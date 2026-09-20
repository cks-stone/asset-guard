// 렌탈 자산 목록 공용 필터 정의 — 대시보드(내 자산·유휴)와 관리자 콘솔에서 함께 사용.
// 필터는 서버 사이드에서 /api/rental-assets 의 파라미터로 적용된다.

export interface AssetFilters {
  query: string;
  managementNo: string;
  serialNo: string;
  userName: string;
  category: string;
  modelName: string;
  manufacturer: string;
  division: string;
  department: string;
  rentalCompany: string;
  billingCycle: string;
  feeMin: string;
  feeMax: string;
  startFrom: string;
  startTo: string;
  endFrom: string;
  endTo: string;
  status: string;
}

export const EMPTY_FILTERS: AssetFilters = {
  query: "",
  managementNo: "",
  serialNo: "",
  userName: "",
  category: "",
  modelName: "",
  manufacturer: "",
  division: "",
  department: "",
  rentalCompany: "",
  billingCycle: "",
  feeMin: "",
  feeMax: "",
  startFrom: "",
  startTo: "",
  endFrom: "",
  endTo: "",
  status: "",
};

const PARAM_KEYS: Record<keyof AssetFilters, string> = {
  query: "q",
  managementNo: "management_no",
  serialNo: "serial_no",
  userName: "user_name",
  category: "category",
  modelName: "model",
  manufacturer: "manufacturer",
  division: "division",
  department: "department",
  rentalCompany: "rental_company",
  billingCycle: "billing_cycle",
  feeMin: "fee_min",
  feeMax: "fee_max",
  startFrom: "start_from",
  startTo: "start_to",
  endFrom: "end_from",
  endTo: "end_to",
  status: "status",
};

export function filtersToSearchParams(filters: AssetFilters): URLSearchParams {
  const params = new URLSearchParams();
  for (const key of Object.keys(PARAM_KEYS) as (keyof AssetFilters)[]) {
    const v = (filters[key] as string).trim();
    if (v) params.set(PARAM_KEYS[key], v);
  }
  return params;
}