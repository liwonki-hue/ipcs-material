-- HP TBS D-TUBE BOM 태그 수정
-- BOM: HP TBS D-TUBE-1/2/3/4 → HP TBS D-TUBE (receiving과 일치)

UPDATE material.bom
SET tag = 'HP TBS D-TUBE'
WHERE tag IN ('HP TBS D-TUBE-1', 'HP TBS D-TUBE-2', 'HP TBS D-TUBE-3', 'HP TBS D-TUBE-4');

-- 검증
SELECT tag, system, full_description
FROM material.bom
WHERE tag = 'HP TBS D-TUBE'
ORDER BY full_description;
