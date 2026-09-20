import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getAdminWalletFromRequest } from "@/lib/admin";
import { EMPLOYMENT_STATUSES, WORK_LOCATIONS } from "@/lib/supabase/types";
import type { EmployeeProfileRow } from "@/lib/supabase/types";
import type { EmploymentStatus, WorkLocation } from "@/lib/supabase/types";

export const runtime = "nodejs";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");

const employeeSchema = z.object({
  user_name: z.string().trim().min(1).max(64),
  wallet_address: z
    .string()
    .trim()
    .min(32)
    .max(44)
    .nullable()
    .optional(),
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

export type EmployeeProfileSource = "렌탈리스트" | "지갑라벨" | null;

// 인사 관리 화면용 뷰 — 인사 프로필 + (지갑라벨/렌탈 자산에서 가져온) 이름·부문·팀 정보
export interface EmployeeProfileView {
  user_name: string;
  wallet_address: string | null;
  employment_status: EmploymentStatus | null;
  work_location: WorkLocation | null;
  job_title: string | null;
  hire_date: string | null;
  departure_date: string | null;
  note: string | null;
  updated_at: string | null;
  label: string | null;
  division: string | null;
  department: string | null;
  source: EmployeeProfileSource; // 프로필 아직 없으면 자동 제안 출처(렌탈리스트/지갑라벨), 있으면 null
}

interface ProfileSeed {
  user_name: string;
  wallet_address: string | null;
  division: string | null;
  department: string | null;
  source: "렌탈리스트" | "지갑라벨";
}

/**
 * 인사 프로필 관리 — 관리자 전용(x-admin-wallet).
 * GET: 렌탈리스트(rental_assets.user_name)에 등장하는 사용자 전체 + 등록된 인사 프로필을
 *        병합해 조회(아직 인사 정보가 없는 사용자도 "렌탈리스트" 출처로 자동 노출).
 * POST: user_name 기준 등록·수정(upsert, wallet_address optional).
 */
export async function GET(req: NextRequest) {
  try {
    if (!getAdminWalletFromRequest(req)) {
      return errorResponse("관리자 지갑이 아닙니다", 401);
    }
    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") ?? "").trim();

    const [
      { data: profiles, error: profilesError },
      { data: labels, error: labelsError },
      { data: renters, error: rentersError },
    ] = await Promise.all([
      supabase.from("employee_profiles").select("*"),
      supabase.from("wallet_labels").select("wallet_address, label, division, department"),
      supabase
        .from("rental_assets")
        .select("user_name, division, department, managed_by"),
    ]);
    if (profilesError || labelsError || rentersError) {
      return errorResponse(
        profilesError?.message ?? labelsError?.message ?? rentersError?.message ?? "조회 실패",
        500,
      );
    }

    const labelByWallet = new Map<
      string,
      { label: string | null; division: string | null; department: string | null }
    >();
    for (const l of labels ?? []) {
      labelByWallet.set(l.wallet_address.toLowerCase(), {
        label: l.label,
        division: l.division,
        department: l.department,
      });
    }

    const profileByUser = new Map<string, EmployeeProfileRow>();
    for (const p of profiles ?? []) {
      profileByUser.set(p.user_name.toLowerCase(), p);
    }

    // 렌탈리스트 사용자 시드 — user_name 기준 (부문/팀은 자산에서, 지갑은 managed_by에서)
    const seeds = new Map<string, ProfileSeed>();
    for (const r of renters ?? []) {
      const name = r.user_name?.trim();
      if (!name) continue;
      const key = name.toLowerCase();
      const existing = seeds.get(key);
      seeds.set(key, {
        user_name: name,
        wallet_address: existing?.wallet_address ?? r.managed_by ?? null,
        division: existing?.division ?? r.division ?? null,
        department: existing?.department ?? r.department ?? null,
        source: "렌탈리스트",
      });
    }
    // 지갑라벨(이름)도 시드로 병합 — 렌탈리스트에 없는 이름은 "지갑라벨" 출처로 노출
    for (const l of labels ?? []) {
      const name = l.label?.trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (!seeds.has(key)) {
        seeds.set(key, {
          user_name: name,
          wallet_address: l.wallet_address,
          division: l.division ?? null,
          department: l.department ?? null,
          source: "지갑라벨",
        });
      }
    }

    const rows: EmployeeProfileView[] = [];
    const seen = new Set<string>();
    const add = (v: EmployeeProfileView) => {
      const key = v.user_name.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      rows.push(v);
    };

    // 1) 이미 인사 프로필이 있는 사용자
    for (const p of profiles ?? []) {
      const walletInfo = p.wallet_address
        ? labelByWallet.get(p.wallet_address.toLowerCase())
        : undefined;
      add({
        user_name: p.user_name,
        wallet_address: p.wallet_address,
        employment_status: p.employment_status,
        work_location: p.work_location,
        job_title: p.job_title,
        hire_date: p.hire_date,
        departure_date: p.departure_date,
        note: p.note,
        updated_at: p.updated_at,
        label: walletInfo?.label ?? null,
        division: walletInfo?.division ?? null,
        department: walletInfo?.department ?? null,
        source: null,
      });
    }
    // 2) 자동 제안(렌탈리스트/지갑라벨) — 인사 정보 입력 대기
    for (const seed of seeds.values()) {
      add({
        user_name: seed.user_name,
        wallet_address: seed.wallet_address,
        employment_status: null,
        work_location: null,
        job_title: null,
        hire_date: null,
        departure_date: null,
        note: null,
        updated_at: null,
        label: seed.user_name,
        division: seed.division,
        department: seed.department,
        source: seed.source,
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
        [r.user_name, r.label, r.division, r.department, r.wallet_address]
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
    const { user_name, wallet_address, ...rest } = parsed.data;
    const { data, error } = await supabase
      .from("employee_profiles")
      .upsert(
        {
          user_name: user_name.trim(),
          wallet_address: wallet_address ?? null,
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