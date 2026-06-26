-- support_receiving 테이블 생성 (CRITICAL BOP SUPPLY LIST 기준)
CREATE TABLE IF NOT EXISTS public.support_receiving (
    id          bigserial PRIMARY KEY,
    system      text,
    iso_dwg_no  text,
    support_tag text,
    type        text,
    part_no     integer,
    id_no       text,
    item        text,
    matl        text,
    size_or_type text,
    length_mm   text,
    qty         integer
);

-- RLS 활성화 + 공개 읽기 정책
ALTER TABLE public.support_receiving ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access" ON public.support_receiving
    FOR SELECT USING (true);

CREATE POLICY "Public insert access" ON public.support_receiving
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Public delete access" ON public.support_receiving
    FOR DELETE USING (true);
