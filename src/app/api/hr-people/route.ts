import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getWalletFromRequest } from "@/lib/admin";

export const runtime = "nodejs";

function errorResponse(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

export interface HrPeopleEntry {
  user_name: string;
  division: string | null;
  department: string | null;
}

/**
 * 인사(직원) 목록 — 로그인 사용자 공개용 (자산 등록 사용자 select).
 * /api/employees 는 관리자 전용(x-admin-wallet)이라 일반 사용자의 자산 등록에서
 * 사용할 수 없다. 여기선 이름·부문·팀만 반환한다 (인사상태 등 민감 필드 제외).
 * RLS: employee_profiles select 는 공개(using true).
 */
export async function GET(req: NextRequest) {
  try {
    const wallet = getWalletFromRequest(req);
    if (!wallet) {
      return errorResponse("지갑으로 로그인한 사용자만 조회할 수 있습니다", 401);
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("employee_profiles")
      .select("user_name, division, department")
      .order("user_name", { ascending: true });
    if (error) return errorResponse(error.message, 500);

    return NextResponse.json({
      data: (data ?? []) as unknown as HrPeopleEntry[],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "알 수 없는 오류";
    return errorResponse(msg, 500);
  }
}