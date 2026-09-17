import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

const walletSchema = z
  .string()
  .regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "유효하지 않은 Solana 지갑 주소");

const createHandoverSchema = z
  .object({
    asset_id: z.string().uuid(),
    from_wallet: walletSchema,
    to_wallet: walletSchema,
    onchain_pda: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/).nullable().optional(),
    tx_signature: z.string().min(64).max(100).nullable().optional(),
  })
  .refine((v) => v.from_wallet !== v.to_wallet, {
    message: "인계자와 인수자는 같은 주소일 수 없습니다",
    path: ["to_wallet"],
  });

function errorResponse(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(req.url);
    const statusParam = searchParams.get("status");
    const assetId = searchParams.get("asset_id");

    let query = supabase
      .from("handovers")
      .select("*")
      .order("created_at", { ascending: false });

    if (statusParam) {
      query = query.eq("onchain_status", statusParam);
    }
    if (assetId) {
      query = query.eq("asset_id", assetId);
    }

    const { data, error } = await query;
    if (error) return errorResponse(error.message, 500);
    return NextResponse.json({ data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "알 수 없는 오류";
    return errorResponse(msg, 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const body = await req.json();
    const parsed = createHandoverSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "입력값 검증 실패", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { asset_id, from_wallet, to_wallet, onchain_pda, tx_signature } = parsed.data;

    const asset = await supabase
      .from("assets")
      .select("asset_code, status")
      .eq("id", asset_id)
      .maybeSingle();
    if (asset.error) return errorResponse(asset.error.message, 500);
    if (!asset.data) return errorResponse("자산을 찾을 수 없습니다", 404);
    if (asset.data.status === "retired") {
      return errorResponse("폐기(retired) 상태 자산은 인수인계할 수 없습니다", 422);
    }

    const { data, error } = await supabase
      .from("handovers")
      .insert({
        asset_id,
        asset_code: asset.data.asset_code,
        from_wallet,
        to_wallet,
        onchain_pda: onchain_pda ?? null,
        tx_signature: tx_signature ?? null,
      })
      .select()
      .single();

    // one_pending_handover_per_asset / asset_pair_unique 위반 시 상태코드 정규화
    if (error) {
      const isConflict = /duplicate key|unique/.test(error.message);
      return errorResponse(
        isConflict ? "이미 진행 중인 인수인계가 있습니다" : error.message,
        isConflict ? 409 : 500,
      );
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "알 수 없는 오류";
    return errorResponse(msg, 500);
  }
}