import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getWalletFromRequest } from "@/lib/admin";
import type {
  MonthlyConfirmItem,
  MonthlyExpiringItem,
  MonthlyReportData,
  RentalAssetRow,
  WorkLocation,
  EmploymentStatus,
} from "@/lib/supabase/types";

export const runtime = "nodejs";

function errorResponse(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

function startOfMonth(month: string): string {
  return `${month}-01`;
}

function endOfMonth3(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(y, m + 2, 0); // month + 2개월 말일
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${last.getFullYear()}-${pad(last.getMonth() + 1)}-${pad(last.getDate())}`;
}

function daysUntil(dateStr: string): number {
  const end = new Date(`${dateStr}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((end.getTime() - today.getTime()) / 86_400_000);
}

interface ConfirmRule {
  reason: string;
  action: string;
}

function confirmRuleFor(
  status: EmploymentStatus | null,
  location: WorkLocation | null,
  hireInMonth: boolean,
  departInMonth: boolean,
): ConfirmRule | null {
  // 우선순위: 퇴직 > 퇴직예정 > 신규입사 > 휴직류 > 재택 > 지사·출장
  if (status === "퇴직") return { reason: "퇴직", action: "기기 반납·이관 확인" };
  if (departInMonth) return { reason: "퇴직(전근) 예정", action: "기기 반납·이관 확인" };
  if (hireInMonth) return { reason: "신규 입사", action: "장비 지급 확인" };
  if (status === "휴직" || status === "출산휴가" || status === "육아휴직") {
    return { reason: status, action: "기기 보관·대체자 인수 확인" };
  }
  if (location === "재택") return { reason: "재택 근무", action: "재택 사용·보안 점검" };
  if (location === "지사" || location === "해외지사" || location === "출장중") {
    return { reason: `${location} 근무`, action: "장비 이전·배정 확인" };
  }
  return null;
}

/**
 * 월간 리포팅 — 로그인한 사용자(전사 공개)에게 해당 월에 필요한
 * ① 인사·근무 기준 "확인 필요 자산" ② 만기(계약 종료) 도래 자산(이번 달 + 향후 3개월)을 제공.
 */
export async function GET(req: NextRequest) {
  try {
    const wallet = getWalletFromRequest(req);
    if (!wallet) {
      return errorResponse("로그인한 사용자만 조회할 수 있습니다", 401);
    }

    const { searchParams } = new URL(req.url);
    const month = /^\d{4}-\d{2}$/.test(searchParams.get("month") ?? "")
      ? (searchParams.get("month") as string)
      : (() => {
          const now = new Date();
          const pad = (n: number) => String(n).padStart(2, "0");
          return `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
        })();

    const monthStart = startOfMonth(month);
    const monthEnd3 = endOfMonth3(month);

    const supabase = getSupabaseAdmin();

    const [{ data: assets }, { data: profiles }, { data: labels }] =
      await Promise.all([
        supabase.from("rental_assets").select("*"),
        supabase
          .from("employee_profiles")
          .select(
            "wallet_address, employment_status, work_location, job_title, hire_date, departure_date",
          ),
        supabase
          .from("wallet_labels")
          .select("wallet_address, label"),
      ]);

    const profileByWallet = new Map(
      (profiles ?? []).map((p) => [p.wallet_address.toLowerCase(), p]),
    );
    const labelByWallet = new Map(
      (labels ?? []).map((l) => [l.wallet_address.toLowerCase(), l.label]),
    );

    const confirmItems: MonthlyConfirmItem[] = [];
    const expiringItems: MonthlyExpiringItem[] = [];

    const rows = (assets ?? []) as unknown as RentalAssetRow[];
    for (const a of rows) {
      const profKey = a.managed_by?.toLowerCase();
      const profile = profKey ? profileByWallet.get(profKey) : undefined;

      if (a.status !== "계약종료") {
        if (profile && a.managed_by) {
          const hireInMonth = !!profile.hire_date?.startsWith(month);
          const departInMonth = !!profile.departure_date?.startsWith(month);
          const rule = confirmRuleFor(
            profile.employment_status,
            profile.work_location,
            hireInMonth,
            departInMonth,
          );
          if (rule) {
            confirmItems.push({
              management_no: a.management_no,
              model_name: a.model_name,
              category: a.category,
              user_name: a.user_name,
              division: a.division,
              department: a.department,
              location: a.location,
              status: a.status,
              employer: profKey ? (labelByWallet.get(profKey) ?? null) : null,
              employment_status: profile.employment_status,
              work_location: profile.work_location,
              job_title: profile.job_title,
              hire_date: profile.hire_date,
              departure_date: profile.departure_date,
              reason: rule.reason,
              action: rule.action,
            });
          }
        }
      }

      if (
        a.rental_end_date &&
        a.status !== "계약종료" &&
        a.rental_end_date >= monthStart &&
        a.rental_end_date <= monthEnd3
      ) {
        expiringItems.push({
          management_no: a.management_no,
          model_name: a.model_name,
          category: a.category,
          user_name: a.user_name,
          division: a.division,
          department: a.department,
          location: a.location,
          rental_end_date: a.rental_end_date,
          days_left: daysUntil(a.rental_end_date),
          action: "재계약(연장)·반납 검토",
        });
      }
    }

    confirmItems.sort((x, y) => y.management_no.localeCompare(x.management_no));
    expiringItems.sort((x, y) => x.rental_end_date.localeCompare(y.rental_end_date));

    const data: MonthlyReportData = { month, confirmItems, expiringItems };
    return NextResponse.json({ data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "알 수 없는 오류";
    return errorResponse(msg, 500);
  }
}