"use client";

import { RENTAL_ASSET_CATEGORIES } from "@/lib/supabase/types";
import type { ReactNode } from "react";
import { EMPTY_FILTERS } from "@/lib/supabase/asset-filters";
import type { AssetFilters } from "@/lib/supabase/asset-filters";

const BILLING_CYCLES = ["월납", "연납", "반기납", "일시납"];
const STATUSES = ["정상사용", "유휴", "계약종료"];

const fieldCls =
  "rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-200 outline-none focus:border-violet-500";

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] text-neutral-500">{label}</span>
      {children}
    </label>
  );
}

export function AssetFilterBar({
  filters,
  onChange,
}: {
  filters: AssetFilters;
  onChange: (filters: AssetFilters) => void;
}) {
  const set = (key: keyof AssetFilters, value: string) =>
    onChange({ ...filters, [key]: value });

  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-3 rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-3">
      <FilterField label="검색 (관리번호/시리얼/모델/사용자)">
        <input
          value={filters.query}
          onChange={(e) => set("query", e.target.value)}
          placeholder="예: AST-2026-0012"
          className={`${fieldCls} w-44`}
        />
      </FilterField>
      <FilterField label="카테고리">
        <select
          value={filters.category}
          onChange={(e) => set("category", e.target.value)}
          className={fieldCls}
        >
          <option value="">전체</option>
          {RENTAL_ASSET_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </FilterField>
      <FilterField label="모델명">
        <input
          value={filters.modelName}
          onChange={(e) => set("modelName", e.target.value)}
          placeholder="예: Latitude"
          className={`${fieldCls} w-28`}
        />
      </FilterField>
      <FilterField label="제조사">
        <input
          value={filters.manufacturer}
          onChange={(e) => set("manufacturer", e.target.value)}
          placeholder="예: Dell"
          className={`${fieldCls} w-24`}
        />
      </FilterField>
      <FilterField label="부문">
        <input
          value={filters.division}
          onChange={(e) => set("division", e.target.value)}
          placeholder="예: A부문"
          className={`${fieldCls} w-24`}
        />
      </FilterField>
      <FilterField label="팀">
        <input
          value={filters.department}
          onChange={(e) => set("department", e.target.value)}
          placeholder="예: AAAA팀"
          className={`${fieldCls} w-24`}
        />
      </FilterField>
      <FilterField label="렌탈사">
        <input
          value={filters.rentalCompany}
          onChange={(e) => set("rentalCompany", e.target.value)}
          placeholder="렌탈사"
          className={`${fieldCls} w-24`}
        />
      </FilterField>
      <FilterField label="청구">
        <select
          value={filters.billingCycle}
          onChange={(e) => set("billingCycle", e.target.value)}
          className={fieldCls}
        >
          <option value="">전체</option>
          {BILLING_CYCLES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </FilterField>
      <FilterField label="렌탈료">
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={0}
            value={filters.feeMin}
            onChange={(e) => set("feeMin", e.target.value)}
            placeholder="최소"
            className={`${fieldCls} w-20`}
          />
          <span className="text-neutral-600">~</span>
          <input
            type="number"
            min={0}
            value={filters.feeMax}
            onChange={(e) => set("feeMax", e.target.value)}
            placeholder="최대"
            className={`${fieldCls} w-20`}
          />
        </div>
      </FilterField>
      <FilterField label="렌탈 시작일">
        <div className="flex items-center gap-1">
          <input
            type="date"
            value={filters.startFrom}
            onChange={(e) => set("startFrom", e.target.value)}
            className={fieldCls}
          />
          <span className="text-neutral-600">~</span>
          <input
            type="date"
            value={filters.startTo}
            onChange={(e) => set("startTo", e.target.value)}
            className={fieldCls}
          />
        </div>
      </FilterField>
      <FilterField label="렌탈 종료일">
        <div className="flex items-center gap-1">
          <input
            type="date"
            value={filters.endFrom}
            onChange={(e) => set("endFrom", e.target.value)}
            className={fieldCls}
          />
          <span className="text-neutral-600">~</span>
          <input
            type="date"
            value={filters.endTo}
            onChange={(e) => set("endTo", e.target.value)}
            className={fieldCls}
          />
        </div>
      </FilterField>
      <FilterField label="상태">
        <select
          value={filters.status}
          onChange={(e) => set("status", e.target.value)}
          className={fieldCls}
        >
          <option value="">전체</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </FilterField>
      <button
        type="button"
        onClick={() => onChange({ ...EMPTY_FILTERS })}
        className="rounded border border-neutral-700 px-2.5 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
      >
        초기화
      </button>
    </div>
  );
}