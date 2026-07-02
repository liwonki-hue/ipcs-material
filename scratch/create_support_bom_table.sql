-- support_bom 테이블 생성 (Support BOM.xlsx 기준, support_receiving과 동일한 형태 + PKG/Delivery 정보 제외)
CREATE TABLE IF NOT EXISTS public.support_bom (
    id           bigserial PRIMARY KEY,
    system       text,
    iso_dwg_no   text,
    support_tag  text,
    type         text,
    part_no      integer,
    id_no        text,
    item         text,
    matl         text,
    size_or_type text,
    length_mm    text,
    qty          integer
);

-- RLS 활성화 + 공개 읽기/쓰기 정책 (support_receiving과 동일한 정책)
ALTER TABLE public.support_bom ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access" ON public.support_bom
    FOR SELECT USING (true);

CREATE POLICY "Public insert access" ON public.support_bom
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Public delete access" ON public.support_bom
    FOR DELETE USING (true);
