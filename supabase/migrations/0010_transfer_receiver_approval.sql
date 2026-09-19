-- M19 — 인수인계 흐름 재설계: 수신자(B) 승인 단계 추가 + 관리자 승인 시 온체인 실행
--
-- 새 흐름 (3단계):
--   1. A(담당자) 이전 요청             → pending_to_wallet / pending_requested_at
--   2. B(수신자) 승인/거절             → pending_receiver_approved_at / pending_receiver_rejected_at
--   3. 관리자 승인 → 온체인(create_handover) 실행 + DB 소유권 이전
--      (관리자 승인 후 더 이상 담당자(확정) 단계 없음 — 컬럼은 유지하되
--       pending_approved_at 는 "수신자 승인 후 최종 승인" 시각으로 기록된다)
--
-- A 요청↔수신자 승인 사이에도 취소 가능하며(1단계 취소 API),
-- 수신자(B) 거절 시 관리자 승인(POST approve)은 400 으로 거부된다.

alter table public.rental_assets
  add column if not exists pending_receiver_approved_at timestamptz,
  add column if not exists pending_receiver_rejected_at timestamptz;

comment on column public.rental_assets.pending_receiver_approved_at is
  '수신자(B)의 인수 승인 시각 — 관리자가 최종 승인하려면 설정되어야 함';
comment on column public.rental_assets.pending_receiver_rejected_at is
  '수신자(B)의 거절 시각 — 설정 시 관리자 승인 불가';

-- 대시보드 '수신 대기' 조회 (내게 온 이전 요청) 용 인덱스
create index if not exists rental_assets_pending_receiver_idx
  on public.rental_assets (pending_to_wallet)
  where pending_to_wallet is not null;