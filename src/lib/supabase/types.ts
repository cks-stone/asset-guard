// M9 — 렌탈 자산 장부 스키마와 매칭되는 타입 (supabase/migrations/0005_rental_assets.sql)

export type RentalAssetStatus = "정상사용" | "유휴" | "계약종료";
export type BillingCycle = "월납" | "연납" | "반기납" | "일시납";

// M38 — 인사(HR) 프로필 값 (supabase/migrations/0014_employee_profiles_asset_location.sql)
export const EMPLOYMENT_STATUSES = [
  "재직",
  "수습",
  "휴직",
  "출산휴가",
  "육아휴직",
  "파견",
  "퇴직",
  "기타",
] as const;
export type EmploymentStatus = (typeof EMPLOYMENT_STATUSES)[number];

export const WORK_LOCATIONS = ["본사", "지사", "재택", "해외지사", "출장중"] as const;
export type WorkLocation = (typeof WORK_LOCATIONS)[number];
export type RentalAssetCategory =
  | "모니터"
  | "노트북"
  | "데스크톱 PC"
  | "네트워크장비"
  | "공유기"
  | "스위치"
  | "태블릿"
  | "스마트폰"
  | "프린터"
  | "복합기"
  | "서버"
  | "스토리지"
  | "TV"
  | "정수기"
  | "제빙기"
  | "공기청정기"
  | "냉난방기"
  | "안마의자"
  | "커피머신"
  | "냉장고";

export const RENTAL_ASSET_CATEGORIES: RentalAssetCategory[] = [
  "모니터",
  "노트북",
  "데스크톱 PC",
  "네트워크장비",
  "공유기",
  "스위치",
  "태블릿",
  "스마트폰",
  "프린터",
  "복합기",
  "서버",
  "스토리지",
  "TV",
  "정수기",
  "제빙기",
  "공기청정기",
  "냉난방기",
  "안마의자",
  "커피머신",
  "냉장고",
];

export interface RentalAssetRow {
  management_no: string;
  serial_no: string | null;
  order_no: string | null;
  model_name: string;
  category: string | null;
  manufacturer: string | null;
  user_name: string | null;
  division: string | null;
  department: string | null;
  location: string | null;
  rental_company: string | null;
  billing_cycle: BillingCycle | null;
  rental_fee: number | null;
  billing_month: string | null;
  rental_start_date: string | null;
  rental_end_date: string | null;
  status: RentalAssetStatus;
  managed_by: string | null;
  transfer_tx: string | null;
  transferred_at: string | null;
  pending_to_wallet: string | null;
  pending_requested_at: string | null;
  pending_approved_at: string | null;
  pending_approved_by: string | null;
  pending_rejected_at: string | null;
  pending_receiver_approved_at: string | null;
  pending_receiver_rejected_at: string | null;
  created_at: string;
  updated_at: string;
}

export type RentalAssetInsert = Omit<
  Partial<RentalAssetRow>,
  | "management_no"
  | "model_name"
  | "created_at"
  | "updated_at"
  | "managed_by"
  | "transfer_tx"
  | "transferred_at"
  | "pending_to_wallet"
  | "pending_requested_at"
  | "pending_approved_at"
  | "pending_approved_by"
  | "pending_rejected_at"
  | "pending_receiver_approved_at"
  | "pending_receiver_rejected_at"
> &
  Pick<RentalAssetRow, "management_no" | "model_name">; // managed_by/transfer_tx/pending_* 는 서버(x-wallet/온체인/관리자)에서 부여

export type RentalAssetUpdate = Partial<
  Omit<
    RentalAssetRow,
    | "management_no"
    | "created_at"
    | "updated_at"
    | "managed_by"
    | "transfer_tx"
    | "transferred_at"
    | "pending_to_wallet"
    | "pending_requested_at"
    | "pending_approved_at"
    | "pending_approved_by"
    | "pending_rejected_at"
    | "pending_receiver_approved_at"
    | "pending_receiver_rejected_at"
  >
>;

export interface EmployeeProfileRow {
  user_name: string;
  wallet_address: string | null;
  employment_status: EmploymentStatus;
  work_location: WorkLocation;
  job_title: string | null;
  hire_date: string | null;
  departure_date: string | null;
  note: string | null;
  updated_at: string;
}

// 월간 리포팅 — 인사·근무 기준 "확인 필요 자산"
export interface MonthlyConfirmItem {
  management_no: string;
  model_name: string;
  category: string | null;
  user_name: string | null;
  division: string | null;
  department: string | null;
  location: string | null;
  status: RentalAssetStatus;
  employer: string | null; // wallet_labels.label (이름)
  employment_status: EmploymentStatus | null;
  work_location: WorkLocation | null;
  job_title: string | null;
  hire_date: string | null;
  departure_date: string | null;
  reason: string;
  action: string;
}

// 월간 리포팅 — 만기(계약 종료) 도래 자산
export interface MonthlyExpiringItem {
  management_no: string;
  model_name: string;
  category: string | null;
  user_name: string | null;
  division: string | null;
  department: string | null;
  location: string | null;
  rental_end_date: string;
  days_left: number;
  action: string;
}

export interface MonthlyReportData {
  month: string; // YYYY-MM
  confirmItems: MonthlyConfirmItem[];
  expiringItems: MonthlyExpiringItem[];
}

// supabase-js createClient<Database> 제네릭용 맵
export interface Database {
  public: {
    Tables: {
      rental_assets: {
        Row: RentalAssetRow;
        Insert: RentalAssetInsert;
        Update: RentalAssetUpdate;
        Relationships: [];
      };
      employee_profiles: {
        Row: EmployeeProfileRow;
        Insert: Partial<EmployeeProfileRow> &
          Pick<EmployeeProfileRow, "user_name">;
        Update: Partial<Omit<EmployeeProfileRow, "user_name" | "updated_at">>;
        Relationships: [];
      };
    };
  };
}