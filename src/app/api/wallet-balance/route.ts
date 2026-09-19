import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { getEnv } from "@/lib/config/env";
import { getWalletFromRequest, isValidSolanaAddress } from "@/lib/admin";

export const runtime = "nodejs";

function errorResponse(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

/** 연결된 지갑의 SOL 잔액 조회 (lamports + SOL). */
export async function GET(req: NextRequest) {
  const wallet = getWalletFromRequest(req);
  if (!wallet) {
    return errorResponse("지갑으로 로그인한 사용자만 조회할 수 있습니다", 401);
  }

  const address = req.nextUrl.searchParams.get("address")?.trim();
  if (!address || !isValidSolanaAddress(address)) {
    return errorResponse("유효한 Solana 주소가 필요합니다", 400);
  }

  try {
    const connection = new Connection(getEnv().NEXT_PUBLIC_SOLANA_RPC_URL, "confirmed");
    const lamports = await connection.getBalance(new PublicKey(address));
    return NextResponse.json({
      address,
      lamports,
      sol: Number((lamports / 1e9).toFixed(6)),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "알 수 없는 오류";
    return errorResponse(msg, 400);
  }
}