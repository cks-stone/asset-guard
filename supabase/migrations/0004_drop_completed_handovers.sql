-- M8 — 완료 인수인계 데이터 미보관
-- 감사 기록은 온체인 Anchor PDA + tx 가 담당하므로,
-- DB(handovers)는 진행 중 조정용이면 충분 → 기존 completed 행 일괄 정리
delete from public.handovers where onchain_status = 'completed';