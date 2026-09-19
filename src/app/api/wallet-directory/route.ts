import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getWalletFromRequest } from "@/lib/admin";

export const runtime = "nodejs";

function errorResponse(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

export interface WalletDirectoryEntry {
  wallet_address: string;
  label: string;
  division: string | null;
  department: string | null;
}

/**
 * 지갑 디렉토리 — 인수인계 대상 검색.
 * 프로필(이름)을 등록한 지갑 목록을 이름/부문/팀으로 검색한다.
 * 본인(x-wallet)은 제외한다 (자기 자신에게 인수인계 불가).
 */
export async function GET(req: NextRequest) {
  try {
    const wallet = getWalletFromRequest(req);
    if (!wallet) {
      return errorResponse("지갑으로 로그인한 사용자만 조회할 수 있습니다", 401);
    }

    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") ?? "").trim();

    const supabase = getSupabaseAdmin();
    let query = supabase
      .from("wallet_labels")
      .select("wallet_address, label, division, department")
      .neq("wallet_address", wallet)
      .order("label", { ascending: true });

    if (q) {
      const pattern = `%${q}%`;
      query = query.or(
        `label.ilike.${pattern},division.ilike.${pattern},department.ilike.${pattern}`,
      );
    } else {
      query = query.order("label", { ascending: true }).limit(50);
    }

    const { data, error } = await query;
    if (error) return errorResponse(error.message, 500);

    return NextResponse.json({
      data: (data ?? []) as unknown as WalletDirectoryEntry[],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "알 수 없는 오류";
    return errorResponse(msg, 500);
  }
}