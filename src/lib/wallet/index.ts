import { PhantomWalletAdapter } from "./phantom";
import type { WalletAdapter } from "./types";

/**
 * 현재 환경에서 사용 가능한 지갑 어댑터 목록.
 * Phantom 설치가 없으면 빈 배열 — Privy embedded 를 도입하면 여기에 어댑터를 추가한다.
 */
export function getWalletAdapters(): WalletAdapter[] {
  if (typeof window === "undefined") return [];

  const adapters: WalletAdapter[] = [];
  const phantom = new PhantomWalletAdapter();
  if (phantom.isInstalled()) adapters.push(phantom);
  return adapters;
}