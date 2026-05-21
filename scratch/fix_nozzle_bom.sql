-- NOZZLE BOM matcode 등록 및 할당 SQL
-- Supabase SQL Editor에서 실행

-- Step 1: matcode_master 등록
INSERT INTO material.matcode_master
  (mat_code, category, item_desc, matl_desc, size1, size2, class_desc, et_desc)
VALUES
  ('NOZ-AS22-D020-C3K-SW', 'Fitting', 'NOZZLE', 'A182-F22', 'DN 50', 'DN 50', 'CL3000', 'SW')
ON CONFLICT (mat_code) DO NOTHING;

-- Step 2: bom 행 UPDATE (2건)
UPDATE material.bom
SET mat_code = 'NOZ-AS22-D020-C3K-SW'
WHERE mat_code IS NULL
  AND full_description = 'NOZZLE, A182-F22 CL.3,, DN 50'
  AND system = 'ATM';
