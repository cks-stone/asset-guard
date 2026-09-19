import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import { getEnv } from "@/lib/config/env";
import { findHandoverPda } from "@/lib/solana/pda";
import { createAnchorProvider, getConnection } from "./provider";
import idl from "./idl/asset_guard.json";
import type { AssetGuard } from "./idl/asset_guard";
import type { WalletAdapter } from "@/lib/wallet/types";

export function getAssetGuardProgramId(): PublicKey {
  const id = getEnv().NEXT_PUBLIC_ASSET_GUARD_PROGRAM_ID;
  if (!id) throw new Error("NEXT_PUBLIC_ASSET_GUARD_PROGRAM_ID 가 설정되어 있지 않습니다");
  return new PublicKey(id);
}

export function getAssetGuardProgram(
  adapter: WalletAdapter,
): anchor.Program<AssetGuard> {
  return new anchor.Program<AssetGuard>(
    idl as unknown as AssetGuard,
    createAnchorProvider(adapter),
  );
}

function requireConnected(adapter: WalletAdapter): string {
  const pk = adapter.getPublicKey();
  if (!pk) throw new Error("지갑이 연결되어 있지 않습니다");
  return pk;
}

// --------------------------------------------
// 인계 신청 (from 단독 서명)
// --------------------------------------------

export interface CreateHandoverArgs {
  assetId: string;
  assetCode: string;
  to: string;
}

function getFeePayerPublicKey(): PublicKey {
  const addr = getEnv().NEXT_PUBLIC_FEE_PAYER_ADDRESS;
  if (!addr) throw new Error("NEXT_PUBLIC_FEE_PAYER_ADDRESS 가 설정되어 있지 않습니다");
  return new PublicKey(addr);
}

export async function buildCreateHandoverTransaction(
  adapter: WalletAdapter,
  args: CreateHandoverArgs,
): Promise<Transaction> {
  const from = requireConnected(adapter);
  if (from === args.to) throw new Error("인계자와 인수자는 같은 주소일 수 없습니다");

  // PDA 초기화 렌트(≈0.0016 SOL) + 거래 수수료는 시스템(서비스 지갑)이 부담.
  // 담당자(from) 지갑에는 SOL 잔액이 없어도 된다.
  const feePayer = getFeePayerPublicKey();

  const program = getAssetGuardProgram(adapter);
  const { pda } = await findHandoverPda(getAssetGuardProgramId().toString(), args.assetId);

  const tx = await program.methods
    .createHandover(args.assetId, args.assetCode)
    .accounts({
      handover: pda,
      from,
      to: new PublicKey(args.to),
      feePayer,
    })
    .transaction();

  // anchor .transaction()는 recentBlockhash/feePayer 를 세팅하지 않으므로 직접 지정
  tx.feePayer = feePayer;
  const { blockhash } = await getConnection().getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  return tx;
}

/**
 * 확정 단계 — 담당자 키로만 서명한 후 서버에 보낼 base64 블롭 생성.
 * feePayer(서비스 지갑) 서명은 서버가 추가한다 (수수료·렌트 시스템 부담).
 */
export async function createHandoverBlob(
  adapter: WalletAdapter,
  args: CreateHandoverArgs,
): Promise<string> {
  console.log("[createHandoverBlob] tx build 시작 (feePayer=서비스 지갑)");
  const tx = await buildCreateHandoverTransaction(adapter, args);
  console.log("[createHandoverBlob] tx build 완료", {
    feePayer: tx.feePayer?.toBase58(),
    recentBlockhash: tx.recentBlockhash,
  });
  const signed = (await withTimeout(
    adapter.signTransaction(tx),
    90_000,
    "지갑 서명 응답이 없습니다 (유령 signer / 팝업 차단 확인).",
  )) as Transaction;
  console.log("[createHandoverBlob] 담당자 서명 완료, signatures=", signed.signatures.length);
  return serializeTransaction(signed);
}

export async function createHandover(
  adapter: WalletAdapter,
  args: CreateHandoverArgs,
): Promise<string> {
  console.log("[createHandover] tx build 시작");
  const tx = await buildCreateHandoverTransaction(adapter, args);
  console.log("[createHandover] tx build 완료", {
    feePayer: tx.feePayer?.toBase58(),
    recentBlockhash: tx.recentBlockhash,
  });
  const signed = (await withTimeout(
    adapter.signTransaction(tx),
    90_000,
    "지갑 서명 응답이 없습니다 (유령 signer / 팝업 차단 확인).",
  )) as Transaction;
  console.log("[createHandover] 서명 완료, signatures=", signed.signatures.length);
  return sendAndConfirm(signed);
}

// --------------------------------------------
// 인수 수락 (양자 서명: 먼저 to 가 부분 서명 → 블롭 전달 → from 이 완료 서명)
// --------------------------------------------

export interface AcceptHandoverArgs {
  assetId: string;
  from: string;
  to: string;
}

export async function buildAcceptHandoverTransaction(
  adapter: WalletAdapter,
  args: AcceptHandoverArgs,
): Promise<Transaction> {
  const program = getAssetGuardProgram(adapter);
  const { pda } = await findHandoverPda(getAssetGuardProgramId().toString(), args.assetId);
  const tx = await program.methods
    .acceptHandover()
    .accounts({
      handover: pda,
      from: new PublicKey(args.from),
      to: new PublicKey(args.to),
    })
    .transaction();

  // anchor .transaction()는 recentBlockhash/feePayer 를 세팅하지 않으므로 직접 지정
  tx.feePayer = new PublicKey(args.from);
  const { blockhash } = await getConnection().getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  return tx;
}

export async function createPartialSignature(
  adapter: WalletAdapter,
  args: AcceptHandoverArgs,
): Promise<string> {
  const tx = await buildAcceptHandoverTransaction(adapter, args);
  const signed = (await adapter.signTransaction(tx)) as Transaction;
  return serializeTransaction(signed);
}

export async function completeAcceptFromPartial(
  adapter: WalletAdapter,
  partialBlob: string,
): Promise<string> {
  const tx = deserializeTransaction(partialBlob);
  const signed = (await adapter.signTransaction(tx)) as Transaction;
  return sendAndConfirm(signed);
}

// --------------------------------------------
// 직렬화 / 전송 헬퍼
// --------------------------------------------

/** 부분 서명 상태를 보존한 채 base64로 직렬화 (필수 서명 누락 허용) */
export function serializeTransaction(tx: Transaction): string {
  return Buffer.from(
    tx.serialize({ requireAllSignatures: false, verifySignatures: false }),
  ).toString("base64");
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

export function deserializeTransaction(blob: string): Transaction {
  return Transaction.from(Buffer.from(blob, "base64"));
}

export async function sendAndConfirm(
  tx: Transaction | VersionedTransaction,
): Promise<string> {
  const connection = getConnection();
  const options = { skipPreflight: false, maxRetries: 3 };
  // 이미 서명된 상태를 raw 전송 (web3 sendTransaction 은 재서명하므로 사용 금지)
  let wire: Uint8Array;
  try {
    wire = tx.serialize();
  } catch (e) {
    console.error("[sendAndConfirm] 직렬화 실패:", e);
    throw e;
  }
  const signature = await connection.sendRawTransaction(wire, options).catch(async (rawErr) => {
    console.error("[sendAndConfirm] 실패:", rawErr);
    const err = rawErr as (Error & { getLogs?: () => Promise<{ logs?: string[] }> }) | undefined;
    if (err && typeof err.getLogs === "function") {
      try {
        const { logs } = await err.getLogs();
        console.error("[sendAndConfirm] 시뮬레이션 로그:\n" + (logs ?? []).join("\n"));
        const meaningful = (logs ?? [])
          .filter((l) => !/^\s*Program .* invoke|^\s*Program .* success|consumed|Compute units|^\s*$/.test(l))
          .join(" | ");
        throw new Error(`온체인 실행 실패: ${meaningful || "시뮬레이션 상세 로그 없음"}`);
      } catch {
        throw rawErr;
      }
    }
    throw rawErr;
  });
  console.log("[sendAndConfirm] 전송 완료:", signature);
  try {
    await connection.confirmTransaction(signature, "confirmed");
  } catch {
    // 전송은 성공했으므로 DB 반영은 서명으로 진행
  }
  return signature;
}