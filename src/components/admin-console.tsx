"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useWallet } from "@/lib/wallet/wallet-context";
import { isSolanaMainnet } from "@/lib/config/env";
import { AssetFilterBar } from "@/components/asset-filter-bar";
import { RENTAL_ASSET_CATEGORIES } from "@/lib/supabase/types";
import { EMPLOYMENT_STATUSES, WORK_LOCATIONS } from "@/lib/supabase/types";
import type { EmploymentStatus, WorkLocation } from "@/lib/supabase/types";
import type { EmployeeProfileView } from "@/app/api/employees/route";
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

const shortAddr = (addr: string | null | undefined) =>
  addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "—";

interface HrDraft {
  wallet_address: string;
  employment_status: EmploymentStatus;
  work_location: WorkLocation;
  job_title: string;
  hire_date: string;
  departure_date: string;
  note: string;
}

const emptyHrDraft = (wallet: string): HrDraft => ({
  wallet_address: wallet,
  employment_status: "재직",
  work_location: "본사",
  job_title: "",
  hire_date: "",
  departure_date: "",
  note: "",
});

export function AdminConsole() {
  const { publicKey, connected, connect } = useWallet();
  const [adminWallets, setAdminWallets] = useState<string[]>([]);
  const [assets, setAssets] = useState<RentalAssetRow[]>([]);
  const [filters, setFilters] = useState<AssetFilters>(EMPTY_FILTERS);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchBusy, setBatchBusy] = useState(false);
  // 인사 정보 관리(M38) — 지갑별 인사상태·근무위치 프로필
  const [hrList, setHrList] = useState<EmployeeProfileView[]>([]);
  const [hrDrafts, setHrDrafts] = useState<Record<string, HrDraft>>({});
  const [hrQ, setHrQ] = useState("");
  const [hrBusy, setHrBusy] = useState<string | null>(null);
  const [hrNewWallet, setHrNewWallet] = useState("");
  const hrQRef = useRef("");
  // 변경 감지용 이전 스냅샷 — 자동 재조회(폴링·포커스·가시성 복귀 = quiet)에서
  // diff를 건너뛰어 목록 전체가 깜빡이지 않게 한다. 깜빡임은 액션 직후 refresh()에서만.
  const prevAssetsRef = useRef<RentalAssetRow[]>([]);
  const [flashNos, setFlashNos] = useState<ReadonlySet<string>>(new Set());
  const flashTimersRef = useRef<Map<string, number>>(new Map());
  // 필터가 바뀌어 재조회하는 경우 diff(깜빡임)를 건너뛴다 —
  // 검색/필터 입력 때마다 목록 전체가 깜빡이는 것을 막는다.
  const lastFilterKeyRef = useRef("");

  // 실제 변경된 행만 5초간 하이라이트 — dashboard와 동일한 diff 배선.
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


  useEffect(() => {
    void fetch("/api/admin/config")
      .then((r) => r.json())
      .then((j) => {
        const list = (j.adminWallets as string[] | undefined) ?? [];
        setAdminWallets(list);
      })
      .catch(() => setAdminWallets([]));
  }, []);

  const isAdmin = useMemo(
    () =>
      connected &&
      publicKey !== null &&
      adminWallets.some((w) => w.toLowerCase() === publicKey.toLowerCase()),
    [connected, publicKey, adminWallets],
  );

  const refresh = useCallback(async (quiet = false) => {
    if (!isAdmin || !publicKey) return;
    if (!quiet) setError(null);
    setError(null);
    try {
      const url = new URL("/api/rental-assets", window.location.origin);
      url.searchParams.set("all", "1");
      for (const [k, v] of filtersToSearchParams(filters)) {
        url.searchParams.set(k, v);
      }
      const res = await fetch(url, {
        headers: { "x-admin-wallet": publicKey },
      });
      const json = (await readJson(res)) as {
        error?: string;
        data?: RentalAssetRow[];
      };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      const next = json.data ?? [];
      const filterKey = JSON.stringify(filters);
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
  }, [isAdmin, publicKey, filters]);

  useEffect(() => {
    if (isAdmin) void refresh();
  }, [isAdmin, refresh]);

  const fetchHr = useCallback(
    async (q?: string) => {
      if (!isAdmin || !publicKey) return;
      const query = (q ?? hrQRef.current).trim();
      try {
        const url = `/api/employees${query ? `?q=${encodeURIComponent(query)}` : ""}`;
        const res = await fetch(url, { headers: { "x-admin-wallet": publicKey } });
        const json = (await readJson(res)) as {
          error?: string;
          data?: EmployeeProfileView[];
        };
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
        const list = json.data ?? [];
        setHrList(list);
        setHrDrafts((prev) => {
          const next = { ...prev };
          for (const p of list) {
            if (!next[p.wallet_address]) {
              next[p.wallet_address] = {
                ...emptyHrDraft(p.wallet_address),
                employment_status: p.employment_status,
                work_location: p.work_location,
                job_title: p.job_title ?? "",
                hire_date: p.hire_date ?? "",
                departure_date: p.departure_date ?? "",
                note: p.note ?? "",
              };
            }
          }
          return next;
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "인사 정보 조회 실패");
      }
    },
    [isAdmin, publicKey],
  );

  useEffect(() => {
    if (isAdmin) void fetchHr();
  }, [isAdmin, fetchHr]);

  const setHrDraft = (wallet: string, patch: Partial<HrDraft>) => {
    setHrDrafts((prev) => ({
      ...prev,
      [wallet]: { ...(prev[wallet] ?? emptyHrDraft(wallet)), ...patch },
    }));
  };

  const saveHr = async (wallet: string) => {
    if (!isAdmin || !publicKey) return;
    const d = hrDrafts[wallet];
    if (!d) return;
    setHrBusy(wallet);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/employees", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-wallet": publicKey,
        },
        body: JSON.stringify({
          wallet_address: d.wallet_address,
          employment_status: d.employment_status,
          work_location: d.work_location,
          job_title: d.job_title || null,
          hire_date: d.hire_date || null,
          departure_date: d.departure_date || null,
          note: d.note || null,
        }),
      });
      const json = await readJson(res);
      if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);
      setNotice(`${shortAddr(wallet)} 인사 정보 저장 완료.`);
      setHrNewWallet("");
      void fetchHr();
    } catch (err) {
      setError(err instanceof Error ? err.message : "인사 정보 저장 실패");
    } finally {
      setHrBusy(null);
    }
  };

  const registerHr = async () => {
    if (!isAdmin || !publicKey) return;
    const w = hrNewWallet.trim();
    if (!w) return;
    setHrBusy("__new__");
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/employees", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-wallet": publicKey,
        },
        body: JSON.stringify({
          wallet_address: w,
          employment_status: "재직",
          work_location: "본사",
        }),
      });
      const json = await readJson(res);
      if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);
      setNotice(`${shortAddr(w)} 인사 프로필 등록 완료.`);
      setHrNewWallet("");
      void fetchHr();
    } catch (err) {
      setError(err instanceof Error ? err.message : "인사 프로필 등록 실패");
    } finally {
      setHrBusy(null);
    }
  };

  // 탭/기기 복귀(포커스·가시성) 시와 10초 주기로 조용히 재조회 —
  // 다른 창/기기에서 이전·승인·거절이 발생해도 새로고침 없이 목록에 바로 반영.
  useEffect(() => {
    const onFocus = () => {
      if (isAdmin) void refresh(true);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") onFocus();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [isAdmin, refresh]);

  useEffect(() => {
    if (!isAdmin) return;
    const id = window.setInterval(() => {
      void refresh(true);
    }, 10_000);
    return () => window.clearInterval(id);
  }, [isAdmin, refresh]);

  const handleUpdate = async (
    asset: RentalAssetRow,
    patch: Partial<
      Pick<
        RentalAssetRow,
        | "category"
        | "user_name"
        | "division"
        | "department"
        | "location"
        | "billing_cycle"
        | "rental_fee"
        | "billing_month"
        | "rental_start_date"
        | "rental_end_date"
        | "status"
      >
    >,
  ) => {
    if (!isAdmin || !publicKey) return;
    setBusy(asset.management_no);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(
        `/api/rental-assets/${encodeURIComponent(asset.management_no)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "x-admin-wallet": publicKey,
          },
          body: JSON.stringify(patch),
        },
      );
      const json = await readJson(res);
      if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);
      setNotice(`${asset.management_no} 업데이트 완료.`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "수정 실패");
    } finally {
      setBusy(null);
    }
  };

  const handleBatchAction = async (action: "approve" | "reject") => {
    if (!isAdmin || !publicKey) return;
    const nos = selectable
      .map((a) => a.management_no)
      .filter((n) => selected.has(n));
    if (nos.length === 0) {
      setError(action === "approve" ? "승인할 항목을 선택하세요." : "거절할 항목을 선택하세요.");
      return;
    }
    if (
      action === "approve"
        ? !window.confirm(
            `선택한 ${nos.length}개 자산의 이전 요청을 한 번에 승인·확정할까요?\n\n일괄 승인은 수수료를 절감하기 위해 여러 건을 한 트랜잭션에 묶어 처리합니다.\n(수신자 승인이 완료된 항목만 승인됩니다.)`,
          )
        : !window.confirm(`선택한 ${nos.length}개 자산의 이전 요청을 모두 거절할까요?`)
    )
      return;
    setBatchBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(
        "/api/rental-assets/transfer-request/approve-batch",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-admin-wallet": publicKey,
          },
          body: JSON.stringify({ management_nos: nos, action }),
        },
      );
      const json = (await readJson(res)) as {
        error?: string;
        message?: string;
        succeeded?: { management_no: string }[];
        failed?: { management_no: string; error: string }[];
        skipped?: { management_no: string; reason: string }[];
      };
      if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);
      const okCount = json.succeeded?.length ?? 0;
      const failCount = json.failed?.length ?? 0;
      const skipCount = json.skipped?.length ?? 0;
      setNotice(
        `${okCount}건 ${action === "approve" ? "승인" : "거절"} 완료${
          failCount ? `, ${failCount}건 실패` : ""
        }${skipCount ? `, ${skipCount}건 제외` : ""}`,
      );
      setSelected(new Set());
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "일괄 처리 실패");
    } finally {
      setBatchBusy(false);
    }
  };

  const handleBatchApprove = () => void handleBatchAction("approve");
  const handleBatchReject = () => void handleBatchAction("reject");

  // 선택 가능 대상: 진행 중인 이전 요청(수신자 승인 여부와 무관) + 미확정.
  // 일괄 승인은 수신자 승인 완료 + 정상사용 항목만, 일괄 거절은 모든 진행 요청에 적용.
  const selectable = useMemo(
    () =>
      assets.filter(
        (a) =>
          a.pending_to_wallet &&
          !a.pending_receiver_rejected_at &&
          !a.pending_approved_at,
      ),
    [assets],
  );
  const approveCandidates = useMemo(
    () =>
      assets.filter(
        (a) =>
          a.pending_to_wallet &&
          a.pending_receiver_approved_at &&
          !a.pending_receiver_rejected_at &&
          a.status === "정상사용",
      ),
    [assets],
  );

  const toggleSelect = (no: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(no)) next.delete(no);
      else next.add(no);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const nos = selectable.map((a) => a.management_no);
    const allSelected = nos.every((n) => selected.has(n));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const n of nos) {
        if (allSelected) next.delete(n);
        else next.add(n);
      }
      return next;
    });
  };

  if (!connected) {
    return (
      <div className="w-full max-w-4xl rounded-xl border border-neutral-800 bg-neutral-900 p-6 text-center">
        <p className="text-sm text-neutral-400">
          관리자 콘솔 사용을 위해 지갑을 연결하세요.
        </p>
        <button
          onClick={() => void connect()}
          className="mt-4 rounded bg-violet-600 px-4 py-2 text-sm text-white hover:bg-violet-500"
        >
          지갑 연결
        </button>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="w-full max-w-4xl rounded-xl border border-red-900/60 bg-red-950/40 p-6 text-center">
        <p className="text-sm text-red-300">
          연결된 지갑({shortAddr(publicKey)})은 관리자 화이트리스트에 없습니다.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[1600px] space-y-6">
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
          <h2 className="text-lg font-semibold">관리자 렌탈 자산 관리 ({assets.length})</h2>
        </div>
        <div className="mt-4">
          <AssetFilterBar filters={filters} onChange={setFilters} />
        </div>
        {selectable.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2">
            <button
              onClick={toggleSelectAll}
              disabled={batchBusy}
              className="rounded border border-neutral-600 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-800 disabled:opacity-40"
            >
              {selectable.every((a) => selected.has(a.management_no)) &&
              selected.size > 0
                ? "전체 해제"
                : "전체 선택"}
            </button>
            <span className="text-xs text-neutral-400">
              이전 요청 {selectable.length}건 중{" "}
              <span className="font-semibold text-amber-200">{selected.size}건</span> 선택
            </span>
            {selected.size > 0 && (
              <>
                <button
                  onClick={handleBatchApprove}
                  disabled={batchBusy}
                  className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  {batchBusy ? "처리 중..." : `선택 ${selected.size}건 승인`}
                </button>
                <button
                  onClick={handleBatchReject}
                  disabled={batchBusy}
                  className="rounded bg-red-600/80 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-50"
                >
                  {batchBusy ? "처리 중..." : `선택 ${selected.size}건 거절`}
                </button>
              </>
            )}
            <span className="text-[11px] text-neutral-500">
              승인은 수신자 승인이 완료된 항목만 처리되고, 여러 건을 한 트랜잭션에 묶어 수수료를 절감합니다.
            </span>
          </div>
        )}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[1600px] border-collapse whitespace-nowrap text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-700 text-xs text-neutral-500">
                <th className="px-3 py-2 font-medium">선택</th>
                <th className="px-3 py-2 font-medium">관리번호</th>
                <th className="px-3 py-2 font-medium">카테고리</th>
                <th className="px-3 py-2 font-medium">모델명</th>
                <th className="px-3 py-2 font-medium">사용자</th>
                <th className="px-3 py-2 font-medium">부문</th>
                <th className="px-3 py-2 font-medium">팀</th>
                <th className="px-3 py-2 font-medium">위치</th>
                <th className="px-3 py-2 font-medium">렌탈사</th>
                <th className="px-3 py-2 font-medium">렌탈료</th>
                <th className="px-3 py-2 font-medium">종료일</th>
                <th className="px-3 py-2 font-medium">상태</th>
                <th className="px-3 py-2 font-medium">이전 요청</th>
                <th className="px-3 py-2 font-medium">이관 기록</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((a) => (
                <tr key={a.management_no} className={`border-b border-neutral-800/70 align-middle${flashNos.has(a.management_no) ? " row-blink" : ""}`}>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(a.management_no)}
                      disabled={
                        batchBusy ||
                        !(
                          a.pending_to_wallet &&
                          !a.pending_receiver_rejected_at &&
                          !a.pending_approved_at
                        )
                      }
                      onChange={() => toggleSelect(a.management_no)}
                      title={
                        a.pending_to_wallet &&
                        !a.pending_receiver_rejected_at &&
                        !a.pending_approved_at
                          ? "승인 또는 거절 대상"
                          : "진행 중인 이전 요청에서만 선택 가능"
                      }
                      className="accent-emerald-500"
                    />
                  </td>
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
                    <select
                      defaultValue={a.category ?? ""}
                      disabled={busy === a.management_no}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v !== (a.category ?? "")) {
                          void handleUpdate(a, { category: v || null });
                        }
                      }}
                      className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs"
                    >
                      <option value="">—</option>
                      {RENTAL_ASSET_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-xs">{a.model_name}</td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      defaultValue={a.user_name ?? ""}
                      placeholder="—"
                      disabled={busy === a.management_no}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v !== (a.user_name ?? "")) {
                          void handleUpdate(a, { user_name: v || null });
                        }
                      }}
                      className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      defaultValue={a.division ?? ""}
                      placeholder="—"
                      disabled={busy === a.management_no}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v !== (a.division ?? "")) {
                          void handleUpdate(a, { division: v || null });
                        }
                      }}
                      className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      defaultValue={a.department ?? ""}
                      placeholder="—"
                      disabled={busy === a.management_no}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v !== (a.department ?? "")) {
                          void handleUpdate(a, { department: v || null });
                        }
                      }}
                      className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      defaultValue={a.location ?? ""}
                      placeholder="—"
                      disabled={busy === a.management_no}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v !== (a.location ?? "")) {
                          void handleUpdate(a, { location: v || null });
                        }
                      }}
                      className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs"
                    />
                  </td>
                  <td className="px-3 py-2 text-xs">{a.rental_company ?? "—"}</td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={0}
                      defaultValue={a.rental_fee ?? ""}
                      disabled={busy === a.management_no}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v === "") {
                          if (a.rental_fee != null) void handleUpdate(a, { rental_fee: null });
                          return;
                        }
                        const fee = Number(v);
                        if (!Number.isNaN(fee) && fee >= 0 && fee !== a.rental_fee) {
                          void handleUpdate(a, { rental_fee: fee });
                        }
                      }}
                      className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="date"
                      defaultValue={a.rental_end_date ?? ""}
                      disabled={busy === a.management_no}
                      onBlur={(e) => {
                        const v = e.target.value;
                        if (v !== (a.rental_end_date ?? "")) {
                          void handleUpdate(a, { rental_end_date: v || null });
                        }
                      }}
                      className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      defaultValue={a.status}
                      disabled={busy === a.management_no}
                      onChange={(e) => {
                        const v = e.target.value as RentalAssetRow["status"];
                        if (v !== a.status) void handleUpdate(a, { status: v });
                      }}
                      className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs"
                    >
                      <option value="정상사용">정상사용</option>
                      <option value="유휴">유휴</option>
                      <option value="계약종료">계약종료</option>
                    </select>
                    <span
                      className={`ml-2 rounded px-2 py-0.5 text-xs ${
                        statusBadge[a.status] ?? "bg-neutral-700/40 text-neutral-300"
                      }`}
                    >
                      {a.status}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {a.pending_to_wallet ? (
                      <div className="flex flex-wrap items-center gap-1">
                        {a.pending_receiver_rejected_at ? (
                          <span className="rounded bg-red-500/15 px-2 py-0.5 text-xs text-red-300">
                            수신자 인수 거절 → {shortAddr(a.pending_to_wallet)}
                          </span>
                        ) : a.pending_receiver_approved_at ? (
                          <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-300">
                            수신자 승인 → {shortAddr(a.pending_to_wallet)}
                          </span>
                        ) : (
                          <span className="rounded bg-amber-500/15 px-2 py-0.5 text-xs text-amber-300">
                            수신자 승인 대기 → {shortAddr(a.pending_to_wallet)}
                          </span>
                        )}
                        {a.pending_requested_at && (
                          <span className="text-[10px] text-neutral-500">
                            {new Date(a.pending_requested_at).toLocaleString()}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-neutral-600">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {a.transfer_tx ? (
                      <a
                        href={`https://explorer.solana.com/tx/${a.transfer_tx}${
                          isSolanaMainnet() ? "" : "?cluster=devnet"
                        }`}
                        target="_blank"
                        rel="noreferrer"
                        title={a.transfer_tx}
                        className="font-mono text-[10px] text-blue-400 underline hover:text-blue-300"
                      >
                        {`${a.transfer_tx.slice(0, 8)}…${a.transfer_tx.slice(-4)}`}
                      </a>
                    ) : (
                      <span className="text-xs text-neutral-600">—</span>
                    )}
                    {a.transferred_at && (
                      <span className="ml-1 text-[10px] text-neutral-500">
                        {new Date(a.transferred_at).toLocaleString()}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!assets.length && (
          <p className="mt-3 text-sm text-neutral-500">등록된 렌탈 자산이 없습니다.</p>
        )}
      </section>

      <section className="mt-6 rounded-xl border border-neutral-800 bg-neutral-900 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
          <h2 className="text-lg font-semibold">
            인사 정보 관리 ({hrList.length})
            <span className="ml-2 align-middle text-xs font-normal text-neutral-500">
              월간 리포팅(퇴직·휴직·신규입사·재택·지사/출장, 만기 예고)의 판단 기준
            </span>
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={hrQ}
              onChange={(e) => {
                setHrQ(e.target.value);
                hrQRef.current = e.target.value;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") void fetchHr(hrQ);
              }}
              placeholder="이름/부문/팀/지갑 검색"
              className="rounded border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm"
            />
            <button
              onClick={() => void fetchHr(hrQ)}
              disabled={hrBusy !== null}
              className="rounded bg-neutral-700 px-3 py-1.5 text-sm transition hover:bg-neutral-600 disabled:opacity-50"
            >
              검색
            </button>
          </div>
        </div>

        <div className="pb-4">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={hrNewWallet}
              disabled={hrBusy === "__new__"}
              onChange={(e) => setHrNewWallet(e.target.value)}
              placeholder="지갑 주소로 새 인사 프로필 등록"
              className="min-w-[18rem] flex-1 rounded border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm"
            />
            <button
              onClick={() => void registerHr()}
              disabled={hrBusy === "__new__" || !hrNewWallet.trim()}
              className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium transition hover:bg-emerald-500 disabled:opacity-50"
            >
              {hrBusy === "__new__" ? "등록 중…" : "등록"}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-neutral-700 text-xs text-neutral-500">
                <th className="px-3 py-2 text-left font-medium">이름</th>
                <th className="px-3 py-2 text-left font-medium">부문/팀</th>
                <th className="px-3 py-2 text-left font-medium">지갑</th>
                <th className="px-3 py-2 text-left font-medium">인사상태</th>
                <th className="px-3 py-2 text-left font-medium">근무위치</th>
                <th className="px-3 py-2 text-left font-medium">직급</th>
                <th className="px-3 py-2 text-left font-medium">입사일</th>
                <th className="px-3 py-2 text-left font-medium">퇴직(예정)일</th>
                <th className="px-3 py-2 text-left font-medium">비고</th>
                <th className="px-3 py-2 text-left font-medium">저장</th>
              </tr>
            </thead>
            <tbody>
              {hrList.map((p) => {
                const d = hrDrafts[p.wallet_address] ?? emptyHrDraft(p.wallet_address);
                const saving = hrBusy === p.wallet_address;
                return (
                  <tr key={p.wallet_address} className="border-b border-neutral-800/70 align-middle">
                    <td className="px-3 py-2 text-sm font-medium">
                      {p.label ?? <span className="text-neutral-600">(미등록 이름)</span>}
                    </td>
                    <td className="px-3 py-2 text-xs text-neutral-300">
                      {[p.division, p.department].filter(Boolean).join(" / ") || "—"}
                    </td>
                    <td className="px-3 py-2 font-mono text-[10px] text-neutral-500">
                      {shortAddr(p.wallet_address)}
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={d.employment_status}
                        disabled={saving}
                        onChange={(e) =>
                          setHrDraft(p.wallet_address, {
                            employment_status: e.target.value as EmploymentStatus,
                          })
                        }
                        className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs"
                      >
                        {EMPLOYMENT_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={d.work_location}
                        disabled={saving}
                        onChange={(e) =>
                          setHrDraft(p.wallet_address, {
                            work_location: e.target.value as WorkLocation,
                          })
                        }
                        className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs"
                      >
                        {WORK_LOCATIONS.map((l) => (
                          <option key={l} value={l}>
                            {l}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={d.job_title}
                        disabled={saving}
                        onChange={(e) =>
                          setHrDraft(p.wallet_address, { job_title: e.target.value })
                        }
                        className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="date"
                        value={d.hire_date}
                        disabled={saving}
                        onChange={(e) =>
                          setHrDraft(p.wallet_address, { hire_date: e.target.value })
                        }
                        className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="date"
                        value={d.departure_date}
                        disabled={saving}
                        onChange={(e) =>
                          setHrDraft(p.wallet_address, { departure_date: e.target.value })
                        }
                        className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={d.note}
                        disabled={saving}
                        onChange={(e) =>
                          setHrDraft(p.wallet_address, { note: e.target.value })
                        }
                        placeholder="—"
                        className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => void saveHr(p.wallet_address)}
                        disabled={saving}
                        className="rounded bg-neutral-700 px-3 py-1 text-xs transition hover:bg-neutral-600 disabled:opacity-50"
                      >
                        {saving ? "저장 중…" : "저장"}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!hrList.length && (
                <tr>
                  <td colSpan={10} className="px-3 py-4 text-center text-sm text-neutral-500">
                    인사 프로필이 없습니다. 위 입력란에 지갑 주소를 넣고 등록해 주세요.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}