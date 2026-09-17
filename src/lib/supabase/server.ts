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