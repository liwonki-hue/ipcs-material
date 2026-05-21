-- NULL matcode BOM 행 수정 SQL (A182-F92 오타 + 비표준 각도 엘보)
-- Supabase SQL Editor에서 실행

-- Step 1: 신규 matcode_master 등록
INSERT INTO material.matcode_master
  (mat_code, category, item_desc, matl_desc, size1, size2, class_desc, et_desc)
VALUES
  ('CPF-AS92-D005-C3K-SW', 'Fitting', 'COUPLING-FULL', 'A182-F92', 'DN 15', 'DN 15', 'CL3000', 'SW'),
  ('CPF-AS92-D020-C3K-SW', 'Fitting', 'COUPLING-FULL', 'A182-F92', 'DN 50', 'DN 50', 'CL3000', 'SW'),
  ('EL4L-AS92-D005-C3K-SW', 'Fitting', 'ELBOW 45D', 'A182-F92', 'DN 15', 'DN 15', 'CL3000', 'SW'),
  ('EL9L-AS92-D005-C3K-SW', 'Fitting', 'ELBOW LR 90D', 'A182-F92', 'DN 15', 'DN 15', 'CL3000', 'SW'),
  ('EL9L-AS92-D020-C3K-SW', 'Fitting', 'ELBOW LR 90D', 'A182-F92', 'DN 50', 'DN 50', 'CL3000', 'SW')
ON CONFLICT (mat_code) DO NOTHING;

-- Step 2: bom 행 UPDATE
-- CPF-AS92-D005-C3K-SW (4건)
UPDATE material.bom
SET mat_code = 'CPF-AS92-D005-C3K-SW'
WHERE mat_code IS NULL
  AND (
  (system = 'GT MISC' AND iso_dwg_no = 'CCP-W-B111-PI-140-CD-005(1OF1)' AND line_no = '0.5"-CD-B1-11/005-GL1-NR' AND full_description = 'COUPLING-FULL, A182-F92, DN 15, CL3000, SW')
  OR   (system = 'GT MISC' AND iso_dwg_no = 'CCP-W-B112-PI-140-CD-005(1OF1)' AND line_no = '0.5"-CD-B1-12/005-GL1-NR' AND full_description = 'COUPLING-FULL, A182-F92, DN 15, CL3000, SW')
  OR   (system = 'GT MISC' AND iso_dwg_no = 'CCP-W-B221-PI-140-CD-005(1OF1)' AND line_no = '0.5"-CD-B2-21/005-GL1-NR' AND full_description = 'COUPLING-FULL, A182-F92, DN 15, CL3000, SW')
  OR   (system = 'GT MISC' AND iso_dwg_no = 'CCP-W-B222-PI-140-CD-005(1OF1)' AND line_no = '0.5"-CD-B2-22/005-GL1-NR' AND full_description = 'COUPLING-FULL, A182-F92, DN 15, CL3000, SW')
  );

-- CPF-AS92-D020-C3K-SW (4건)
UPDATE material.bom
SET mat_code = 'CPF-AS92-D020-C3K-SW'
WHERE mat_code IS NULL
  AND (
  (system = 'GT MISC' AND iso_dwg_no = 'CCP-W-B111-PI-140-CD-002(1OF1)' AND line_no = '2"-CD-B1-11/002-GL1-NR' AND full_description = 'COUPLING-FULL, A182-F92, DN 50, CL3000, SW')
  OR   (system = 'GT MISC' AND iso_dwg_no = 'CCP-W-B112-PI-140-CD-002(1OF1)' AND line_no = '2"-CD-B1-12/002-GL1-NR' AND full_description = 'COUPLING-FULL, A182-F92, DN 50, CL3000, SW')
  OR   (system = 'GT MISC' AND iso_dwg_no = 'CCP-W-B221-PI-140-CD-002(1OF1)' AND line_no = '2"-CD-B2-21/002-GL1-NR' AND full_description = 'COUPLING-FULL, A182-F92, DN 50, CL3000, SW')
  OR   (system = 'GT MISC' AND iso_dwg_no = 'CCP-W-B222-PI-140-CD-002(1OF1)' AND line_no = '2"-CD-B2-22/002-GL1-NR' AND full_description = 'COUPLING-FULL, A182-F92, DN 50, CL3000, SW')
  );

-- EL4L-AS92-D005-C3K-SW (4건)
UPDATE material.bom
SET mat_code = 'EL4L-AS92-D005-C3K-SW'
WHERE mat_code IS NULL
  AND (
  (system = 'GT MISC' AND iso_dwg_no = 'CCP-W-B111-PI-140-CD-005(1OF1)' AND line_no = '0.5"-CD-B1-11/005-GL1-NR' AND full_description = 'ELBOW 45D, A182-F92, DN 15, CL3000, SW')
  OR   (system = 'GT MISC' AND iso_dwg_no = 'CCP-W-B112-PI-140-CD-005(1OF1)' AND line_no = '0.5"-CD-B1-12/005-GL1-NR' AND full_description = 'ELBOW 45D, A182-F92, DN 15, CL3000, SW')
  OR   (system = 'GT MISC' AND iso_dwg_no = 'CCP-W-B221-PI-140-CD-005(1OF1)' AND line_no = '0.5"-CD-B2-21/005-GL1-NR' AND full_description = 'ELBOW 45D, A182-F92, DN 15, CL3000, SW')
  OR   (system = 'GT MISC' AND iso_dwg_no = 'CCP-W-B222-PI-140-CD-005(1OF1)' AND line_no = '0.5"-CD-B2-22/005-GL1-NR' AND full_description = 'ELBOW 45D, A182-F92, DN 15, CL3000, SW')
  );

-- EL4L-CS05-D080-S40-BW (2건)
UPDATE material.bom
SET mat_code = 'EL4L-CS05-D080-S40-BW'
WHERE mat_code IS NULL
  AND (
  (system = 'RW' AND iso_dwg_no = 'CCP-W-B038-PI-140-RW-039(1OF1)' AND line_no = '8"-RW-B0-38/039-GB1-HT' AND full_description = 'ELBOW 30D, A234-WPB, DN 200, S-40, BW')
  OR   (system = 'RW' AND iso_dwg_no = 'CCP-W-B038-PI-140-RW-041(1OF1)' AND line_no = '8"-RW-B0-38/041-GB1-HT' AND full_description = 'ELBOW 30D, A234-WPB, DN 200, S-40, BW')
  );

-- EL4L-SS04-D040-S10S-BW (2건)
UPDATE material.bom
SET mat_code = 'EL4L-SS04-D040-S10S-BW'
WHERE mat_code IS NULL
  AND (
  (system = 'PW' AND iso_dwg_no = 'CCP-W-B037-PI-140-PW-106(1OF1)' AND line_no = '4"-PW-B0-37/106-GK1-HT' AND full_description = 'ELBOW 30D, A403-WP304, DN 100, S-10S, BW')
  OR   (system = 'PW' AND iso_dwg_no = 'CCP-W-B037-PI-140-PW-107(1OF1)' AND line_no = '4"-PW-B0-37/107-GK1-HT' AND full_description = 'ELBOW 30D, A403-WP304, DN 100, S-10S, BW')
  );

-- EL4L-SS04-D100-S10S-BW (2건)
UPDATE material.bom
SET mat_code = 'EL4L-SS04-D100-S10S-BW'
WHERE mat_code IS NULL
  AND (
  (system = 'PW' AND iso_dwg_no = 'CCP-W-B037-PI-140-PW-004(1OF1)' AND line_no = '10"-PW-B0-37/004-GK1-HT' AND full_description = 'ELBOW 30D, A403-WP304W, DN 250, S-10S, BW')
  OR   (system = 'PW' AND iso_dwg_no = 'CCP-W-B037-PI-140-PW-005(1OF1)' AND line_no = '10"-PW-B0-37/005-GK1-HT' AND full_description = 'ELBOW 30D, A403-WP304W, DN 250, S-10S, BW')
  );

-- EL9L-AS92-D005-C3K-SW (4건)
UPDATE material.bom
SET mat_code = 'EL9L-AS92-D005-C3K-SW'
WHERE mat_code IS NULL
  AND (
  (system = 'GT MISC' AND iso_dwg_no = 'CCP-W-B111-PI-140-CD-005(1OF1)' AND line_no = '0.5"-CD-B1-11/005-GL1-NR' AND full_description = 'ELBOW LR 90D, A182-F92, DN 15, CL3000, SW')
  OR   (system = 'GT MISC' AND iso_dwg_no = 'CCP-W-B112-PI-140-CD-005(1OF1)' AND line_no = '0.5"-CD-B1-12/005-GL1-NR' AND full_description = 'ELBOW LR 90D, A182-F92, DN 15, CL3000, SW')
  OR   (system = 'GT MISC' AND iso_dwg_no = 'CCP-W-B221-PI-140-CD-005(1OF1)' AND line_no = '0.5"-CD-B2-21/005-GL1-NR' AND full_description = 'ELBOW LR 90D, A182-F92, DN 15, CL3000, SW')
  OR   (system = 'GT MISC' AND iso_dwg_no = 'CCP-W-B222-PI-140-CD-005(1OF1)' AND line_no = '0.5"-CD-B2-22/005-GL1-NR' AND full_description = 'ELBOW LR 90D, A182-F92, DN 15, CL3000, SW')
  );

-- EL9L-AS92-D020-C3K-SW (4건)
UPDATE material.bom
SET mat_code = 'EL9L-AS92-D020-C3K-SW'
WHERE mat_code IS NULL
  AND (
  (system = 'GT MISC' AND iso_dwg_no = 'CCP-W-B111-PI-140-CD-002(1OF1)' AND line_no = '2"-CD-B1-11/002-GL1-NR' AND full_description = 'ELBOW LR 90D, A182-F92, DN 50, CL3000, SW')
  OR   (system = 'GT MISC' AND iso_dwg_no = 'CCP-W-B112-PI-140-CD-002(1OF1)' AND line_no = '2"-CD-B1-12/002-GL1-NR' AND full_description = 'ELBOW LR 90D, A182-F92, DN 50, CL3000, SW')
  OR   (system = 'GT MISC' AND iso_dwg_no = 'CCP-W-B221-PI-140-CD-002(1OF1)' AND line_no = '2"-CD-B2-21/002-GL1-NR' AND full_description = 'ELBOW LR 90D, A182-F92, DN 50, CL3000, SW')
  OR   (system = 'GT MISC' AND iso_dwg_no = 'CCP-W-B222-PI-140-CD-002(1OF1)' AND line_no = '2"-CD-B2-22/002-GL1-NR' AND full_description = 'ELBOW LR 90D, A182-F92, DN 50, CL3000, SW')
  );

-- EL9L-CS05-D040-S40-BW (2건)
UPDATE material.bom
SET mat_code = 'EL9L-CS05-D040-S40-BW'
WHERE mat_code IS NULL
  AND (
  (system = 'RW' AND iso_dwg_no = 'CCP-W-B038-PI-140-RW-038(1OF1)' AND line_no = '4"-RW-B0-38/038-GB1-HT' AND full_description = 'ELBOW LR 72D, A234-WPB, DN 100, S-40, BW')
  OR   (system = 'RW' AND iso_dwg_no = 'CCP-W-B038-PI-140-RW-040(1OF1)' AND line_no = '4"-RW-B0-38/040-GB1-HT' AND full_description = 'ELBOW LR 72D, A234-WPB, DN 100, S-40, BW')
  );

-- EL9L-SS04-D040-S10S-BW (1건)
UPDATE material.bom
SET mat_code = 'EL9L-SS04-D040-S10S-BW'
WHERE mat_code IS NULL
  AND (
  (system = 'PW' AND iso_dwg_no = 'CCP-W-B037-PI-140-PW-110(1OF1)' AND line_no = '4"-PW-B0-37/110-GK1-HT' AND full_description = 'ELBOW LR 55D, A403-WP304, DN 100, S-10S, BW')
  );

-- EL9S-SS04-D040-S10S-BW (1건)
UPDATE material.bom
SET mat_code = 'EL9S-SS04-D040-S10S-BW'
WHERE mat_code IS NULL
  AND (
  (system = 'PW' AND iso_dwg_no = 'CCP-W-B037-PI-140-PW-109(1OF1)' AND line_no = '4"-PW-B0-37/109-GK1-HT' AND full_description = 'ELBOW SR 55D, A403-WP304, DN 100, S-10S, BW')
  );

