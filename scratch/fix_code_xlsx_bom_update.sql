-- fix_code_xlsx_bom_update.sql
-- Code.xlsx 기준 BOM 데이터 수정: Material → A182-F304L
-- 대상: GT MISC / CD 계통 32행 (ELBOW 45D, ELBOW LR 90D, COUPLING-FULL)
-- 매칭 기준: system + iso_dwg_no + line_no + full_description(ITEM 앞부분)
-- Supabase SQL Editor에서 실행

-- ============================================================
-- STEP 1: matcode_master S04L 코드 확보
--   (fix_a182f92_to_f304l.sql 실행 전이면 신규 INSERT,
--    이미 실행됐으면 ON CONFLICT DO NOTHING으로 무해)
-- ============================================================

INSERT INTO material.matcode_master
  (mat_code, category, item_desc, matl_desc, size1, size2, class_desc, et_desc)
VALUES
  ('CPF-S04L-D005-C3K-SW',  'Fitting', 'COUPLING-FULL',  'A182-F304L', 'DN 15', 'DN 15', 'CL3000', 'SW'),
  ('CPF-S04L-D020-C3K-SW',  'Fitting', 'COUPLING-FULL',  'A182-F304L', 'DN 50', 'DN 50', 'CL3000', 'SW'),
  ('EL4L-S04L-D005-C3K-SW', 'Fitting', 'ELBOW 45D',      'A182-F304L', 'DN 15', 'DN 15', 'CL3000', 'SW'),
  ('EL9L-S04L-D005-C3K-SW', 'Fitting', 'ELBOW LR 90D',   'A182-F304L', 'DN 15', 'DN 15', 'CL3000', 'SW'),
  ('EL9L-S04L-D020-C3K-SW', 'Fitting', 'ELBOW LR 90D',   'A182-F304L', 'DN 50', 'DN 50', 'CL3000', 'SW')
ON CONFLICT (mat_code) DO NOTHING;

-- AS92 → S04L 코드명 변경 (fix_a182f92_to_f304l.sql 미실행 시 대비)
UPDATE material.matcode_master SET mat_code='CPF-S04L-D005-C3K-SW',  matl_desc='A182-F304L' WHERE mat_code='CPF-AS92-D005-C3K-SW';
UPDATE material.matcode_master SET mat_code='CPF-S04L-D020-C3K-SW',  matl_desc='A182-F304L' WHERE mat_code='CPF-AS92-D020-C3K-SW';
UPDATE material.matcode_master SET mat_code='EL4L-S04L-D005-C3K-SW', matl_desc='A182-F304L' WHERE mat_code='EL4L-AS92-D005-C3K-SW';
UPDATE material.matcode_master SET mat_code='EL9L-S04L-D005-C3K-SW', matl_desc='A182-F304L' WHERE mat_code='EL9L-AS92-D005-C3K-SW';
UPDATE material.matcode_master SET mat_code='EL9L-S04L-D020-C3K-SW', matl_desc='A182-F304L' WHERE mat_code='EL9L-AS92-D020-C3K-SW';

-- ============================================================
-- STEP 2: bom UPDATE (Code.xlsx 5종 × 4 ISO = 20개 조합)
-- ============================================================

-- [1/5] ELBOW 45D, DN 15, CL3000, SW (CD-005 계통 4개 ISO × 1행 = 4행)
UPDATE material.bom
SET full_description = 'ELBOW 45D, A182-F304L, DN 15, CL3000, SW',
    mat_code         = 'EL4L-S04L-D005-C3K-SW'
WHERE system      = 'GT MISC'
  AND iso_dwg_no IN (
      'CCP-W-B111-PI-140-CD-005(1OF1)',
      'CCP-W-B112-PI-140-CD-005(1OF1)',
      'CCP-W-B221-PI-140-CD-005(1OF1)',
      'CCP-W-B222-PI-140-CD-005(1OF1)'
  )
  AND full_description LIKE 'ELBOW 45D%';

-- [2/5] ELBOW LR 90D, DN 15, CL3000, SW (CD-005 계통 4개 ISO × 2행 = 8행)
UPDATE material.bom
SET full_description = 'ELBOW LR 90D, A182-F304L, DN 15, CL3000, SW',
    mat_code         = 'EL9L-S04L-D005-C3K-SW'
WHERE system      = 'GT MISC'
  AND iso_dwg_no IN (
      'CCP-W-B111-PI-140-CD-005(1OF1)',
      'CCP-W-B112-PI-140-CD-005(1OF1)',
      'CCP-W-B221-PI-140-CD-005(1OF1)',
      'CCP-W-B222-PI-140-CD-005(1OF1)'
  )
  AND full_description LIKE 'ELBOW LR 90D%';

-- [3/5] COUPLING-FULL, DN 15, CL3000, SW (CD-005 계통 4개 ISO × 1행 = 4행)
UPDATE material.bom
SET full_description = 'COUPLING-FULL, A182-F304L, DN 15, CL3000, SW',
    mat_code         = 'CPF-S04L-D005-C3K-SW'
WHERE system      = 'GT MISC'
  AND iso_dwg_no IN (
      'CCP-W-B111-PI-140-CD-005(1OF1)',
      'CCP-W-B112-PI-140-CD-005(1OF1)',
      'CCP-W-B221-PI-140-CD-005(1OF1)',
      'CCP-W-B222-PI-140-CD-005(1OF1)'
  )
  AND full_description LIKE 'COUPLING-FULL%';

-- [4/5] ELBOW LR 90D, DN 50, CL3000, SW (CD-002 계통 4개 ISO × 3행 = 12행)
UPDATE material.bom
SET full_description = 'ELBOW LR 90D, A182-F304L, DN 50, CL3000, SW',
    mat_code         = 'EL9L-S04L-D020-C3K-SW'
WHERE system      = 'GT MISC'
  AND iso_dwg_no IN (
      'CCP-W-B111-PI-140-CD-002(1OF1)',
      'CCP-W-B112-PI-140-CD-002(1OF1)',
      'CCP-W-B221-PI-140-CD-002(1OF1)',
      'CCP-W-B222-PI-140-CD-002(1OF1)'
  )
  AND full_description LIKE 'ELBOW LR 90D%';

-- [5/5] COUPLING-FULL, DN 50, CL3000, SW (CD-002 계통 4개 ISO × 1행 = 4행)
UPDATE material.bom
SET full_description = 'COUPLING-FULL, A182-F304L, DN 50, CL3000, SW',
    mat_code         = 'CPF-S04L-D020-C3K-SW'
WHERE system      = 'GT MISC'
  AND iso_dwg_no IN (
      'CCP-W-B111-PI-140-CD-002(1OF1)',
      'CCP-W-B112-PI-140-CD-002(1OF1)',
      'CCP-W-B221-PI-140-CD-002(1OF1)',
      'CCP-W-B222-PI-140-CD-002(1OF1)'
  )
  AND full_description LIKE 'COUPLING-FULL%';

-- ============================================================
-- STEP 3: receiving full_description 수정 (해당 항목 있을 경우)
-- ============================================================

UPDATE material.receiving
SET full_description = REPLACE(full_description, 'A182-F92', 'A182-F304L')
WHERE full_description LIKE '%A182-F92%'
  AND full_description LIKE '%CD-%';

-- ============================================================
-- 검증 쿼리
-- ============================================================

-- S04L matcode 5건 확인
SELECT mat_code, item_desc, matl_desc, size1, class_desc
FROM material.matcode_master
WHERE mat_code LIKE '%-S04L-%'
ORDER BY mat_code;

-- bom 수정 결과 확인 (32건이어야 정상)
SELECT mat_code, full_description, COUNT(*) AS cnt
FROM material.bom
WHERE system = 'GT MISC'
  AND iso_dwg_no LIKE '%CD-00%'
GROUP BY mat_code, full_description
ORDER BY mat_code, full_description;

-- AS92 잔존 여부 (0건이어야 정상)
SELECT COUNT(*) AS remaining_as92
FROM material.bom
WHERE mat_code LIKE '%-AS92-%'
   OR full_description LIKE '%A182-F92%';
