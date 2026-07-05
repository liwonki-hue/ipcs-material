-- receiving 테이블에 DELETE RLS 정책이 없어 anon key로 DELETE가 0행 적용되는 문제 해결
-- (Valve 재적재 중 발견: 기존 3,629행 삭제 시도가 200/204를 반환했지만 실제로는 0행 삭제됨)
CREATE POLICY "Public delete access" ON public.receiving
    FOR DELETE USING (true);
