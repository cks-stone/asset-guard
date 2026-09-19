"use client";

import { useEffect, useMemo, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useWallet } from "@/lib/wallet/wallet-context";
import { useWalletLabel } from "@/lib/wallet/wallet-label-context";
import { isSolanaMainnet } from "@/lib/config/env";

const shortAddr = (addr: string | null) =>
  addr ? `${addr.slice(0, 5)}…${addr.slice(-4)}` : null;

export function WalletStatus() {
  const { wallets, publicKey, connected, connecting, connect, disconnect } =
    useWallet();
  const { label, division, department, setOpen } = useWalletLabel();
  const { user } = usePrivy();
  const [open, setOpen_] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sol, setSol] = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [adminWallets, setAdminWallets] = useState<string[]>([]);
  const [feePayerAddress, setFeePayerAddress] = useState<string | null>(null);
  const [feePayerSol, setFeePayerSol] = useState<number | null>(null);
  const [feePayerLoading, setFeePayerLoading] = useState(false);

  const isAdmin = useMemo(
    () =>
      connected &&
      !!publicKey &&
      adminWallets.some((w) => w.toLowerCase() === publicKey.toLowerCase()),
    [connected, publicKey, adminWallets],
  );

  useEffect(() => {
    if (!connected) return;
    let cancelled = false;
    void fetch("/api/admin/config")
      .then((res) => (res.ok ? (res.json() as Promise<{ adminWallets: string[]; feePayerAddress: string | null }>) : null))
      .then((json) => {
        if (cancelled || !json) return;
        setAdminWallets(json.adminWallets ?? []);
        setFeePayerAddress(json.feePayerAddress ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [connected]);

  useEffect(() => {
    if (!connected || !publicKey) {
      setSol(null);
      return;
    }
    let cancelled = false;
    const fetchBalance = async () => {
      setBalanceLoading(true);
      try {
        const res = await fetch(`/api/wallet-balance?address=${publicKey}`, {
          headers: { "x-wallet": publicKey },
        });
        if (!res.ok) throw new Error("balance fetch failed");
        const json = (await res.json()) as { sol: number };
        if (!cancelled) setSol(json.sol);
      } catch {
        if (!cancelled) setSol(null);
      } finally {
        if (!cancelled) setBalanceLoading(false);
      }
    };
    void fetchBalance();
    return () => {
      cancelled = true;
    };
  }, [connected, publicKey]);

  useEffect(() => {
    if (!isAdmin || !publicKey || !feePayerAddress) {
      setFeePayerSol(null);
      return;
    }
    let cancelled = false;
    const fetchFeePayerBalance = async () => {
      setFeePayerLoading(true);
      try {
        const res = await fetch(`/api/wallet-balance?address=${feePayerAddress}`, {
          headers: { "x-wallet": publicKey },
        });
        if (!res.ok) throw new Error("fee payer balance fetch failed");
        const json = (await res.json()) as { sol: number };
        if (!cancelled) setFeePayerSol(json.sol);
      } catch {
        if (!cancelled) setFeePayerSol(null);
      } finally {
        if (!cancelled) setFeePayerLoading(false);
      }
    };
    void fetchFeePayerBalance();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, publicKey, feePayerAddress]);

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

  const email = user?.email?.address ?? null;
  const copyAddress = async () => {
    if (!publicKey) return;
    try {
      await navigator.clipboard.writeText(publicKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen_((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-2 rounded-lg border border-neutral-700 px-3 py-1.5"
      >
        <span className="h-2 w-2 rounded-full bg-emerald-400" />
        {label && (
          <span className="max-w-28 truncate text-sm text-neutral-100">{label}</span>
        )}
        <span className="font-mono text-xs text-neutral-400">{publicKey}</span>
        <span className="text-xs text-neutral-500">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-80 rounded-xl border border-neutral-700 bg-neutral-900 p-4 shadow-xl">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">지갑 정보</p>
            <button
              onClick={() => void disconnect()}
              className="rounded bg-red-600/80 px-2 py-1 text-xs text-white hover:bg-red-500"
            >
              해제
            </button>
          </div>

          <dl className="mt-3 space-y-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-neutral-500">네트워크</dt>
              <dd className="font-mono text-neutral-200">
                Solana {isSolanaMainnet() ? "Mainnet" : "Devnet"}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-neutral-500">SOL 잔액</dt>
              <dd className="font-mono text-neutral-200">
                {balanceLoading ? (
                  <span className="text-neutral-500">조회 중...</span>
                ) : sol !== null ? (
                  `${sol.toLocaleString("ko-KR", { maximumFractionDigits: 6 })} SOL`
                ) : (
                  <span className="text-neutral-500">—</span>
                )}
              </dd>
            </div>
            {isAdmin && feePayerAddress && (
              <div className="flex items-center justify-between gap-2">
                <dt className="shrink-0 text-neutral-500">
                  결제 지갑 SOL
                  <span className="ml-1 font-mono text-[9px] text-neutral-600">
                    {shortAddr(feePayerAddress)}
                  </span>
                </dt>
                <dd className="font-mono text-neutral-200">
                  {feePayerLoading ? (
                    <span className="text-neutral-500">조회 중...</span>
                  ) : feePayerSol !== null ? (
                    `${feePayerSol.toLocaleString("ko-KR", { maximumFractionDigits: 6 })} SOL`
                  ) : (
                    <span className="text-neutral-500">—</span>
                  )}
                </dd>
              </div>
            )}
            {email && (
              <div className="flex items-center justify-between gap-2">
                <dt className="text-neutral-500">로그인 (Google)</dt>
                <dd className="truncate text-neutral-200">{email}</dd>
              </div>
            )}
            <div className="flex items-center justify-between gap-2">
              <dt className="shrink-0 text-neutral-500">프로바이더</dt>
              <dd className="truncate text-neutral-200">
                {wallets.map((w) => w.name).join(", ")}
              </dd>
            </div>
            <div className="border-t border-neutral-800 pt-2">
              <dt className="flex items-center justify-between text-neutral-500">
                내 정보
                <button
                  onClick={() => setOpen(true)}
                  className="rounded border border-neutral-700 px-2 py-0.5 text-[10px] text-neutral-400 hover:text-neutral-200"
                >
                  {label ? "수정" : "등록"}
                </button>
              </dt>
              <dd className="mt-1 text-sm text-neutral-200">
                {label || <span className="text-neutral-500">—</span>}
              </dd>
              {(division || department) && (
                <dd className="mt-0.5 text-[11px] text-neutral-400">
                  {[division, department].filter(Boolean).join(" / ")}
                </dd>
              )}
            </div>
            <div className="border-t border-neutral-800 pt-2">
              <dt className="text-neutral-500">지갑 주소</dt>
              <dd className="mt-1 flex items-center gap-2 whitespace-nowrap font-mono text-[11px] text-neutral-200">
                <span className="min-w-0 overflow-x-auto">{publicKey}</span>
                <button
                  onClick={() => void copyAddress()}
                  className="shrink-0 rounded border border-neutral-700 px-1.5 py-0.5 text-[10px] text-neutral-400 hover:text-neutral-200"
                >
                  {copied ? "복사됨" : "복사"}
                </button>
              </dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}