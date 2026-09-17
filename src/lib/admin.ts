import { NextRequest } from "next/server";
import { getEnv } from "@/lib/config/env";

/**
 * 관리자 지갑 화이트리스트 — ADMIN_WALLETS (콤마 구분, 서버 전용).
 * DOGPANDA의 x-admin-secret(x-admin-secret 헤더 매칭) 방식을
 * 지갑 생태계에 맞춰 "연결된 지갑 ∈ 화이트리스트"로 대체한 버전.
 * 순수 MVP 게이트이며, 실서비스에서는 서명 기반 인증(nonce + personal_sign)으로 교체 예정.
 */
export function getAdminWallets(): string[] {
  const raw = getEnv().ADMIN_WALLETS ?? "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function isAdminWallet(address: string | null | undefined): boolean {
  if (!address) return false;
  const normalized = address.trim();
  return getAdminWallets().some(
    (w) => w.toLowerCase() === normalized.toLowerCase(),
  );
}

/**
 * 요청의 x-admin-wallet 헤더가 화이트리스트에 속하면 해당 지갑 반환, 아니면 null.
 */
export function getAdminWalletFromRequest(req: NextRequest): string | null {
  const wallet = req.headers.get("x-admin-wallet");
  return isAdminWallet(wallet) ? wallet!.trim() : null;
}