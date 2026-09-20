import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getAdminWalletFromRequest } from "@/lib/admin";
import { EMPLOYMENT_STATUSES, WORK_LOCATIONS } from "@/lib/supabase/types";
import type { EmploymentStatus, WorkLocation } from "@/lib/supabase/types";

export const runtime = "nodejs";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");

const employeeSchema = z.object({
  user_name: z.string().trim().min(1).max(64),
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

// 인사 관리 화면용 뷰 — 인사 프로필 + (렌탈 자산에서 가져온) 부문·팀 정보
export interface EmployeeProfileView {
  user_name: string;
  employment_status: EmploymentStatus | null;
  work_location: WorkLocation | null;
  job_title: string | null;
  hire_date: string | null;
  departure_date: string | null;
  note: string | null;
  updated_at: string | null;
  division: string | null;
  department: string | null;
  // 프로필 아직 없으면 자동 제안(렌탈리스트 출처), 있으면 null
  source: "렌탈리스트" | null;
}

/**
 * 인사 프로필 관리 — 관리자 전용(x-admin-wallet).
 * GET: rental_assets.user_name(distinct) 전체 + 등록된 인사 프로필을 병합해 조회 —
 *        인사 정보가 아직 없는 사용자도 "렌탈리스트 인수 대기"로 자동 노출.
 * POST: user_name 기준 등록·수정(upsert).
 */
export async function GET(req: NextRequest) {
  try {
    if (!getAdminWalletFromRequest(req)) {
      return errorResponse("관리자 지갑이 아닙니다", 401);
    }
    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") ?? "").trim();

    const [{ data: profiles, error: profilesError }, { data: renters, error: rentersError }] =
      await Promise.all([
        supabase.from("employee_profiles").select("*"),
        supabase
          .from("rental_assets")
          .select("user_name, division, department"),
      ]);
    if (profilesError || rentersError) {
      return errorResponse(
        profilesError?.message ?? rentersError?.message ?? "조회 실패",
        500,
      );
    }

    // 렌탈리스트 사용자 시드 — rental_assets.user_name distinct (부문/팀은 자산에서)
    const renames = new Map<string, string>();
    const divisionByUser = new Map<string, string | null>();
    const departmentByUser = new Map<string, string | null>();
    for (const r of renters ?? []) {
      const name = r.user_name?.trim();
      if (!name) continue;
      const key = name.toLowerCase();
      renames.set(key, name);
      if (divisionByUser.get(key) == null) divisionByUser.set(key, r.division ?? null);
      if (departmentByUser.get(key) == null) departmentByUser.set(key, r.department ?? null);
    }

    const rows: EmployeeProfileView[] = [];
    const seen = new Set<string>();

    // 1) 이미 인사 프로필이 있는 사용자
    for (const p of profiles ?? []) {
      if (seen.has(p.user_name.toLowerCase())) continue;
      seen.add(p.user_name.toLowerCase());
      rows.push({
        user_name: p.user_name,
        employment_status: p.employment_status,
        work_location: p.work_location,
        job_title: p.job_title,
        hire_date: p.hire_date,
        departure_date: p.departure_date,
        note: p.note,
        updated_at: p.updated_at,
        division: divisionByUser.get(p.user_name.toLowerCase()) ?? null,
        department: departmentByUser.get(p.user_name.toLowerCase()) ?? null,
        source: null,
      });
    }
    // 2) 렌탈리스트 자동 제안 — 인사 정보 입력 대기
    for (const [key, name] of renames) {
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        user_name: name,
        employment_status: null,
        work_location: null,
        job_title: null,
        hire_date: null,
        departure_date: null,
        note: null,
        updated_at: null,
        division: divisionByUser.get(key) ?? null,
        department: departmentByUser.get(key) ?? null,
        source: "렌탈리스트",
      });
    }

    const sorted = rows.sort((a, b) => {
      // 미입력(자동 제안) 먼저 → 입력된 프로필 뒤에
      if (a.source && !b.source) return -1;
      if (!a.source && b.source) return 1;
      return a.user_name.localeCompare(b.user_name);
    });

    if (q) {
      const hit = sorted.filter((r) =>
        [r.user_name, r.division, r.department]
          .filter(Boolean)
          .some((v) => v!.toLowerCase().includes(q)),
      );
      return NextResponse.json({ data: hit });
    }

    return NextResponse.json({ data: sorted });
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
    const { user_name, ...rest } = parsed.data;
    const { data, error } = await supabase
      .from("employee_profiles")
      .upsert(
        {
          user_name: user_name.trim(),
          ...rest,
          job_title: rest.job_title ?? null,
          hire_date: rest.hire_date ?? null,
          departure_date: rest.departure_date ?? null,
          note: rest.note ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_name" },
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