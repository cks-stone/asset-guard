import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getAdminWalletFromRequest } from "@/lib/admin";
import { EMPLOYMENT_STATUSES, WORK_LOCATIONS } from "@/lib/supabase/types";
import type { EmployeeProfileRow } from "@/lib/supabase/types";

export const runtime = "nodejs";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");

const employeeSchema = z.object({
  wallet_address: z.string().trim().min(32).max(44),
  employment_status: z.enum(EMPLOYMENT_STATUSES).default("재직"),
  work_location: z.enum(WORK_LOCATIONS).default("본사"),
  job_title: z.string().trim().max(64).nullable().optional(),
  hire_date: dateSchema.nullable().optional(),
  departure_date: dateSchema.nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
});

function errorResponse(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

export interface EmployeeProfileView extends EmployeeProfileRow {
  label: string | null;
  division: string | null;
  department: string | null;
}

/**
 * 인사 프로필 관리 — 관리자 전용(x-admin-wallet).
 * GET: 전체 목록(지갑 라벨 조인, 이름/부문/팀 검색) / POST: 등록·수정(upsert).
 */
export async function GET(req: NextRequest) {
  try {
    if (!getAdminWalletFromRequest(req)) {
      return errorResponse("관리자 지갑이 아닙니다", 401);
    }
    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") ?? "").trim();

    const [{ data: profiles, error: profilesError }, { data: labels, error: labelsError }] =
      await Promise.all([
        supabase.from("employee_profiles").select("*"),
        supabase
          .from("wallet_labels")
          .select("wallet_address, label, division, department"),
      ]);
    if (profilesError || labelsError) {
      return errorResponse(profilesError?.message ?? labelsError?.message ?? "조회 실패", 500);
    }

    const labelByWallet = new Map<string, { label: string | null; division: string | null; department: string | null }>();
    for (const l of labels ?? []) {
      labelByWallet.set(l.wallet_address.toLowerCase(), {
        label: l.label,
        division: l.division,
        department: l.department,
      });
    }

    const rows: EmployeeProfileView[] = (profiles ?? []).map((p) => {
      const l = labelByWallet.get(p.wallet_address.toLowerCase());
      return {
        wallet_address: p.wallet_address,
        employment_status: p.employment_status,
        work_location: p.work_location,
        job_title: p.job_title,
        hire_date: p.hire_date,
        departure_date: p.departure_date,
        note: p.note,
        updated_at: p.updated_at,
        label: l?.label ?? null,
        division: l?.division ?? null,
        department: l?.department ?? null,
      };
    });

    if (q) {
      const hit = rows.filter((r) =>
        [r.label, r.division, r.department, r.wallet_address]
          .filter(Boolean)
          .some((v) => v!.toLowerCase().includes(q)),
      );
      const sorted = hit.sort((a, b) => (a.label ?? "").localeCompare(b.label ?? ""));
      return NextResponse.json({ data: sorted });
    }

    rows.sort((a, b) => (a.label ?? "").localeCompare(b.label ?? ""));
    return NextResponse.json({ data: rows });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "알 수 없는 오류";
    return errorResponse(msg, 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!getAdminWalletFromRequest(req)) {
      return errorResponse("관리자 지갑이 아닙니다", 401);
    }
    const supabase = getSupabaseAdmin();
    const body = await req.json();
    const parsed = employeeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "입력값 검증 실패", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const { wallet_address, ...rest } = parsed.data;
    const { data, error } = await supabase
      .from("employee_profiles")
      .upsert(
        {
          wallet_address,
          ...rest,
          job_title: rest.job_title ?? null,
          hire_date: rest.hire_date ?? null,
          departure_date: rest.departure_date ?? null,
          note: rest.note ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "wallet_address" },
      )
      .select()
      .single();
    if (error) return errorResponse(error.message, 500);
    return NextResponse.json({ data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "알 수 없는 오류";
    return errorResponse(msg, 500);
  }
}