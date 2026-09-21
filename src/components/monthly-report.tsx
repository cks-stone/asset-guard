"use client";

import { useCallback, useEffect, useState } from "react";
import { useWallet } from "@/lib/wallet/wallet-context";
import type { MonthlyReportData } from "@/lib/supabase/types";

async function readJson(res: Response): Promise<{ error?: string; [k: string]: unknown }> {
  try {
    return (await res.json()) as { error?: string };
  } catch {
    return { error: `HTTP ${res.status}` };
  }
}

function currentYm(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
}

function shiftYm(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

const REASON_BADGE: Record<string, string> = {
  퇴직: "bg-red-500/15 text-red-300",
  "퇴직(전근) 예정": "bg-orange-500/15 text-orange-300",
  "신규 입사": "bg-emerald-500/15 text-emerald-300",
  휴직: "bg-amber-500/15 text-amber-300",
  출산휴가: "bg-amber-500/15 text-amber-300",
  육아휴직: "bg-amber-500/15 text-amber-300",
  "재택 근무": "bg-sky-500/15 text-sky-300",
  "지사 근무": "bg-violet-500/15 text-violet-300",
  "해외지사 근무": "bg-violet-500/15 text-violet-300",
  "출장중 근무": "bg-violet-500/15 text-violet-300",
};

export function MonthlyReport({ scope = "mine" }: { scope?: "mine" | "all" }) {
  const { publicKey, connected } = useWallet();
  const [ym, setYm] = useState(currentYm());
  const [data, setData] = useState<MonthlyReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  const load = useCallback(async () => {
    if (!connected || !publicKey) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/monthly-report?scope=${scope}&month=${ym}`, {
        headers:
          scope === "all"
            ? { "x-wallet": publicKey, "x-admin-wallet": publicKey }
            : { "x-wallet": publicKey },
      });
      const json = (await readJson(res)) as { error?: string; data?: MonthlyReportData };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setData(json.data ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "월간 리포팅 조회 실패");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [connected, publicKey, ym, scope]);

  useEffect(() => {
    void load();
  }, [load, retryKey]);

  const year = ym.slice(0, 4);
  const monthNum = Number(ym.slice(5, 7));
  const isCurrentMonth = ym === currentYm();
  const monthLabel = `${year}년 ${monthNum}월`;

  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
        <div>
          <h2 className="text-lg font-semibold">월간 리포팅</h2>
          <p className="mt-0.5 text-xs text-neutral-500">
            {scope === "all"
              ? "전사 전체 자산 기준 — 인사상태·근무위치로 확인이 필요한 자산과 만기(계약 종료) 도래 자산을 한눈에 보여 줍니다."
              : "내가 관리하는 자산 기준 — 인사상태·근무위치로 확인이 필요한 자산과 만기(계약 종료) 도래 자산을 한눈에 보여 줍니다."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setYm((v) => shiftYm(v, -1))}
            disabled={loading}
            className="rounded border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm transition hover:bg-neutral-700 disabled:opacity-50"
          >
            ◀
          </button>
          <button
            onClick={() => {
              setYm(currentYm());
              setError(null);
            }}
            className={`rounded px-3 py-1.5 text-sm font-medium transition ${
              isCurrentMonth
                ? "bg-violet-600 text-white"
                : "border border-neutral-700 bg-neutral-800 hover:bg-neutral-700"
            }`}
          >
            {monthLabel}
          </button>
          <button
            onClick={() => setYm((v) => shiftYm(v, 1))}
            disabled={loading}
            className="rounded border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm transition hover:bg-neutral-700 disabled:opacity-50"
          >
            ▶
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-center justify-between gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <span>{error}</span>
          {connected && publicKey ? (
            <button
              onClick={() => setRetryKey((k) => k + 1)}
              className="shrink-0 rounded bg-red-500/20 px-3 py-1 text-xs transition hover:bg-red-500/30"
            >
              재시도
            </button>
          ) : (
            <span className="shrink-0 text-xs">
              지갑을 연결하면 리포팅을 볼 수 있습니다.
            </span>
          )}
        </div>
      )}

      {!connected || !publicKey ? null : loading && !data ? (
        <p className="py-6 text-center text-sm text-neutral-500">리포팅 불러오는 중…</p>
      ) : data ? (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4">
              <p className="text-xs text-neutral-500">확인 필요 (인사·근무 기준)</p>
              <p className="mt-1 text-2xl font-semibold text-amber-300">
                {data.confirmItems.length}건
              </p>
            </div>
            <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4">
              <p className="text-xs text-neutral-500">
                {isCurrentMonth ? "이번 달부터 3개월 내 만기 도래" : `${monthLabel} 리포팅 기준 만기 도래`}
              </p>
              <p className="mt-1 text-2xl font-semibold text-rose-300">
                {data.expiringItems.length}건
              </p>
            </div>
          </div>

          <div>
            <h3 className="pb-2 text-sm font-semibold text-neutral-300">
              ① 확인 필요 자산 — {data.confirmItems.length}건
            </h3>
            {data.confirmItems.length ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-neutral-700 text-xs text-neutral-500">
                      <th className="px-3 py-2 text-left font-medium">사유</th>
                      <th className="px-3 py-2 text-left font-medium">관리번호</th>
                      <th className="px-3 py-2 text-left font-medium">모델명</th>
                      <th className="px-3 py-2 text-left font-medium">사용자</th>
                      <th className="px-3 py-2 text-left font-medium">부문/팀</th>
                      <th className="px-3 py-2 text-left font-medium">자산위치</th>
                      <th className="px-3 py-2 text-left font-medium">인사상태</th>
                      <th className="px-3 py-2 text-left font-medium">근무위치</th>
                      <th className="px-3 py-2 text-left font-medium">권장 조치</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.confirmItems.map((it) => (
                      <tr key={it.management_no} className="border-b border-neutral-800/70 align-middle text-xs">
                        <td className="px-3 py-2">
                          <span
                            className={`rounded px-2 py-0.5 whitespace-nowrap ${
                              REASON_BADGE[it.reason] ?? "bg-neutral-700/40 text-neutral-300"
                            }`}
                          >
                            {it.reason}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-mono whitespace-nowrap">{it.management_no}</td>
                        <td className="px-3 py-2">
                          {it.model_name}
                          {it.category && (
                            <span className="ml-1 text-[10px] text-neutral-500">{it.category}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {it.user_name ?? it.employer ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-neutral-300">
                          {[it.division, it.department].filter(Boolean).join(" / ") || "—"}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">{it.location ?? "—"}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {it.employment_status ?? "—"}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">{it.work_location ?? "—"}</td>
                        <td className="px-3 py-2 text-neutral-300">{it.action}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="rounded-lg border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-neutral-500">
                이번 달 기준으로 인사·근무 변화로 인한 확인 항목이 없습니다.
              </p>
            )}
          </div>

          <div>
            <h3 className="pb-2 text-sm font-semibold text-neutral-300">
              ② 만기 도래 자산 — {data.expiringItems.length}건
              <span className="ml-2 text-[11px] font-normal text-neutral-500">
                {monthLabel} 시작일 기준 이번 달 + 향후 3개월 내 계약 종료
              </span>
            </h3>
            {data.expiringItems.length ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-neutral-700 text-xs text-neutral-500">
                      <th className="px-3 py-2 text-left font-medium">남은 기간</th>
                      <th className="px-3 py-2 text-left font-medium">관리번호</th>
                      <th className="px-3 py-2 text-left font-medium">모델명</th>
                      <th className="px-3 py-2 text-left font-medium">사용자</th>
                      <th className="px-3 py-2 text-left font-medium">부문/팀</th>
                      <th className="px-3 py-2 text-left font-medium">자산위치</th>
                      <th className="px-3 py-2 text-left font-medium">종료일</th>
                      <th className="px-3 py-2 text-left font-medium">권장 조치</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.expiringItems.map((it) => {
                      const overdue = it.days_left < 0;
                      return (
                        <tr key={it.management_no} className="border-b border-neutral-800/70 align-middle text-xs">
                          <td className="px-3 py-2 whitespace-nowrap">
                            <span
                              className={`rounded px-2 py-0.5 ${
                                overdue
                                  ? "bg-red-500/15 text-red-300"
                                  : it.days_left <= 30
                                    ? "bg-amber-500/15 text-amber-300"
                                    : "bg-neutral-700/40 text-neutral-300"
                              }`}
                            >
                              {overdue ? "기간 경과" : it.days_left === 0 ? "당일" : `D-${it.days_left}`}
                            </span>
                          </td>
                          <td className="px-3 py-2 font-mono whitespace-nowrap">{it.management_no}</td>
                          <td className="px-3 py-2">
                            {it.model_name}
                            {it.category && (
                              <span className="ml-1 text-[10px] text-neutral-500">{it.category}</span>
                            )}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">{it.user_name ?? "—"}</td>
                          <td className="px-3 py-2 text-neutral-300">
                            {[it.division, it.department].filter(Boolean).join(" / ") || "—"}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">{it.location ?? "—"}</td>
                          <td className="px-3 py-2 font-mono whitespace-nowrap">{it.rental_end_date}</td>
                          <td className="px-3 py-2 text-neutral-300">{it.action}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="rounded-lg border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-neutral-500">
                해당 기간 내 만기 도래 자산이 없습니다.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}