import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getAdminWalletFromRequest } from "@/lib/admin";
import { executeCreateHandover } from "@/lib/solana/execute-handover";
import { PublicKey } from "@solana/web3.js";
import { getConnection } from "@/lib/anchor/provider";
import { getFeePayerAddress } from "@/lib/solana/fee-payer";

export const runtime = "nodejs";

export type TransferRequestApproveRouteContext = {
  params: Promise<{ management_no: string }>;
};

const actionSchema = z.object({
  action: z.enum(["approve", "reject"]),
});

function errorResponse(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * 인수인계 3단계(최종) — 관리자(ADMIN_WALLETS)가 이전 요청을 승인/거절.
 *
 * 신규 흐름: 1) A 요청 → 2) B 수신 승인(pending_receiver_approved_at)
 * → 3) 관리자 승인. 승인(approve) 시점에 서비스 지갑이 온체인 create_handover 를
 * 단독 실행하고, 성공하면 DB 소유권이 B 로 바로 이전된다(인수·확정 단계 불필요).
 *
 * 거절(reject)은 진행 중 요청을 초기화하고, 수신자(B)가 거절하면 승인 불가.
 */
export async function POST(req: NextRequest, ctx: TransferRequestApproveRouteContext) {
  const admin = getAdminWalletFromRequest(req);
  if (!admin) {
    return errorResponse("관리자 화이트리스트에 없는 지갑입니다", 403);
  }
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

  try {
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

    const to_wallet: string = asset.pending_to_wallet;
    const now = new Date().toISOString();

    // 거절 — 진행 상태 초기화 (수신자 결의 포함)
    if (action === "reject") {
      const { error } = await supabase
        .from("rental_assets")
        .update({
          pending_to_wallet: null,
          pending_requested_at: null,
          pending_approved_at: null,
          pending_approved_by: null,
          pending_rejected_at: now,
          pending_receiver_approved_at: null,
          pending_receiver_rejected_at: null,
        })
        .eq("management_no", management_no)
        .neq("pending_to_wallet", null);
      if (error) return errorResponse(error.message, 500);
      return NextResponse.json({
        ok: true,
        action,
        message: `${management_no} 이전 요청을 거절했습니다.`,
      });
    }

    // ── 승인 (최종): 수신자 승인이 선행되어야 함 ──
    if (asset.pending_receiver_rejected_at) {
      return errorResponse(`수신자가 이전을 거절했습니다 (${management_no})`, 400);
    }
    if (!asset.pending_receiver_approved_at) {
      return errorResponse(
        `수신자가 아직 이전을 승인하지 않았습니다 (${management_no})`,
        400,
      );
    }
    if (asset.status !== "정상사용") {
      return errorResponse("정상사용 상태에서만 이전을 승인할 수 있습니다", 400);
    }

    // 온체인 실행 (서비스 지갑 단독 서명 — 관리자 승인의 실행 결과)
    let signature: string;
    try {
      ({ signature } = await executeCreateHandover({
        assetId: management_no,
        assetCode: management_no,
        from: asset.managed_by,
        to: to_wallet,
      }));
    } catch (e) {
      const detail = e instanceof Error ? e.message : "지갑 단독 실행 실패";
      return errorResponse(`온체인 실행 실패: ${detail}`, 500);
    }
    await new Promise((r) => setTimeout(r, 3000));

    // DB 소유권 이전 + 진행 상태 초기화 (조건부 업데이트로 중복 방지)
    const { data, error } = await supabase
      .from("rental_assets")
      .update({
        managed_by: to_wallet,
        status: "정상사용",
        transfer_tx: signature,
        transferred_at: new Date().toISOString(),
        pending_to_wallet: null,
        pending_requested_at: null,
        pending_approved_at: null,
        pending_approved_by: null,
        pending_rejected_at: null,
        pending_receiver_approved_at: null,
        pending_receiver_rejected_at: null,
      })
      .eq("management_no", management_no)
      .eq("managed_by", asset.managed_by)
      .eq("pending_to_wallet", to_wallet)
      .not("pending_to_wallet", "is", null)
      .select()
      .maybeSingle();
    if (error) return errorResponse(error.message, 500);
    if (!data) {
      // 같은 요청이 중복 제출돼 이미 반영됐는지(멱등성) 재확인
      const reb = await supabase
        .from("rental_assets")
        .select("managed_by, status, transfer_tx")
        .eq("management_no", management_no)
        .maybeSingle();
      if (
        reb.data &&
        reb.data.managed_by === to_wallet &&
        reb.data.transfer_tx === signature
      ) {
        console.warn("[approve] 중복 승인 요청 — 이미 반영됨:", {
          management_no,
          tx: signature,
        });
        return NextResponse.json({
          data: reb.data,
          tx_signature: signature,
          message: `${management_no} 이전을 이미 완료했습니다.`,
        });
      }
      console.error(
        "[approve] DB 이관 반영 실패 (조건 불일치), 온체인은 실행됨:",
        { management_no, tx: signature },
      );
      return errorResponse(
        "이관은 온체인에 반영됐지만 DB 상태 반영에 실패했습니다. 관리자에게 문의하세요.",
        500,
      );
    }

    // 이관 이력 기록 (조회 편의용, 실패해도 이관 자체는 완료)
    const { error: histErr } = await supabase.from("transfer_history").insert({
      management_no,
      from_wallet: asset.managed_by,
      to_wallet,
      transfer_tx: signature,
      transferred_at: new Date().toISOString(),
    });
    if (histErr) {
      console.error("[approve] 이관 이력 기록 실패:", histErr.message);
    }

    console.log("[approve] 인수인계 완료:", {
      management_no,
      from: asset.managed_by,
      to: to_wallet,
      tx: signature,
      feePayer: getFeePayerAddress(),
      feePayerBalance: await getConnection()
        .getBalance(new PublicKey(getFeePayerAddress() ?? ""))
        .catch(() => null),
    });

    return NextResponse.json({
      data,
      tx_signature: signature,
      message: `${management_no} 이전을 승인·완료했습니다.`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "알 수 없는 오류";
    return errorResponse(msg, 500);
  }
}