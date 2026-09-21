import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getAdminWalletFromRequest, getWalletFromRequest } from "@/lib/admin";
import type { ReportProfile } from "@/lib/monthly-report/core";
import {
  computeMonthlyReport,
  currentMonth,
} from "@/lib/monthly-report/core";
import type { MonthlyReportData, RentalAssetRow } from "@/lib/supabase/types";

export const runtime = "nodejs";

function errorResponse(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * 월간 리포팅 — 해당 월에 필요한
 * ① 인사·근무 기준 "확인 필요 자산" ② 만기(계약 종료) 도래 자산(이번 달 + 향후 3개월).
 * scope=mine: 내가 관리하는 자산(managed_by = 내 지갑)만 — 모든 로그인 사용자.
 * scope=all(기본): 전체 자산 — 관리자 전용(전사 대시보드).
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const scope = searchParams.get("scope") ?? "all";

    // 모든 사용자(관리자 포함)의 일반 대시보드는 "내 자산" 기준이라
    // scope=mine을 기본 조회 모드로 사용하고, 전사 뷰(scope=all)는 관리자만.
    let wallet: string | null = null;
    if (scope === "mine") {
      wallet = getWalletFromRequest(req);
      if (!wallet) return errorResponse("로그인한 사용자만 조회할 수 있습니다", 401);
    } else {
      if (!getAdminWalletFromRequest(req)) {
        return errorResponse("관리자 지갑이 아닙니다", 401);
      }
    }

    const monthParam = searchParams.get("month");
    const month = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : currentMonth();

    const supabase = getSupabaseAdmin();

    let assetQuery = supabase.from("rental_assets").select("*");
    if (scope === "mine" && wallet) {
      // 내가 관리하는 자산만 — 일반 대시보드와 동일한 기준 (계약종료 제외 규칙 유지)
      assetQuery = assetQuery
        .eq("managed_by", wallet)
        .neq("status", "계약종료");
    }

    const [{ data: assets }, { data: profiles }] = await Promise.all([
      assetQuery,
      supabase
        .from("employee_profiles")
        .select(
          "user_name, employment_status, work_location, job_title, hire_date, departure_date",
        ),
    ]);

    const data: MonthlyReportData = computeMonthlyReport({
      assets: (assets ?? []) as RentalAssetRow[],
      profiles: (profiles ?? []) as ReportProfile[],
      month,
    });
    return NextResponse.json({ data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "알 수 없는 오류";
    return errorResponse(msg, 500);
  }
}