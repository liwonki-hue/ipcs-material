# v_iso_stage_status를 입고량 배분 방식(시공 우선순위 System → ISO 순)으로 재정의 — 기존 정의는 백업 파일로 남김
import sys
import psycopg2

NEW_VIEW = r"""
CREATE OR REPLACE VIEW public.v_iso_stage_status AS
WITH active_rec AS (
    -- 입고 집계 공용 기준(app.js isCountableReceiving)과 동일: 현장 도착 PKG + Temporary 제외
    SELECT r.mat_code, r.tag, r.qty
    FROM receiving r
    LEFT JOIN pl_updates p ON p.pkg_no = r.pkg_no
    WHERE COALESCE(p.status, '') NOT IN ('Preparing', 'Shipping')
      AND COALESCE(r.purpose, '') <> 'Temporary'
), rec_agg AS (
    SELECT upper(trim(mat_code)) AS mat_code, sum(qty) AS total_rec
    FROM active_rec WHERE mat_code IS NOT NULL AND trim(mat_code) <> ''
    GROUP BY 1
), rec_tag AS (
    SELECT DISTINCT upper(trim(tag)) AS tag
    FROM active_rec WHERE (mat_code IS NULL OR trim(mat_code) = '') AND tag IS NOT NULL
), bom_ranked AS (
    SELECT b.ctid AS rid, b.iso_dwg_no, b.system, b.mat_code, b.tag, b.category, b.full_description, b.qty,
        -- 시공 우선순위(app.js SYSTEM_PRIORITY): CCW → RW → SW → FG → HW → AS → FO, 나머지 동순위
        CASE upper(trim(b.system))
            WHEN 'CCW' THEN 0 WHEN 'RW' THEN 1 WHEN 'SW' THEN 2 WHEN 'FG' THEN 3
            WHEN 'HW' THEN 4 WHEN 'AS' THEN 5 WHEN 'FO' THEN 6 ELSE 7 END AS sys_rank
    FROM bom b
    WHERE b.iso_dwg_no IS NOT NULL AND b.iso_dwg_no <> ''
), bom_alloc AS (
    -- 같은 mat_code를 쓰는 ISO들이 우선순위 순으로 입고량을 앞에서부터 나눠 가짐(ISO마다 중복 인정 안 함)
    SELECT br.*,
        COALESCE(sum(br.qty) OVER (PARTITION BY upper(trim(br.mat_code))
            ORDER BY br.sys_rank, br.iso_dwg_no, br.rid ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS prior_qty
    FROM bom_ranked br
    WHERE br.mat_code IS NOT NULL AND trim(br.mat_code) <> ''
), bom_scored AS (
    SELECT a.iso_dwg_no, a.system, a.qty, a.category, a.mat_code, a.full_description,
        GREATEST(0::numeric, LEAST(a.qty, COALESCE(r.total_rec, 0) - a.prior_qty)) AS rec_qty
    FROM bom_alloc a LEFT JOIN rec_agg r ON r.mat_code = upper(trim(a.mat_code))
    UNION ALL
    -- Valve/Speciality(mat_code 없음)는 Tag 입고 여부로 판정
    SELECT br.iso_dwg_no, br.system, br.qty, br.category, br.mat_code, br.full_description,
        CASE WHEN t.tag IS NOT NULL THEN br.qty ELSE 0 END
    FROM bom_ranked br LEFT JOIN rec_tag t ON t.tag = upper(trim(br.tag))
    WHERE br.mat_code IS NULL OR trim(br.mat_code) = ''
), flagged AS (
    SELECT s.*,
        CASE
            WHEN COALESCE(s.category, '') = ANY (ARRAY['Pipe', 'Fitting']) THEN true
            WHEN s.mat_code LIKE 'PIS-%' OR s.mat_code LIKE 'PIP-%' THEN true
            WHEN s.mat_code LIKE 'ELB-%' OR s.mat_code LIKE 'TEE-%' OR s.mat_code LIKE 'RED-%' OR s.mat_code LIKE 'CAP-%' OR s.mat_code LIKE 'FLN-%' OR s.mat_code LIKE 'GSKT-%' THEN true
            WHEN upper(COALESCE(s.full_description, '')) LIKE '%PIPE%' OR upper(COALESCE(s.full_description, '')) LIKE '%TUBE%' THEN true
            WHEN upper(COALESCE(s.full_description, '')) LIKE '%ELBOW%' OR upper(COALESCE(s.full_description, '')) LIKE '%FLANGE%' OR upper(COALESCE(s.full_description, '')) LIKE '%REDUCER%' OR upper(COALESCE(s.full_description, '')) LIKE '%OLET%' OR upper(COALESCE(s.full_description, '')) LIKE '%TEE%' THEN true
            ELSE false
        END AS is_spool_mat
    FROM bom_scored s
)
SELECT iso_dwg_no, system,
    sum(qty) AS total_bom_qty,
    sum(rec_qty) AS total_rec_qty,
    CASE WHEN sum(CASE WHEN is_spool_mat THEN qty ELSE 0 END) > 0
        THEN round(sum(CASE WHEN is_spool_mat THEN rec_qty ELSE 0 END) / sum(CASE WHEN is_spool_mat THEN qty ELSE 0 END) * 100, 1)
        ELSE 0::numeric END AS spool_score,
    CASE WHEN sum(qty) > 0 THEN round(sum(rec_qty) / sum(qty) * 100, 1) ELSE 0::numeric END AS field_score
FROM flagged
GROUP BY iso_dwg_no, system;
"""

STAGE_SQL = """
select count(*) filter (where field_score >= 100) erection_ready,
       count(*) filter (where field_score < 100 and spool_score >= 100) spool_ready,
       count(*) filter (where field_score < 100 and spool_score < 100 and spool_score >= 50) spool_in_prog,
       count(*) filter (where field_score < 100 and spool_score < 50) critical,
       count(*) total
from v_iso_stage_status
"""

url = [l.split('=', 1)[1].strip() for l in open('.env', encoding='utf-8') if l.startswith('SUPABASE_DB_URL')][0]
conn = psycopg2.connect(url)
cur = conn.cursor()
cur.execute("select pg_get_viewdef('v_iso_stage_status'::regclass, true)")
old_def = cur.fetchone()[0]
open('scratch/BACKUP_v_iso_stage_status_20260927.sql', 'w', encoding='utf-8').write(
    '-- v_iso_stage_status 재정의 전 원본(2026-09-27)\nCREATE OR REPLACE VIEW public.v_iso_stage_status AS\n' + old_def + '\n')
cur.execute(STAGE_SQL)
print('before', cur.fetchone())
cur.execute(NEW_VIEW)
cur.execute(STAGE_SQL)
print('after ', cur.fetchone())
if '--commit' in sys.argv:
    cur.execute("notify pgrst, 'reload schema'")
    conn.commit()
    print('committed')
else:
    conn.rollback()
    print('dry-run (rolled back)')
