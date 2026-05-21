-- TRANSITION PIECE BOM matcode 할당 SQL
-- Receiving의 기존 TR-CS05 코드와 매칭
-- Supabase SQL Editor에서 실행

-- TR-CS05-D220-S30-BW: DN 550, STD x S-30 (ATM, 2건)
UPDATE material.bom
SET mat_code = 'TR-CS05-D220-S30-BW'
WHERE mat_code IS NULL
  AND (
    (system = 'ATM' AND iso_dwg_no = 'CCP-W-B133-PI-140-AV-501(1OF2)' AND line_no = '22"-AV-B1-33/501-GB1-PP' AND full_description = 'TRANSITION PIECE, A106-B, DN 550, STD x S-30, BW')
    OR (system = 'ATM' AND iso_dwg_no = 'CCP-W-B233-PI-140-AV-501(1OF2)' AND line_no = '22"-AV-B2-33/501-GB1-PP' AND full_description = 'TRANSITION PIECE, A106-B, DN 550, STD x S-30, BW')
  );

-- TR-CS05-D060-S80-BW: DN 150, S-40 x S-80 (ATM, 4건)
UPDATE material.bom
SET mat_code = 'TR-CS05-D060-S80-BW'
WHERE mat_code IS NULL
  AND (
    (system = 'ATM' AND iso_dwg_no = 'CCP-W-B133-PI-140-ST-402(1OF1)' AND line_no = '6"-ST-B1-33/402-GB1-PP' AND full_description = 'TRANSITION PIECE, A106-B, DN 150, S-40 x S-80, BW')
    OR (system = 'ATM' AND iso_dwg_no = 'CCP-W-B133-PI-140-ST-403(1OF1)' AND line_no = '6"-ST-B1-33/403-FB1-PP' AND full_description = 'TRANSITION PIECE, A106-B, DN 150, S-40 x S-80, BW')
    OR (system = 'ATM' AND iso_dwg_no = 'CCP-W-B233-PI-140-ST-402(1OF1)' AND line_no = '6"-ST-B2-33/402-GB1-PP' AND full_description = 'TRANSITION PIECE, A106-B, DN 150, S-40 x S-80, BW')
    OR (system = 'ATM' AND iso_dwg_no = 'CCP-W-B233-PI-140-ST-403(1OF1)' AND line_no = '6"-ST-B2-33/403-FB1-PP' AND full_description = 'TRANSITION PIECE, A106-B, DN 150, S-40 x S-80, BW')
  );

-- TR-CS05-D040-S120-BW: DN 100, S-40 x S-120 (HW, 2건)
UPDATE material.bom
SET mat_code = 'TR-CS05-D040-S120-BW'
WHERE mat_code IS NULL
  AND (
    (system = 'HW' AND iso_dwg_no = 'CCP-W-B134-PI-140-ST-035(2OF2)' AND line_no = '4"-ST-B1-34/035-GB1-PP' AND full_description = 'TRANSITION PIECE, A106-B, DN 100, S-40 x S-120, BW')
    OR (system = 'HW' AND iso_dwg_no = 'CCP-W-B234-PI-140-ST-035(3OF3)' AND line_no = '4"-ST-B2-34/035-GB1-PP' AND full_description = 'TRANSITION PIECE, A106-B, DN 100, S-40 x S-120, BW')
  );
