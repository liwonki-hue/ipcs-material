-- fix_a182f92_to_f304l.sql
-- BOM Description 오류 수정: A182-F92 → A182-F304L
-- 신규 MatCode: AS92 → S04L (A182-F304L, 304L Stainless Steel Forgings)
-- 대상 시스템: GT MISC (Condensate Drain)
-- 대상 아이템: CPF x2, EL4L x1, EL9L x2 (총 5종 matcode)
-- Supabase SQL Editor에서 실행

-- ============================================================
-- STEP 1: matcode_master 수정 (mat_code + matl_desc 동시 변경)
-- ============================================================

-- CPF DN15
UPDATE material.matcode_master
SET mat_code   = 'CPF-S04L-D005-C3K-SW',
    matl_desc  = 'A182-F304L'
WHERE mat_code = 'CPF-AS92-D005-C3K-SW';

-- CPF DN50
UPDATE material.matcode_master
SET mat_code   = 'CPF-S04L-D020-C3K-SW',
    matl_desc  = 'A182-F304L'
WHERE mat_code = 'CPF-AS92-D020-C3K-SW';

-- EL4L DN15
UPDATE material.matcode_master
SET mat_code   = 'EL4L-S04L-D005-C3K-SW',
    matl_desc  = 'A182-F304L'
WHERE mat_code = 'EL4L-AS92-D005-C3K-SW';

-- EL9L DN15
UPDATE material.matcode_master
SET mat_code   = 'EL9L-S04L-D005-C3K-SW',
    matl_desc  = 'A182-F304L'
WHERE mat_code = 'EL9L-AS92-D005-C3K-SW';

-- EL9L DN50
UPDATE material.matcode_master
SET mat_code   = 'EL9L-S04L-D020-C3K-SW',
    matl_desc  = 'A182-F304L'
WHERE mat_code = 'EL9L-AS92-D020-C3K-SW';

-- ============================================================
-- STEP 2: bom mat_code 수정 (AS92 → S04L)
-- ============================================================

UPDATE material.bom SET mat_code = 'CPF-S04L-D005-C3K-SW'  WHERE mat_code = 'CPF-AS92-D005-C3K-SW';
UPDATE material.bom SET mat_code = 'CPF-S04L-D020-C3K-SW'  WHERE mat_code = 'CPF-AS92-D020-C3K-SW';
UPDATE material.bom SET mat_code = 'EL4L-S04L-D005-C3K-SW' WHERE mat_code = 'EL4L-AS92-D005-C3K-SW';
UPDATE material.bom SET mat_code = 'EL9L-S04L-D005-C3K-SW' WHERE mat_code = 'EL9L-AS92-D005-C3K-SW';
UPDATE material.bom SET mat_code = 'EL9L-S04L-D020-C3K-SW' WHERE mat_code = 'EL9L-AS92-D020-C3K-SW';

-- ============================================================
-- STEP 3: bom full_description 수정 (A182-F92 → A182-F304L)
-- ============================================================

UPDATE material.bom
SET full_description = REPLACE(full_description, 'A182-F92', 'A182-F304L')
WHERE full_description LIKE '%A182-F92%';

-- ============================================================
-- STEP 4: receiving full_description 수정 (해당 항목 있을 경우 대비)
-- ============================================================

UPDATE material.receiving
SET full_description = REPLACE(full_description, 'A182-F92', 'A182-F304L')
WHERE full_description LIKE '%A182-F92%';

-- ============================================================
-- 검증 쿼리 (실행 후 결과 확인용)
-- ============================================================

-- 신규 matcode 5건 확인
SELECT mat_code, category, item_desc, matl_desc, size1, class_desc, et_desc
FROM material.matcode_master
WHERE mat_code LIKE '%-S04L-%'
ORDER BY mat_code;

-- bom A182-F92 잔존 여부 확인 (0건이어야 정상)
SELECT COUNT(*) AS remaining_f92
FROM material.bom
WHERE full_description LIKE '%A182-F92%'
   OR mat_code LIKE '%-AS92-%';
