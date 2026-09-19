-- M22 — 렌탈 자산 카테고리 추가
-- 렌탈 자산 목록의 '관리번호'와 '모델명' 사이에 표시할 카테고리를 신설한다.
-- 카테고리는 총 20종으로 고정하며, 잘못된 값 저장을 방지하기 위해
-- 기존 status CHECK 제약과 동일한 스타일로 CHECK 제약을 건다.

alter table public.rental_assets
  add column if not exists category text;

alter table public.rental_assets
  drop constraint if exists rental_assets_category_check;

alter table public.rental_assets
  add constraint rental_assets_category_check check (
    category is null or category in (
      '모니터', '노트북', '데스크톱 PC', '네트워크장비', '공유기', '스위치',
      '태블릿', '스마트폰', '프린터', '복합기', '서버', '스토리지',
      'TV', '정수기', '제빙기', '공기청정기', '냉난방기', '안마의자',
      '커피머신', '냉장고'
    )
  );

comment on column public.rental_assets.category is '카테고리 (20종: 모니터/노트북/데스크톱 PC/네트워크장비/공유기/스위치/태블릿/스마트폰/프린터/복합기/서버/스토리지/TV/정수기/제빙기/공기청정기/냉난방기/안마의자/커피머신/냉장고)';