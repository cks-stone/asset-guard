-- M38 — 인사(HR) 프로필 + 장비 위치
-- 1) employee_profiles: 렌탈 자산 사용자(user_name, distinct)별 인사상태·근무위치·직급·입사/퇴직예정일·비고
--    - 키는 오직 rental_assets.user_name (지갑과 무관)
--    - 월간 리포팅의 "확인 필요 자산" 판단 기준
--    - 등록된 자산의 사용자(user_name)를 인사 프로필로 자동 등록(관리자가 세부 정보 입력 대기)
-- 2) rental_assets.location: 장비 자체 물리 위치 (간단 텍스트, 예: 본사 / B-XX지사 / A사옥)
--
-- ※ 0014 이전 버전(지갑 포함)을 이미 적용했다면 이 파일 재실행 시 employee_profiles를
--   드롭 후 재생성한다(아직 실데이터 입력 전 전제).

drop table if exists public.employee_profiles cascade;

create table public.employee_profiles (
  user_name         text primary key,   -- rental_assets.user_name (distinct, 자유 텍스트)
  employment_status text not null default '재직',
  work_location     text not null default '본사',
  job_title         text,
  hire_date         date,
  departure_date    date,
  note              text,
  updated_at        timestamptz not null default now()
);

comment on table public.employee_profiles is
  '인사 프로필 — 렌탈 자산 사용자(user_name)별 인사상태·근무위치·입사/퇴직예정일 (월간 리포팅 판단 기준)';
comment on column public.employee_profiles.employment_status is
  '인사상태: 재직/수습/휴직/출산휴가/육아휴직/파견/퇴직/기타';
comment on column public.employee_profiles.work_location is
  '근무 위치: 본사/지사/재택/해외지사/출장중';
comment on column public.employee_profiles.hire_date is '입사일 — 신규 입사자 장비 지급 확인';
comment on column public.employee_profiles.departure_date is '퇴직(예정)일 — 기기 회수 일정 예고';

alter table public.employee_profiles enable row level security;

drop policy if exists employee_profiles_select on public.employee_profiles;
create policy employee_profiles_select on public.employee_profiles
  for select using (true);

drop policy if exists employee_profiles_write on public.employee_profiles;
create policy employee_profiles_write on public.employee_profiles
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- 시드: rental_assets.user_name distinct 값을 인사 프로필로 자동 등록 (기본 재직·본사)
insert into public.employee_profiles (user_name)
select distinct trim(u.user_name)
from public.rental_assets u
where u.user_name is not null
  and trim(u.user_name) <> ''
  and not exists (
    select 1 from public.employee_profiles e
    where e.user_name = trim(u.user_name)
  );

-- 장비 자체 물리 위치 컬럼 — 기존 등록 장비는 기본 '본사'로 채운다 (관리자가 수정)
alter table public.rental_assets
  add column if not exists location text;

update public.rental_assets
set location = '본사'
where location is null;

comment on column public.rental_assets.location is
  '장비 물리 위치 (간단 텍스트, 예: 본사 / B-XX지사 / A사옥)';