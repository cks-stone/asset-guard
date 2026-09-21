import type {
  EmploymentStatus,
  MonthlyConfirmItem,
  MonthlyExpiringItem,
  MonthlyReportData,
  RentalAssetRow,
  WorkLocation,
} from "@/lib/supabase/types";

export function startOfMonth(month: string): string {
  return `${month}-01`;
}

export function endOfMonth3(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(y, m + 2, 0); // month + 2개월 말일
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${last.getFullYear()}-${pad(last.getMonth() + 1)}-${pad(last.getDate())}`;
}

export function daysUntil(dateStr: string): number {
  const end = new Date(`${dateStr}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((end.getTime() - today.getTime()) / 86_400_000);
}

export interface ConfirmRule {
  reason: string;
  action: string;
}

// 자유 텍스트 자산위치 → 근무위치 카테고리로 정규화 (식별 불가 시 null)
export function assetLocationCategory(loc: string | null): WorkLocation | null {
  if (!loc) return null;
  const s = loc.toLowerCase();
  if (s.includes("재택")) return "재택";
  if (s.includes("해외")) return "해외지사"; // 해외지사가 지사보다 우선
  if (s.includes("지사")) return "지사";
  if (s.includes("본사") || s.includes("사옥") || s.includes("hq")) return "본사";
  return null;
}

export function confirmRuleFor(
  status: EmploymentStatus | null,
  workLocation: WorkLocation | null,
  assetLocation: string | null,
  hireInMonth: boolean,
  departInWindow: boolean,
): ConfirmRule | null {
  // 우선순위: 퇴직 > 퇴직예정 > 신규입사 > 휴직류 > 파견 > 위치 불일치 > 수습/기타
  if (status === "퇴직") return { reason: "퇴직", action: "기기 반납·이관 확인" };
  if (departInWindow) return { reason: "퇴직(전근) 예정", action: "기기 반납·이관 확인" };
  if (hireInMonth) return { reason: "신규 입사", action: "장비 지급 확인" };
  if (status === "휴직" || status === "출산휴가" || status === "육아휴직") {
    return { reason: status, action: "기기 보관·대체자 인수 확인" };
  }
  if (status === "파견") return { reason: "파견 근무", action: "파견지 장비 이전·재배정 확인" };
  // 자산 위치와 근무 위치가 모두 식별되고 서로 다르면 위치 상이 판정 (자산위치 미상은 제외).
  const assetCat = assetLocationCategory(assetLocation);
  if (assetCat && workLocation && assetCat !== workLocation) {
    return { reason: "자산-근무지 위치 상이", action: "장비 이전·배정 확인" };
  }
  if (status === "수습") return { reason: "수습", action: "사유 확인" };
  if (status === "기타") return { reason: "기타", action: "사유 확인" };
  return null;
}

// 리포팅 계산에 필요한 인사 프로필 필드만 (풀 컬럼 대신 부분 select 결과도 허용)
export interface ReportProfile {
  user_name: string;
  employment_status: EmploymentStatus | null;
  work_location: WorkLocation | null;
  job_title: string | null;
  hire_date: string | null;
  departure_date: string | null;
}

export interface ComputeMonthlyReportOptions {
  assets: RentalAssetRow[];
  profiles: ReportProfile[] | null;
  month: string; // YYYY-MM
}

/**
 * 월간 리포팅 계산 — 매월 체크할
 * ① 인사·근무 기준 "확인 필요 자산" ② 만기(계약 종료) 도래 자산(이번 달 + 향후 3개월).
 * 화면(/api/monthly-report)과 AI 챗봇 도구가 공유하는 단일 구현.
 */
export function computeMonthlyReport({
  assets,
  profiles,
  month,
}: ComputeMonthlyReportOptions): MonthlyReportData {
  const monthStart = startOfMonth(month);
  const monthEnd3 = endOfMonth3(month);

  const profileByUser = new Map(
    (profiles ?? []).map((p) => [p.user_name?.trim().toLowerCase(), p]),
  );

  const confirmItems: MonthlyConfirmItem[] = [];
  const expiringItems: MonthlyExpiringItem[] = [];

  for (const a of assets) {
    const nameKey = a.user_name?.trim().toLowerCase() ?? "";
    const profile = nameKey ? profileByUser.get(nameKey) : undefined;

    if (a.status !== "계약종료") {
      if (profile) {
        const hireInMonth = !!profile.hire_date?.startsWith(month);
        const departInWindow = !!(
          profile.departure_date &&
          profile.departure_date >= monthStart &&
          profile.departure_date <= monthEnd3
        );
        const rule = confirmRuleFor(
          profile.employment_status,
          profile.work_location,
          a.location,
          hireInMonth,
          departInWindow,
        );
        if (rule) {
          confirmItems.push({
            management_no: a.management_no,
            model_name: a.model_name,
            category: a.category,
            user_name: a.user_name,
            division: a.division,
            department: a.department,
            location: a.location,
            status: a.status,
            employer: null,
            employment_status: profile.employment_status,
            work_location: profile.work_location,
            job_title: profile.job_title,
            hire_date: profile.hire_date,
            departure_date: profile.departure_date,
            reason: rule.reason,
            action: rule.action,
          });
        }
      }
    }

    if (
      a.rental_end_date &&
      a.status !== "계약종료" &&
      a.rental_end_date <= monthEnd3
    ) {
      const days = daysUntil(a.rental_end_date);
      expiringItems.push({
        management_no: a.management_no,
        model_name: a.model_name,
        category: a.category,
        user_name: a.user_name,
        division: a.division,
        department: a.department,
        location: a.location,
        rental_end_date: a.rental_end_date,
        days_left: days,
        action: days < 0 ? "반납·연장 대책 필요 (기한 경과)" : "재계약(연장)·반납 검토",
      });
    }
  }

  confirmItems.sort((x, y) => y.management_no.localeCompare(x.management_no));
  expiringItems.sort((x, y) => x.rental_end_date.localeCompare(y.rental_end_date));

  return { month, confirmItems, expiringItems };
}

export function currentMonth(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
}