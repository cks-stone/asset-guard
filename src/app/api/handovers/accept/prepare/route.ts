import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

const prepareSchema = z.object({
  handover_id: z.string().uuid(),
  partial_tx: z.string().min(64).max(100_000),
});

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const body = await req.json();
    const parsed = prepareSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "입력값 검증 실패", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const current = await supabase
      .from("handovers")
      .select("onchain_status, partial_tx")
      .eq("id", parsed.data.handover_id)
      .maybeSingle();
    if (current.error) return NextResponse.json({ error: current.error.message }, { status: 500 });
    if (!current.data) return NextResponse.json({ error: "인수인계를 찾을 수 없습니다" }, { status: 404 });
    if (current.data.onchain_status !== "pending") {
      return NextResponse.json({ error: "PENDING 상태가 아닙니다" }, { status: 409 });
    }

    const { error } = await supabase
      .from("handovers")
      .update({ partial_tx: parsed.data.partial_tx })
      .eq("id", parsed.data.handover_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "알 수 없는 오류";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}