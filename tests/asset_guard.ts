import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import { createHash } from "crypto";
import { expect } from "chai";
import type { AssetGuard } from "../src/lib/anchor/idl/asset_guard";

describe("asset_guard — 인수인계 스마트컨트랙트", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.AssetGuard as Program<AssetGuard>;

  const from = Keypair.generate();
  const to = Keypair.generate();

  const assetId = "c2d9a30a-38d4-4f4e-9b0e-1a2b3c4d5e6f";
  const assetId2 = "d3e0b41b-49e5-5a5f-ae1f-2b3c4d5e6f70";
  const assetCode = "RCB-0001";

  const findPda = (aid: string, a: PublicKey, b: PublicKey) =>
    PublicKey.findProgramAddress(
      [
        Buffer.from("handover"),
        createHash("sha256").update(Buffer.from(aid)).digest(),
        a.toBuffer(),
        b.toBuffer(),
      ],
      program.programId,
    );

  const airdrop = async (pk: PublicKey) => {
    const sig = await provider.connection.requestAirdrop(
      pk,
      2 * anchor.web3.LAMPORTS_PER_SOL,
    );
    await provider.connection.confirmTransaction(sig, "confirmed");
  };

  const expectReject = async (
    promise: Promise<unknown>,
    pattern?: RegExp,
  ) => {
    try {
      await promise;
      expect.fail("트랜잭션이 성공했습니다 (실패해야 함)");
    } catch (err) {
      if (pattern) {
        expect(String((err as Error)?.message ?? err)).to.match(pattern);
      }
    }
  };

  before(async () => {
    await airdrop(from.publicKey);
    await airdrop(to.publicKey);
  });

  describe("create_handover", () => {
    it("PDA 초기화 + PENDING 상태 + 필드 값 검증", async () => {
      const [hPda] = await findPda(assetId, from.publicKey, to.publicKey);
      await program.methods
        .createHandover(assetId, assetCode)
        .accounts({ handover: hPda, from: from.publicKey, to: to.publicKey })
        .signers([from])
        .rpc();

      const acc = await program.account.handover.fetch(hPda);
      expect(acc.assetId).to.eq(assetId);
      expect(acc.assetCode).to.eq(assetCode);
      expect(acc.from.toString()).to.eq(from.publicKey.toString());
      expect(acc.to.toString()).to.eq(to.publicKey.toString());
      expect(acc.status).to.deep.eq({ pending: {} });
      expect(acc.createdTs.toNumber()).to.be.greaterThan(0);
      expect(acc.completedTs.toNumber()).to.eq(0);
    });

    it("동일 PDA 중복 생성 거부 (already in use)", async () => {
      const [hPda] = await findPda(assetId, from.publicKey, to.publicKey);
      await expectReject(
        program.methods
          .createHandover(assetId, assetCode)
          .accounts({ handover: hPda, from: from.publicKey, to: to.publicKey })
          .signers([from])
          .rpc(),
        /already in use|ALREADY_IN_USE|already initialized/i,
      );
    });

    it("인계자 == 인수자 거부 (SameParty)", async () => {
      const [hPda] = await findPda(
        assetId2,
        from.publicKey,
        from.publicKey,
      );
      await expectReject(
        program.methods
          .createHandover(assetId2, assetCode)
          .accounts({ handover: hPda, from: from.publicKey, to: from.publicKey })
          .signers([from])
          .rpc(),
        /same|같은 주소/i,
      );
    });
  });

  describe("accept_handover (양자 서명 필수)", () => {
    it("인계자(from)만 서명 → 거부 (서명 검증 실패)", async () => {
      const [hPda] = await findPda(assetId, from.publicKey, to.publicKey);
      await expectReject(
        program.methods
          .acceptHandover()
          .accounts({ handover: hPda, from: from.publicKey, to: to.publicKey })
          .signers([from])
          .rpc(),
        /transaction has not been signed|signature/i,
      );
    });

    it("인수자(to)만 서명 → 거부 (서명 검증 실패)", async () => {
      const [hPda] = await findPda(assetId, from.publicKey, to.publicKey);
      await expectReject(
        program.methods
          .acceptHandover()
          .accounts({ handover: hPda, from: from.publicKey, to: to.publicKey })
          .signers([to])
          .rpc(),
        /transaction has not been signed|signature/i,
      );
    });

    it("from + to 양자 서명 → COMPLETED + completed_ts 기록", async () => {
      const [hPda] = await findPda(assetId, from.publicKey, to.publicKey);
      await program.methods
        .acceptHandover()
        .accounts({ handover: hPda, from: from.publicKey, to: to.publicKey })
        .signers([from, to])
        .rpc();

      const acc = await program.account.handover.fetch(hPda);
      expect(acc.status).to.deep.eq({ completed: {} });
      expect(acc.completedTs.toNumber()).to.be.greaterThan(0);
    });

    it("COMPLETED 후 재수락 거부 (InvalidStatus)", async () => {
      const [hPda] = await findPda(assetId, from.publicKey, to.publicKey);
      await expectReject(
        program.methods
          .acceptHandover()
          .accounts({ handover: hPda, from: from.publicKey, to: to.publicKey })
          .signers([from, to])
          .rpc(),
        /PENDING 상태/i,
      );
    });
  });

  describe("cancel_handover", () => {
    it("from 서명 → CANCELLED, 이후 accept 거부", async () => {
      const [hPda] = await findPda(assetId2, from.publicKey, to.publicKey);
      await airdrop(from.publicKey);
      await program.methods
        .createHandover(assetId2, assetCode)
        .accounts({ handover: hPda, from: from.publicKey, to: to.publicKey })
        .signers([from])
        .rpc();

      await program.methods
        .cancelHandover()
        .accounts({
          handover: hPda,
          from: from.publicKey,
          to: to.publicKey,
        })
        .signers([from])
        .rpc();

      const acc = await program.account.handover.fetch(hPda);
      expect(acc.status).to.deep.eq({ cancelled: {} });

      await expectReject(
        program.methods
          .acceptHandover()
          .accounts({ handover: hPda, from: from.publicKey, to: to.publicKey })
          .signers([from, to])
          .rpc(),
        /PENDING 상태/i,
      );
    });

    it("CANCELLED 상태 재취소 거부 (InvalidStatus)", async () => {
      const [hPda] = await findPda(assetId2, from.publicKey, to.publicKey);
      await expectReject(
        program.methods
          .cancelHandover()
          .accounts({
            handover: hPda,
            from: from.publicKey,
            to: to.publicKey,
          })
          .signers([from])
          .rpc(),
        /PENDING 상태/i,
      );
    });
  });
});