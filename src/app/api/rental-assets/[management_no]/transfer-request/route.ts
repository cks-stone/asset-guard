import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getWalletFromRequest, isValidSolanaAddress } from "@/lib/admin";

export const runtime = "nodejs";

export type TransferRequestRouteContext = {
  params: Promise<{ management_no: string }>;
};

const requestSchema = z.object({
  to_wallet: z.string().trim().min(1),
});

function errorResponse(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * 인수인계 1단계 — 담당자(managed_by)가 '이전 요청'을 등록.
 * DB에만 기록하고, 관리자 승인 전까지 온체인 트랜잭션은 만들지 않는다.
 */
export async function POST(req: NextRequest, ctx: TransferRequestRouteContext) {
  try {
    const wallet = getWalletFromRequest(req);
    const supabase = getSupabaseAdmin();
    const { management_no } = await ctx.params;

    const body = await req.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "입력값 검증 실패", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { to_wallet } = parsed.data;
    if (!isValidSolanaAddress(to_wallet)) {
      return errorResponse("유효한 Solana 지갑 주소가 아닙니다", 400);
    }

    const { data: asset, error: findErr } = await supabase
      .from("rental_assets")
      .select("*")
      .eq("management_no", management_no)
      .maybeSingle();
    if (findErr) return errorResponse(findErr.message, 500);
    if (!asset) return errorResponse("렌탈 자산을 찾을 수 없습니다", 404);

    if (!wallet || asset.managed_by !== wallet) {
      return errorResponse("해당 렌탈 자산의 담당자만 이전을 요청할 수 있습니다", 403);
    }
    if (to_wallet === wallet) {
      return errorResponse("자기 자신에게 인수인계할 수 없습니다", 400);
    }
    if (asset.status !== "정상사용") {
      return errorResponse("정상사용 상태에서만 이전을 요청할 수 있습니다", 400);
    }
    if (asset.pending_to_wallet) {
      return errorResponse("이미 진행 중인 이전 요청이 있습니다", 400);
    }

    const { error } = await supabase
      .from("rental_assets")
      .update({
        pending_to_wallet: to_wallet,
        pending_requested_at: new Date().toISOString(),
        pending_approved_at: null,
        pending_approved_by: null,
        pending_rejected_at: null,
        pending_receiver_approved_at: null,
        pending_receiver_rejected_at: null,
      })
      .eq("management_no", management_no)
      .is("pending_to_wallet", null);
    if (error) return errorResponse(error.message, 500);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "알 수 없는 오류";
    return errorResponse(msg, 500);
  }
}

/** 인수인계 요청 취소 — 담당자(managed_by)만 가능. 실제 이관이 완료되면(소유가 상대에게 넘어가면) 불가. */
export async function DELETE(req: NextRequest, ctx: TransferRequestRouteContext) {
  try {
    const wallet = getWalletFromRequest(req);
    const supabase = getSupabaseAdmin();
    const { management_no } = await ctx.params;

    const { data: asset, error: findErr } = await supabase
      .from("rental_assets")
      .select("*")
      .eq("management_no", management_no)
      .maybeSingle();
    if (findErr) return errorResponse(findErr.message, 500);
    if (!asset) return errorResponse("렌탈 자산을 찾을 수 없습니다", 404);

    if (!wallet || asset.managed_by !== wallet) {
      return errorResponse("해당 렌탈 자산의 담당자만 이전 요청을 취소할 수 있습니다", 403);
    }
    if (!asset.pending_to_wallet) {
      return errorResponse("진행 중인 이전 요청이 없습니다", 400);
    }

    // 이관은 온체인 실행 후 ownership(managed_by)이 상대에게 넘어가므로,
    // 여기 도달했다는 것은 아직 실제 이관이 아님을 의미한다.
    // 어긋난 이력(transfer_tx/transferred_at)이 남아있다면 함께 정리한다.
    const { error } = await supabase
      .from("rental_assets")
      .update({
        pending_to_wallet: null,
        pending_requested_at: null,
        pending_approved_at: null,
        pending_approved_by: null,
        pending_rejected_at: null,
        pending_receiver_approved_at: null,
        pending_receiver_rejected_at: null,
        transfer_tx: null,
        transferred_at: null,
      })
      .eq("management_no", management_no)
      .eq("managed_by", wallet)
      .not("pending_to_wallet", "is", null);
    if (error) return errorResponse(error.message, 500);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "알 수 없는 오류";
    return errorResponse(msg, 500);
  }
}