-- M11 — 인수인계(이전) 기록 보관
-- 담당자(managed_by)가 온체인 create_handover 서명 이후
-- DB에도 이전 정보를 보관한다 (감사 조회/탐색기 링크 용도).
-- 온체인 PDA+PDA 생성 tx 가 불변 감사 기록이며, 아래 컬럼은 조회 편의 필드다.

alter table public.rental_assets
  add column if not exists transfer_tx text;

alter table public.rental_assets
  add column if not exists transferred_at timestamptz;

comment on column public.rental_assets.transfer_tx
  is '마지막 인수인계 온체인 tx 서명 (create_handover)';
comment on column public.rental_assets.transferred_at
  is '마지막 인수인계 처리 시각';