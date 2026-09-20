"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { WalletDirectoryPicker } from "@/components/wallet-directory-picker";
import { AssetFilterBar } from "@/components/asset-filter-bar";
import { useWallet } from "@/lib/wallet/wallet-context";
import { isValidSolanaAddress } from "@/lib/admin";
import { RENTAL_ASSET_CATEGORIES } from "@/lib/supabase/types";
import { EMPTY_FILTERS } from "@/lib/supabase/asset-filters";
import { filtersToSearchParams } from "@/lib/supabase/asset-filters";
import type { AssetFilters } from "@/lib/supabase/asset-filters";
import type { BillingCycle, RentalAssetRow } from "@/lib/supabase/types";

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

const billingCycleLabels: Record<BillingCycle, string> = {
  월납: "월납",
  연납: "연납",
  반기납: "반기납",
  일시납: "일시납",
};

const emptyForm = {
  management_no: "",
  serial_no: "",
  order_no: "",
  model_name: "",
  category: "",
  manufacturer: "",
  user_name: "",
  division: "",
  department: "",
  location: "",
  rental_company: "",
  billing_cycle: "월납",
  rental_fee: "",
  billing_month: "",
  rental_start_date: "",
  rental_end_date: "",
  status: "정상사용",
};

// 내가 담당(managed_by)하는 자산 + 내게 이전 요청이 온 인입 자산 목록.
// 대시보드 좌측 "내가 관리하고 있는 자산목록" 탭에서 사용한다.
export function MyAssetsList() {
  const { publicKey } = useWallet();

  const [assets, setAssets] = useState<RentalAssetRow[]>([]);
  const [assetFilters, setAssetFilters] = useState<AssetFilters>(EMPTY_FILTERS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [transferTo, setTransferTo] = useState<Record<string, string>>({});
  const [acting, setActing] = useState<string | null>(null);

  // 변경 감지용 이전 스냅샷 — 폴링/포커스 재조회 시 바뀐 행만 5초간 깜빡이게 해 새로고침 없이 변화를 보여준다.
  const prevAssetsRef = useRef<RentalAssetRow[]>([]);
  const prevIncomingRef = useRef<RentalAssetRow[]>([]);
  const [flashNos, setFlashNos] = useState<ReadonlySet<string>>(new Set());
  const flashTimersRef = useRef<Map<string, number>>(new Map());
  // 필터가 바뀌어 재조회하는 경우 diff(깜빡임)를 건너뛴다 —
  // 검색/필터 입력 때마다 목록 전체가 깜빡이는 것을 막는다.
  const lastFilterKeyRef = useRef("");

  // diff 대상 스냅샷을 갱신하고, 바뀐 관리번호를 5초간 깜빡이게 한다.
  const applyDiff = useCallback((prev: RentalAssetRow[], next: RentalAssetRow[]) => {
    const prevByNo = new Map(prev.map((r) => [r.management_no, r]));
    const changed: string[] = [];
    for (const r of next) {
      const p = prevByNo.get(r.management_no);
      if (!p || JSON.stringify(p) !== JSON.stringify(r)) changed.push(r.management_no);
    }
    if (changed.length === 0) return;
    setFlashNos((cur) => {
      const nextSet = new Set(cur);
      changed.forEach((no) => nextSet.add(no));
      return nextSet;
    });
    changed.forEach((no) => {
      const prevTimer = flashTimersRef.current.get(no);
      if (prevTimer) window.clearTimeout(prevTimer);
      const timer = window.setTimeout(() => {
        flashTimersRef.current.delete(no);
        setFlashNos((cur) => {
          const nextSet = new Set(cur);
          nextSet.delete(no);
          return nextSet;
        });
      }, 5000);
      flashTimersRef.current.set(no, timer);
    });
  }, []);

  useEffect(
    () => () => {
      flashTimersRef.current.forEach((t) => window.clearTimeout(t));
    },
    [],
  );

  const [incomingAssets, setIncomingAssets] = useState<RentalAssetRow[]>([]);
  const [incomingLoading, setIncomingLoading] = useState(false);

  // 렌탈 목록에 표시할 행: 내 담당(managed_by) 자산 + 내게 이전 요청이 온 인입 자산.
  // 인입 자산은 목록에서 바로 인수 승인/거절을 처리할 수 있도록 함께 노출.
  const visibleAssets = useMemo(() => {
    const byNo = new Map<string, RentalAssetRow & { incoming: boolean }>();
    for (const a of assets) byNo.set(a.management_no, { ...a, incoming: false });
    for (const a of incomingAssets) {
      byNo.set(a.management_no, { ...a, incoming: true });
    }
    return [...byNo.values()].sort((x, y) =>
      y.management_no.localeCompare(x.management_no),
    );
  }, [assets, incomingAssets]);

  const refreshIncoming = useCallback(async (quiet = false) => {
    if (!publicKey) return;
    if (!quiet) setIncomingLoading(true);
    try {
      const res = await fetch(
        new URL("/api/rental-assets?incoming=1", window.location.origin),
        { headers: { "x-wallet": publicKey } },
      );
      const json = (await readJson(res)) as { error?: string; data?: RentalAssetRow[] };
      if (res.ok) {
        const next = json.data ?? [];
        // 첫 로드(빈 prev)에서만 diff를 건너뛴다 — 목록 전체가 깜빡이는 것을 막는다.
        // 그 이후 자동 재조회(폴링·포커스/가시성 복귀 = quiet)에서도 applyDiff를 실행해,
        // A의 이전요청으로 내게 새로 도착한 행만 깜빡인다.
        if (prevIncomingRef.current.length > 0) {
          applyDiff(prevIncomingRef.current, next);
        }
        prevIncomingRef.current = next;
        setIncomingAssets(next);
      }
    } catch (err) {
      console.error("[my-assets] 수신 대기 목록 조회 실패:", err);
    } finally {
      setIncomingLoading(false);
    }
  }, [publicKey, applyDiff]);

  const handleReceiverAction = async (
    asset: RentalAssetRow,
    action: "approve" | "reject",
  ) => {
    if (!publicKey) return;
    if (action === "reject" && !window.confirm(`${asset.management_no} 인수를 거절할까요?`)) {
      return;
    }
    setActing(asset.management_no);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(
        `/api/rental-assets/${encodeURIComponent(asset.management_no)}/transfer-request/receiver`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-wallet": publicKey },
          body: JSON.stringify({ action }),
        },
      );
      const json = await readJson(res);
      if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);
      setNotice(json.message as string);
      await refreshIncoming();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "수신 승인/거절 실패");
    } finally {
      setActing(null);
    }
  };

  const refresh = useCallback(async (quiet = false) => {
    if (!publicKey) return;
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const url = new URL("/api/rental-assets", window.location.origin);
      for (const [k, v] of filtersToSearchParams(assetFilters)) {
        url.searchParams.set(k, v);
      }
      const res = await fetch(url, {
        headers: { "x-wallet": publicKey },
      });
      const json = (await readJson(res)) as {
        error?: string;
        data?: RentalAssetRow[];
      };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      const next = json.data ?? [];
      const filterKey = JSON.stringify(assetFilters);
      const filterChanged = filterKey !== lastFilterKeyRef.current;
      // 필터나 첫 로드로 인한 재조회는 diff를 건너뛰어 목록 전체가 깜빡이는 것을 막는다.
      // 같은 필터로 재조회(폴링·포커스)할 때만 applyDiff로 실제 변경된 행을 깜빡인다.
      if (!filterChanged && prevAssetsRef.current.length > 0) {
        applyDiff(prevAssetsRef.current, next);
      }
      prevAssetsRef.current = next;
      lastFilterKeyRef.current = filterKey;
      setAssets(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "목록 조회 실패");
    }
  }, [publicKey, assetFilters, applyDiff]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (publicKey) void refreshIncoming();
  }, [publicKey, refreshIncoming]);

  // 탭/기기 복귀(포커스·가시성) 시 조용히 최신화 — 새로고침 없이 바로 반영.
  useEffect(() => {
    const onVisible = () => {
      void refresh(true);
      if (publicKey) void refreshIncoming(true);
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
  }, [publicKey, refresh, refreshIncoming]);

  // 주기 폴링(10초) — 내 담당 자산 + 수신 대기 목록을 조용히 갱신.
  useEffect(() => {
    if (!publicKey) return;
    const id = window.setInterval(() => {
      void refresh(true);
      void refreshIncoming(true);
    }, 10_000);
    return () => window.clearInterval(id);
  }, [publicKey, refresh, refreshIncoming]);

  const handleSubmit = async () => {
    if (!publicKey) return;
    if (!form.management_no.trim() || !form.model_name.trim()) {
      setError("관리번호와 모델명은 필수입니다.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const body: Record<string, string | number | null> = {
        management_no: form.management_no.trim(),
        model_name: form.model_name.trim(),
        category: form.category.trim() || null,
        status: form.status,
        billing_cycle: form.billing_cycle,
      };
      const textFields: (keyof typeof form)[] = [
        "serial_no",
        "order_no",
        "manufacturer",
        "user_name",
        "division",
        "department",
        "location",
        "rental_company",
        "billing_month",
        "rental_start_date",
        "rental_end_date",
      ];
      for (const key of textFields) {
        const v = (form[key] as string).trim();
        body[key] = v === "" ? null : v;
      }
      if (form.rental_fee.trim()) {
        const fee = Number(form.rental_fee);
        if (Number.isNaN(fee) || fee < 0) throw new Error("렌탈료는 0 이상 숫자여야 합니다");
        body.rental_fee = fee;
      } else {
        body.rental_fee = null;
      }

      const res = await fetch("/api/rental-assets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-wallet": publicKey,
        },
        body: JSON.stringify(body),
      });
      const json = await readJson(res);
      if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);
      setNotice(`렌탈 자산 등록 완료 (${form.management_no})`);
      setForm(emptyForm);
      setFormOpen(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "등록 실패");
    } finally {
      setBusy(false);
    }
  };

  const shortMiddle = (addr: string) => `${addr.slice(0, 6)}…${addr.slice(-4)}`;

  const handleTransferRequest = async (asset: RentalAssetRow) => {
    const toWallet = (transferTo[asset.management_no] ?? "").trim();
    if (!publicKey) return;
    if (!isValidSolanaAddress(toWallet)) {
      setError("유효한 Solana 지갑 주소를 입력하세요.");
      return;
    }
    if (toWallet === publicKey) {
      setError("자기 자신에게 인수인계할 수 없습니다.");
      return;
    }
    setActing(asset.management_no);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(
        `/api/rental-assets/${encodeURIComponent(asset.management_no)}/transfer-request`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-wallet": publicKey,
          },
          body: JSON.stringify({ to_wallet: toWallet }),
        },
      );
      const json = await readJson(res);
      if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);
      setNotice(`${asset.management_no} 이전 요청 완료 — 수신자 승인 후 관리자가 최종 승인하면 확정됩니다.`);
      setTransferTo((prev) => ({ ...prev, [asset.management_no]: "" }));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "이전 요청 실패");
    } finally {
      setActing(null);
    }
  };

  const handleCancelRequest = async (asset: RentalAssetRow) => {
    if (!publicKey) return;
    if (!window.confirm(`${asset.management_no} 이전 요청을 취소할까요?`)) return;
    setActing(asset.management_no);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(
        `/api/rental-assets/${encodeURIComponent(asset.management_no)}/transfer-request`,
        {
          method: "DELETE",
          headers: { "x-wallet": publicKey },
        },
      );
      const json = await readJson(res);
      if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);
      setNotice(`${asset.management_no} 이전 요청을 취소했습니다.`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "이전 요청 취소 실패");
    } finally {
      setActing(null);
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <p className="rounded bg-red-950/60 px-4 py-2 text-sm text-red-300">{error}</p>
      )}
      {notice && (
        <p className="rounded bg-emerald-950/60 px-4 py-2 text-sm text-emerald-300">
          {notice}
        </p>
      )}

      <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">
            내가 관리하고 있는 자산목록 ({visibleAssets.length})
          </h2>
          <button
            type="button"
            onClick={() => {
              setForm(emptyForm);
              setFormOpen(true);
            }}
            className="rounded bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500"
          >
            + 자산등록
          </button>
        </div>
        <div className="mt-4">
          <AssetFilterBar filters={assetFilters} onChange={setAssetFilters} />
        </div>
        {loading && <p className="mt-3 text-xs text-neutral-500">불러오는 중...</p>}
        {!loading && visibleAssets.length === 0 && (
          <p className="mt-3 text-sm text-neutral-500">관리 중인 자산이 없습니다.</p>
        )}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[1220px] whitespace-nowrap border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-700 text-xs text-neutral-500">
                <th className="px-3 py-2 font-medium">관리번호</th>
                <th className="px-3 py-2 font-medium">카테고리</th>
                <th className="px-3 py-2 font-medium">모델명</th>
                <th className="px-3 py-2 font-medium">제조사</th>
                <th className="px-3 py-2 font-medium">사용자</th>
                <th className="px-3 py-2 font-medium">부문/팀</th>
                <th className="px-3 py-2 font-medium">위치</th>
                <th className="px-3 py-2 font-medium">렌탈사</th>
                <th className="px-3 py-2 font-medium">청구</th>
                <th className="px-3 py-2 font-medium">렌탈료</th>
                <th className="px-3 py-2 font-medium">렌탈 시작일</th>
                <th className="px-3 py-2 font-medium">렌탈 종료일</th>
                <th className="px-3 py-2 font-medium">상태</th>
                <th className="px-3 py-2 font-medium">인수인계</th>
              </tr>
            </thead>
            <tbody>
              {visibleAssets.map((a) => (
                <tr key={a.management_no} className={`border-b border-neutral-800/70 align-middle${flashNos.has(a.management_no) ? " row-blink" : ""}`}>
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
                    {a.pending_receiver_approved_at ? (
                      <span className="rounded bg-amber-500/15 px-2 py-0.5 text-xs text-amber-300">
                        관리자 승인 대기
                      </span>
                    ) : (
                      <span
                        className={`rounded px-2 py-0.5 text-xs ${
                          statusBadge[a.status] ?? "bg-neutral-700/40 text-neutral-300"
                        }`}
                      >
                        {a.status}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {a.incoming ? (
                      a.pending_receiver_rejected_at ? (
                        <span className="rounded bg-red-500/15 px-2 py-0.5 text-xs text-red-300">
                          인수 거절됨
                        </span>
                      ) : a.pending_receiver_approved_at ? (
                        <span className="rounded bg-amber-500/15 px-2 py-0.5 text-xs text-amber-300">
                          인수 승인 완료 · 관리자 최종 승인 대기
                        </span>
                      ) : (
                        <div className="flex flex-wrap items-center gap-1">
                          <span className="rounded bg-blue-500/15 px-2 py-0.5 text-xs text-blue-300">
                            내게 이전 요청
                          </span>
                          <button
                            onClick={() => void handleReceiverAction(a, "approve")}
                            disabled={acting === a.management_no}
                            className="rounded bg-emerald-600 px-2 py-1 text-xs text-white hover:bg-emerald-500 disabled:opacity-50"
                          >
                            {acting === a.management_no ? "처리 중..." : "인수 승인"}
                          </button>
                          <button
                            onClick={() => void handleReceiverAction(a, "reject")}
                            disabled={acting === a.management_no}
                            className="rounded border border-red-800 px-2 py-1 text-xs text-red-300 hover:bg-red-950 disabled:opacity-50"
                          >
                            인수 거절
                          </button>
                        </div>
                      )
                    ) : a.status === "계약종료" ? (
                      <span className="text-xs text-neutral-600">—</span>
                    ) : a.pending_to_wallet ? (
                      <div className="flex flex-wrap items-center gap-1">
                        {a.pending_receiver_rejected_at ? (
                          <span className="rounded bg-red-500/15 px-2 py-0.5 text-xs text-red-300">
                            ↦ {shortMiddle(a.pending_to_wallet)} 인수 거절
                          </span>
                        ) : a.pending_receiver_approved_at ? (
                          <>
                            <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-300">
                              ↦ {shortMiddle(a.pending_to_wallet)} 승인 완료
                            </span>
                            <span className="rounded bg-amber-500/15 px-2 py-0.5 text-xs text-amber-300">
                              관리자 승인 대기
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="rounded bg-amber-500/15 px-2 py-0.5 text-xs text-amber-300">
                              ↦ {shortMiddle(a.pending_to_wallet)}
                            </span>
                            <span className="rounded bg-blue-500/15 px-2 py-0.5 text-xs text-blue-300">
                              수신자 승인 대기
                            </span>
                          </>
                        )}
                        <button
                          onClick={() => void handleCancelRequest(a)}
                          disabled={acting === a.management_no}
                          className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
                        >
                          취소
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-nowrap items-center gap-1 whitespace-nowrap">
                        {a.pending_rejected_at && (
                          <span className="rounded bg-red-500/15 px-2 py-0.5 text-xs text-red-300">
                            이전 요청 거절됨
                          </span>
                        )}
                        <WalletDirectoryPicker
                          value={transferTo[a.management_no] ?? ""}
                          onChange={(addr) =>
                            setTransferTo((prev) => ({
                              ...prev,
                              [a.management_no]: addr,
                            }))
                          }
                          disabled={acting === a.management_no}
                        />
                        <button
                          onClick={() => void handleTransferRequest(a)}
                          disabled={acting === a.management_no}
                          className="rounded bg-violet-600 px-2 py-1 text-xs text-white hover:bg-violet-500 disabled:opacity-50"
                        >
                          {acting === a.management_no ? "요청 중..." : "이전 요청"}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {formOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => {
            if (!busy) setFormOpen(false);
          }}
        >
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-neutral-700 bg-neutral-900 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">자산 등록</h2>
              <button
                type="button"
                onClick={() => {
                  if (!busy) setFormOpen(false);
                }}
                disabled={busy}
                aria-label="닫기"
                className="flex h-7 w-7 items-center justify-center rounded-full border border-neutral-700 text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
              >
                ✕
              </button>
            </div>
            <p className="mt-1 text-xs text-neutral-500">
              로그인한 사용자는 누구나 렌탈 자산을 등록할 수 있습니다.
            </p>

            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <input
                value={form.management_no}
                onChange={(e) => setForm({ ...form, management_no: e.target.value })}
                placeholder="관리번호 (예: AST-2026-0012) *"
                className="rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm"
              />
              <input
                value={form.serial_no}
                onChange={(e) => setForm({ ...form, serial_no: e.target.value })}
                placeholder="시리얼번호"
                className="rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm"
              />
              <input
                value={form.order_no}
                onChange={(e) => setForm({ ...form, order_no: e.target.value })}
                placeholder="주문번호"
                className="rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm"
              />
              <input
                value={form.model_name}
                onChange={(e) => setForm({ ...form, model_name: e.target.value })}
                placeholder="모델명 (예: Dell Latitude 5530) *"
                className="rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm"
              />
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm"
              >
                <option value="">카테고리 선택</option>
                {RENTAL_ASSET_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <input
                value={form.manufacturer}
                onChange={(e) => setForm({ ...form, manufacturer: e.target.value })}
                placeholder="제조사 (예: Dell)"
                className="rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm"
              />
              <input
                value={form.user_name}
                onChange={(e) => setForm({ ...form, user_name: e.target.value })}
                placeholder="현재 사용자 (예: 홍길동)"
                className="rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm"
              />
              <input
                value={form.division}
                onChange={(e) => setForm({ ...form, division: e.target.value })}
                placeholder="상위 소속 (예: A부문)"
                className="rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm"
              />
              <input
                value={form.department}
                onChange={(e) => setForm({ ...form, department: e.target.value })}
                placeholder="소속 팀 (예: AAAA팀)"
                className="rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm"
              />
              <input
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder="위치 (예: B-XX지사)"
                className="rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm"
              />
              <input
                value={form.rental_company}
                onChange={(e) => setForm({ ...form, rental_company: e.target.value })}
                placeholder="렌탈사"
                className="rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm"
              />
              <select
                value={form.billing_cycle}
                onChange={(e) => setForm({ ...form, billing_cycle: e.target.value })}
                className="rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm"
              >
                {(Object.keys(billingCycleLabels) as BillingCycle[]).map((c) => (
                  <option key={c} value={c}>
                    {billingCycleLabels[c]}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={0}
                value={form.rental_fee}
                onChange={(e) => setForm({ ...form, rental_fee: e.target.value })}
                placeholder="렌탈료 (원)"
                className="rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm"
              />
              <input
                value={form.billing_month}
                onChange={(e) => setForm({ ...form, billing_month: e.target.value })}
                placeholder="청구월 (예: 매월 / 3,9월)"
                className="rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm"
              />
              <input
                type="date"
                value={form.rental_start_date}
                onChange={(e) => setForm({ ...form, rental_start_date: e.target.value })}
                placeholder="렌탈 시작일"
                className="rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm"
              />
              <input
                type="date"
                value={form.rental_end_date}
                onChange={(e) => setForm({ ...form, rental_end_date: e.target.value })}
                placeholder="렌탈 종료일"
                className="rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm"
              />
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm"
              >
                <option value="정상사용">정상사용</option>
                <option value="유휴">유휴</option>
                <option value="계약종료">계약종료</option>
              </select>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  if (!busy) setFormOpen(false);
                }}
                disabled={busy}
                className="rounded border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={busy || !form.management_no.trim() || !form.model_name.trim()}
                className="rounded bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
              >
                {busy ? "등록 중..." : "자산 등록"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}