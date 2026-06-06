-- BOM Safety Valve Tag 수정 SQL
-- 생성: fix_sv_bom_tags.py

-- Fix 1: PSV-301193 → PSV-31193
UPDATE material.bom SET tag = REPLACE(tag, 'PSV-301193', 'PSV-31193')
WHERE tag LIKE '%PSV-301193%';

-- Fix 2: PSVnnnn → PSV-nnnn (대시 누락)
UPDATE material.bom
SET tag = REGEXP_REPLACE(tag, 'PSV([0-9])', 'PSV-\1', 'g')
WHERE tag ~ 'PSV[0-9]';

-- 검증: 수정 후 태그 확인
SELECT DISTINCT tag FROM material.bom
WHERE tag ILIKE '%PSV%'
ORDER BY tag;