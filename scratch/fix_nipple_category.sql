-- matcode_master 및 receiving에서 PIN-(NIPPLE) category 'Pipe' → 'Fitting' 수정
-- gen_missing_matcode_sql.py의 PIN:('PIPE','Pipe') 오류로 잘못 등록된 데이터 수정

-- 1. matcode_master: PIN- 코드 category + item_desc 수정
UPDATE material.matcode_master
SET category = 'Fitting',
    item_desc = 'NIPPLE'
WHERE mat_code LIKE 'PIN-%'
  AND (category != 'Fitting' OR item_desc != 'NIPPLE');

-- 2. receiving: PIN- 코드 category 수정
UPDATE material.receiving
SET category = 'Fitting'
WHERE mat_code LIKE 'PIN-%'
  AND category != 'Fitting';

-- 확인 쿼리
SELECT 'matcode_master' AS tbl, mat_code, category, item_desc FROM material.matcode_master WHERE mat_code LIKE 'PIN-%'
UNION ALL
SELECT 'receiving', mat_code, category, full_description FROM material.receiving WHERE mat_code LIKE 'PIN-%'
ORDER BY 1, 2;
