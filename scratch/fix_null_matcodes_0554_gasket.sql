-- 0554 GASKET NULL matcode 18건 할당
-- PGU-DE-0554 receiving 중 GASKET 항목 (id=937~954)
-- DN size → D-code (NPS×10) 변환, SUS304/SUS316 재질 확인
-- Supabase SQL Editor에서 실행

UPDATE material.receiving SET mat_code='GSKT-SW304-D080' WHERE id=937;  -- DN200 SUS304
UPDATE material.receiving SET mat_code='GSKT-SW304-D040' WHERE id=938;  -- DN100 SUS304
UPDATE material.receiving SET mat_code='GSKT-SW304-D080' WHERE id=939;  -- DN200 SUS304
UPDATE material.receiving SET mat_code='GSKT-SW304-D010' WHERE id=940;  -- DN25  SUS304
UPDATE material.receiving SET mat_code='GSKT-SW304-D100' WHERE id=941;  -- DN250 SUS304
UPDATE material.receiving SET mat_code='GSKT-SW304-D120' WHERE id=942;  -- DN300 SUS304
UPDATE material.receiving SET mat_code='GSKT-SW304-D160' WHERE id=943;  -- DN400 SUS304
UPDATE material.receiving SET mat_code='GSKT-SW304-D030' WHERE id=944;  -- DN80  SUS304
UPDATE material.receiving SET mat_code='GSKT-SW304-D060' WHERE id=945;  -- DN150 SUS304
UPDATE material.receiving SET mat_code='GSKT-SW304-D030' WHERE id=946;  -- DN80  SUS304 CL600
UPDATE material.receiving SET mat_code='GSKT-SW304-D060' WHERE id=947;  -- DN150 SUS304 CL300
UPDATE material.receiving SET mat_code='GSKT-SW316-D160' WHERE id=948;  -- DN400 SUS316 CL1500
UPDATE material.receiving SET mat_code='GSKT-SW316-D120' WHERE id=949;  -- DN300 SUS316 CL1500
UPDATE material.receiving SET mat_code='GSKT-SW304-D060' WHERE id=950;  -- DN150 SUS304 CL1500
UPDATE material.receiving SET mat_code='GSKT-SW304-D140' WHERE id=951;  -- DN350 SUS304
UPDATE material.receiving SET mat_code='GSKT-SW304-D050' WHERE id=952;  -- DN125 SUS304
UPDATE material.receiving SET mat_code='GSKT-SW304-D200' WHERE id=953;  -- DN500 SUS304
UPDATE material.receiving SET mat_code='GSKT-SW304-D100' WHERE id=954;  -- DN250 SUS304 CL300

-- 결과 확인
SELECT id, doc_no, mat_code, full_description, qty
FROM material.receiving
WHERE id BETWEEN 937 AND 954
ORDER BY id;
