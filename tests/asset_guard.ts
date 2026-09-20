import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import { expect } from "chai";
import type { AssetGuard } from "../src/lib/anchor/idl/asset_guard";

describe("asset_guard — 인수인계 (무계정 이벤트 emit)", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.AssetGuard as Program<AssetGuard>;

  const from = Keypair.generate();
  const to = Keypair.generate();
  const assetId = "c2d9a30a-38d4-4f4e-9b0e-1a2b3c4d5e6f";
  const assetId2 = "d3e0b41b-49e5-5a5f-ae1f-2b3c4d5e6f70";
  const assetCode = "RCB-0001";
  const feePayer = provider.wallet.publicKey;

  // 무계정 설계: 서명자는 서비스 지갑(fee_payer) 하나뿐. from/to 는 주소만 기록.
  const callHandover = (aid: string, a: PublicKey, b: PublicKey) =>
    program.methods
      .createHandover(aid, assetCode)
      .accounts({ from: a, to: b, feePayer })
      .rpc();

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

  const getParsedTransaction = async (sig: string) => {
    await provider.connection.confirmTransaction(sig, "confirmed");
    return provider.connection.getTransaction(sig, {
      maxSupportedTransactionVersion: 0,
      commitment: "confirmed",
    });
  };

  describe("create_handover (이벤트 emit 전용)", () => {
    it("성공 — 이벤트 로그 기록, 계정 미생성, 수수료=5,000 lamports", async () => {
      const sig = await callHandover(assetId, from.publicKey, to.publicKey);

      const tx = await getParsedTransaction(sig);
      expect(tx).to.not.eq(null);
      const meta = tx!.meta!;
      const logs = meta.logMessages ?? [];

      // 1) 이벤트가 트랜잭션 로그(불변 증거)에 남는다
      expect(logs.some((l) => l.startsWith("Program data:"))).to.eq(true);

      // 2) PDA 등 새로운 계정이 생성되지 않는다 (수수료 지갑 외 잔액 불변)
      const post = meta.postBalances;
      post.forEach((v, i) => {
        if (i !== 0) expect(v).to.eq(meta.preBalances[i]);
      });

      // 3) 비용은 트랜잭션 수수료뿐 (렌트 예치 0)
      expect(meta.fee).to.eq(5_000);
    });

    it("동일 자산 재이관 — 계정 생성 없이 수수료만 (반복 가능)", async () => {
      const sig = await callHandover(assetId2, from.publicKey, to.publicKey);

      const tx = await getParsedTransaction(sig);
      const meta = tx!.meta!;
      const pre = meta.preBalances;
      const post = meta.postBalances;
      post.forEach((v, i) => {
        if (i !== 0) expect(v).to.eq(pre[i]);
      });
      expect(meta.fee).to.eq(5_000);

      const sig2 = await callHandover(assetId2, to.publicKey, from.publicKey);
      const tx2 = await getParsedTransaction(sig2);
      const meta2 = tx2!.meta!;
      meta2.postBalances.forEach((v, i) => {
        if (i !== 0) expect(v).to.eq(meta2.preBalances[i]);
      });
      expect(meta2.fee).to.eq(5_000);
    });

    it("인계자 == 인수자 거부 (SameParty)", async () => {
      await expectReject(
        callHandover(assetId2, from.publicKey, from.publicKey),
        /same|같은 주소/i,
      );
    });

    it("빈 asset_id 거부 (InvalidInput)", async () => {
      await expectReject(
        callHandover("", from.publicKey, to.publicKey),
        /empty|비어|64/i,
      );
    });
  });
});