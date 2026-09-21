import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let shared: SupabaseClient | null = null;

/**
 * 서버 전용 Supabase 클라이언트 (service_role key).
 * RLS INSERT/UPDATE 정책이 service_role 로 제한되어 있어
 * 모든 쓰기 API는 반드시 이 클라이언트를 사용해야 한다.
 * 절대 클라이언트 번들에 노출 금지.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (shared) return shared;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Supabase server env 미설정 (NEXT_PUBLIC_SUPABASE_URL / SERVICE_ROLE_KEY)");
  }

  shared = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
  return shared;
}

// 내부용 — 기본 지갑 명칭: 앞 6자+뒤 4자 (예: BbixZu…fg9DM)
const shortAddr = (addr: string) =>
  addr.length > 10 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;

/**
 * FK(rental_assets.managed_by / transfer_history.from·to_wallet → wallet_labels) 보장을 위해
 * 아직 지갑 명부에 없는 지갑을 기본 명칭(짧은 주소)으로 등록한다 (0016).
 * 프로필 저장은 별도 API(wallet-label)로 하므로, 여기선 FK 무결성만 확보한다.
 */
export async function ensureWalletLabels(
  supabase: SupabaseClient,
  wallets: (string | null | undefined)[],
): Promise<void> {
  const targets = [
    ...new Set(wallets.filter((w): w is string => Boolean(w && w.trim()))),
  ];
  if (targets.length === 0) return;

  const { data: existing, error } = await supabase
    .from("wallet_labels")
    .select("wallet_address")
    .in("wallet_address", targets);
  if (error) {
    throw new Error(`지갑 명부 조회 실패: ${error.message}`);
  }

  const have = new Set((existing ?? []).map((r) => r.wallet_address));
  const missing = targets.filter((w) => !have.has(w));
  if (missing.length === 0) return;

  const now = new Date().toISOString();
  const { error: upsertErr } = await supabase
    .from("wallet_labels")
    .upsert(
      missing.map((w) => ({
        wallet_address: w,
        label: shortAddr(w),
        updated_at: now,
      })),
      { onConflict: "wallet_address" },
    );
  if (upsertErr) {
    throw new Error(`지갑 명부 자동 등록 실패: ${upsertErr.message}`);
  }
}