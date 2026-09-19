-- M10 — 렌탈 자산 담당 지갑(managed_by) 추가
-- 각 렌탈 자산은 "담당(관리) 지갑"을 가지며,
-- 인수인계를 통해 managed_by 가 다른 지갑으로 이전된다.
-- 일반 사용자 조회는 본인 managed_by 행만 보인다.

alter table public.rental_assets
  add column if not exists managed_by text;

comment on column public.rental_assets.managed_by
  is '현재 담당(관리) 지갑 주소 — 인수인계로 이전됨';

-- 기존 데이터는 데모 사용자 지갑으로 귀속 (최초 등록자 = 담당자)
update public.rental_assets
  set managed_by = 'BbixZu6Xk9NMRgpxPySdNn8vHyQTkzJSYLvFkK5fg9DM'
  where managed_by is null;

create index if not exists rental_assets_managed_by_idx
  on public.rental_assets (managed_by);