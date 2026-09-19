import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getWalletFromRequest } from "@/lib/admin";

export const runtime = "nodejs";

const profileSchema = z.object({
  label: z.string().trim().min(1).max(60),
  division: z.string().trim().max(64).nullable().optional(),
  department: z.string().trim().max(64).nullable().optional(),
});

function errorResponse(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * 지갑 프로필 등록/수정 (명칭 + 부문 + 팀).
 * 로그인 사용자가 본인(x-wallet) 지갑의 프로필만 저장할 수 있다.
 * 조회는 지갑 로그인한 사용자 누구나 가능(RLS select 참조).
 */
export async function POST(req: NextRequest) {
  try {
    const wallet = getWalletFromRequest(req);
    if (!wallet) {
      return errorResponse("지갑으로 로그인한 사용자만 등록할 수 있습니다", 401);
    }

    const body = await req.json();
    const parsed = profileSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "이름은 1~60자, 부문/팀은 64자 이하로 입력해 주세요", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const { label, division = null, department = null } = parsed.data;

    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("wallet_labels").upsert(
      {
        wallet_address: wallet,
        label,
        division: division?.trim() || null,
        department: department?.trim() || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "wallet_address" },
    );
    if (error) return errorResponse(error.message, 500);

    return NextResponse.json({ ok: true, wallet, label, division: division?.trim() || null, department: department?.trim() || null });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "알 수 없는 오류";
    return errorResponse(msg, 500);
  }
}

/** 내 지갑 프로필 조회 */
export async function GET(req: NextRequest) {
  try {
    const wallet = getWalletFromRequest(req);
    if (!wallet) {
      return errorResponse("지갑으로 로그인한 사용자만 조회할 수 있습니다", 401);
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("wallet_labels")
      .select("label, division, department")
      .eq("wallet_address", wallet)
      .maybeSingle();
    if (error) return errorResponse(error.message, 500);

    return NextResponse.json({
      wallet,
      label: data?.label ?? null,
      division: data?.division ?? null,
      department: data?.department ?? null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "알 수 없는 오류";
    return errorResponse(msg, 500);
  }
}