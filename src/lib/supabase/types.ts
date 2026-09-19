// M9 — 렌탈 자산 장부 스키마와 매칭되는 타입 (supabase/migrations/0005_rental_assets.sql)

export type RentalAssetStatus = "정상사용" | "유휴" | "계약종료";
export type BillingCycle = "월납" | "연납" | "반기납" | "일시납";
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
    };
  };
}