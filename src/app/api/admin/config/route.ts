import { NextResponse } from "next/server";
import { getAdminWallets } from "@/lib/admin";

export const runtime = "nodejs";

/**
 * 관리자 화이트리스트 조회(공개) — 클라이언트 UI 게이트용.
 * 실제 데이터 변경은 서버가 x-admin-wallet 헤더로 재검증.
 */
export async function GET() {
  return NextResponse.json({ adminWallets: getAdminWallets() });
}