"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AssetFilterBar } from "@/components/asset-filter-bar";
import { useWallet } from "@/lib/wallet/wallet-context";
import { EMPTY_FILTERS } from "@/lib/supabase/asset-filters";
import { filtersToSearchParams } from "@/lib/supabase/asset-filters";
import type { AssetFilters } from "@/lib/supabase/asset-filters";
import type { RentalAssetRow } from "@/lib/supabase/types";

async function readJson(res: Response): Promise<{ error?: string; [k: string]: unknown }> {
  try {
    return (await res.json()) as { error?: string };
  } catch {
    return { error: `HTTP ${res.status}` };
  }
}

const statusBadge: Record<string, string> = {
  정상사용: "bg-emerald-500/15 text-emerald-300",
  유휴: "bg-sky-500/15 text-sky-300",
  계약종료: "bg-neutral-500/15 text-neutral-400",
};

// 전사 유휴 자산 목록 — 로그인한 모든 사용자가 회사 전체 유휴 자산을 볼 수 있다.
// 대시보드 좌측 "유휴 자산(전사)" 탭에서 사용한다.
export function IdleAssetsList() {
  const { publicKey } = useWallet();

  const [idleAssets, setIdleAssets] = useState<RentalAssetRow[]>([]);
  const [idleFilters, setIdleFilters] = useState<AssetFilters>(EMPTY_FILTERS);
  const [loading, setLoading] = useState(false);

  // 전사 유휴 자산 조회 — 내 담당 여부와 무관하게 공개되는 전사 목록이므로
  // 별도 diff 없이 갱신한다(인수 배정 등에 따라 목록 자체가 재구성되기 때문).
  const refreshIdle = useCallback(async (quiet = false) => {
    if (!publicKey) return;
    if (!quiet) setLoading(true);
    try {
      const url = new URL("/api/rental-assets?idle=1", window.location.origin);
      for (const [k, v] of filtersToSearchParams(idleFilters)) {
        url.searchParams.set(k, v);
      }
      const res = await fetch(url, {
        headers: { "x-wallet": publicKey },
      });
      const json = (await readJson(res)) as {
        error?: string;
        data?: RentalAssetRow[];
      };
      if (res.ok) setIdleAssets(json.data ?? []);
    } catch (err) {
      console.error("[idle-assets] 유휴 자산 목록 조회 실패:", err);
    } finally {
      setLoading(false);
    }
  }, [publicKey, idleFilters]);

  useEffect(() => {
    void refreshIdle();
  }, [refreshIdle]);

  // 탭/기기 복귀(포커스·가시성) 시 조용히 최신화 — 새로고침 없이 바로 반영.
  useEffect(() => {
    const onVisible = () => {
      void refreshIdle(true);
    };
    window.addEventListener("focus", onVisible);
    const onVisChange = () => {
      if (document.visibilityState === "visible") onVisible();
    };
    document.addEventListener("visibilitychange", onVisChange);
    return () => {
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisChange);
    };
  }, [refreshIdle]);

  // 주기 폴링(10초) — 유휴 전사 목록을 조용히 갱신.
  useEffect(() => {
    if (!publicKey) return;
    const id = window.setInterval(() => {
      void refreshIdle(true);
    }, 10_000);
    return () => window.clearInterval(id);
  }, [publicKey, refreshIdle]);

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">유휴 자산 (전사 공개)</h2>
          <span className="text-xs text-neutral-500">
            로그인한 모든 사용자가 회사 전체 유휴 자산을 볼 수 있습니다.
          </span>
        </div>
        <div className="mt-4">
          <AssetFilterBar filters={idleFilters} onChange={setIdleFilters} />
        </div>
        {loading && <p className="mt-3 text-xs text-neutral-500">불러오는 중...</p>}
        {!loading && idleAssets.length === 0 && (
          <p className="mt-3 text-sm text-neutral-500">현재 유휴 상태인 자산이 없습니다.</p>
        )}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[1100px] whitespace-nowrap border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-700 text-xs text-neutral-500">
                <th className="px-3 py-2 font-medium">관리번호</th>
                <th className="px-3 py-2 font-medium">카테고리</th>
                <th className="px-3 py-2 font-medium">모델명</th>
                <th className="px-3 py-2 font-medium">제조사</th>
                <th className="px-3 py-2 font-medium">사용자</th>
                <th className="px-3 py-2 font-medium">부문/팀</th>
                <th className="px-3 py-2 font-medium">자산위치</th>
                <th className="px-3 py-2 font-medium">렌탈사</th>
                <th className="px-3 py-2 font-medium">청구</th>
                <th className="px-3 py-2 font-medium">렌탈료</th>
                <th className="px-3 py-2 font-medium">렌탈 시작일</th>
                <th className="px-3 py-2 font-medium">렌탈 종료일</th>
                <th className="px-3 py-2 font-medium">상태</th>
              </tr>
            </thead>
            <tbody>
              {idleAssets.map((a) => (
                <tr key={a.management_no} className="border-b border-neutral-800/70 align-middle">
                  <td className="px-3 py-2">
                    <div className="font-mono text-xs">{a.management_no}</div>
                    <Link
                      href={`/assets/${encodeURIComponent(a.management_no)}/lineage`}
                      className="text-[10px] text-blue-400 underline hover:text-blue-300"
                    >
                      이관 그래프 ↗
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    {a.category ? (
                      <span className="rounded bg-neutral-700/40 px-2 py-0.5 text-xs text-neutral-200">
                        {a.category}
                      </span>
                    ) : (
                      <span className="text-xs text-neutral-600">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {a.model_name}
                    {a.serial_no && (
                      <span className="ml-2 text-[10px] font-mono text-neutral-500">
                        SN: {a.serial_no}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">{a.manufacturer ?? "—"}</td>
                  <td className="px-3 py-2">{a.user_name ?? "—"}</td>
                  <td className="px-3 py-2 text-xs">
                    {a.division && <span>{a.division}</span>}
                    {a.division && a.department && " / "}
                    {a.department && <span>{a.department}</span>}
                    {!a.division && !a.department && "—"}
                  </td>
                  <td className="px-3 py-2 text-xs">{a.location ?? "—"}</td>
                  <td className="px-3 py-2 text-xs">{a.rental_company ?? "—"}</td>
                  <td className="px-3 py-2 text-xs">
                    {a.billing_cycle ?? "—"}
                    {a.billing_month && (
                      <span className="ml-2 text-[10px] text-neutral-500">
                        {a.billing_month}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {a.rental_fee != null ? `${a.rental_fee.toLocaleString()}원` : "—"}
                  </td>
                  <td className="px-3 py-2 text-xs">{a.rental_start_date ?? "—"}</td>
                  <td className="px-3 py-2 text-xs">{a.rental_end_date ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded px-2 py-0.5 text-xs ${
                        statusBadge[a.status] ?? "bg-neutral-700/40 text-neutral-300"
                      }`}
                    >
                      {a.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}