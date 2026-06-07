-- HP TBS D-TUBE category Pipe → Valve 수정
UPDATE material.bom
SET category = 'Valve'
WHERE tag = 'HP TBS D-TUBE'
  AND category = 'Pipe';

-- 검증
SELECT tag, category, system, full_description
FROM material.bom
WHERE tag = 'HP TBS D-TUBE';
