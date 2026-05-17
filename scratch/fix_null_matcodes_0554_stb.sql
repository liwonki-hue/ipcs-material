-- 0554 STUD BOLT NULL matcode 27건 할당
-- PGU-DE-0554 receiving 중 STUD BOLT 항목 (id=911~936, 955~956)
-- 볼트 직경+길이 → ASME B16.5 + 프로젝트 BOM matcode 매핑
-- STB matcode L150은 실제 볼트 길이가 아닌 고정 suffix (D-code = 플랜지 관경)
-- Supabase SQL Editor에서 실행

-- ============================================================
-- B7 (A193-B7) 볼트 — STB-B700-Dxxx
-- ============================================================

-- 7/8" × 130L (qty=938): DN250~DN300 CL150 혼재 → D100 (DN250)
UPDATE material.receiving SET mat_code='STB-B700-D100' WHERE id=911;

-- 3/4" × 110L (qty=819): DN100 CL150 → D040
UPDATE material.receiving SET mat_code='STB-B700-D040' WHERE id=912;

-- 1000L 스페어 볼트 (qty=5 각): 해당 직경의 표준 플랜지 관경으로 할당
UPDATE material.receiving SET mat_code='STB-B700-D160' WHERE id=913;  -- 1-3/8" spare → DN400
UPDATE material.receiving SET mat_code='STB-B700-D200' WHERE id=914;  -- 1-1/8" spare → DN500
UPDATE material.receiving SET mat_code='STB-B700-D160' WHERE id=915;  -- 1" spare → DN400
UPDATE material.receiving SET mat_code='STB-B700-D100' WHERE id=916;  -- 7/8" spare → DN250
UPDATE material.receiving SET mat_code='STB-B700-D060' WHERE id=917;  -- 3/4" spare → DN150
UPDATE material.receiving SET mat_code='STB-B700-D040' WHERE id=918;  -- 5/8" spare → DN100
UPDATE material.receiving SET mat_code='STB-B700-D010' WHERE id=919;  -- 1/2" spare → DN25

-- 1-1/8" × 170L (qty=966): DN500 CL150 → D200
UPDATE material.receiving SET mat_code='STB-B700-D200' WHERE id=923;

-- 1" × 170L (qty=74): DN250 CL300 → D100
UPDATE material.receiving SET mat_code='STB-B700-D100' WHERE id=924;

-- 1-3/8" × 270L (qty=221): DN400 CL300 → D160
UPDATE material.receiving SET mat_code='STB-B700-D160' WHERE id=925;

-- 1" × 150L (qty=405): DN350~DN400 CL150 혼재 → D160 (DN400)
UPDATE material.receiving SET mat_code='STB-B700-D160' WHERE id=926;

-- 1/2" × 80L (qty=350): DN25 CL150 → D010
UPDATE material.receiving SET mat_code='STB-B700-D010' WHERE id=927;

-- 3/4" × 120L (qty=1233): DN150 CL150 → D060
UPDATE material.receiving SET mat_code='STB-B700-D060' WHERE id=928;

-- 3/4" × 130L (qty=221): DN200 CL150 → D080
UPDATE material.receiving SET mat_code='STB-B700-D080' WHERE id=929;

-- 3/4" × 140L (qty=74): DN150 CL300 → D060
UPDATE material.receiving SET mat_code='STB-B700-D060' WHERE id=931;

-- 7/8" × 120L (qty=55): DN200 CL300 (근사) → D080
UPDATE material.receiving SET mat_code='STB-B700-D080' WHERE id=932;

-- 5/8" × 100L (qty=1334): DN100 CL150 → D040
UPDATE material.receiving SET mat_code='STB-B700-D040' WHERE id=933;

-- 1" × 140L (qty=55): DN200 CL300 → D080
UPDATE material.receiving SET mat_code='STB-B700-D080' WHERE id=936;

-- ============================================================
-- B8 (A193-B8) 볼트 — STB-B800-Dxxx (SS 플랜지용)
-- ============================================================

UPDATE material.receiving SET mat_code='STB-B800-D060' WHERE id=920;  -- 3/4" 1000L spare → DN150
UPDATE material.receiving SET mat_code='STB-B800-D040' WHERE id=921;  -- 5/8" 1000L spare → DN100

-- 3/4" × 120L (qty=184): DN150 CL150 SS → D060
UPDATE material.receiving SET mat_code='STB-B800-D060' WHERE id=930;

-- 3/4" × 110L (qty=147): DN100 SS → D040
UPDATE material.receiving SET mat_code='STB-B800-D040' WHERE id=934;

-- 5/8" × 100L (qty=110): DN100 CL150 SS → D040
UPDATE material.receiving SET mat_code='STB-B800-D040' WHERE id=935;

-- ============================================================
-- B16 (A193-B16) 볼트 — STB-B160-Dxxx (CL1500 대구경)
-- ============================================================

-- 2-1/2" × 460L (qty=37): DN400 CL1500 → D160
UPDATE material.receiving SET mat_code='STB-B160-D160' WHERE id=955;

-- 2" × 390L (qty=74): DN300 CL1500 → D120
UPDATE material.receiving SET mat_code='STB-B160-D120' WHERE id=956;

-- ============================================================
-- 결과 확인
-- ============================================================
SELECT id, mat_code, full_description, qty
FROM material.receiving
WHERE id IN (
  911,912,913,914,915,916,917,918,919,920,921,
  923,924,925,926,927,928,929,930,931,932,933,934,935,936,
  955,956
)
ORDER BY id;
