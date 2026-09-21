import "server-only";
import { z } from "zod";
import { tool, zodSchema, type ToolSet } from "ai";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { computeMonthlyReport, currentMonth, daysUntil } from "@/lib/monthly-report/core";
import type { ReportProfile } from "@/lib/monthly-report/core";
import type { RentalAssetRow } from "@/lib/supabase/types";

export interface ChatToolContext {
  wallet: string;
  isAdmin: boolean;
}

const shortAddr = (addr: string | null | undefined) =>
  addr && addr.length > 10 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr ?? null;

function nowPlusMonths(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function fetchWalletLabels(wallets: (string | null | undefined)[]): Promise<
  Map<string, string>
> {
  const targets = [...new Set(wallets.filter((w): w is string => Boolean(w && w.trim())))];
  if (targets.length === 0) return new Map();
  const { data } = await getSupabaseAdmin()
    .from("wallet_labels")
    .select("wallet_address, label")
    .in("wallet_address", targets);
  const map = new Map<string, string>();
  for (const r of data ?? []) {
    if (r.label) map.set(r.wallet_address, r.label);
  }
  return map;
}

function assetSummary(a: RentalAssetRow): Record<string, unknown> {
  return {
    management_no: a.management_no,
    model_name: a.model_name,
    category: a.category,
    user_name: a.user_name,
    division: a.division,
    department: a.department,
    location: a.location,
    status: a.status,
    rental_fee: a.rental_fee,
    rental_start_date: a.rental_start_date,
    rental_end_date: a.rental_end_date,
  };
}

function adminOnly(ctx: ChatToolContext) {
  if (!ctx.isAdmin) throw new Error("관리자만 조회할 수 있습니다");
}

export function buildChatTools(ctx: ChatToolContext): ToolSet {
  const supabase = getSupabaseAdmin();

  return {
    // ── 내 담당 자산 요약 ─────────────────────────────────────────────
    getMyAssetOverview: tool({
      description:
        "내 담당 자산(managed_by = 내 지갑)의 요약: 총 수, 정상사용/유휴/계약종료 수, 진행 중 이전 요청 수, 월 렌탈비 합계, 만기 임박 건수. 대시보드 질문에 사용.",
      inputSchema: zodSchema(z.object({})),
      execute: async () => {
        const { data, error } = await supabase
          .from("rental_assets")
          .select("*")
          .eq("managed_by", ctx.wallet);
        if (error) throw new Error(error.message);
        const rows = (data ?? []) as RentalAssetRow[];
        const count = (s: string) => rows.filter((r) => r.status === s).length;
        const active = rows.filter((r) => r.status !== "계약종료");
        const feeSum = active.reduce((s, r) => s + (r.rental_fee ?? 0), 0);
        const pendingIn = rows.filter((r) => r.pending_to_wallet !== null);
        const expiringSoon = rows.filter(
          (r) =>
            r.status !== "계약종료" &&
            r.rental_end_date &&
            r.rental_end_date <= nowPlusMonths(3),
        ).length;
        return {
          total: rows.length,
          normal: count("정상사용"),
          idle: count("유휴"),
          expired: count("계약종료"),
          pendingTransfers: pendingIn.length,
          monthlyFeeSum: feeSum,
          expiringWithin3Months: expiringSoon,
        };
      },
    }),

    // ── 승인 대기 업무 ────────────────────────────────────────────────
    getPendingTransfers: tool({
      description:
        "내게 온 이전(인수인계) 요청과 내가 보낸 이전 요청의 진행 단계를 알려준다. 최신 상태 배지(수신자 승인 대기/관리자 승인 대기) 기준으로 파악하려 할 때 사용.",
      inputSchema: zodSchema(z.object({})),
      execute: async () => {
        const { data, error } = await supabase
          .from("rental_assets")
          .select("*")
          .not("pending_to_wallet", "is", null);
        if (error) throw new Error(error.message);
        const rows = (data ?? []) as RentalAssetRow[];
        const mine = rows.filter(
          (r) =>
            r.managed_by === ctx.wallet ||
            r.pending_to_wallet === ctx.wallet,
        );
        const wallets = mine.flatMap((r) => [r.managed_by, r.pending_to_wallet]);
        const labels = await fetchWalletLabels(wallets);

        const stage = (r: RentalAssetRow): string => {
          if (r.pending_approved_at) return "관리자 승인 완료";
          if (r.pending_receiver_rejected_at) return "수신자 거절";
          if (r.pending_rejected_at) return "요청 취소/거절";
          if (r.pending_receiver_approved_at) return "수신자 승인 · 관리자 승인 대기";
          return "수신자 승인 대기";
        };
        const items = mine.map((r) => ({
          management_no: r.management_no,
          model_name: r.model_name,
          from: labels.get(r.managed_by ?? "") ?? shortAddr(r.managed_by),
          to: labels.get(r.pending_to_wallet ?? "") ?? shortAddr(r.pending_to_wallet),
          stage: stage(r),
          requestedAt: r.pending_requested_at,
        }));
        items.sort((a, b) => (b.requestedAt ?? "").localeCompare(a.requestedAt ?? ""));
        return { count: items.length, items: items.slice(0, 20) };
      },
    }),

    // ── 만기 도래 자산 ────────────────────────────────────────────────
    getExpiringAssets: tool({
      description:
        "계약 종료 예정(기한 경과 포함) 자산 목록. scope=mine은 내 자산(기본), scope=all은 전사(관리자 전용). 기본 windowMonths=3(이번 달 + 향후 3개월).",
      inputSchema: zodSchema(
        z.object({
          scope: z.enum(["mine", "all"]).default("mine"),
          windowMonths: z.number().int().min(1).max(12).default(3),
        }),
      ),
      execute: async ({ scope, windowMonths }) => {
        if (scope === "all") adminOnly(ctx);
        let query = supabase
          .from("rental_assets")
          .select("*")
          .neq("status", "계약종료")
          .not("rental_end_date", "is", null)
          .lte("rental_end_date", nowPlusMonths(windowMonths))
          .order("rental_end_date", { ascending: true })
          .limit(20);
        if (scope === "mine") query = query.eq("managed_by", ctx.wallet);
        const { data, error } = await query;
        if (error) throw new Error(error.message);
        const items = ((data ?? []) as RentalAssetRow[]).map((r) => ({
          ...assetSummary(r),
          rental_end_date: r.rental_end_date,
          days_left: daysUntil(r.rental_end_date as string),
        }));
        return { count: items.length, items };
      },
    }),

    // ── 유휴 자산 ─────────────────────────────────────────────────────
    getIdleAssets: tool({
      description:
        "전사 유휴(재배정 가능) 자산 목록. 유휴 자산 추천·재배정 상담에 사용.",
      inputSchema: zodSchema(
        z.object({
          category: z.string().max(64).optional(),
          limit: z.number().int().min(1).max(20).default(10),
        }),
      ),
      execute: async ({ category, limit }) => {
        let query = supabase
          .from("rental_assets")
          .select("*")
          .eq("status", "유휴")
          .order("created_at", { ascending: false })
          .limit(limit);
        if (category) query = query.ilike("category", `%${category}%`);
        const { data, error } = await query;
        if (error) throw new Error(error.message);
        const items = ((data ?? []) as RentalAssetRow[]).map((r) => ({
          ...assetSummary(r),
          rental_fee: r.rental_fee,
        }));
        return { count: items.length, items };
      },
    }),

    // ── 자산 상세 ─────────────────────────────────────────────────────
    getAssetDetail: tool({
      description:
        "특정 관리번호 자산의 상세 정보. 내 담당 자산 또는 내게 이전 요청이 온 자산(관리자면 전체)만 조회 가능.",
      inputSchema: zodSchema(
        z.object({ management_no: z.string().min(1).max(64) }),
      ),
      execute: async ({ management_no }) => {
        const { data, error } = await supabase
          .from("rental_assets")
          .select("*")
          .eq("management_no", management_no)
          .maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) throw new Error(`자산을 찾을 수 없습니다: ${management_no}`);
        const asset = data as RentalAssetRow;
        const canView =
          ctx.isAdmin ||
          asset.managed_by === ctx.wallet ||
          asset.pending_to_wallet === ctx.wallet;
        if (!canView) throw new Error("본인 담당 자산 또는 수신 예정 자산만 조회할 수 있습니다");
        const labels = await fetchWalletLabels([asset.managed_by, asset.pending_to_wallet]);
        return {
          ...assetSummary(asset),
          serial_no: asset.serial_no,
          order_no: asset.order_no,
          manufacturer: asset.manufacturer,
          rental_company: asset.rental_company,
          billing_cycle: asset.billing_cycle,
          billing_month: asset.billing_month,
          managed_by_label: labels.get(asset.managed_by ?? "") ?? shortAddr(asset.managed_by),
          pending_to_label:
            labels.get(asset.pending_to_wallet ?? "") ?? shortAddr(asset.pending_to_wallet),
          transfer_tx: asset.transfer_tx,
          transferred_at: asset.transferred_at,
        };
      },
    }),

    // ── 이관 이력 ─────────────────────────────────────────────────────
    getTransferHistory: tool({
      description:
        "특정 자산의 이관(인수인계) 이력 — 누가 누구에게, 언제, 어떤 온체인 트랜잭션으로 넘겼는지. 이관 코치·감사 조회에 사용.",
      inputSchema: zodSchema(
        z.object({ management_no: z.string().min(1).max(64) }),
      ),
      execute: async ({ management_no }) => {
        const { data: asset, error: assetErr } = await supabase
          .from("rental_assets")
          .select("management_no, managed_by, pending_to_wallet")
          .eq("management_no", management_no)
          .maybeSingle();
        if (assetErr) throw new Error(assetErr.message);
        if (!asset) throw new Error(`자산을 찾을 수 없습니다: ${management_no}`);
        const canView =
          ctx.isAdmin ||
          asset.managed_by === ctx.wallet ||
          asset.pending_to_wallet === ctx.wallet;
        if (!canView) throw new Error("본인 담당 자산 또는 수신 예정 자산만 조회할 수 있습니다");

        const { data, error } = await supabase
          .from("transfer_history")
          .select("management_no, from_wallet, to_wallet, transfer_tx, transferred_at")
          .eq("management_no", management_no)
          .order("transferred_at", { ascending: true })
          .limit(50);
        if (error) throw new Error(error.message);
        const wallets = (data ?? []).flatMap((r) => [r.from_wallet, r.to_wallet]);
        const labels = await fetchWalletLabels(wallets);
        const items = (data ?? []).map((r) => ({
          from: labels.get(r.from_wallet ?? "") ?? shortAddr(r.from_wallet) ?? "(최초 등록)",
          to: labels.get(r.to_wallet ?? "") ?? shortAddr(r.to_wallet),
          tx: r.transfer_tx ? shortAddr(r.transfer_tx) : null,
          transferred_at: r.transferred_at,
        }));
        return { management_no, count: items.length, items };
      },
    }),

    // ── 월간 리포팅 ───────────────────────────────────────────────────
    getMonthlyReport: tool({
      description:
        "월간 리포팅 — ①확인 필요 자산(인사·근무 기준)과 ②만기 도래 자산(3개월 내 계약 종료). scope=mine은 내 자산(기본), scope=all은 전사(관리자 전용). 리포팅·업무 정리 질문에 사용.",
      inputSchema: zodSchema(
        z.object({
          month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
          scope: z.enum(["mine", "all"]).default("mine"),
        }),
      ),
      execute: async ({ month, scope }) => {
        if (scope === "all") adminOnly(ctx);
        const reportMonth = month ?? currentMonth();
        let assetQuery = supabase.from("rental_assets").select("*");
        if (scope === "mine") {
          assetQuery = assetQuery.eq("managed_by", ctx.wallet).neq("status", "계약종료");
        }
        const [{ data: assets }, { data: profiles }] = await Promise.all([
          assetQuery,
          supabase
            .from("employee_profiles")
            .select(
              "user_name, employment_status, work_location, job_title, hire_date, departure_date",
            ),
        ]);
        const report = computeMonthlyReport({
          assets: (assets ?? []) as RentalAssetRow[],
          profiles: (profiles ?? []) as ReportProfile[],
          month: reportMonth,
        });
        const confirmReasons = new Map<string, number>();
        for (const c of report.confirmItems) {
          confirmReasons.set(c.reason, (confirmReasons.get(c.reason) ?? 0) + 1);
        }
        return {
          month: reportMonth,
          confirmPositions: {
            reasonHistogram: Object.fromEntries(confirmReasons),
            reasons: report.confirmItems.map((c) => ({
              management_no: c.management_no,
              model_name: c.model_name,
              user_name: c.user_name,
              reason: c.reason,
              action: c.action,
              departure_date: c.departure_date,
            })),
          },
          expiring: report.expiringItems.slice(0, 20).map((e) => ({
            management_no: e.management_no,
            model_name: e.model_name,
            user_name: e.user_name,
            rental_end_date: e.rental_end_date,
            days_left: e.days_left,
            action: e.action,
          })),
          totals: {
            confirmCount: report.confirmItems.length,
            expiringCount: report.expiringItems.length,
          },
        };
      },
    }),

    // ── 지갑 디렉토리(이관 대상 검색) ─────────────────────────────────
    getWalletContacts: tool({
      description:
        "인수인계 대상자를 찾기 위한 지갑 디렉토리 조회 — 이름/부문/팀으로 검색. 이관 상대 선택 시 사용.",
      inputSchema: zodSchema(
        z.object({
          keyword: z.string().max(64).optional(),
          division: z.string().max(64).optional(),
          department: z.string().max(64).optional(),
          limit: z.number().int().min(1).max(20).default(10),
        }),
      ),
      execute: async ({ keyword, division, department, limit }) => {
        let query = supabase
          .from("wallet_labels")
          .select("wallet_address, label, division, department")
          .not("label", "is", null)
          .order("label", { ascending: true })
          .limit(limit);
        if (keyword) {
          const k = keyword.replace(/[%,.()]/g, " ").trim();
          if (k) query = query.or(`label.ilike.%${k}%,division.ilike.%${k}%`);
        }
        if (division) query = query.ilike("division", `%${division}%`);
        if (department) query = query.ilike("department", `%${department}%`);
        const { data, error } = await query;
        if (error) throw new Error(error.message);
        return {
          count: (data ?? []).length,
          contacts: (data ?? []).map((r) => ({
            label: r.label,
            division: r.division,
            department: r.department,
            address: shortAddr(r.wallet_address),
          })),
        };
      },
    }),

    // ── 관리자 전용 ───────────────────────────────────────────────────
    getCorpOverview: tool({
      description: "(관리자 전용) 전사 자산 요약 — 전체 자산·상태별 집계·월 렌탈비 합계·진행 중 이전 요청 수. 전사 대시보드 질문에 사용.",
      inputSchema: zodSchema(z.object({})),
      execute: async () => {
        adminOnly(ctx);
        const { data, error } = await supabase.from("rental_assets").select("*");
        if (error) throw new Error(error.message);
        const rows = (data ?? []) as RentalAssetRow[];
        const count = (s: string) => rows.filter((r) => r.status === s).length;
        const active = rows.filter((r) => r.status !== "계약종료");
        const feeSum = active.reduce((s, r) => s + (r.rental_fee ?? 0), 0);
        const pendingApprovals = rows.filter(
          (r) => r.pending_to_wallet !== null && r.pending_receiver_approved_at !== null,
        ).length;
        return {
          total: rows.length,
          normal: count("정상사용"),
          idle: count("유휴"),
          expired: count("계약종료"),
          monthlyFeeSum: feeSum,
          pendingApprovals,
        };
      },
    }),

    getPendingAdminApprovals: tool({
      description: "(관리자 전용) 수신자 승인까지 끝나 관리자 승인만 남은 이전 요청 목록 — 업무 우선순위 파악·배치 처리 전 확인에 사용.",
      inputSchema: zodSchema(
        z.object({ limit: z.number().int().min(1).max(20).default(10) }),
      ),
      execute: async ({ limit }) => {
        adminOnly(ctx);
        const { data, error } = await supabase
          .from("rental_assets")
          .select("*")
          .not("pending_to_wallet", "is", null)
          .not("pending_receiver_approved_at", "is", null)
          .is("pending_approved_at", null)
          .order("pending_approved_at", { ascending: true })
          .limit(limit);
        if (error) throw new Error(error.message);
        const rows = (data ?? []) as RentalAssetRow[];
        const wallets = rows.flatMap((r) => [r.managed_by, r.pending_to_wallet]);
        const labels = await fetchWalletLabels(wallets);
        const items = rows.map((r) => ({
          management_no: r.management_no,
          model_name: r.model_name,
          from: labels.get(r.managed_by ?? "") ?? shortAddr(r.managed_by),
          to: labels.get(r.pending_to_wallet ?? "") ?? shortAddr(r.pending_to_wallet),
          receiverApprovedAt: r.pending_receiver_approved_at,
        }));
        return { count: items.length, items };
      },
    }),

    getHrProfiles: tool({
      description: "(관리자 전용) 인사 프로필 목록 조회 — 이름/부문/팀/인사상태 필터 가능. 인사 정보·리포팅 판단 질문에 사용.",
      inputSchema: zodSchema(
        z.object({
          keyword: z.string().max(64).optional(),
          division: z.string().max(64).optional(),
          department: z.string().max(64).optional(),
          employment_status: z.string().max(64).optional(),
          limit: z.number().int().min(1).max(20).default(10),
        }),
      ),
      execute: async ({ keyword, division, department, employment_status, limit }) => {
        adminOnly(ctx);
        let query = supabase
          .from("employee_profiles")
          .select("user_name, employment_status, work_location, job_title, division, department, hire_date, departure_date")
          .order("user_name", { ascending: true })
          .limit(limit);
        if (keyword) query = query.ilike("user_name", `%${keyword}%`);
        if (division) query = query.eq("division", division);
        if (department) query = query.eq("department", department);
        if (employment_status) query = query.eq("employment_status", employment_status);
        const { data, error } = await query;
        if (error) throw new Error(error.message);
        return { count: (data ?? []).length, profiles: data ?? [] };
      },
    }),
  };
}