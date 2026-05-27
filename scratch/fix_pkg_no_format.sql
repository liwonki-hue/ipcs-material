-- receiving 테이블 pkg_no 형식 수정
-- 1) 0503: PIP-0010 → PIP-010 (4자리 → 3자리, 앞 0 제거)
-- 2) 0574: BOP-FDR → BOP-FRD (철자 오류 수정)

-- 1. 0503 형식 수정 (PIP-0NNN → PIP-NNN)
UPDATE material.receiving
SET pkg_no = regexp_replace(pkg_no, 'BOP-PIP-0(\d{3})$', 'BOP-PIP-\1')
WHERE pkg_no LIKE 'PGU-DE-0503-BOP-PIP-0%';

-- 2. 0574 FDR → FRD 수정
UPDATE material.receiving
SET pkg_no = replace(pkg_no, 'BOP-FDR-', 'BOP-FRD-')
WHERE pkg_no LIKE 'PGU-DE-0574-BOP-FDR-%';

-- 검증
SELECT pkg_no, COUNT(*) AS cnt, SUM(qty) AS total_qty, MIN(unit) AS unit
FROM material.receiving
WHERE pkg_no LIKE 'PGU-DE-0503-BOP-PIP-%'
   OR pkg_no LIKE 'PGU-DE-0574-BOP-FRD-%'
GROUP BY pkg_no
ORDER BY pkg_no;
