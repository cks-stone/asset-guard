-- M7 — 렌탈 자산 메타데이터
-- assets 마스터에 렌탈 개념 컬럼 추가 (인수인계/온체인 로직은 유지)
alter table if exists public.assets
  add column if not exists rental_type text default 'company_owned'
    check (rental_type in ('company_owned', 'leased')),
  add column if not exists rental_start_at date,
  add column if not exists rental_end_at date,
  add column if not exists rental_fee numeric(12,2)
    check (rental_fee is null or rental_fee >= 0),
  add column if not exists rental_terms text;

comment on column public.assets.rental_type is '렌탈 유형 — company_owned(회사 보유) | leased(임대 장비)';
comment on column public.assets.rental_start_at is '렌탈 시작일 (YYYY-MM-DD)';
comment on column public.assets.rental_end_at is '예정 반납일 (YYYY-MM-DD)';
comment on column public.assets.rental_fee is '월 렌탈비 (단위: 원)';
comment on column public.assets.rental_terms is '렌탈 조건/비고';

-- 신규 시드와 동일한 값으로 기존 시드 자산 백필
update public.assets set
  rental_type = 'company_owned',
  rental_start_at = '2026-01-05',
  rental_end_at   = '2026-12-31',
  rental_fee      = 0,
  rental_terms    = '회사 표준 렌탈 — 년 1회 계약 갱신, 분실 시 본인 부담'
where asset_code in ('NB-0001', 'NB-0002', 'NB-0003', 'MN-0001', 'MN-0002', 'PH-0001', 'PH-0002', 'ET-0001', 'ET-0002');

update public.assets set
  rental_type = 'leased',
  rental_start_at = '2026-03-02',
  rental_end_at   = '2026-09-30',
  rental_fee      = 120000,
  rental_terms    = '외부 렌탈사 임대 — 회의/행사용, 반납 시 원상복구'
where asset_code = 'TC-0001';