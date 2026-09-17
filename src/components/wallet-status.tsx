"use client";

import { useWallet } from "@/lib/wallet/wallet-context";

const shortAddr = (addr: string | null) =>
  addr ? `${addr.slice(0, 5)}…${addr.slice(-4)}` : null;

export function WalletStatus() {
  const { publicKey, connected, connecting, connect, disconnect } = useWallet();

  if (!connected) {
    return (
      <button
        onClick={() => void connect()}
        disabled={connecting}
        className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm text-white hover:bg-violet-500 disabled:opacity-50"
      >
        {connecting ? "연결 중..." : "지갑 연결"}
      </button>
    );
  }

  return (
    <span className="flex items-center gap-2 rounded-lg border border-neutral-700 px-3 py-1.5">
      <span className="h-2 w-2 rounded-full bg-emerald-400" />
      <span className="font-mono text-xs text-neutral-400">{shortAddr(publicKey)}</span>
      <button
        onClick={disconnect}
        className="text-xs text-neutral-500 hover:text-neutral-300"
      >
        해제
      </button>
    </span>
  );
}