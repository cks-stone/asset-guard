-- ============================================
-- ASSET-GUARD 시드 데이터 (자산 목록)
-- 적용: supabase db push 후 SQL 에디터에서 실행하거나
--       `supabase db reset` + 마이그레이션과 함께 적용
-- 담당자(custodian_wallet)는 선택 — 비워두면 미배정(available)으로 시작
-- ============================================

INSERT INTO public.assets (asset_code, name, category, description, status, custodian_wallet)
VALUES
  ('NB-0001', '맥북 프로 14인치 M3', '노트북', 'M3 맥북 프로, 16GB/512GB', 'in_use', '27VYZhD95sNCRL91PsUYWszPyTfoaMqu3R6hWgg5cDUy'),
  ('NB-0002', '맥북 에어 13인치 M2', '노트북', 'M2 맥북 에어, 8GB/256GB', 'available', NULL),
  ('NB-0003', 'LG 그램 16', '노트북', '16인치 업무용 노트북', 'available', NULL),
  ('MN-0001', 'LG 27인치 4K 모니터', '모니터', '27UP850N 4K UHD', 'in_use', '27VYZhD95sNCRL91PsUYWszPyTfoaMqu3R6hWgg5cDUy'),
  ('MN-0002', '삼성 32인치 QHD 모니터', '모니터', 'S32BM800', 'available', NULL),
  ('PH-0001', '아이폰 15 프로', '스마트폰', '256GB 네이처 티타늄', 'in_use', '27VYZhD95sNCRL91PsUYWszPyTfoaMqu3R6hWgg5cDUy'),
  ('PH-0002', '갤럭시 S24울트라', '스마트폰', '512GB 티타늄 그레이', 'available', NULL),
  ('TC-0001', '뷰소닉 프로젝터', 'AV장비', '렌탈 회의용', 'retired', '27VYZhD95sNCRL91PsUYWszPyTfoaMqu3R6hWgg5cDUy'),
  ('ET-0001', '로지텍 MX 마스터 3S', '주변기기', '스튜디오 키트', 'available', NULL),
  ('ET-0002', '디스플레이 허브', '주변기기', 'USB-C Dock', 'available', NULL);