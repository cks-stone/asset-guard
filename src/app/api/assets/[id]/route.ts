import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getAdminWalletFromRequest } from "@/lib/admin";

export const runtime = "nodejs";

export type AssetRouteContext = { params: Promise<{ id: string }> };

const updateAssetSchema = z.object({
  asset_code: z.string().trim().min(1).max(64).optional(),
  name: z.string().trim().min(1).max(200).optional(),
  category: z.string().trim().max(100).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  custodian_wallet: z
    .string()
    .trim()
    .regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)
    .nullable()
    .optional(),
  status: z.enum(["available", "in_use", "retired"]).optional(),
});

function errorResponse(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(_req: NextRequest, ctx: AssetRouteContext) {
  try {
    const supabase = getSupabaseAdmin();
    const { id } = await ctx.params;
    const { data, error } = await supabase
      .from("assets")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) return errorResponse(error.message, 500);
    if (!data) return errorResponse("자산을 찾을 수 없습니다", 404);
    return NextResponse.json({ data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "알 수 없는 오류";
    return errorResponse(msg, 500);
  }
}

export async function PATCH(req: NextRequest, ctx: AssetRouteContext) {
  try {
    if (!getAdminWalletFromRequest(req)) {
      return errorResponse("관리자 지갑이 아닙니다", 401);
    }
    const supabase = getSupabaseAdmin();
    const { id } = await ctx.params;
    const body = await req.json();
    const parsed = updateAssetSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "입력값 검증 실패", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const { data, error } = await supabase
      .from("assets")
      .update(parsed.data)
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) return errorResponse(error.message, 409);
    if (!data) return errorResponse("자산을 찾을 수 없습니다", 404);
    return NextResponse.json({ data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "알 수 없는 오류";
    return errorResponse(msg, 500);
  }
}