-- PSV receiving records matcode 할당
-- 규칙: Description "inlet X outlet" → outlet 사이즈 기준 D-code
-- 예: "1" X 2"" → outlet 2" → D020 → PSV-CS05-D020-C150-RF

-- ── STEP 1: 현황 확인 ─────────────────────────────────────────────────────
SELECT
    id,
    tag,
    full_description,
    mat_code,
    pkg_no
FROM material.receiving
WHERE (full_description ILIKE '%Safety Valve%' OR tag ILIKE '%PSV%' OR tag ILIKE '%PRV%')
  AND (mat_code IS NULL OR mat_code = '')
ORDER BY tag;

-- ── STEP 2: outlet 사이즈별 업데이트 ──────────────────────────────────────

-- outlet 2" (1" X 2", 1.5" X 2")
UPDATE material.receiving
SET mat_code = 'PSV-CS05-D020-C150-RF'
WHERE (full_description ILIKE '%Safety Valve%' OR tag ILIKE '%PSV%')
  AND (mat_code IS NULL OR mat_code = '')
  AND full_description ~* 'x\s*2"';

-- outlet 6" (4" X 6")
UPDATE material.receiving
SET mat_code = 'PSV-CS05-D060-C150-RF'
WHERE (full_description ILIKE '%Safety Valve%' OR tag ILIKE '%PSV%')
  AND (mat_code IS NULL OR mat_code = '')
  AND full_description ~* 'x\s*6"';

-- outlet 8" (6" X 8")
UPDATE material.receiving
SET mat_code = 'PSV-CS05-D080-C150-RF'
WHERE (full_description ILIKE '%Safety Valve%' OR tag ILIKE '%PSV%')
  AND (mat_code IS NULL OR mat_code = '')
  AND full_description ~* 'x\s*8"';

-- ── STEP 3: 결과 검증 ─────────────────────────────────────────────────────
SELECT
    mat_code,
    COUNT(*) AS cnt,
    array_agg(DISTINCT tag ORDER BY tag) AS tags
FROM material.receiving
WHERE full_description ILIKE '%Safety Valve%' OR tag ILIKE '%PSV%'
GROUP BY mat_code
ORDER BY mat_code;
