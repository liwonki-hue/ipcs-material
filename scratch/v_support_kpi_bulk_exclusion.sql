-- v_support_kpi에서 Support Tag 없는 Bulk 항목(BULK/-/공란)을 제외하도록 수정 (2026-07-06 사용자가 Supabase SQL Editor에서 실행 완료)
-- 실행 전: total_bom=70491, total_received=32312 (45.8%)
-- 실행 후: total_bom=61618, total_received=23457 (38.1%)
CREATE OR REPLACE VIEW public.v_support_kpi AS
SELECT
    COALESCE(sum(qty), 0::bigint) AS total_bom,
    COALESCE(sum(
        CASE
            WHEN package_no IS NOT NULL THEN qty
            ELSE 0
        END), 0::bigint) AS total_received
FROM support_receiving
WHERE support_tag IS NOT NULL
  AND support_tag NOT IN ('BULK', '-');
