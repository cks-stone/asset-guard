import { PublicKey } from "@solana/web3.js";

/**
 * Anchor 프로그램의 PDA 시드 규칙과 동일하게 계산.
 * on-chain: seeds = [b"handover", sha256(asset_id), from, to]
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
  from: string,
  to: string,
): Promise<{ pda: PublicKey; bump: number }> {
  const seed = await handoverSeed(assetId);
  const [pda, bump] = await PublicKey.findProgramAddress(
    [
      new TextEncoder().encode("handover"),
      seed,
      new PublicKey(from).toBytes(),
      new PublicKey(to).toBytes(),
    ],
    new PublicKey(programId),
  );
  return { pda, bump };
}