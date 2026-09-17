import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getAdminWalletFromRequest } from "@/lib/admin";
import type { AssetStatus } from "@/lib/supabase/types";

export const runtime = "nodejs";

const insertAssetSchema = z.object({
  asset_code: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(200),
  category: z.string().trim().max(100).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  custodian_wallet: z
    .string()
    .trim()
    .regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)
    .nullable()
    .optional(),
  status: z.enum(["available", "in_use", "retired"]).default("available"),
});

function errorResponse(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(req.url);
    const statusParam = searchParams.get("status") as AssetStatus | null;
    const q = searchParams.get("q");

    let query = supabase
      .from("assets")
      .select("*")
      .order("created_at", { ascending: false });

    if (statusParam) {
      query = query.eq("status", statusParam);
    }
    if (q && q.trim()) {
      const pattern = `%${q.trim()}%`;
      query = query.or(`name.ilike.${pattern},asset_code.ilike.${pattern}`);
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
    if (!getAdminWalletFromRequest(req)) {
      return errorResponse("관리자 지갑이 아닙니다", 401);
    }
    const supabase = getSupabaseAdmin();
    const body = await req.json();
    const parsed = insertAssetSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "입력값 검증 실패", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const { data, error } = await supabase
      .from("assets")
      .insert(parsed.data)
      .select()
      .single();
    if (error) return errorResponse(error.message, 409);
    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "알 수 없는 오류";
    return errorResponse(msg, 500);
  }
}