-- material.support_bom 테이블 생성 + anon key READ 권한 부여
CREATE TABLE IF NOT EXISTS material.support_bom (
    id          bigserial PRIMARY KEY,
    category    text,
    system      text,
    iso_dwg_no  text,
    support_tag text,
    part_no     text,
    id_no       text,
    item        text,
    matl        text,
    size_or_type text,
    length_mm   text,
    qty         numeric,
    created_at  timestamptz DEFAULT now()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_support_bom_system      ON material.support_bom(system);
CREATE INDEX IF NOT EXISTS idx_support_bom_iso_dwg_no  ON material.support_bom(iso_dwg_no);
CREATE INDEX IF NOT EXISTS idx_support_bom_support_tag ON material.support_bom(support_tag);

-- anon 사용자에게 SELECT 권한 부여 (anon key로 읽기 가능)
GRANT SELECT ON material.support_bom TO anon;
