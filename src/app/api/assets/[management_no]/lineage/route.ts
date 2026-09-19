import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getWalletFromRequest } from "@/lib/admin";

export const runtime = "nodejs";

function errorResponse(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ management_no: string }> },
) {
  try {
    const wallet = getWalletFromRequest(req);
    if (!wallet) {
      return errorResponse("지갑으로 로그인한 사용자만 이관 이력을 볼 수 있습니다", 401);
    }
    const supabase = getSupabaseAdmin();
    const { management_no } = await ctx.params;

    const { data: asset, error: findErr } = await supabase
      .from("rental_assets")
      .select("management_no, model_name, serial_no, status, managed_by")
      .eq("management_no", management_no)
      .maybeSingle();
    if (findErr) return errorResponse(findErr.message, 500);
    if (!asset) return errorResponse("렌탈 자산을 찾을 수 없습니다", 404);

    const { data: transfers, error: trErr } = await supabase
      .from("transfer_history")
      .select("from_wallet, to_wallet, transfer_tx, transferred_at")
      .eq("management_no", management_no)
      .order("transferred_at", { ascending: true })
      .order("id", { ascending: true });
    if (trErr) return errorResponse(trErr.message, 500);

    // 그래프 노드가 될 모든 지갑(이관 내역 + 현재 담당자)의 명칭 조회
    const wallets = new Set<string>();
    for (const t of transfers ?? []) {
      if (t.from_wallet) wallets.add(t.from_wallet);
      if (t.to_wallet) wallets.add(t.to_wallet);
    }
    if (asset.managed_by) wallets.add(asset.managed_by);

    const labels: Record<string, string | null> = {};
    if (wallets.size > 0) {
      const { data: labelRows } = await supabase
        .from("wallet_labels")
        .select("wallet_address, label")
        .in("wallet_address", [...wallets]);
      for (const row of labelRows ?? []) labels[row.wallet_address] = row.label;
    }

    return NextResponse.json({
      asset,
      labels,
      transfers: (transfers ?? []).map((t) => ({
        from: t.from_wallet as string | null,
        to: t.to_wallet as string,
        tx: t.transfer_tx as string | null,
        at: t.transferred_at,
      })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "알 수 없는 오류";
    return errorResponse(msg, 500);
  }
}