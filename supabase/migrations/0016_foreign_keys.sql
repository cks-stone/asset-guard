-- M38 — 스키마 비주얼라이저 연결용 외래 키 (NOT VALID)
-- 4개 테이블(employee_profiles / rental_assets / transfer_history / wallet_labels)의
-- 관계를 실제 FK로 표현한다. NOT VALID 로 추가해 기존 데이터 검증 없이
-- 신규 쓰기부터 강제하며, Supabase Schema Visualizer 가 정상적으로 엣지를 그린다.
--
-- 관계 (시각화 구도):
--   employee_profiles ──user_name ── rental_assets ──managed_by── wallet_labels
--   rental_assets ──management_no── transfer_history ──from/to_wallet── wallet_labels
--
-- ※ 정합성 후 실제 VALIDATE 를 원하면 아래처럼 실행(선택):
--   alter table public.rental_assets validate constraint rental_assets_user_name_fk;
--   alter table public.rental_assets validate constraint rental_assets_managed_by_fk;
--   alter table public.transfer_history validate constraint transfer_history_management_no_fk;
--   alter table public.transfer_history validate constraint transfer_history_from_wallet_fk;
--   alter table public.transfer_history validate constraint transfer_history_to_wallet_fk;

-- rental_assets.user_name → employee_profiles (자산 사용자는 등록된 인사 프로필만)
alter table public.rental_assets
  add constraint rental_assets_user_name_fk
  foreign key (user_name) references public.employee_profiles (user_name)
  on delete set null
  not valid;

-- rental_assets.managed_by → wallet_labels (담당 지갑은 지갑 명부에 존재)
alter table public.rental_assets
  add constraint rental_assets_managed_by_fk
  foreign key (managed_by) references public.wallet_labels (wallet_address)
  on delete set null
  not valid;

-- transfer_history.management_no → rental_assets (이관 대상 자산)
alter table public.transfer_history
  add constraint transfer_history_management_no_fk
  foreign key (management_no) references public.rental_assets (management_no)
  not valid;

-- transfer_history.from_wallet / to_wallet → wallet_labels (이관 당사자 지갑)
alter table public.transfer_history
  add constraint transfer_history_from_wallet_fk
  foreign key (from_wallet) references public.wallet_labels (wallet_address)
  on delete set null
  not valid;

alter table public.transfer_history
  add constraint transfer_history_to_wallet_fk
  foreign key (to_wallet) references public.wallet_labels (wallet_address)
  on delete set null
  not valid;

-- FK 참조 컬럼 인덱스 (누락분 보강)
create index if not exists transfer_history_from_wallet_idx
  on public.transfer_history (from_wallet)
  where from_wallet is not null;

create index if not exists transfer_history_to_wallet_idx
  on public.transfer_history (to_wallet)
  where to_wallet is not null;

comment on constraint rental_assets_user_name_fk on public.rental_assets is
  '인사 프로필 기반 자산 등록: 자산 사용자는 employee_profiles.user_name 참조 (0016)';
comment on constraint rental_assets_managed_by_fk on public.rental_assets is
  '담당 지갑은 wallet_labels.wallet_address 참조 (0016)';
comment on constraint transfer_history_management_no_fk on public.transfer_history is
  '이관 대상 자산은 rental_assets.management_no 참조 (0016)';
comment on constraint transfer_history_from_wallet_fk on public.transfer_history is
  '기존 담당 지갑은 wallet_labels.wallet_address 참조 (0016)';
comment on constraint transfer_history_to_wallet_fk on public.transfer_history is
  '신규 담당 지갑은 wallet_labels.wallet_address 참조 (0016)';