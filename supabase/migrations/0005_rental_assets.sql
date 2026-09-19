-- M9 — 렌탈 자산 스키마 전면 교체
-- 기존 인수인계(assets/handovers/온체인 연동) 모델은 잠정 보류.
-- 렌탈 자산 장부(rental_assets)를 로그인 사용자가 등록·조회하는 구조로 전환.

drop table if exists public.handovers;
drop table if exists public.assets;

create table if not exists public.rental_assets (
  management_no      text primary key,  -- 관리번호 (예: AST-2026-0012)
  serial_no          text,              -- 제조사 시리얼 (예: SN987654321)
  order_no           text,              -- 주문번호 (예: ORD-2024-5512)
  model_name         text not null,     -- 모델명 (예: Dell Latitude 5530)
  manufacturer       text,              -- 제조사 (예: Dell)
  user_name          text,              -- 현재 사용자 (예: 홍길동)
  division           text,              -- 상위 소속/부문 (예: A부문)
  department         text,              -- 소속 팀 (예: AAAA팀)
  rental_company     text,              -- 렌탈사 (예: OO렌탈)
  billing_cycle      text,              -- 청구 구분: 월납/연납/반기납/일시납
    check (billing_cycle is null or billing_cycle in ('월납', '연납', '반기납', '일시납')),
  rental_fee         integer,           -- 월 렌탈료 (예: 75000)
  billing_month      text,              -- 청구월 (예: 매월 / 3,9월)
  rental_start_date  date,              -- 렌탈 청구 시작일
  rental_end_date    date,              -- 렌탈 종료일
  status             text not null default '정상사용'
    check (status in ('정상사용', '인수인계대기', '계약종료')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rental_assets_dates check (
    rental_end_date is null or rental_start_date is null or rental_end_date >= rental_start_date
  )
);

comment on table public.rental_assets is '렌탈 자산 장부 — 로그인 사용자가 등록/조회';
comment on column public.rental_assets.management_no is '사내 고유 관리번호 (PK)';

-- updated_at 자동 갱신 트리거
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_rental_assets_updated_at
  before update on public.rental_assets
  for each row execute function public.set_updated_at();

-- RLS — 조회는 로그인 사용자(익명 포함 허용), 쓰기는 서버(service_role) 경유
alter table public.rental_assets enable row level security;

drop policy if exists rental_assets_select on public.rental_assets;
create policy rental_assets_select on public.rental_assets
  for select using (true);

drop policy if exists rental_assets_insert on public.rental_assets;
create policy rental_assets_insert on public.rental_assets
  for insert with check (auth.role() = 'service_role');

drop policy if exists rental_assets_update on public.rental_assets;
create policy rental_assets_update on public.rental_assets
  for update using (auth.role() = 'service_role');

drop policy if exists rental_assets_delete on public.rental_assets;
create policy rental_assets_delete on public.rental_assets
  for delete using (auth.role() = 'service_role');