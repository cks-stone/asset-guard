"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminConsole } from "@/components/admin-console";
import { HrManagement } from "@/components/hr-management";
import { MyAssetsList } from "@/components/my-assets-list";
import { IdleAssetsList } from "@/components/idle-assets-list";
import { useWallet } from "@/lib/wallet/wallet-context";
import { BillingCalendar, buildYearPayments } from "@/components/billing-calendar";
import { MonthlyReport } from "@/components/monthly-report";
import type { RentalAssetRow, RentalAssetStatus } from "@/lib/supabase/types";

async function readJson(res: Response): Promise<{ error?: string; [k: string]: unknown }> {
  try {
    return (await res.json()) as { error?: string };
  } catch {
    return { error: `HTTP ${res.status}` };
  }
}

type TabKey = "overview" | "my" | "idle" | "corp" | "admin" | "hr";

type StatCard = { label: string; value: number | string; accent: string };

function StatCards({ cards }: { cards: StatCard[] }) {
  return (
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {cards.map((s) => (
        <div
          key={s.label}
          className="rounded-xl border border-neutral-800 bg-neutral-900 p-4"
        >
          <p className={`text-2xl font-bold ${s.accent}`}>{s.value}</p>
          <p className="mt-1 text-xs text-neutral-400">{s.label}</p>
        </div>
      ))}
    </section>
  );
}

function buildStatCards(p: {
  total: number;
  normal: number;
  idle: number;
  transfers: number;
  monthlyFee: number;
  now: Date;
}): StatCard[] {
  return [
    { label: "총 렌탈 자산", value: p.total, accent: "text-neutral-200" },
    { label: "정상사용", value: p.normal, accent: "text-emerald-300" },
    { label: "유휴", value: p.idle, accent: "text-sky-300" },
    { label: "이전 진행", value: p.transfers, accent: "text-amber-300" },
    {
      label: `${p.now.getMonth() + 1}월 렌탈비 합계`,
      value: p.monthlyFee ? `₩${p.monthlyFee.toLocaleString()}` : "₩0",
      accent: "text-blue-300",
    },
  ];
}

const tabCls = (active: boolean) =>
  `rounded-lg px-3 py-2 text-left text-sm font-medium whitespace-nowrap ${
    active
      ? "bg-violet-600 text-white"
      : "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
  }`;

// 대시보드 — 좌측 탭으로 "대시보드(통계·청구달력)" / "내 자산 목록" / "유휴 자산" /
// "관리자 콘솔"을 전환한다. 각 탭은 자기 완결형 컴포넌트(자체 조회·필터·폴링)다.
export function Dashboard() {
  const { publicKey, connected, connecting, connect } = useWallet();

  const [tab, setTab] = useState<TabKey>("overview");
  const [adminWallets, setAdminWallets] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // 대시보드(통계·청구달력)용 내 담당 자산 요약 — 필터 없이 전체를 조회한다.
  const [summaryAssets, setSummaryAssets] = useState<RentalAssetRow[]>([]);
  // "이전 진행" 카드에 반영할, 내게 이전 요청이 온 인입 자산 수.
  const [incomingCount, setIncomingCount] = useState(0);
  // 전사 대시보드(관리자 전용) — 전체 자산 기반 조회(all=1).
  const [corpAssets, setCorpAssets] = useState<RentalAssetRow[]>([]);

  useEffect(() => {
    const onRejection = (e: PromiseRejectionEvent) => {
      console.error("[unhandledrejection]", e.reason);
      setError(
        e.reason instanceof Error
          ? `처리되지 않은 오류: ${e.reason.message}`
          : "처리되지 않은 오류가 발생했습니다",
      );
    };
    window.addEventListener("unhandledrejection", onRejection);
    return () => window.removeEventListener("unhandledrejection", onRejection);
  }, []);

  useEffect(() => {
    void fetch("/api/admin/config")
      .then((r) => r.json())
      .then((j) => {
        setAdminWallets((j.adminWallets as string[] | undefined) ?? []);
      })
      .catch(() => setAdminWallets([]));
  }, []);

  const isAdmin = useMemo(
    () =>
      publicKey !== null &&
      adminWallets.some((w) => w.toLowerCase() === publicKey.toLowerCase()),
    [publicKey, adminWallets],
  );

  const refreshSummary = useCallback(async () => {
    if (!publicKey) return;
    try {
      const res = await fetch(new URL("/api/rental-assets", window.location.origin), {
        headers: { "x-wallet": publicKey },
      });
      const json = (await readJson(res)) as {
        error?: string;
        data?: RentalAssetRow[];
      };
      if (res.ok) setSummaryAssets(json.data ?? []);
    } catch (err) {
      console.error("[dashboard] 요약 자산 조회 실패:", err);
    }
  }, [publicKey]);

  const refreshIncomingCount = useCallback(async () => {
    if (!publicKey) return;
    try {
      const res = await fetch(
        new URL("/api/rental-assets?incoming=1", window.location.origin),
        { headers: { "x-wallet": publicKey } },
      );
      const json = (await readJson(res)) as {
        error?: string;
        data?: RentalAssetRow[];
      };
      if (res.ok) setIncomingCount((json.data ?? []).length);
    } catch (err) {
      console.error("[dashboard] 수신 대기 수 조회 실패:", err);
    }
  }, [publicKey]);

  // 전사 대시보드 — 관리자만 전체 자산을 조회한다(계약종료 포함).
  const refreshCorp = useCallback(async () => {
    if (!isAdmin || !publicKey) return;
    try {
      const url = new URL("/api/rental-assets?all=1", window.location.origin);
      const res = await fetch(url, { headers: { "x-admin-wallet": publicKey } });
      const json = (await readJson(res)) as {
        error?: string;
        data?: RentalAssetRow[];
      };
      if (res.ok) setCorpAssets(json.data ?? []);
    } catch (err) {
      console.error("[dashboard] 전사 자산 조회 실패:", err);
    }
  }, [isAdmin, publicKey]);

  useEffect(() => {
    if (publicKey) {
      void refreshSummary();
      void refreshIncomingCount();
    }
    if (isAdmin) void refreshCorp();
  }, [publicKey, isAdmin, refreshSummary, refreshIncomingCount, refreshCorp]);

  // 포커스·가시성 복귀 + 10초 폴링으로 요약 지표를 조용히 최신화.
  useEffect(() => {
    if (!connected || !publicKey) return;
    const onVisible = () => {
      void refreshSummary();
      void refreshIncomingCount();
      if (isAdmin) void refreshCorp();
    };
    window.addEventListener("focus", onVisible);
    const onVisChange = () => {
      if (document.visibilityState === "visible") onVisible();
    };
    document.addEventListener("visibilitychange", onVisChange);
    const id = window.setInterval(onVisible, 10_000);
    return () => {
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisChange);
      window.clearInterval(id);
    };
  }, [connected, publicKey, isAdmin, refreshSummary, refreshIncomingCount, refreshCorp]);

  const stats = useMemo(() => {
    const total = summaryAssets.length;
    const countByStatus = (s: RentalAssetStatus) =>
      summaryAssets.filter((a) => a.status === s).length;
    // 내가 이전 요청을 보냈지만 수신자가 아직 승인/거절하지 않은 상태
    const pendingOutgoing = summaryAssets.filter(
      (a) =>
        a.status !== "유휴" &&
        a.pending_to_wallet &&
        !a.pending_receiver_approved_at &&
        !a.pending_receiver_rejected_at,
    ).length;
    const now = new Date();
    const monthlyFee =
      buildYearPayments(
        summaryAssets.filter((a) => a.status !== "계약종료"),
        now.getFullYear(),
      ).byMonth.get(now.getMonth() + 1) ?? 0;
    return { total, countByStatus, pendingOutgoing, monthlyFee, now };
  }, [summaryAssets]);

  const overviewCards = useMemo(
    () =>
      buildStatCards({
        total: stats.total,
        normal: stats.countByStatus("정상사용"),
        idle: stats.countByStatus("유휴"),
        transfers: incomingCount + stats.pendingOutgoing,
        monthlyFee: stats.monthlyFee,
        now: stats.now,
      }),
    [stats, incomingCount],
  );

  // 전사 대시보드 지표 — 전체 자산 기준(계약종료 포함).
  const corpCards = useMemo(() => {
    const now = new Date();
    const countByStatus = (s: RentalAssetStatus) =>
      corpAssets.filter((a) => a.status === s).length;
    // 전사 "이전 진행" = 진행 중인 모든 이전 요청 수.
    const transfers = corpAssets.filter(
      (a) =>
        a.pending_to_wallet &&
        !a.pending_receiver_approved_at &&
        !a.pending_receiver_rejected_at,
    ).length;
    const monthlyFee =
      buildYearPayments(
        corpAssets.filter((a) => a.status !== "계약종료"),
        now.getFullYear(),
      ).byMonth.get(now.getMonth() + 1) ?? 0;
    return buildStatCards({
      total: corpAssets.length,
      normal: countByStatus("정상사용"),
      idle: countByStatus("유휴"),
      transfers,
      monthlyFee,
      now,
    });
  }, [corpAssets]);

  if (!connected) {
    return (
      <div className="w-full max-w-3xl rounded-xl border border-neutral-800 bg-neutral-900 p-10 text-center">
        <p className="text-sm text-neutral-400">
          지갑으로 로그인하면 렌탈 자산을 등록하고 조회할 수 있습니다.
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

  const tabs: { key: TabKey; label: string }[] = [
    { key: "overview", label: "대시보드" },
  ];
  if (isAdmin) {
    tabs.push({ key: "corp", label: "전사 대시보드" });
  }
  tabs.push({ key: "my", label: "내가 관리하고 있는 자산목록" });
  tabs.push({ key: "idle", label: "유휴 자산(전사)" });
  if (isAdmin) {
    tabs.push({ key: "admin", label: "관리자 렌탈 자산 관리" });
    tabs.push({ key: "hr", label: "인사 정보 관리" });
  }

  return (
    <div className="w-full max-w-[2480px] space-y-6">
      {error && (
        <p className="rounded bg-red-950/60 px-4 py-2 text-sm text-red-300">{error}</p>
      )}

      <div className="flex flex-col gap-6 lg:flex-row">
        <nav
          aria-label="대시보드 섹션"
          className="flex shrink-0 gap-1 overflow-x-auto lg:w-56 lg:flex-col lg:overflow-visible"
        >
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={tabCls(tab === t.key)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="min-w-0 flex-1 space-y-6">
          {tab === "overview" && (
            <>
              <StatCards cards={overviewCards} />
              <BillingCalendar assets={summaryAssets} />
              <MonthlyReport scope="mine" />
            </>
          )}
          {tab === "corp" && isAdmin && (
            <>
              <StatCards cards={corpCards} />
              <BillingCalendar
                assets={corpAssets.filter((a) => a.status !== "계약종료")}
              />
              <MonthlyReport scope="all" />
            </>
          )}
          {tab === "my" && <MyAssetsList />}
          {tab === "idle" && <IdleAssetsList />}
          {tab === "admin" && isAdmin && <AdminConsole />}
          {tab === "hr" && isAdmin && <HrManagement />}
        </div>
      </div>
    </div>
  );
}