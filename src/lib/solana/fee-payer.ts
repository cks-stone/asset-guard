import "server-only";
import { Keypair, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { getEnv } from "@/lib/config/env";

/**
 * 시스템(관리자) 결제 지갑 — 인수인계 수수료 + PDA 렌트 부담.
 * 개인키(FEE_PAYER_SECRET)는 서버 전용이며 브라우저로 절대 내려보내지 않는다.
 */

export function getFeePayerPublicKey(): PublicKey | null {
  const addr = getEnv().NEXT_PUBLIC_FEE_PAYER_ADDRESS;
  if (!addr) return null;
  return new PublicKey(addr);
}

export function getFeePayerKeypair(): Keypair {
  const secret = getEnv().FEE_PAYER_SECRET;
  if (!secret) throw new Error("FEE_PAYER_SECRET 이 설정되어 있지 않습니다");
  return Keypair.fromSecretKey(bs58.decode(secret));
}

export function getFeePayerAddress(): string | null {
  const addr = getEnv().NEXT_PUBLIC_FEE_PAYER_ADDRESS;
  return addr || null;
}