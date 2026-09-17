"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useWallet } from "@/lib/wallet/wallet-context";
import type { AssetRow, HandoverRow } from "@/lib/supabase/types";

async function readJson(res: Response): Promise<{ error?: string; [k: string]: unknown }> {
  try {
    return (await res.json()) as { error?: string };
  } catch {
    return { error: `HTTP ${res.status}` };
  }
}

const assetStatusBadge: Record<string, string> = {
  available: "bg-blue-500/15 text-blue-300",
  in_use: "bg-emerald-500/15 text-emerald-300",
  retired: "bg-neutral-500/15 text-neutral-400",
};

const handoverStatusBadge: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-300",
  completed: "bg-emerald-500/15 text-emerald-300",
  cancelled: "bg-neutral-500/15 text-neutral-400",
};

const shortAddr = (addr: string | null | undefined) =>
  addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "—";

export function Dashboard() {
  const { publicKey, connected, connect } = useWallet();
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [asFrom, setAsFrom] = useState<HandoverRow[]>([]);
  const [asTo, setAsTo] = useState<HandoverRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!publicKey) return;
    setLoading(true);
    setError(null);
    try {
      const [assetRes, fromRes, toRes] = await Promise.all([
        fetch("/api/assets"),
        fetch(`/api/handovers?from_wallet=${encodeURIComponent(publicKey)}`),
        fetch(`/api/handovers?to_wallet=${encodeURIComponent(publicKey)}`),
      ]);
      const assetsData = (await readJson(assetRes)) as { data?: AssetRow[] };
      const fromData = (await readJson(fromRes)) as { data?: HandoverRow[] };
      const toData = (await readJson(toRes)) as { data?: HandoverRow[] };
      setAssets(assetsData.data ?? []);
      setAsFrom(fromData.data ?? []);
      setAsTo(toData.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "대시보드 조회 실패");
    } finally {
      setLoading(false);
    }
  }, [publicKey]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const myAssets = useMemo(
    () => assets.filter((a) => a.custodian_wallet === publicKey),
    [assets, publicKey],
  );
  const pendingTo = useMemo(
    () => asTo.filter((h) => h.onchain_status === "pending"),
    [asTo],
  );
  const pendingFrom = useMemo(
    () => asFrom.filter((h) => h.onchain_status === "pending"),
    [asFrom],
  );
  const relayable = useMemo(
    () => pendingFrom.filter((h) => h.partial_tx),
    [pendingFrom],
  );
  const completedHistory = useMemo(() => {
    const seen = new Map<string, HandoverRow>();
    for (const h of [...asFrom, ...asTo]) {
      if (h.onchain_status !== "pending" && !seen.has(h.id)) {
        seen.set(h.id, h);
      }
    }
    return [...seen.values()]
      .sort((a, b) => (b.created_at < a.created_at ? -1 : 1))
      .slice(0, 10);
  }, [asFrom, asTo]);

  if (!connected) {
    return (
      <div className="w-full max-w-3xl rounded-xl border border-neutral-800 bg-neutral-900 p-10 text-center">
        <p className="text-sm text-neutral-400">
          지갑을 연결하면 내 담당 자산과 인수인계 현황을 볼 수 있습니다.
        </p>
        <button
          onClick={() => void connect()}
          className="mt-5 rounded bg-violet-600 px-5 py-2 text-sm text-white hover:bg-violet-500"
        >
          지갑 연결
        </button>
      </div>
    );
  }

  const stats = [
    { label: "보유 자산", value: myAssets.length, accent: "text-emerald-300" },
    { label: "수락 대기 (내게 신청)", value: pendingTo.length, accent: "text-amber-300" },
    { label: "최종 확정 대기", value: relayable.length, accent: "text-blue-300" },
    { label: "완료 인수인계", value: completedHistory.length, accent: "text-neutral-200" },
  ];

  return (
    <div className="w-full max-w-3xl space-y-6">
      {error && (
        <p className="rounded bg-red-950/60 px-4 py-2 text-sm text-red-300">{error}</p>
      )}
      {loading && <p className="text-xs text-neutral-500">불러오는 중...</p>}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
            <p className={`text-2xl font-bold ${s.accent}`}>{s.value}</p>
            <p className="mt-1 text-xs text-neutral-400">{s.label}</p>
          </div>
        ))}
      </section>

      <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">내 담당 자산 ({myAssets.length})</h2>
          <Link href="/handover" className="text-xs text-violet-300 hover:text-violet-200">
            인수인계 콘솔 →
          </Link>
        </div>
        {myAssets.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">담당 중인 자산이 없습니다.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {myAssets.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center gap-2 rounded border border-neutral-800 bg-neutral-800/40 px-3 py-2"
              >
                <span className="font-mono text-sm">{a.asset_code}</span>
                <span className="text-sm">{a.name}</span>
                <span
                  className={`rounded px-2 py-0.5 text-xs ${
                    assetStatusBadge[a.status] ?? assetStatusBadge.available
                  }`}
                >
                  {a.status}
                </span>
                {a.category && (
                  <span className="text-xs text-neutral-500">/{a.category}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            수락 대기 — 내게 신청된 인수인계 ({pendingTo.length})
          </h2>
        </div>
        {pendingTo.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">신청된 인수인계가 없습니다.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {pendingTo.map((h) => (
              <li
                key={h.id}
                className="flex flex-wrap items-center gap-2 rounded border border-neutral-800 bg-neutral-800/40 px-3 py-2"
              >
                <span className="font-mono text-sm">{h.asset_code}</span>
                <span
                  className={`rounded px-2 py-0.5 text-xs ${
                    handoverStatusBadge[h.onchain_status] ?? handoverStatusBadge.pending
                  }`}
                >
                  {h.onchain_status}
                </span>
                <span className="text-xs text-neutral-500">
                  인계자 {shortAddr(h.from_wallet)}
                </span>
                <span className="ml-auto">
                  <Link
                    href="/handover"
                    className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-500"
                  >
                    수락하러 가기
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            최종 확정 대기 — 인수자 서명 완료 ({relayable.length})
          </h2>
        </div>
        {relayable.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">
            인수자 서명을 기다리는 항목이 없습니다. 총 {pendingFrom.length}건이 진행 중입니다.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {relayable.map((h) => (
              <li
                key={h.id}
                className="flex flex-wrap items-center gap-2 rounded border border-neutral-800 bg-neutral-800/40 px-3 py-2"
              >
                <span className="font-mono text-sm">{h.asset_code}</span>
                <span className="text-xs text-neutral-500">
                  → {shortAddr(h.to_wallet)}
                </span>
                <span className="ml-auto">
                  <Link
                    href="/handover"
                    className="rounded bg-emerald-600 px-3 py-1 text-xs text-white hover:bg-emerald-500"
                  >
                    최종 확정하기
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-6">
        <h2 className="text-lg font-semibold">최근 인수인계 이력</h2>
        {completedHistory.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">
            완료된 인수인계가 없습니다. {pendingFrom.length}건이 진행 중입니다.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {completedHistory.map((h) => (
              <li
                key={h.id}
                className="flex flex-wrap items-center gap-2 rounded border border-neutral-800 bg-neutral-800/40 px-3 py-2"
              >
                <span className="font-mono text-sm">{h.asset_code}</span>
                <span
                  className={`rounded px-2 py-0.5 text-xs ${
                    handoverStatusBadge[h.onchain_status] ?? handoverStatusBadge.pending
                  }`}
                >
                  {h.onchain_status}
                </span>
                <span className="text-xs text-neutral-500">
                  {shortAddr(h.from_wallet)} → {shortAddr(h.to_wallet)}
                </span>
                <span className="ml-auto text-[10px] text-neutral-600">
                  {new Date(h.completed_at ?? h.created_at).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}