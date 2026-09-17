-- ============================================
-- asset-guard M2 — 사내/렌탈 자산 인수인계 스키마
-- MySQL 아키텍처와 달리 매번 SELECT ... FOR UPDATE 대신
-- partial unique index 로 동일 자산의 중복 PENDING 을 원천 차단
-- (온체인 Anchor PDA는 Supabase 이외의 정합성/감사 증거로 사용)
-- ============================================

create extension if not exists pgcrypto;

-- --------------------------------------------
-- assets — 자산 마스터
-- --------------------------------------------
create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  asset_code text not null unique,
  name text not null,
  category text,
  description text,
  -- 현재 담당자 (Solana 지갑 base58). 인수인계가 완료되면 handovers.to_wallet 로 갱신
  custodian_wallet text,
  status text not null default 'available'
    check (status in ('available', 'in_use', 'retired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.assets is '자산 마스터 — 손상방지/감사 목적의 온체인 원장과 대비되는 실시간 쿼리용 DB';
comment on column public.assets.custodian_wallet is '현재 담당자 지갑 (Solana base58)';

-- --------------------------------------------
-- handovers — 인수인계 이력 (온체인 PDA 상태를 미러링)
-- --------------------------------------------
create table if not exists public.handovers (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete restrict,
  asset_code text not null,
  from_wallet text not null,
  to_wallet text not null,
  -- Anchor PDA: handover_{sha256(asset_id)}_{from_wallet}_{to_wallet}
  onchain_pda text,
  onchain_status text not null default 'pending'
    check (onchain_status in ('pending', 'completed', 'cancelled')),
  tx_signature text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint handovers_wallets_distinct check (from_wallet <> to_wallet)
);

comment on table public.handovers is '인수인계 이력 — 온체인(PDA) 상태와 정합성을 유지하며 조회/알림/공문에 사용';

create unique index handovers_asset_pair_unique
  on public.handovers (asset_id, from_wallet, to_wallet);

-- 동일 자산의 한 번에 하나의 PENDING 인수인계만 허용
create unique index one_pending_handover_per_asset
  on public.handovers (asset_id)
  where onchain_status = 'pending';

create index handovers_asset_id_idx on public.handovers (asset_id);
create index handovers_from_wallet_idx on public.handovers (from_wallet);
create index handovers_to_wallet_idx on public.handovers (to_wallet);

-- --------------------------------------------
-- updated_at 자동 갱신 트리거
-- --------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_assets_updated_at
  before update on public.assets
  for each row execute function public.set_updated_at();

-- --------------------------------------------
-- RLS — 조회는 허용, 쓰기는 service_role(서버) 경유
-- (Phantom 지갑 로그인 → Supabase Auth 미사용,
--  클라이언트가 service_role 탈취할 수 없도록 insert/update 는 서버 전용)
-- --------------------------------------------
alter table public.assets enable row level security;
alter table public.handovers enable row level security;

drop policy if exists assets_select on public.assets;
create policy assets_select on public.assets
  for select using (true);

drop policy if exists assets_insert on public.assets;
create policy assets_insert on public.assets
  for insert with check (auth.role() = 'service_role');

drop policy if exists assets_update on public.assets;
create policy assets_update on public.assets
  for update using (auth.role() = 'service_role');

drop policy if exists handovers_select on public.handovers;
create policy handovers_select on public.handovers
  for select using (true);

drop policy if exists handovers_insert on public.handovers;
create policy handovers_insert on public.handovers
  for insert with check (auth.role() = 'service_role');

drop policy if exists handovers_update on public.handovers;
create policy handovers_update on public.handovers
  for update using (auth.role() = 'service_role');