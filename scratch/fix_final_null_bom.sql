-- 잔존 NULL matcode 최종 수정 (SWAGE-CON 8건, CAP 1건, INSULATION GASKET KIT 2건)
-- Supabase SQL Editor에서 실행

-- Step 1: matcode_master 신규 등록
INSERT INTO material.matcode_master
  (mat_code, category, item_desc, matl_desc, size1, size2, class_desc, et_desc)
VALUES
  ('SCN-SS16-D010-S80-BW', 'Fitting', 'SWAGE-CON', 'A182-F316', 'DN 25', 'DN 15', 'S-80 x CL3000', 'BW'),
  ('CAP-CS05-D060-S40-BW', 'Fitting', 'CAP', 'A105', 'DN 150', 'DN 150', 'S-40', 'BW'),
  ('GSKT-INS-D030', 'Others', 'INSULATION GASKET KIT', 'INS', 'DN 80', 'DN 80', '-', '-')
ON CONFLICT (mat_code) DO NOTHING;

-- Step 2: SWAGE-CON UPDATE (8건, GT MISC)
UPDATE material.bom
SET mat_code = 'SCN-SS16-D010-S80-BW'
WHERE mat_code IS NULL
  AND system = 'GT MISC'
  AND full_description LIKE 'SWAGE-CON%';

-- Step 3: CAP UPDATE (1건, AS)
UPDATE material.bom
SET mat_code = 'CAP-CS05-D060-S40-BW'
WHERE mat_code IS NULL
  AND system = 'AS'
  AND full_description LIKE 'CAP%DN 150%';

-- Step 4: INSULATION GASKET KIT UPDATE (2건, ST)
UPDATE material.bom
SET mat_code = 'GSKT-INS-D030'
WHERE mat_code IS NULL
  AND full_description LIKE 'INSULATION GASKET KIT%';

-- 확인 쿼리
SELECT COUNT(*) AS remaining_null FROM material.bom WHERE mat_code IS NULL;
