-- bom_detail 뷰: BOM Management 탭 조회용 (tag 컬럼 포함)
-- Supabase SQL Editor에서 실행

CREATE OR REPLACE VIEW material.bom_detail AS
SELECT
    mat_code,
    category,
    tag,
    system,
    iso_dwg_no,
    line_no,
    full_description,
    uom,
    qty
FROM material.bom;

-- anon key로 조회 가능하도록 권한 부여
GRANT SELECT ON material.bom_detail TO anon;
