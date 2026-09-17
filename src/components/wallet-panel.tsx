"use client";

import { useWallet } from "@/lib/wallet/wallet-context";

export function WalletPanel() {
  const { adapter, publicKey, connected, connecting, connect, disconnect, error } =
    useWallet();

  return (
    <div className="w-full max-w-md rounded-xl border border-neutral-800 bg-neutral-900 p-6">
      <h2 className="text-lg font-semibold">지갑 연결</h2>
      <p className="mt-1 text-sm text-neutral-400">
        {adapter ? adapter.name : "지갑(Phantom) 미설치 — 브라우저에서 실행해주세요"}
      </p>

      {connected ? (
        <div className="mt-4 flex flex-col items-center gap-3">
          <p className="max-w-full break-all font-mono text-xs text-neutral-300">
            {publicKey}
          </p>
          <button
            onClick={disconnect}
            className="rounded bg-red-600/90 px-4 py-2 text-sm text-white hover:bg-red-600"
          >
            연결 해제
          </button>
        </div>
      ) : (
        <button
          onClick={connect}
          disabled={!adapter || connecting}
          className="mt-4 w-full rounded bg-violet-600 px-4 py-2 text-sm text-white hover:bg-violet-500 disabled:opacity-50"
        >
          {connecting ? "연결 중..." : "Phantom 연결"}
        </button>
      )}

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}