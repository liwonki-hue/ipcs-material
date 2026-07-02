-- receiving 테이블에 UPDATE RLS 정책이 없어 anon key로 PATCH가 0행 적용되는 문제 해결
CREATE POLICY "Public update access" ON public.receiving
    FOR UPDATE USING (true) WITH CHECK (true);
