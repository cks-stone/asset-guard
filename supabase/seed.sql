-- ============================================
-- ASSET-GUARD 시드 데이터 — 렌탈 자산 장부 20건
-- 청구 구분: 월납 / 연납 / 반기납 / 일시납 분포
-- category: 모델 기준 20종 카테고리(모니터/노트북/데스크톱 PC 등) 부여
-- managed_by: 최초 등록(데모) 담당 지갑 = BbixZu6Xk9NMRgpxPySdNn8vHyQTkzJSYLvFkK5fg9DM
-- 카테고리 더미(100건)는 별도 파일 supabase/seed_category_dummies.sql 참고
-- 적용: `supabase db reset` 또는 SQL 에디터에서 실행
-- (재실행 안전: 기존 행 삭제 후 삽입)
-- ============================================

DELETE FROM public.rental_assets;

-- FK(0016) 선행: 렌탈 자산이 참조하는 지갑 명부 · 인사 프로필을 먼저 등록한다
-- (rental_assets.user_name → employee_profiles, managed_by → wallet_labels)
INSERT INTO public.wallet_labels (wallet_address, label)
VALUES
  ('BbixZu6Xk9NMRgpxPySdNn8vHyQTkzJSYLvFkK5fg9DM', 'BbixZu…fg9DM'),
  ('9uwp42cTXJJr8Sakp7Zs9UTEiVSjUZPEVkSMyau6o2kC', '9uwp42…o2kC')
ON CONFLICT (wallet_address) DO NOTHING;

INSERT INTO public.employee_profiles (user_name, division, department, employment_status, work_location)
VALUES
  ('홍길동', 'A부문', 'AAAA팀', '재직', '본사'),
  ('김철수', 'A부문', 'BBBB팀', '재직', '본사'),
  ('김민지', 'A부문', 'AAAA팀', '재직', '본사'),
  ('이영희', 'B부문', 'CCCC팀', '재직', '본사'),
  ('박민수', 'B부문', 'DDDD팀', '재직', '본사'),
  ('정우진', 'A부문', 'AAAA팀', '재직', '본사'),
  ('최하늘', 'C부문', 'EEEE팀', '재직', '본사'),
  ('오세훈', 'C부문', 'FFFF팀', '재직', '본사'),
  ('임성민', 'B부문', 'CCCC팀', '재직', '본사'),
  ('윤나래', 'C부문', 'FFFF팀', '재직', '본사'),
  ('서준호', 'A부문', 'BBBB팀', '재직', '본사'),
  ('한지훈', 'B부문', 'DDDD팀', '재직', '본사'),
  ('강다은', 'C부문', 'EEEE팀', '재직', '본사'),
  ('신예원', 'B부문', 'CCCC팀', '재직', '본사'),
  ('장유진', 'A부문', 'AAAA팀', '재직', '본사'),
  ('배소현', 'C부문', 'FFFF팀', '재직', '본사'),
  ('남궁희', 'B부문', 'DDDD팀', '재직', '본사'),
  ('구본승', 'C부문', 'EEEE팀', '재직', '본사'),
  ('문상혁', 'A부문', 'BBBB팀', '재직', '본사')
ON CONFLICT (user_name) DO NOTHING;

INSERT INTO public.rental_assets
  (management_no, serial_no, order_no, model_name, manufacturer,
   user_name, division, department, rental_company,
   billing_cycle, rental_fee, billing_month, rental_start_date, rental_end_date,
   status, category, managed_by)
VALUES
  -- 월납 (8)
  ('AST-2026-0001', 'SN987654321', 'ORD-2024-5512', 'Dell Latitude 5530', 'Dell',
   '홍길동', 'A부문', 'AAAA팀', 'OO렌탈',
   '월납', 75000, '매월', '2024-03-01', '2027-02-28',
   '정상사용', '노트북', 'BbixZu6Xk9NMRgpxPySdNn8vHyQTkzJSYLvFkK5fg9DM'),
  ('AST-2026-0002', 'SN112244556', 'ORD-2024-5513', 'HP EliteBook 860 G11', 'HP',
   '김철수', 'A부문', 'BBBB팀', '렌탈사A',
   '월납', 78000, '매월', '2024-06-01', '2027-05-31',
   '정상사용', '노트북', 'BbixZu6Xk9NMRgpxPySdNn8vHyQTkzJSYLvFkK5fg9DM'),
  ('AST-2026-0003', 'SN334455667', 'ORD-2024-5514', 'Dell Latitude 5530', 'Dell',
   '김민지', 'A부문', 'AAAA팀', 'OO렌탈',
   '월납', 75000, '매월', '2024-03-01', '2027-02-28',
   '정상사용', '노트북', 'BbixZu6Xk9NMRgpxPySdNn8vHyQTkzJSYLvFkK5fg9DM'),
  ('AST-2026-0004', 'SN556677889', 'ORD-2025-0003', 'LG 그램 Pro 17', 'LG',
   '이영희', 'B부문', 'CCCC팀', '케이렌탈',
   '월납', 62000, '매월', '2025-01-01', '2028-12-31',
   '유휴', '노트북', 'BbixZu6Xk9NMRgpxPySdNn8vHyQTkzJSYLvFkK5fg9DM'),
  ('AST-2026-0005', 'SN667788990', 'ORD-2025-0012', '삼성 갤럭시북4 Pro', 'Samsung',
   '박민수', 'B부문', 'DDDD팀', '렌탈사B',
   '월납', 58000, '매월', '2025-03-01', '2028-02-29',
   '정상사용', '노트북', 'BbixZu6Xk9NMRgpxPySdNn8vHyQTkzJSYLvFkK5fg9DM'),
  ('AST-2026-0006', 'SN778899001', 'ORD-2025-0021', 'MacBook Air M3 13"', 'Apple',
   '정우진', 'A부문', 'AAAA팀', 'OO렌탈',
   '월납', 89000, '매월', '2025-04-01', '2028-03-31',
   '정상사용', '노트북', 'BbixZu6Xk9NMRgpxPySdNn8vHyQTkzJSYLvFkK5fg9DM'),
  ('AST-2026-0007', 'SN010203040', 'ORD-2025-0033', 'Dell Latitude 5450', 'Dell',
   '최하늘', 'C부문', 'EEEE팀', '렌탈사A',
   '월납', 69000, '매월', '2025-06-01', '2028-05-31',
   '정상사용', '노트북', 'BbixZu6Xk9NMRgpxPySdNn8vHyQTkzJSYLvFkK5fg9DM'),
  ('AST-2026-0008', 'SN121314154', 'ORD-2025-0045', 'HP ProBook 450 G10', 'HP',
   '오세훈', 'C부문', 'FFFF팀', '케이렌탈',
   '월납', 66000, '매월', '2025-07-01', '2028-06-30',
   '정상사용', '노트북', 'BbixZu6Xk9NMRgpxPySdNn8vHyQTkzJSYLvFkK5fg9DM'),

  -- 연납 (5)
  ('AST-2026-0009', 'SN556677890', 'ORD-2024-8871', 'HP EliteBook 860 G11', 'HP',
   '임성민', 'B부문', 'CCCC팀', '렌탈사A',
   '연납', 850000, '1월', '2024-01-01', '2026-12-31',
   '정상사용', '노트북', 'BbixZu6Xk9NMRgpxPySdNn8vHyQTkzJSYLvFkK5fg9DM'),
  ('AST-2026-0010', 'SN991827364', 'ORD-2024-8890', 'Lenovo ThinkPad X1 Carbon', 'Lenovo',
   '윤나래', 'C부문', 'FFFF팀', 'OO렌탈',
   '연납', 1020000, '1월', '2024-01-01', '2026-12-31',
   '정상사용', '노트북', 'BbixZu6Xk9NMRgpxPySdNn8vHyQTkzJSYLvFkK5fg9DM'),
  ('AST-2026-0011', 'SN182736455', 'ORD-2025-1100', 'LG 그램 Pro 16', 'LG',
   '서준호', 'A부문', 'BBBB팀', '케이렌탈',
   '연납', 720000, '2월', '2025-02-01', '2027-01-31',
   '정상사용', '노트북', 'BbixZu6Xk9NMRgpxPySdNn8vHyQTkzJSYLvFkK5fg9DM'),
  ('AST-2026-0012', 'SN273645562', 'ORD-2025-1122', 'Dell Precision 3680', 'Dell',
   '한지훈', 'B부문', 'DDDD팀', '렌탈사B',
   '연납', 1350000, '3월', '2025-03-01', '2027-02-28',
   '유휴', '데스크톱 PC', 'BbixZu6Xk9NMRgpxPySdNn8vHyQTkzJSYLvFkK5fg9DM'),
  ('AST-2026-0013', 'SN364554678', 'ORD-2025-1144', 'MacBook Pro 14"M4', 'Apple',
   '강다은', 'C부문', 'EEEE팀', 'OO렌탈',
   '연납', 1580000, '3월', '2025-03-01', '2027-02-28',
   '정상사용', '노트북', 'BbixZu6Xk9NMRgpxPySdNn8vHyQTkzJSYLvFkK5fg9DM'),

  -- 반기납 (4)
  ('AST-2026-0014', 'SN455443236', 'ORD-2023-1200', 'Lenovo ThinkPad T14s', 'Lenovo',
   '신예원', 'B부문', 'CCCC팀', '렌탈사B',
   '반기납', 390000, '1,7월', '2023-07-01', '2026-06-30',
   '정상사용', '노트북', 'BbixZu6Xk9NMRgpxPySdNn8vHyQTkzJSYLvFkK5fg9DM'),
  ('AST-2026-0015', 'SN545352515', 'ORD-2024-2200', 'Dell Latitude 7440', 'Dell',
   '장유진', 'A부문', 'AAAA팀', 'OO렌탈',
   '반기납', 420000, '1,7월', '2024-07-01', '2026-12-31',
   '정상사용', '노트북', 'BbixZu6Xk9NMRgpxPySdNn8vHyQTkzJSYLvFkK5fg9DM'),
  ('AST-2026-0016', 'SN635261504', 'ORD-2025-3300', 'HP ZBook Firefly 14', 'HP',
   '배소현', 'C부문', 'FFFF팀', '케이렌탈',
   '반기납', 460000, '2,8월', '2025-02-01', '2027-01-31',
   '정상사용', '노트북', 'BbixZu6Xk9NMRgpxPySdNn8vHyQTkzJSYLvFkK5fg9DM'),
  ('AST-2026-0017', 'SN725160493', 'ORD-2025-3344', 'LG UltraFine 27" 모니터', 'LG',
   '남궁희', 'B부문', 'DDDD팀', '렌탈사A',
   '반기납', 120000, '1,7월', '2025-07-01', '2027-06-30',
   '정상사용', '모니터', 'BbixZu6Xk9NMRgpxPySdNn8vHyQTkzJSYLvFkK5fg9DM'),

  -- 일시납 (3)
  ('AST-2026-0018', 'SN898887869', 'ORD-2024-4411', 'Apple Mac mini M4', 'Apple',
   '구본승', 'C부문', 'EEEE팀', '케이렌탈',
   '일시납', 1200000, NULL, '2024-10-01', '2027-09-30',
   '정상사용', '데스크톱 PC', 'BbixZu6Xk9NMRgpxPySdNn8vHyQTkzJSYLvFkK5fg9DM'),
  ('AST-2026-0019', 'SN979594936', 'ORD-2025-4422', 'Dell 27" 4K 모니터', 'Dell',
   '문상혁', 'A부문', 'BBBB팀', '렌탈사B',
   '일시납', 450000, NULL, '2025-05-01', '2027-04-30',
   '정상사용', '모니터', 'BbixZu6Xk9NMRgpxPySdNn8vHyQTkzJSYLvFkK5fg9DM'),
  ('AST-2026-0020', 'SN049586754', 'ORD-2023-5500', 'Samsung ViewFinity S8 32"', 'Samsung',
   NULL, NULL, NULL, 'OO렌탈',
   '일시납', 780000, NULL, '2023-11-01', '2025-10-31',
   '계약종료', '모니터', 'BbixZu6Xk9NMRgpxPySdNn8vHyQTkzJSYLvFkK5fg9DM');