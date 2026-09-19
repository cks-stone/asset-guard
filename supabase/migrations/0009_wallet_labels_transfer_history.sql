-- 0009 — 지갑 명칭 + 이관(인수인계) 이력
-- 자산 이동 그래프(어느 지갑을 거쳐갔는지)의 데이터 기반.
-- 온체인 PDA는 불변 진실 소스, 여기 표는 조회 편의용(이후 온체인 백필 옵션).

-- 지갑 명칭 — 로그인 사용자가 본인 지갑에 부여 (노드 그래프 표시용)
create table if not exists public.wallet_labels (
  wallet_address text primary key,   -- Solana 지갑 주소 (base58)
  label          text not null check (length(trim(label)) between 1 and 60),
  updated_at     timestamptz not null default now()
);

comment on table public.wallet_labels is
  '지갑 명칭 — 로그인 사용자가 본인 지갑의 이름을 지정 (이관 그래프 노드 표시)';

alter table public.wallet_labels enable row level security;

drop policy if exists wallet_labels_select on public.wallet_labels;
create policy wallet_labels_select on public.wallet_labels
  for select using (true);

drop policy if exists wallet_labels_write on public.wallet_labels;
create policy wallet_labels_write on public.wallet_labels
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- 이관 이력 — 승인되어 온체인 create_handover가 실행된 시점에 서비스키가 기록
create table if not exists public.transfer_history (
  id             bigint generated always as identity primary key,
  management_no  text not null,      -- 자산 관리번호
  from_wallet    text,               -- 기존 담당자 (이력 시작 전 최초분은 null 가능)
  to_wallet      text not null,      -- 신규 담당자
  transfer_tx    text,               -- 온체인 create_handover 서명 (탐색기 링크용)
  transferred_at timestamptz not null default now(),
  created_at     timestamptz not null default now()
);

create index if not exists transfer_history_management_no_idx
  on public.transfer_history (management_no);

comment on table public.transfer_history is
  '이관(인수인계) 이력 — 온체인 PDA 기록 확인 후 기록 (진실 소스는 온체인, 여기는 조회 편의)';

alter table public.transfer_history enable row level security;

drop policy if exists transfer_history_select on public.transfer_history;
create policy transfer_history_select on public.transfer_history
  for select using (true);

drop policy if exists transfer_history_write on public.transfer_history;
create policy transfer_history_write on public.transfer_history
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');