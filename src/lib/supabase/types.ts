// M2 — Supabase 스키마와 매칭되는 타입 (supabase/migrations/0001_assets_handovers.sql)

export type AssetStatus = "available" | "in_use" | "retired";
export type RentalType = "company_owned" | "leased";
export type HandoverStatus = "pending" | "completed" | "cancelled";

export interface AssetRow {
  id: string;
  asset_code: string;
  name: string;
  category: string | null;
  description: string | null;
  custodian_wallet: string | null;
  status: AssetStatus;
  rental_type: RentalType;
  rental_start_at: string | null;
  rental_end_at: string | null;
  rental_fee: number | null;
  rental_terms: string | null;
  created_at: string;
  updated_at: string;
}

export type AssetInsert = Partial<Omit<AssetRow, "id" | "created_at" | "updated_at">> &
  Pick<AssetRow, "asset_code" | "name">;

export type AssetUpdate = Partial<
  Omit<AssetRow, "id" | "created_at" | "updated_at">
>;

export interface HandoverRow {
  id: string;
  asset_id: string;
  asset_code: string;
  from_wallet: string;
  to_wallet: string;
  onchain_pda: string | null;
  onchain_status: HandoverStatus;
  partial_tx: string | null;
  tx_signature: string | null;
  created_at: string;
  completed_at: string | null;
}

export type HandoverInsert = Pick<
  HandoverRow,
  "asset_id" | "asset_code" | "from_wallet" | "to_wallet"
> &
  Partial<
    Pick<HandoverRow, "onchain_pda" | "onchain_status" | "partial_tx" | "tx_signature">
  >;

export type HandoverUpdate = Partial<
  Omit<HandoverRow, "id" | "asset_id" | "asset_code" | "created_at">
>;

// supabase-js createClient<Database> 제네릭용 맵
export interface Database {
  public: {
    Tables: {
      assets: {
        Row: AssetRow;
        Insert: AssetInsert;
        Update: AssetUpdate;
        Relationships: [];
      };
      handovers: {
        Row: HandoverRow;
        Insert: HandoverInsert;
        Update: HandoverUpdate;
        Relationships: [];
      };
    };
  };
}