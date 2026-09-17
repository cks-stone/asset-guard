-- M3 — accept 양자서명 relay: to 서명 후 전달하는 부분 서명 블롭 저장
alter table if exists public.handovers
  add column if not exists partial_tx text;

comment on column public.handovers.partial_tx is
  '양자서명 완료 단계에서 to 가 서명한 accept 트랜잭션의 base64 부분서명 블롭 (from 이 완료 서명함)';