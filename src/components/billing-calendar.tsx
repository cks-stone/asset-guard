"use client";

import { useMemo, useState } from "react";
import type { RentalAssetRow } from "@/lib/supabase/types";

const fmt = (n: number) => n.toLocaleString("ko-KR");
const MONTHS = Array.from({ length: 12 }, (_, i) => `${i + 1}월`);

function yearOf(date: string | null): number | null {
  if (!date) return null;
  const y = new Date(date).getFullYear();
  return Number.isFinite(y) ? y : null;
}

function parseBillMonths(text: string | null | undefined): number[] {
  if (!text) return [];
  return text
    .replace(/월/g, "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^\d{1,2}$/.test(s))
    .map((s) => Number(s))
    .filter((m) => m >= 1 && m <= 12);
}

function isAfterEnd(asset: RentalAssetRow, year: number, month: number): boolean {
  const end = asset.rental_end_date;
  if (!end) return false;
  const ey = new Date(end).getFullYear();
  const em = new Date(end).getMonth() + 1;
  if (!Number.isFinite(ey)) return false;
  return year > ey || (year === ey && month > em);
}

interface YearPayments {
  rows: { asset: RentalAssetRow; monthly: Map<number, number> }[];
  byMonth: Map<number, number>;
  total: number;
}

export function buildYearPayments(assets: RentalAssetRow[], year: number): YearPayments {
  const rows: YearPayments["rows"] = [];
  const byMonth = new Map<number, number>();
  let total = 0;

  const add = (row: { asset: RentalAssetRow; monthly: Map<number, number> }, m: number, v: number) => {
    if (v <= 0) return;
    row.monthly.set(m, (row.monthly.get(m) ?? 0) + v);
    byMonth.set(m, (byMonth.get(m) ?? 0) + v);
    total += v;
  };

  for (const asset of assets) {
    const sy = yearOf(asset.rental_start_date);
    const ey = yearOf(asset.rental_end_date);
    if (sy && sy > year) continue;

    const sm = asset.rental_start_date ? new Date(asset.rental_start_date).getMonth() + 1 : 1;
    const em = asset.rental_end_date ? new Date(asset.rental_end_date).getMonth() + 1 : 12;
    const firstMonth = sy && sy < year ? 1 : sm;
    // 청구 가능한 마지막 월 — 이미 종료된 연도면 0 (청구 없음, 칸만 '만기'로 표시)
    const lastMonth = !ey ? 12 : ey > year ? 12 : ey === year ? em : 0;
    const fee = asset.rental_fee ?? 0;
    if (fee <= 0) continue;

    const row = { asset, monthly: new Map<number, number>() };
    let pushed = false;
    const push = (m: number, v: number) => {
      if (m < firstMonth || m > lastMonth) return;
      add(row, m, v);
      pushed = true;
    };

    if (asset.billing_cycle === "월납") {
      for (let m = firstMonth; m <= lastMonth; m++) push(m, fee);
    } else if (asset.billing_cycle === "연납") {
      const months = parseBillMonths(asset.billing_month);
      push(months.includes(firstMonth) ? firstMonth : (months[0] ?? firstMonth), fee);
    } else if (asset.billing_cycle === "반기납") {
      const months = parseBillMonths(asset.billing_month);
      (months.length ? months : [firstMonth]).forEach((m) => push(m, fee));
    } else if (asset.billing_cycle === "일시납") {
      const payMonth = parseBillMonths(asset.billing_month)[0] ?? sm;
      if (sy === year) push(payMonth, fee);
    }

    // 종료 후 연도에도 행을 유지 (12개월 모두 '만기'로 표시)
    if (pushed || (ey && ey < year)) rows.push(row);
  }

  return { rows, byMonth, total };
}

export function BillingCalendar({ assets }: { assets: RentalAssetRow[] }) {
  const years = useMemo(() => {
    const ys = assets.flatMap((a) => {
      const s = yearOf(a.rental_start_date);
      const e = yearOf(a.rental_end_date);
      const list: number[] = [];
      if (s) list.push(s);
      if (e) list.push(e);
      return list;
    });
    if (ys.length === 0) return [new Date().getFullYear()];
    const min = Math.min(...ys);
    const max = Math.max(new Date().getFullYear(), ...ys);
    const out: number[] = [];
    for (let y = min; y <= max; y++) out.push(y);
    return out;
  }, [assets]);

  const today = new Date().getFullYear();
  const [year, setYear] = useState<number>(years.includes(today) ? today : years[0]);

  const data = useMemo(() => buildYearPayments(assets, year), [assets, year]);

  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">청구 달력</h2>
          <p className="mt-1 text-xs text-neutral-500">
            연도를 클릭하면 해당 연도의 월별 렌탈 비용이 보입니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {years.map((y) => (
            <button
              key={y}
              type="button"
              onClick={() => setYear(y)}
              aria-pressed={y === year}
              className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                y === year
                  ? "border-violet-500 bg-violet-600 text-white"
                  : "border-neutral-700 text-neutral-300 hover:border-neutral-500"
              }`}
            >
              {y}년
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[1200px] whitespace-nowrap border-collapse text-sm">
          <thead>
            <tr className="border-b border-neutral-700 text-center text-xs text-neutral-400">
              <th className="px-3 py-2 text-left font-medium">자산</th>
              {MONTHS.map((m) => (
                <th key={m} className="min-w-[76px] px-2 py-2 font-medium">
                  {m}
                </th>
              ))}
              <th className="min-w-[90px] px-3 py-2 text-right font-medium">합계</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map(({ asset, monthly }) => {
              const rowTotal = [...monthly.values()].reduce((a, b) => a + b, 0);
              return (
                <tr key={asset.management_no} className="border-b border-neutral-800/70">
                  <td className="px-3 py-2">
                    <span className="font-mono text-xs text-neutral-400">
                      {asset.management_no}
                    </span>
                    <span className="ml-2 text-xs">{asset.model_name}</span>
                  </td>
                  {MONTHS.map((_, i) => {
                    const m = i + 1;
                    const v = monthly.get(m) ?? 0;
                    const expired = isAfterEnd(asset, year, m);
                    return (
                      <td
                        key={i}
                        className={`px-2 py-2 text-right font-mono text-[11px] ${
                          v > 0
                            ? "text-neutral-200"
                            : expired
                              ? "text-amber-500/80"
                              : "text-neutral-700"
                        }`}
                      >
                        {v > 0 ? fmt(v) : expired ? "만기" : "—"}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-right font-mono text-xs font-semibold text-violet-300">
                    {rowTotal > 0 ? fmt(rowTotal) : "—"}
                  </td>
                </tr>
              );
            })}
            {data.rows.length === 0 && (
              <tr>
                <td
                  colSpan={14}
                  className="px-3 py-6 text-center text-xs text-neutral-500"
                >
                  해당 연도에 청구가 있는 렌탈 자산이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-neutral-600 bg-neutral-800/40 text-right font-semibold">
              <td className="px-3 py-2 text-left text-xs text-neutral-300">
                월별 합계
              </td>
              {MONTHS.map((_, i) => {
                const v = data.byMonth.get(i + 1) ?? 0;
                return (
                  <td
                    key={i}
                    className={`px-2 py-2 font-mono text-xs ${
                      v > 0 ? "text-neutral-50" : "text-neutral-600"
                    }`}
                  >
                    {v > 0 ? fmt(v) : "—"}
                  </td>
                );
              })}
              <td className="px-3 py-2 font-mono text-xs text-amber-300">
                {data.total > 0 ? `₩${fmt(data.total)}` : "—"}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}