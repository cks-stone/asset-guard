import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getWalletFromRequest } from "@/lib/admin";

export const runtime = "nodejs";

export type TransferRequestReceiverRouteContext = {
  params: Promise<{ management_no: string }>;
};

const actionSchema = z.object({
  action: z.enum(["approve", "reject"]),
});

function errorResponse(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * 인수인계 2단계 — 수신자(B, pending_to_wallet)가 인수 의사를 승인/거절.
 * 관리자는 B 승인 후에만 최종 승인(온체인 실행)할 수 있다.
 */
export async function POST(req: NextRequest, ctx: TransferRequestReceiverRouteContext) {
  try {
    const wallet = getWalletFromRequest(req);
    if (!wallet) return errorResponse("로그인한 사용자만 수신 승인할 수 있습니다", 401);
    const supabase = getSupabaseAdmin();
    const { management_no } = await ctx.params;

    const body = await req.json();
    const parsed = actionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "입력값 검증 실패", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const { action } = parsed.data;

    const { data: asset, error: findErr } = await supabase
      .from("rental_assets")
      .select("*")
      .eq("management_no", management_no)
      .maybeSingle();
    if (findErr) return errorResponse(findErr.message, 500);
    if (!asset) return errorResponse("렌탈 자산을 찾을 수 없습니다", 404);

    if (!asset.pending_to_wallet) {
      return errorResponse("진행 중인 이전 요청이 없습니다", 400);
    }
    if (asset.pending_to_wallet !== wallet) {
      return errorResponse("이전 요청의 수신자만 승인/거절할 수 있습니다", 403);
    }
    if (asset.pending_receiver_rejected_at) {
      return errorResponse("이미 거절한 이전 요청입니다", 400);
    }

    const now = new Date().toISOString();
    const patch =
      action === "approve"
        ? { pending_receiver_approved_at: now, pending_receiver_rejected_at: null }
        : { pending_receiver_approved_at: null, pending_receiver_rejected_at: now };

    const { data, error } = await supabase
      .from("rental_assets")
      .update(patch)
      .eq("management_no", management_no)
      .eq("pending_to_wallet", wallet)
      .not("pending_to_wallet", "is", null)
      .select()
      .maybeSingle();
    if (error) return errorResponse(error.message, 500);
    if (!data) return errorResponse("요청 상태가 변경되어 처리할 수 없습니다", 400);

    return NextResponse.json({
      ok: true,
      action,
      message:
        action === "approve"
          ? `${management_no} 인수를 승인했습니다. 관리자 최종 승인을 기다립니다.`
          : `${management_no} 인수를 거절했습니다.`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "알 수 없는 오류";
    return errorResponse(msg, 500);
  }
}