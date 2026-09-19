-- M20 — 지갑 프로필 확장: 부문(division)/팀(department)
-- 로그인 시 이름(명칭) + 부문/팀을 입력받아 지갑 디렉토리(인수인계 대상 검색)와
-- 이관 그래프 노드 표시에 사용한다.

alter table public.wallet_labels
  add column if not exists division   text,
  add column if not exists department text;

comment on column public.wallet_labels.division is '부문 (예: A부문)';
comment on column public.wallet_labels.department is '팀 (예: AAAA팀)';

create index if not exists wallet_labels_directory_idx
  on public.wallet_labels (label)
  where label is not null;