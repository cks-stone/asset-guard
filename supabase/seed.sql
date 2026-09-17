-- ============================================
-- ASSET-GUARD 시드 데이터 (렌탈 자산 목록)
-- 적용: supabase db push 후 SQL 에디터에서 실행하거나
--       `supabase db reset` + 마이그레이션과 함께 적용
-- 담당자(custodian_wallet)는 선택 — 비워두면 미배정(available)으로 시작
-- 렌탈 메타데이터(rental_type/기간/비용)는 migration 0003 이후 컬럼 기준
-- ============================================

INSERT INTO public.assets
  (asset_code, name, category, description, status, custodian_wallet,
   rental_type, rental_start_at, rental_end_at, rental_fee, rental_terms)
VALUES
  ('NB-0001', '맥북 프로 14인치 M3', '노트북', 'M3 맥북 프로, 16GB/512GB', 'in_use', '27VYZhD95sNCRL91PsUYWszPyTfoaMqu3R6hWgg5cDUy',
   'company_owned', '2026-01-05', '2026-12-31', 0, '회사 표준 렌탈 — 년 1회 계약 갱신, 분실 시 본인 부담'),
  ('NB-0002', '맥북 에어 13인치 M2', '노트북', 'M2 맥북 에어, 8GB/256GB', 'available', NULL,
   'company_owned', '2026-01-05', '2026-12-31', 0, '회사 표준 렌탈 — 년 1회 계약 갱신, 분실 시 본인 부담'),
  ('NB-0003', 'LG 그램 16', '노트북', '16인치 업무용 노트북', 'available', NULL,
   'company_owned', '2026-01-05', '2026-12-31', 0, '회사 표준 렌탈 — 년 1회 계약 갱신, 분실 시 본인 부담'),
  ('MN-0001', 'LG 27인치 4K 모니터', '모니터', '27UP850N 4K UHD', 'in_use', '27VYZhD95sNCRL91PsUYWszPyTfoaMqu3R6hWgg5cDUy',
   'company_owned', '2026-01-05', '2026-12-31', 0, '회사 표준 렌탈 — 년 1회 계약 갱신, 분실 시 본인 부담'),
  ('MN-0002', '삼성 32인치 QHD 모니터', '모니터', 'S32BM800', 'available', NULL,
   'company_owned', '2026-01-05', '2026-12-31', 0, '회사 표준 렌탈 — 년 1회 계약 갱신, 분실 시 본인 부담'),
  ('PH-0001', '아이폰 15 프로', '스마트폰', '256GB 네이처 티타늄', 'in_use', '27VYZhD95sNCRL91PsUYWszPyTfoaMqu3R6hWgg5cDUy',
   'company_owned', '2026-01-05', '2026-12-31', 0, '회사 표준 렌탈 — 년 1회 계약 갱신, 분실 시 본인 부담'),
  ('PH-0002', '갤럭시 S24울트라', '스마트폰', '512GB 티타늄 그레이', 'available', NULL,
   'company_owned', '2026-01-05', '2026-12-31', 0, '회사 표준 렌탈 — 년 1회 계약 갱신, 분실 시 본인 부담'),
  ('TC-0001', '뷰소닉 프로젝터', 'AV장비', '렌탈 회의용', 'retired', '27VYZhD95sNCRL91PsUYWszPyTfoaMqu3R6hWgg5cDUy',
   'leased', '2026-03-02', '2026-09-30', 120000, '외부 렌탈사 임대 — 회의/행사용, 반납 시 원상복구'),
  ('ET-0001', '로지텍 MX 마스터 3S', '주변기기', '스튜디오 키트', 'available', NULL,
   'company_owned', '2026-01-05', '2026-12-31', 0, '회사 표준 렌탈 — 년 1회 계약 갱신, 분실 시 본인 부담'),
  ('ET-0002', '디스플레이 허브', '주변기기', 'USB-C Dock', 'available', NULL,
   'company_owned', '2026-01-05', '2026-12-31', 0, '회사 표준 렌탈 — 년 1회 계약 갱신, 분실 시 본인 부담');