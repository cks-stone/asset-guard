-- M38 — 인사(HR) 부문/팀 필드 추가
-- 인사 정보 관리 화면에서 부문/팀을 선택 목록으로 편집·저장하기 위해
-- employee_profiles에 division/department 컬럼을 추가하고, 기존 렌탈 자산의
-- user_name별 부문/팀 값으로 백필한다.

alter table public.employee_profiles
  add column if not exists division text,
  add column if not exists department text;

-- 백필: rental_assets.user_name별 첫(사전순 최소) 부문/팀 값으로 채운다.
update public.employee_profiles e
set division = a.division,
    department = a.department
from (
  select user_name,
         min(division) as division,
         min(department) as department
  from public.rental_assets
  where user_name is not null
    and trim(user_name) <> ''
  group by user_name
) a
where e.user_name = a.user_name
  and e.division is null
  and e.department is null;

comment on column public.employee_profiles.division is
  '부문 — 인사 정보 관리 선택 목록 (A부문/B부문/C부문, 렌탈 자산 파생 값 포함)';
comment on column public.employee_profiles.department is
  '팀 — 인사 정보 관리 선택 목록 (AAAA팀~FFFF팀, 렌탈 자산 파생 값 포함)';