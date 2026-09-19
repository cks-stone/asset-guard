import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getAdminWalletFromRequest } from "@/lib/admin";
import { executeCreateHandovers } from "@/lib/solana/execute-handover";
import type { RentalAssetRow } from "@/lib/supabase/types";

export const runtime = "nodejs";

const batchSchema = z.object({
  management_nos: z.array(z.string().min(1)).min(1),
  action: z.enum(["approve", "reject"]).default("approve"),
});

function errorResponse(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * 인수인계 3단계(최종) 일괄 승인 — 관리자(ADMIN_WALLETS)가 여러 자산의
 * 이전 요청을 한 번에 승인한다.
 *
 * - 사전 검증: 수신자 승인이 끝난 요청만 대상(수신자 거절/미승인/비정상 상태 제외).
 * - 온체인: `executeCreateHandovers`가 한 트랜잭션에 지시를 묶어 서명 1회,
 *   배치가 통째로 실패하면 개별 폴백해 "한 건이 문제여도 나머지는 처리".
 * - DB 반영: 온체인 승인(tx 서명 확보)된 자산만 소유권 이전 + 이력 기록.
 *
 * 응답은 자산별 결과를 모두 반환하며, 일부만 성공해도 200 이다.
 */
export async function POST(req: NextRequest) {
  const admin = getAdminWalletFromRequest(req);
  if (!admin) {
    return errorResponse("관리자 화이트리스트에 없는 지갑입니다", 403);
  }
  const supabase = getSupabaseAdmin();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("잘못된 요청 본문입니다", 400);
  }
  const parsed = batchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "입력값 검증 실패", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const managementNos = [...new Set(parsed.data.management_nos)];
  const action = parsed.data.action;

  // ── 1) 대상 조회 ──
  const { data: assets, error: findErr } = await supabase
    .from("rental_assets")
    .select("*")
    .in("management_no", managementNos);
  if (findErr) return errorResponse(findErr.message, 500);
  if (!assets) return errorResponse("대상 조회 실패", 500);

  const assetMap = new Map<string, RentalAssetRow>(assets.map((a) => [a.management_no, a]));

  // ── 2) 사전 검증 ──
  const targets: RentalAssetRow[] = [];
  const skipped: { management_no: string; reason: string }[] = [];
  for (const no of managementNos) {
    const asset = assetMap.get(no);
    if (!asset) {
      skipped.push({ management_no: no, reason: "렌탈 자산을 찾을 수 없습니다" });
      continue;
    }
    if (!asset.pending_to_wallet) {
      skipped.push({ management_no: no, reason: "진행 중인 이전 요청이 없습니다" });
      continue;
    }
    if (asset.pending_receiver_rejected_at) {
      skipped.push({ management_no: no, reason: "수신자가 이전을 거절했습니다" });
      continue;
    }
    if (action === "approve") {
      if (!asset.pending_receiver_approved_at) {
        skipped.push({ management_no: no, reason: "수신자가 아직 이전을 승인하지 않았습니다" });
        continue;
      }
      if (asset.status !== "정상사용") {
        skipped.push({ management_no: no, reason: "정상사용 상태에서만 이전을 승인할 수 있습니다" });
        continue;
      }
    }
    targets.push(asset);
  }

  // ── 3) 일괄 거절 (DB 전용 처리 — 온체인 불필요) ──
  if (action === "reject") {
    const succeeded: { management_no: string }[] = [];
    const failed: { management_no: string; error: string }[] = [];
    const now = new Date().toISOString();
    for (const asset of targets) {
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
        .eq("management_no", asset.management_no)
        .neq("pending_to_wallet", null);
      if (error) {
        failed.push({ management_no: asset.management_no, error: error.message });
      } else {
        succeeded.push({ management_no: asset.management_no });
      }
    }
    return NextResponse.json({
      ok: true,
      succeeded,
      failed,
      skipped,
      message: `${succeeded.length}건 거절 완료, ${skipped.length}건 제외, ${failed.length}건 실패.`,
    });
  }

  if (targets.length > 0) {
    // ── 3) 온체인 일괄 실행 (자동 분할 + 배치 실패 시 개별 폴백) ──
    const chainResults = await executeCreateHandovers(
      targets.map((a) => ({
        assetId: a.management_no,
        assetCode: a.management_no,
        from: a.managed_by ?? "",
        to: a.pending_to_wallet ?? "",
      })),
    );
    const sigByNo = new Map<string, string>();
    const chainFailed: { management_no: string; error: string }[] = [];
    for (const r of chainResults) {
      if (r.signature) {
        sigByNo.set(r.assetId, r.signature);
      } else {
        chainFailed.push({ management_no: r.assetId, error: r.error ?? "온체인 실행 실패" });
      }
    }

    // ── 4) 성공한 것만 DB 소유권 이전 + 이력 기록 ──
    const succeeded: { management_no: string; tx_signature: string }[] = [];
    const dbFailed: { management_no: string; error: string }[] = [];
    for (const asset of targets) {
      const signature = sigByNo.get(asset.management_no);
      if (!signature) continue; // chainFailed 에서 이미 보고됨

      const to_wallet = asset.pending_to_wallet!;
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("rental_assets")
        .update({
          managed_by: to_wallet,
          status: "정상사용",
          transfer_tx: signature,
          transferred_at: now,
          pending_to_wallet: null,
          pending_requested_at: null,
          pending_approved_at: null,
          pending_approved_by: null,
          pending_rejected_at: null,
          pending_receiver_approved_at: null,
          pending_receiver_rejected_at: null,
        })
        .eq("management_no", asset.management_no)
        .eq("managed_by", asset.managed_by)
        .eq("pending_to_wallet", to_wallet)
        .not("pending_to_wallet", "is", null)
        .select()
        .maybeSingle();

      const applied =
        !error && data
          ? true
          : await (async () => {
              // 조건 불일치 → 멱등성 재확인 (같은 요청이 이미 반영됐는지)
              const reb = await supabase
                .from("rental_assets")
                .select("managed_by, transfer_tx")
                .eq("management_no", asset.management_no)
                .maybeSingle();
              return !!(
                reb.data &&
                reb.data.managed_by === to_wallet &&
                reb.data.transfer_tx === signature
              );
            })();
      if (!applied) {
        console.error("[approve-batch] DB 이관 반영 실패:", {
          management_no: asset.management_no,
          tx: signature,
          dbError: error?.message,
        });
        dbFailed.push({
          management_no: asset.management_no,
          error:
            error?.message ??
            "이관은 온체인에 반영됐지만 DB 상태 반영에 실패했습니다. 관리자에게 문의하세요.",
        });
        continue;
      }

      // 이관 이력 기록 (실패해도 이관 자체는 완료)
      const { error: histErr } = await supabase.from("transfer_history").insert({
        management_no: asset.management_no,
        from_wallet: asset.managed_by,
        to_wallet,
        transfer_tx: signature,
        transferred_at: now,
      });
      if (histErr) {
        console.error("[approve-batch] 이관 이력 기록 실패:", histErr.message);
      }

      succeeded.push({ management_no: asset.management_no, tx_signature: signature });
    }

    console.log("[approve-batch] 완료:", {
      total: managementNos.length,
      succeeded: succeeded.length,
      chainFailed: chainFailed.length,
      dbFailed: dbFailed.length,
      skipped: skipped.length,
    });

    return NextResponse.json({
      ok: true,
      succeeded,
      failed: [...chainFailed, ...dbFailed],
      skipped,
      message: `${succeeded.length}건 승인 완료, ${skipped.length}건 제외, ${
        chainFailed.length + dbFailed.length
      }건 실패.`,
    });
  }

  return NextResponse.json({
    ok: true,
    succeeded: [],
    failed: [],
    skipped,
    message: `승인 가능한 대상이 없습니다 (${skipped.length}건 제외).`,
  });
}