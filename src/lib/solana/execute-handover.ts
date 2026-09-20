import "server-only";
import * as anchor from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import { getConnection } from "@/lib/anchor/provider";
import { getFeePayerKeypair, getFeePayerPublicKey } from "@/lib/solana/fee-payer";
import idl from "@/lib/anchor/idl/asset_guard.json";
import type { AssetGuard } from "@/lib/anchor/idl/asset_guard";

// @coral-xyz/anchor 0.31 ESM 은 `anchor.Wallet` 을 내보내지 않으므로,
// AnchorProvider 가 요구하는 최소 지갑 인터페이스만 키페어로 구현한다.
function keypairWallet(keypair: Keypair): ConstructorParameters<typeof anchor.AnchorProvider>[1] {
  return {
    publicKey: keypair.publicKey,
    signTransaction: async <T extends Transaction | VersionedTransaction>(tx: T): Promise<T> => {
      if (tx instanceof Transaction) tx.partialSign(keypair);
      return tx;
    },
    signAllTransactions: async <T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> => {
      for (const tx of txs) if (tx instanceof Transaction) tx.partialSign(keypair);
      return txs;
    },
  };
}

/**
 * 관리자(서비스 지갑) 단독 실행 인수인계 — create_handover 온체인 확정.
 * 2026-09 흐름: A 요청(1단계) → B 수신 승인(2단계) → 관리자 승인(3단계).
 * 관리자 승인 시점에 이 함수로 온체인에 기록하고, 호출부(approve 라우트)가
 * DB 소유권을 B로 이전한다. 온체인에는 from/to 주소만 기록되고 서명자는
 * 서비스 지갑(fee_payer)이다 — 온체인 레코드는 "관리자가 승인해 실행한 이전"의
 * 위변조 불가 증거이며, A·B 동의는 DB 승인 타임스탬프로 보존한다.
 */
export async function executeCreateHandover(args: {
  assetId: string;
  assetCode: string;
  from: string;
  to: string;
}): Promise<{ signature: string }> {
  const feePayer = getFeePayerKeypair();
  const feePayerAddress = getFeePayerPublicKey();
  if (!feePayerAddress) throw new Error("서비스 결제 지갑이 설정되어 있지 않습니다");

  const connection = getConnection();
  const provider = new anchor.AnchorProvider(
    connection,
    keypairWallet(feePayer),
    { commitment: "confirmed", preflightCommitment: "confirmed" },
  );
  const program = new anchor.Program<AssetGuard>(
    idl as unknown as AssetGuard,
    provider,
  );

  const tx = await program.methods
    .createHandover(args.assetId, args.assetCode)
    .accounts({
      from: new PublicKey(args.from),
      to: new PublicKey(args.to),
      feePayer: feePayerAddress,
    })
    .transaction();
  tx.feePayer = feePayerAddress;
  tx.recentBlockhash = (await connection.getLatestBlockhash("confirmed")).blockhash;
  tx.partialSign(feePayer);

  const signature = await connection
    .sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 })
    .catch(async (rawErr) => {
      console.error("[executeCreateHandover] 전송 실패:", rawErr);
      const err = rawErr as (Error & { getLogs?: () => Promise<{ logs?: string[] }> }) | undefined;
      if (err && typeof err.getLogs === "function") {
        try {
          const { logs } = await err.getLogs();
          const meaningful = (logs ?? [])
            .filter(
              (l) =>
                !/^\s*Program .* invoke|^\s*Program .* success|consumed|Compute units|^\s*$/.test(
                  l,
                ),
            )
            .join(" | ");
          throw new Error(`온체인 실행 실패: ${meaningful || "시뮬레이션 상세 로그 없음"}`);
        } catch {
          throw rawErr;
        }
      }
      throw rawErr;
    });

  try {
    await connection.confirmTransaction(signature, "confirmed");
  } catch {
    // 전송은 성공했으므로 DB 반영은 서명 기준으로 진행
  }
  return { signature };
}

// --------------------------------------------
// 일괄 승인 — 한 트랜잭션에 create_handover 지시 N개를 묶어 서명 1회로 실행.
// - 트랜잭션 크기 제한(레거시 ≈1232B)에 맞춰 배치 크기를 6으로 고정.
// - 배치 트랜잭션 전체가 실패하면 개별 실행으로 폴백해 "한 건이 문제여도
//   나머지는 처리"를 보장한다 (온체인 원자성: 하나라도 실패 시 전체 롤백).
// - 각 자산의 DB 반영은 호출부(라우트)가 서명 기준으로 수행한다.
// --------------------------------------------

export interface CreateHandoverBatchItem {
  assetId: string;
  assetCode: string;
  from: string;
  to: string;
}

export interface BatchHandoverResult {
  assetId: string;
  signature?: string;
  error?: string;
}

// 계정 키 병합 후 한 트랜잭션에 안전하게 담을 수 있는 지시 수.
// 계산: (3N+2) 계정 × 32B + 지시 데이터(≈44B×N) + 헤더/서명 > 1232B 금지
//   N=7 → 23×32+44×7+헤더 ≈ 1,144B (여유), N=8 → ≈1,284B (초과)
const BATCH_MAX = 6;

async function sendRawAndConfirm(
  connection: Connection,
  tx: Transaction,
): Promise<string> {
  const signature = await connection
    .sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 })
    .catch(async (rawErr) => {
      console.error("[sendRawAndConfirm] 전송 실패:", rawErr);
      const err = rawErr as (Error & { getLogs?: () => Promise<{ logs?: string[] }> }) | undefined;
      if (err && typeof err.getLogs === "function") {
        try {
          const { logs } = await err.getLogs();
          const meaningful = (logs ?? [])
            .filter(
              (l) =>
                !/^\s*Program .* invoke|^\s*Program .* success|consumed|Compute units|^\s*$/.test(
                  l,
                ),
            )
            .join(" | ");
          throw new Error(`온체인 실행 실패: ${meaningful || "시뮬레이션 상세 로그 없음"}`);
        } catch {
          throw rawErr;
        }
      }
      throw rawErr;
    });
  try {
    await connection.confirmTransaction(signature, "confirmed");
  } catch {
    // 전송은 성공했으므로 DB 반영은 서명 기준으로 진행
  }
  return signature;
}

/**
 * 여러 자산을 배치 단위로 한 트랜잭션에 묶어 실행하고, 배치가 통째로 실패하면
 * 각 항목을 개별 트랜잭션으로 폴백한다. 반환 배열 순서는 입력 순서와 동일.
 */
export async function executeCreateHandovers(
  items: CreateHandoverBatchItem[],
): Promise<BatchHandoverResult[]> {
  const results: BatchHandoverResult[] = [];
  for (let i = 0; i < items.length; i += BATCH_MAX) {
    const chunk = items.slice(i, i + BATCH_MAX);
    results.push(...(await executeBatchChunk(chunk)));
  }
  return results;
}

async function executeBatchChunk(
  chunk: CreateHandoverBatchItem[],
): Promise<BatchHandoverResult[]> {
  const feePayer = getFeePayerKeypair();
  const feePayerAddress = getFeePayerPublicKey();
  if (!feePayerAddress) throw new Error("서비스 결제 지갑이 설정되어 있지 않습니다");
  const connection = getConnection();
  const provider = new anchor.AnchorProvider(
    connection,
    keypairWallet(feePayer),
    { commitment: "confirmed", preflightCommitment: "confirmed" },
  );
  const program = new anchor.Program<AssetGuard>(idl as unknown as AssetGuard, provider);

  // ── 1) 배치 트랜잭션 시도 ──
  try {
    const tx = new Transaction();
    for (const item of chunk) {
      const ix = await program.methods
        .createHandover(item.assetId, item.assetCode)
        .accounts({
          from: new PublicKey(item.from),
          to: new PublicKey(item.to),
          feePayer: feePayerAddress,
        })
        .instruction();
      tx.add(ix);
    }
    tx.feePayer = feePayerAddress;
    tx.recentBlockhash = (await connection.getLatestBlockhash("confirmed")).blockhash;
    tx.partialSign(feePayer);
    const signature = await sendRawAndConfirm(connection, tx);
    return chunk.map((item) => ({ assetId: item.assetId, signature }));
  } catch (batchErr) {
    console.warn(
      "[executeCreateHandovers] 배치 트랜잭션 실패 — 개별 실행으로 폴백:",
      batchErr,
    );

    // ── 2) 개별 폴백 (배치 내 어느 한 건이 문제여도 나머지는 처리) ──
    const results: BatchHandoverResult[] = [];
    for (const item of chunk) {
      try {
        const { signature } = await executeCreateHandover(item);
        results.push({ assetId: item.assetId, signature });
      } catch (e) {
        console.error("[executeCreateHandovers] 개별 실행 실패:", item.assetId, e);
        results.push({
          assetId: item.assetId,
          error: e instanceof Error ? e.message : "개별 실행 실패",
        });
      }
    }
    return results;
  }
}