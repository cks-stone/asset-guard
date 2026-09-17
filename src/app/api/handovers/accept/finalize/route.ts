import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { fetchHandoverStatusOnChain } from "@/lib/solana/onchain-status";

export const runtime = "nodejs";

const finalizeSchema = z.object({
  handover_id: z.string().uuid(),
  tx_signature: z.string().min(64).max(100),
  asset_id: z.string().uuid(),
  from_wallet: z.string().min(32).max(44),
  to_wallet: z.string().min(32).max(44),
});

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const body = await req.json();
    const parsed = finalizeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "입력값 검증 실패", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const current = await supabase
      .from("handovers")
      .select("onchain_status, from_wallet, to_wallet, asset_id")
      .eq("id", parsed.data.handover_id)
      .maybeSingle();
    if (current.error) return NextResponse.json({ error: current.error.message }, { status: 500 });
    if (!current.data) return NextResponse.json({ error: "인수인계를 찾을 수 없습니다" }, { status: 404 });
    if (current.data.onchain_status !== "pending") {
      return NextResponse.json({ error: "PENDING 상태가 아닙니다" }, { status: 409 });
    }

    // 온체인 원장 기준 검증 (클라이언트 주장을 믿지 않는다)
    const onchain = await fetchHandoverStatusOnChain({
      assetId: parsed.data.asset_id,
      from: parsed.data.from_wallet,
      to: parsed.data.to_wallet,
    });
    if (!onchain.exists) {
      return NextResponse.json({ error: "온체인 PDA를 찾을 수 없습니다" }, { status: 422 });
    }
    if (onchain.status !== "completed") {
      return NextResponse.json(
        { error: "온체인 상태가 COMPLETED가 아닙니다", onchain: onchain.status },
        { status: 409 },
      );
    }

    const handoverUpdate = await supabase
      .from("handovers")
      .update({
        onchain_status: "completed",
        tx_signature: parsed.data.tx_signature,
        completed_at: new Date().toISOString(),
        partial_tx: null,
      })
      .eq("id", parsed.data.handover_id)
      .select()
      .maybeSingle();
    if (handoverUpdate.error) {
      return NextResponse.json({ error: handoverUpdate.error.message }, { status: 500 });
    }

    const assetUpdate = await supabase
      .from("assets")
      .update({ custodian_wallet: parsed.data.to_wallet, status: "in_use" })
      .eq("id", parsed.data.asset_id)
      .select()
      .maybeSingle();
    if (assetUpdate.error) {
      return NextResponse.json({ error: assetUpdate.error.message }, { status: 500 });
    }

    return NextResponse.json({
      handover: handoverUpdate.data,
      asset: assetUpdate.data,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "알 수 없는 오류";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}