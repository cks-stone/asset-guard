import { PublicKey } from "@solana/web3.js";

/**
 * Anchor 프로그램의 PDA 시드 규칙과 동일하게 계산.
 * on-chain: seeds = [b"handover", sha256(asset_id)]
 *
 * 2026-09: PDA를 자산 단독 키로 변경 (from/to 제거).
 *  - 기존 [.., from, to] 시드는 (자산, 방향)당 1회만 생성 가능해
 *    A→B→A 왕복/반복 이관이 "already in use"로 막히는 문제가 있었다.
 *  - 이제 자산당 단일 PDA를 create_handover가 재사용(init_if_needed)한다.
 *  - 온체인 = 최신 소유 이전 사실, 전체 이력은 DB transfer_history가 보관.
 */

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", buffer);
  return new Uint8Array(digest);
}

export async function handoverSeed(assetId: string): Promise<Uint8Array> {
  return sha256(new TextEncoder().encode(assetId));
}

export async function findHandoverPda(
  programId: string,
  assetId: string,
): Promise<{ pda: PublicKey; bump: number }> {
  const seed = await handoverSeed(assetId);
  const [pda, bump] = await PublicKey.findProgramAddress(
    [new TextEncoder().encode("handover"), seed],
    new PublicKey(programId),
  );
  return { pda, bump };
}