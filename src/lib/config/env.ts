import { z } from "zod";

const devSchema = z.object({
  NEXT_PUBLIC_SOLANA_NETWORK: z.enum(["devnet", "mainnet-beta"]),
  NEXT_PUBLIC_SOLANA_RPC_URL: z.string().url(),
  NEXT_PUBLIC_ASSET_GUARD_PROGRAM_ID: z.string().optional(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
  NEXT_PUBLIC_PRIVY_APP_ID: z.string().optional(),
  NEXT_PUBLIC_PRIVY_CLIENT_ID: z.string().optional(),
  // 인수인계 수수료·PDA 렌트를 부담하는 시스템(관리자) 결제 지갑 (공개주소, 브라우저 사용)
  NEXT_PUBLIC_FEE_PAYER_ADDRESS: z.string().min(1).optional(),
});

const serverSchema = devSchema.extend({
  // 관리자 지갑 화이트리스트 (콤마 구분 base58) — 서버 전용
  ADMIN_WALLETS: z.string().optional(),
  // AI 챗봇 — Gemini API 키 (서버 전용, 절대 브라우저 노출 금지)
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1).optional(),
  // 챗봇 모델 (기본 gemini-2.5-flash, env로 오버라이드)
  CHAT_MODEL: z.string().min(1).optional(),
  // 서버 전용 결제 지갑 개인키 (base58, 절대 브라우저 노출 금지)
  FEE_PAYER_SECRET: z.string().min(1).optional(),
});

export type SolanaEnv = z.infer<typeof serverSchema>;

let cached: SolanaEnv | null = null;

/**
 * 단일 설정 진입점.
 * Devnet/Mainnet 전환은 NEXT_PUBLIC_SOLANA_NETWORK 기준 (DOGPANDA 스펙 코딩 원칙 #2).
 */
export function getEnv(): SolanaEnv {
  if (cached) return cached;
  const parsed = serverSchema.safeParse({
    NEXT_PUBLIC_SOLANA_NETWORK: process.env.NEXT_PUBLIC_SOLANA_NETWORK,
    NEXT_PUBLIC_SOLANA_RPC_URL: process.env.NEXT_PUBLIC_SOLANA_RPC_URL,
    NEXT_PUBLIC_ASSET_GUARD_PROGRAM_ID:
      process.env.NEXT_PUBLIC_ASSET_GUARD_PROGRAM_ID,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_PRIVY_APP_ID: process.env.NEXT_PUBLIC_PRIVY_APP_ID,
    NEXT_PUBLIC_PRIVY_CLIENT_ID: process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID,
    NEXT_PUBLIC_FEE_PAYER_ADDRESS: process.env.NEXT_PUBLIC_FEE_PAYER_ADDRESS,
    ADMIN_WALLETS: process.env.ADMIN_WALLETS,
    GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    CHAT_MODEL: process.env.CHAT_MODEL,
    FEE_PAYER_SECRET: process.env.FEE_PAYER_SECRET,
  });
  if (!parsed.success) {
    const details = JSON.stringify(parsed.error.flatten().fieldErrors, null, 2);
    throw new Error(`Invalid environment variables:\n${details}`);
  }
  cached = parsed.data;
  return cached;
}

export const isSolanaMainnet = (): boolean =>
  getEnv().NEXT_PUBLIC_SOLANA_NETWORK === "mainnet-beta";

export function getProgramId(): string | null {
  return getEnv().NEXT_PUBLIC_ASSET_GUARD_PROGRAM_ID ?? null;
}