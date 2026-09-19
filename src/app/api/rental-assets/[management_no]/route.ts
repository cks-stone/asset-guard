import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getAdminWalletFromRequest } from "@/lib/admin";

export const runtime = "nodejs";

export type RentalAssetRouteContext = { params: Promise<{ management_no: string }> };

const STATUSES = ["정상사용", "유휴", "계약종료"] as const;

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식이어야 합니다");

const updateRentalAssetSchema = z
  .object({
    serial_no: z.string().trim().max(100).nullable().optional(),
    order_no: z.string().trim().max(64).nullable().optional(),
    model_name: z.string().trim().min(1).max(200).optional(),
    manufacturer: z.string().trim().max(64).nullable().optional(),
    user_name: z.string().trim().max(64).nullable().optional(),
    division: z.string().trim().max(64).nullable().optional(),
    department: z.string().trim().max(64).nullable().optional(),
    rental_company: z.string().trim().max(64).nullable().optional(),
    billing_cycle: z.enum(["월납", "연납", "반기납", "일시납"]).nullable().optional(),
    rental_fee: z.number().int().min(0).nullable().optional(),
    billing_month: z.string().trim().max(64).nullable().optional(),
    rental_start_date: dateSchema.nullable().optional(),
    rental_end_date: dateSchema.nullable().optional(),
    status: z.enum(STATUSES).optional(),
  })
  .superRefine((val, ctx) => {
    if (
      val.rental_start_date &&
      val.rental_end_date &&
      val.rental_end_date < val.rental_start_date
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "렌탈 종료일은 시작일 이후여야 합니다",
        path: ["rental_end_date"],
      });
    }
  });

function errorResponse(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(_req: NextRequest, ctx: RentalAssetRouteContext) {
  try {
    const supabase = getSupabaseAdmin();
    const { management_no } = await ctx.params;
    const { data, error } = await supabase
      .from("rental_assets")
      .select("*")
      .eq("management_no", management_no)
      .maybeSingle();
    if (error) return errorResponse(error.message, 500);
    if (!data) return errorResponse("렌탈 자산을 찾을 수 없습니다", 404);
    return NextResponse.json({ data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "알 수 없는 오류";
    return errorResponse(msg, 500);
  }
}

export async function PATCH(req: NextRequest, ctx: RentalAssetRouteContext) {
  try {
    if (!getAdminWalletFromRequest(req)) {
      return errorResponse("관리자 지갑이 아닙니다", 401);
    }
    const supabase = getSupabaseAdmin();
    const { management_no } = await ctx.params;
    const body = await req.json();
    const parsed = updateRentalAssetSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "입력값 검증 실패", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const { data, error } = await supabase
      .from("rental_assets")
      .update(parsed.data)
      .eq("management_no", management_no)
      .select()
      .maybeSingle();
    if (error) return errorResponse(error.message, 409);
    if (!data) return errorResponse("렌탈 자산을 찾을 수 없습니다", 404);
    return NextResponse.json({ data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "알 수 없는 오류";
    return errorResponse(msg, 500);
  }
}