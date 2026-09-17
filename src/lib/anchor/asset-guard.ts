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

export async function buildCreateHandoverTransaction(
  adapter: WalletAdapter,
  args: CreateHandoverArgs,
): Promise<Transaction> {
  const from = requireConnected(adapter);
  if (from === args.to) throw new Error("인계자와 인수자는 같은 주소일 수 없습니다");

  const program = getAssetGuardProgram(adapter);
  const { pda } = await findHandoverPda(
    getAssetGuardProgramId().toString(),
    args.assetId,
    from,
    args.to,
  );

  return program.methods
    .createHandover(args.assetId, args.assetCode)
    .accounts({
      handover: pda,
      from,
      to: new PublicKey(args.to),
    })
    .transaction();
}

export async function createHandover(
  adapter: WalletAdapter,
  args: CreateHandoverArgs,
): Promise<string> {
  const tx = await buildCreateHandoverTransaction(adapter, args);
  const signed = (await adapter.signTransaction(tx)) as Transaction;
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
  const { pda } = await findHandoverPda(
    getAssetGuardProgramId().toString(),
    args.assetId,
    args.from,
    args.to,
  );
  return program.methods
    .acceptHandover()
    .accounts({
      handover: pda,
      from: new PublicKey(args.from),
      to: new PublicKey(args.to),
    })
    .transaction();
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

export function deserializeTransaction(blob: string): Transaction {
  return Transaction.from(Buffer.from(blob, "base64"));
}

export async function sendAndConfirm(
  tx: Transaction | VersionedTransaction,
): Promise<string> {
  const connection = getConnection();
  const options = { skipPreflight: false, maxRetries: 3 };
  if (tx instanceof VersionedTransaction) {
    return connection.sendTransaction(tx, options);
  }
  return connection.sendTransaction(tx, [], options);
}