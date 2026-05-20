-- HS-023 ISO SB BOM 항목 재삽입 (delete_hs_ls_bom.sql로 잘못 삭제된 항목)
INSERT INTO material.bom (mat_code, category, tag, system, iso_dwg_no, line_no, full_description, uom, qty)
VALUES
(NULL, 'Fitting', NULL, 'HS', 'CCP-W-B126-PI-140-HS-023(1OF1)', '1"-HS-B1-26/023-BA1-PP', 'ELBOW LR 90D, A182-F91, 1", CL3000, SW', 'EA', 5.0),
(NULL, 'Pipe', NULL, 'HS', 'CCP-W-B126-PI-140-HS-023(1OF1)', '1"-HS-B1-26/023-BA1-PP', 'PIPE SMLS, A335-P91, 1", S-80, PE', 'M', 9.0026),
(NULL, 'Fitting', NULL, 'HS', 'CCP-W-B226-PI-140-HS-023(1OF1)', '1"-HS-B2-26/023-BA1-PP', 'ELBOW LR 90D, A182-F91, 1", CL3000, SW', 'EA', 5.0),
(NULL, 'Pipe', NULL, 'HS', 'CCP-W-B226-PI-140-HS-023(1OF1)', '1"-HS-B2-26/023-BA1-PP', 'PIPE SMLS, A335-P91, 1", S-80, PE', 'M', 7.1729);

SELECT COUNT(*) AS bom_total FROM material.bom;