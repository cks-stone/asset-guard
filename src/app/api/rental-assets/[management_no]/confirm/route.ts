import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getWalletFromRequest } from "@/lib/admin";

export const runtime = "nodejs";

export type ConfirmRouteContext = { params: Promise<{ management_no: string }> };

function errorResponse(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * 인수 확인 — 이전받은 담당자(managed_by)가 인수인계대기 자산을 정상사용으로 확정.
 * (온체인 별도 기록 없음, DB 상태만 전환)
 */
export async function POST(req: NextRequest, ctx: ConfirmRouteContext) {
  try {
    const wallet = getWalletFromRequest(req);
    const supabase = getSupabaseAdmin();
    const { management_no } = await ctx.params;

    const { data: asset, error: findErr } = await supabase
      .from("rental_assets")
      .select("management_no, managed_by, status")
      .eq("management_no", management_no)
      .maybeSingle();
    if (findErr) return errorResponse(findErr.message, 500);
    if (!asset) return errorResponse("렌탈 자산을 찾을 수 없습니다", 404);

    if (asset.managed_by !== wallet) {
      return errorResponse("해당 렌탈 자산의 담당자만 인수 확인할 수 있습니다", 403);
    }
    if (asset.status !== "인수인계대기") {
      return errorResponse("인수인계대기 상태인 자산만 인수 확인할 수 있습니다", 400);
    }

    const { data, error } = await supabase
      .from("rental_assets")
      .update({ status: "정상사용" })
      .eq("management_no", management_no)
      .select()
      .maybeSingle();
    if (error) return errorResponse(error.message, 500);
    return NextResponse.json({ data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "알 수 없는 오류";
    return errorResponse(msg, 500);
  }
}