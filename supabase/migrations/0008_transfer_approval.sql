-- M18 — 인수인계 2단계 승인 (요청 → 관리자 승인 → 담당자 확정)
-- 담당자(managed_by)가 '이전 요청'을 등록하면 관리자가 승인/거절하고,
-- 승인 후 담당자가 온체인 서명(create_handover) → 서버가 결제(수수료·PDA 렌트) → DB 이전.
-- 컬럼은 "진행 중 요청" 상태만 담고, 확정/거부 후 이력은 transfer_tx/transferred_at 등으로 보존된다.

alter table public.rental_assets
  add column if not exists pending_to_wallet     text,
  add column if not exists pending_requested_at  timestamptz,
  add column if not exists pending_approved_at   timestamptz,
  add column if not exists pending_approved_by   text,
  add column if not exists pending_rejected_at   timestamptz;

comment on column public.rental_assets.pending_to_wallet is
  '이전 요청 대상 지갑 — 관리자 승인/거절 대상 (확정 시 managed_by 로 이전됨)';
comment on column public.rental_assets.pending_requested_at is
  '이전 요청 시각 (담당자)';
comment on column public.rental_assets.pending_approved_at is
  '관리자 승인 시각 — 설정 후 담당자가 온체인 확정 가능';
comment on column public.rental_assets.pending_approved_by is
  '승인한 관리자 지갑';
comment on column public.rental_assets.pending_rejected_at is
  '관리자 거절 시각';

-- 자산당 동시 진행 중인 이전 요청은 1개만 허용 (요청/승인 후 확정 전까지 유지됨)
create unique index if not exists rental_assets_one_active_transfer_idx
  on public.rental_assets (management_no)
  where pending_to_wallet is not null;