-- support_tag가 없는 자재 삭제 (Spare & Bulk성 자재)

-- 1. 삭제 대상 확인
SELECT COUNT(*) AS target_count, category, item
FROM material.support_bom
WHERE support_tag IS NULL OR support_tag = ''
GROUP BY category, item
ORDER BY category, item;

-- 2. 삭제 실행 (확인 후 주석 해제)
-- DELETE FROM material.support_bom
-- WHERE support_tag IS NULL OR support_tag = '';
