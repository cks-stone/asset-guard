import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let shared: SupabaseClient | null = null;

/**
 * 브라우저/서버 공용 Supabase 클라이언트 (anon key, public env 사용).
 * RLS SELECT 정책으로 읽기만 허용하고, 쓰기는 getSupabaseAdmin() 경유.
 */
export function getSupabaseClient(): SupabaseClient {
  if (shared) return shared;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Supabase public env 미설정 (NEXT_PUBLIC_SUPABASE_URL / ANON_KEY)");
  }

  shared = createClient(url, anonKey, {
    auth: { persistSession: false },
  });
  return shared;
}