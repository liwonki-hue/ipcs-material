-- fix_bom_size_55_80.sql
-- BOM 사이즈 오류 수정: D550(55") → D220(22"), CAP D800(80") → D320(32")
-- 원인: DN550→NPS 22", DN800→NPS 32"를 D-code 변환 시 DN값을 그대로 사용한 오기입
-- Supabase SQL Editor에서 실행

-- ============================================================
-- [사전 확인] 영향 범위 SELECT
-- ============================================================

-- D550 영향 범위 (bom)
SELECT mat_code, full_description, tag, system, category
FROM material.bom
WHERE mat_code LIKE '%D550%'
ORDER BY mat_code;

-- D550 영향 범위 (receiving)
SELECT id, mat_code, full_description, doc_no
FROM material.receiving
WHERE mat_code LIKE '%D550%'
ORDER BY mat_code;

-- D550 영향 범위 (matcode_master)
SELECT mat_code, category, item_desc, size1, size2
FROM material.matcode_master
WHERE mat_code LIKE '%D550%'
ORDER BY mat_code;

-- CAP D800 영향 범위 (bom)
SELECT mat_code, full_description, tag, system, category
FROM material.bom
WHERE mat_code LIKE 'CAP%D800%'
ORDER BY mat_code;

-- CAP D800 영향 범위 (receiving)
SELECT id, mat_code, full_description, doc_no
FROM material.receiving
WHERE mat_code LIKE 'CAP%D800%'
ORDER BY mat_code;

-- CAP D800 영향 범위 (matcode_master)
SELECT mat_code, category, item_desc, size1, size2
FROM material.matcode_master
WHERE mat_code LIKE 'CAP%D800%'
ORDER BY mat_code;

-- ============================================================
-- PART 1: matcode_master D550 → D220 수정
-- D220이 이미 존재하면 RENAME 불가(unique constraint) → D550 행 삭제
-- D220이 없는 경우는 RENAME 처리
-- ============================================================

-- D220이 이미 있는 경우: D550 행 삭제
DELETE FROM material.matcode_master
WHERE mat_code LIKE '%D550%'
  AND EXISTS (
      SELECT 1 FROM material.matcode_master m2
      WHERE m2.mat_code = REPLACE(material.matcode_master.mat_code, 'D550', 'D220')
  );

-- D220이 없는 경우: RENAME + size1/size2 갱신
UPDATE material.matcode_master
SET mat_code = REPLACE(mat_code, 'D550', 'D220'),
    size1    = '22"',
    size2    = 'DN 550'
WHERE mat_code LIKE '%D550%';

-- ============================================================
-- PART 2: matcode_master CAP D800 → D320 수정
-- D320이 이미 존재하면 D800 행 삭제
-- ============================================================

-- D320이 이미 있는 경우: D800 행 삭제
DELETE FROM material.matcode_master
WHERE mat_code LIKE 'CAP%D800%'
  AND EXISTS (
      SELECT 1 FROM material.matcode_master m2
      WHERE m2.mat_code = REPLACE(material.matcode_master.mat_code, 'D800', 'D320')
  );

-- D320이 없는 경우: RENAME + size1/size2 갱신
UPDATE material.matcode_master
SET mat_code = REPLACE(mat_code, 'D800', 'D320'),
    size1    = '32"',
    size2    = 'DN 800'
WHERE mat_code LIKE 'CAP%D800%';

-- ============================================================
-- PART 3: bom D550 → D220 수정
-- ============================================================

UPDATE material.bom
SET mat_code = REPLACE(mat_code, 'D550', 'D220')
WHERE mat_code LIKE '%D550%';

-- ============================================================
-- PART 4: bom CAP D800 → D320 수정
-- ============================================================

UPDATE material.bom
SET mat_code = REPLACE(mat_code, 'D800', 'D320')
WHERE mat_code LIKE 'CAP%D800%';

-- ============================================================
-- PART 5: receiving D550 → D220 수정
-- ============================================================

UPDATE material.receiving
SET mat_code = REPLACE(mat_code, 'D550', 'D220')
WHERE mat_code LIKE '%D550%';

-- ============================================================
-- PART 6: receiving CAP D800 → D320 수정
-- ============================================================

UPDATE material.receiving
SET mat_code = REPLACE(mat_code, 'D800', 'D320')
WHERE mat_code LIKE 'CAP%D800%';

-- ============================================================
-- [결과 확인] 수정 후 검증
-- ============================================================

-- D220으로 바뀐 matcode_master 확인
SELECT mat_code, category, item_desc, size1, size2
FROM material.matcode_master
WHERE mat_code LIKE '%D220%'
ORDER BY mat_code;

-- D320 CAP으로 바뀐 matcode_master 확인
SELECT mat_code, category, item_desc, size1, size2
FROM material.matcode_master
WHERE mat_code LIKE 'CAP%D320%'
ORDER BY mat_code;

-- D550/D800 잔존 여부 확인 (0건이어야 정상)
SELECT 'bom_D550'        AS check_target, COUNT(*) AS remaining FROM material.bom       WHERE mat_code LIKE '%D550%'
UNION ALL
SELECT 'bom_CAP_D800',                   COUNT(*)              FROM material.bom       WHERE mat_code LIKE 'CAP%D800%'
UNION ALL
SELECT 'receiving_D550',                 COUNT(*)              FROM material.receiving  WHERE mat_code LIKE '%D550%'
UNION ALL
SELECT 'receiving_CAP_D800',             COUNT(*)              FROM material.receiving  WHERE mat_code LIKE 'CAP%D800%'
UNION ALL
SELECT 'master_D550',                    COUNT(*)              FROM material.matcode_master WHERE mat_code LIKE '%D550%'
UNION ALL
SELECT 'master_CAP_D800',                COUNT(*)              FROM material.matcode_master WHERE mat_code LIKE 'CAP%D800%';
