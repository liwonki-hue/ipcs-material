-- 신규 matcode_master 등록 SQL (TOTAL BOM 260420 기준)
-- Supabase SQL Editor에서 실행

INSERT INTO material.matcode_master (mat_code, category, item_desc, matl_desc, size1, size2, class_desc, et_desc)
VALUES
  ('FLN-SS16-D005-C300-RF', 'Fitting', 'FLANGE', 'A182-F316L', 'DN 15', 'DN 15', 'CL300 X S-40S', 'SWRF'),
  ('GSKT-SW316-D030', 'Others', 'GSKT', 'SW316', 'DN 80', 'DN 80', '', 'RF'),
  ('GSKT-SW316-D060', 'Others', 'GSKT', 'SW316', 'DN 150', 'DN 150', '', 'RF'),
  ('LAT-CS05-D060D010-C3K-BW', 'Fitting', 'LATROLET', 'A105', 'DN 150 x DN 25', 'DN 150 x DN 25', 'CL3000', 'SW'),
  ('LAT-CS05-D060D020-C3K-BW', 'Fitting', 'LATROLET', 'A105', 'DN 150 x DN 50', 'DN 150 x DN 50', 'CL3000', 'SW'),
  ('PIW-CSB6-D280-STD-BW', 'Pipe', 'PIPE WELDED', 'A672-B60-CL22', 'DN 700', 'DN 700', 'STD', 'BE'),
  ('SWC-SS16-D020D010-S40S-BW', 'Fitting', 'SWAGE-CON', 'A182-F316L', 'DN 50 x DN 25', 'DN 50 x DN 25', 'S-40S x S-40S', 'BLE X PSE'),
  ('SWE-SS16-D020D010-S40S-BW', 'Fitting', 'SWAGE-ECC', 'A182-F316L', 'DN 50 x DN 25', 'DN 50 x DN 25', 'S-40S x S-40S', 'BLE X PSE')
ON CONFLICT (mat_code) DO NOTHING;
