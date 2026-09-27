-- v_iso_stage_status 재정의 전 원본(2026-09-27)
CREATE OR REPLACE VIEW public.v_iso_stage_status AS
 WITH rec_agg AS (
         SELECT receiving.mat_code,
            sum(receiving.qty) AS total_rec
           FROM receiving
          GROUP BY receiving.mat_code
        ), bom_scored AS (
         SELECT b.iso_dwg_no,
            b.system,
            b.mat_code,
            b.qty,
                CASE
                    WHEN COALESCE(b.category, ''::text) = ANY (ARRAY['Pipe'::text, 'Fitting'::text]) THEN true
                    WHEN b.mat_code ~~ 'PIS-%'::text OR b.mat_code ~~ 'PIP-%'::text THEN true
                    WHEN b.mat_code ~~ 'ELB-%'::text OR b.mat_code ~~ 'TEE-%'::text OR b.mat_code ~~ 'RED-%'::text OR b.mat_code ~~ 'CAP-%'::text OR b.mat_code ~~ 'FLN-%'::text OR b.mat_code ~~ 'GSKT-%'::text THEN true
                    WHEN upper(COALESCE(b.full_description, ''::text)) ~~ '%PIPE%'::text OR upper(COALESCE(b.full_description, ''::text)) ~~ '%TUBE%'::text THEN true
                    WHEN upper(COALESCE(b.full_description, ''::text)) ~~ '%ELBOW%'::text OR upper(COALESCE(b.full_description, ''::text)) ~~ '%FLANGE%'::text OR upper(COALESCE(b.full_description, ''::text)) ~~ '%REDUCER%'::text OR upper(COALESCE(b.full_description, ''::text)) ~~ '%OLET%'::text OR upper(COALESCE(b.full_description, ''::text)) ~~ '%TEE%'::text THEN true
                    ELSE false
                END AS is_spool_mat,
            LEAST(COALESCE(r.total_rec, 0::numeric), b.qty) AS rec_qty
           FROM bom b
             LEFT JOIN rec_agg r ON b.mat_code = r.mat_code
          WHERE b.iso_dwg_no IS NOT NULL
        )
 SELECT iso_dwg_no,
    system,
    sum(qty) AS total_bom_qty,
    sum(rec_qty) AS total_rec_qty,
        CASE
            WHEN sum(
            CASE
                WHEN is_spool_mat THEN qty
                ELSE 0::numeric
            END) > 0::numeric THEN round(sum(
            CASE
                WHEN is_spool_mat THEN rec_qty
                ELSE 0::numeric
            END) / sum(
            CASE
                WHEN is_spool_mat THEN qty
                ELSE 0::numeric
            END) * 100::numeric, 1)
            ELSE 0::numeric
        END AS spool_score,
        CASE
            WHEN sum(qty) > 0::numeric THEN round(sum(rec_qty) / sum(qty) * 100::numeric, 1)
            ELSE 0::numeric
        END AS field_score
   FROM bom_scored
  GROUP BY iso_dwg_no, system;
