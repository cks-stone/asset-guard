import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getAdminWalletFromRequest, getWalletFromRequest } from "@/lib/admin";
import type { RentalAssetRow, RentalAssetStatus } from "@/lib/supabase/types";

export const runtime = "nodejs";

const STATUSES = ["정상사용", "유휴", "계약종료"] as const;
const BILLING_CYCLES = ["월납", "연납", "반기납", "일시납"] as const;

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식이어야 합니다");

const insertRentalAssetSchema = z
  .object({
    management_no: z.string().trim().min(1).max(64),
    serial_no: z.string().trim().max(100).nullable().optional(),
    order_no: z.string().trim().max(64).nullable().optional(),
    model_name: z.string().trim().min(1).max(200),
    category: z.string().trim().max(64).nullable().optional(),
    manufacturer: z.string().trim().max(64).nullable().optional(),
    user_name: z.string().trim().max(64).nullable().optional(),
    division: z.string().trim().max(64).nullable().optional(),
    department: z.string().trim().max(64).nullable().optional(),
    rental_company: z.string().trim().max(64).nullable().optional(),
    billing_cycle: z.enum(BILLING_CYCLES).nullable().optional(),
    rental_fee: z.number().int().min(0).nullable().optional(),
    billing_month: z.string().trim().max(64).nullable().optional(),
    rental_start_date: dateSchema.nullable().optional(),
    rental_end_date: dateSchema.nullable().optional(),
    status: z.enum(STATUSES).default("정상사용"),
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

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(req.url);
    const statusParam = searchParams.get("status") as RentalAssetStatus | null;
    const categoryParam = searchParams.get("category");
    const q = searchParams.get("q");
    const modelParam = searchParams.get("model");
    const manufacturerParam = searchParams.get("manufacturer");
    const divisionParam = searchParams.get("division");
    const departmentParam = searchParams.get("department");
    const rentalCompanyParam = searchParams.get("rental_company");
    const billingCycleParam = searchParams.get("billing_cycle");
    const feeMinParam = searchParams.get("fee_min");
    const feeMaxParam = searchParams.get("fee_max");
    const startFromParam = searchParams.get("start_from");
    const startToParam = searchParams.get("start_to");
    const endFromParam = searchParams.get("end_from");
    const endToParam = searchParams.get("end_to");
    // all=1 (관리자 전용): 전체 조회. 기본: 본인 담당(managed_by) 행만 조회.
    const all = searchParams.get("all") === "1";
    // incoming=1: 내게 온 '수신 대기'(pending_to_wallet = 내 지갑) 조회
    const incoming = searchParams.get("incoming") === "1";
    // idle=1: 전사 유휴 자산 — 로그인한 모든 사용자에게 공개
    const idle = searchParams.get("idle") === "1";
    const wallet = getWalletFromRequest(req);
    const admin = getAdminWalletFromRequest(req);

    if (all) {
      if (!admin) return errorResponse("관리자 지갑이 아닙니다", 401);
    } else {
      // 유휴 공개(idle)도 로그인한 사용자만 조회 가능 (관리자 제한은 없음)
      if (!wallet) return errorResponse("로그인한 사용자만 조회할 수 있습니다", 401);
    }

    let query = supabase
      .from("rental_assets")
      .select("*")
      .order("management_no", { ascending: false });

    if (all) {
      // 관리자 전체 조회 — 계약종료 포함 (관리자만 볼 수 있음)
    } else if (idle) {
      // 전사 유휴 자산 — 전체 공개 (상태가 유휴인 모든 행)
      query = query.eq("status", "유휴");
    } else if (incoming) {
      query = query.eq("pending_to_wallet", wallet);
    } else {
      query = query.eq("managed_by", wallet);
    }

    // 일반 사용자(관리자 제외)에게는 계약종료 자산을 숨긴다.
    // 관리자가 '정상 재개'하면 다시 목록에 노출된다.
    // 유휴 공개(idle)는 유휴 행만 대상이므로 계약종료 숨김 규칙이 적용되지 않는다.
    if (!all && !idle) {
      query = query.neq("status", "계약종료");
    }

    if (statusParam) {
      query = query.eq("status", statusParam);
    }
    if (categoryParam && categoryParam.trim()) {
      query = query.eq("category", categoryParam.trim());
    }
    if (q && q.trim()) {
      const pattern = `%${q.trim()}%`;
      query = query.or(
        `management_no.ilike.${pattern},serial_no.ilike.${pattern},model_name.ilike.${pattern},user_name.ilike.${pattern},manufacturer.ilike.${pattern}`,
      );
    }
    const textFilter = (field: string, value: string | null) => {
      if (value && value.trim()) query = query.ilike(field, `%${value.trim()}%`);
    };
    textFilter("model_name", modelParam);
    textFilter("manufacturer", manufacturerParam);
    textFilter("division", divisionParam);
    textFilter("department", departmentParam);
    textFilter("rental_company", rentalCompanyParam);

    if (billingCycleParam) {
      const cycle = billingCycleParam.trim();
      if (cycle && BILLING_CYCLES.includes(cycle as (typeof BILLING_CYCLES)[number])) {
        query = query.eq("billing_cycle", cycle);
      }
    }
    const rangeFilter = (field: string, from: string | null, to: string | null, numeric: boolean) => {
      const f = from && from.trim() ? from.trim() : null;
      const t = to && to.trim() ? to.trim() : null;
      if (numeric && f !== null && Number.isNaN(Number(f))) return;
      if (numeric && t !== null && Number.isNaN(Number(t))) return;
      if (f !== null) query = query.gte(field, numeric ? Number(f) : f);
      if (t !== null) query = query.lte(field, numeric ? Number(t) : t);
    };
    rangeFilter("rental_fee", feeMinParam, feeMaxParam, true);
    rangeFilter("rental_start_date", startFromParam, startToParam, false);
    rangeFilter("rental_end_date", endFromParam, endToParam, false);

    const { data, error } = await query;
    if (error) return errorResponse(error.message, 500);
    return NextResponse.json({ data: data as unknown as RentalAssetRow[] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "알 수 없는 오류";
    return errorResponse(msg, 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    // 로그인한 사용자만 등록할 수 있다 (연결된 지갑 주소 = 로그인 증명)
    const wallet = getWalletFromRequest(req);
    if (!wallet) {
      return errorResponse("로그인한 사용자만 렌탈 자산을 등록할 수 있습니다", 401);
    }
    const supabase = getSupabaseAdmin();
    const body = await req.json();
    const parsed = insertRentalAssetSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "입력값 검증 실패", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    // 최초 등록자 = 담당 지갑 (인수인계로 이후 이전됨)
    const { data, error } = await supabase
      .from("rental_assets")
      .insert({ ...parsed.data, managed_by: wallet })
      .select()
      .single();
    if (error) return errorResponse(error.message, 409);
    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "알 수 없는 오류";
    return errorResponse(msg, 500);
  }
}