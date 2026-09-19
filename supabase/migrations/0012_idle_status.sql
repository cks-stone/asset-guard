-- M10 — 렌탈 자산 상태 3종 전이
-- '인수인계대기' → '유휴' (렌탈 자산 관리 상태: 정상사용/유휴/계약종료)
-- 유휴 자산은 모든 로그인 사용자에게 공개된다 (조회는 API 분기로 제어, RLS 변경 없음).

-- 1) status CHECK 제약 교체 (인라인 check의 자동 네이밍: rental_assets_status_check)
alter table public.rental_assets
  drop constraint if exists rental_assets_status_check;
alter table public.rental_assets
  add constraint rental_assets_status_check
  check (status in ('정상사용', '유휴', '계약종료'));

-- 2) 기존 '인수인계대기' 데이터 → '유휴' (프로덕션 보유 0건, seed 2건)
update public.rental_assets
  set status = '유휴'
  where status = '인수인계대기';