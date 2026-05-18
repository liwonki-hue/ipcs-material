-- bom 테이블에서 mat_code별 full_description 1건을 반환하는 뷰
-- Material Shortage 탭의 Full Description 표시용
-- Supabase SQL Editor에서 실행

CREATE OR REPLACE VIEW material.bom_desc AS
SELECT mat_code, MIN(full_description) AS full_description
FROM material.bom
WHERE full_description IS NOT NULL AND full_description <> ''
GROUP BY mat_code;

-- anon key로 조회 가능하도록 권한 부여
GRANT SELECT ON material.bom_desc TO anon;
