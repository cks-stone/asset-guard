"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@/lib/wallet/wallet-context";
import {
  LineageGraph,
  type LineageAssetInfo,
  type TransferEdge,
} from "./lineage-graph";

interface LineageResponse {
  asset: LineageAssetInfo;
  labels: Record<string, string | null>;
  transfers: TransferEdge[];
}

export function LineageView({ managementNo }: { managementNo: string }) {
  const { publicKey, connected, connecting, connect } = useWallet();

  const [data, setData] = useState<LineageResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!publicKey) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/assets/${encodeURIComponent(managementNo)}/lineage`,
        { headers: { "x-wallet": publicKey } },
      );
      const json = (await res.json()) as Partial<LineageResponse> & {
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      if (!json.asset || !json.transfers) throw new Error("이관 이력을 불러오지 못했습니다");
      setData(json as LineageResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "이관 이력 조회 실패");
    } finally {
      setLoading(false);
    }
  }, [publicKey, managementNo]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!connected) {
    return (
      <div className="w-full max-w-3xl rounded-xl border border-neutral-800 bg-neutral-900 p-10 text-center">
        <p className="text-sm text-neutral-400">
          지갑으로 로그인하면 이관 이력(이동 그래프)을 볼 수 있습니다.
        </p>
        <button
          onClick={() => void connect()}
          disabled={connecting}
          className="mt-5 rounded bg-violet-600 px-5 py-2 text-sm text-white hover:bg-violet-500 disabled:opacity-50"
        >
          {connecting ? "연결 중..." : "지갑 연결"}
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl space-y-5">
      <div className="flex items-center justify-between">
        <Link
          href="/"
          className="text-sm text-neutral-400 hover:text-neutral-200"
        >
          ← 홈
        </Link>
      </div>

      {error && (
        <p className="rounded bg-red-950/60 px-4 py-2 text-sm text-red-300">{error}</p>
      )}
      {loading && <p className="text-xs text-neutral-500">불러오는 중...</p>}

      {data && (
        <>
          <header className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
            <p className="text-xs text-neutral-500">렌탈 자산</p>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="text-lg font-bold">{data.asset.management_no}</h1>
              <span className="text-sm text-neutral-300">{data.asset.model_name}</span>
              {data.asset.serial_no && (
                <span className="font-mono text-xs text-neutral-500">
                  SN: {data.asset.serial_no}
                </span>
              )}
              <span className="rounded bg-neutral-700/40 px-2 py-0.5 text-xs text-neutral-300">
                {data.asset.status}
              </span>
            </div>
            <p className="mt-3 text-xs text-neutral-500">
              지갑으로 로그인한 사용자 누구나 이 자산이 거쳐간 지갑 이동 경로를 볼 수
              있습니다. 온체인 PDA가 진실 소스이며, 아래 기록은 조회용입니다.
            </p>
          </header>

          <LineageGraph
            asset={data.asset}
            labels={data.labels}
            transfers={data.transfers}
            currentManagedBy={data.asset.managed_by}
            viewer={publicKey}
          />
        </>
      )}
    </div>
  );
}