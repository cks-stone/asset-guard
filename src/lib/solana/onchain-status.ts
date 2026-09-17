import "server-only";
import { Connection } from "@solana/web3.js";
import { getEnv } from "@/lib/config/env";
import { findHandoverPda } from "@/lib/solana/pda";

export type OnChainStatus = "pending" | "completed" | "cancelled";

const STATUS_BY_U8: OnChainStatus[] = ["pending", "completed", "cancelled"];

/**
 * 서버에서 Anchor PDA 계정 데이터를 읽어 온체인 상태를 검증한다.
 * (Supabase 서버 역할이 아니라 온체인 원장 기준으로 상태를 확정하기 위한 것)
 */
export async function fetchHandoverStatusOnChain(args: {
  assetId: string;
  from: string;
  to: string;
}): Promise<{ exists: boolean; status: OnChainStatus }> {
  const env = getEnv();
  if (!env.NEXT_PUBLIC_ASSET_GUARD_PROGRAM_ID) {
    throw new Error("NEXT_PUBLIC_ASSET_GUARD_PROGRAM_ID 가 설정되어 있지 않습니다");
  }
  const { pda } = await findHandoverPda(
    env.NEXT_PUBLIC_ASSET_GUARD_PROGRAM_ID,
    args.assetId,
    args.from,
    args.to,
  );
  const connection = new Connection(env.NEXT_PUBLIC_SOLANA_RPC_URL, "confirmed");
  const info = await connection.getAccountInfo(pda);
  if (!info || info.data.length === 0) return { exists: false, status: "pending" };

  // layout: [8 discriminator][4+len asset_id][4+len asset_code][32 from][32 to][1 status]...
  const data = info.data;
  let i = 8;
  const assetIdLen = data.readUInt32LE(i);
  i += 4 + assetIdLen;
  const assetCodeLen = data.readUInt32LE(i);
  i += 4 + assetCodeLen;
  i += 32 + 32;
  const status = data[i];

  return { exists: true, status: STATUS_BY_U8[status] ?? "pending" };
}