-- 실수로 삭제된 RESTRICTION ORIFICE (EDUCTOR) 2건 복구
-- 원본: Raw File/BOM Data/Speciality BOM.xlsx 행 275~276

INSERT INTO material.bom
  (mat_code, category, tag, system, iso_dwg_no, line_no, full_description, uom, qty)
VALUES
  ('ROR-316S-2-150-SW', 'Speciality', 'B1-RO-35028', NULL, NULL, '2"-DW-B1-35/001-GK1-NR', 'RESTRICTION ORIFICE, EDUCTOR #1 FOR QUENCHING LINE', 'EA', 1),
  ('ROR-316S-2-150-SW', 'Speciality', 'B2-RO-35028', NULL, NULL, '2"-DW-B2-35/001-GK1-NR', 'RESTRICTION ORIFICE, EDUCTOR #2 FOR QUENCHING LINE', 'EA', 1);

-- 복구 확인
SELECT tag, full_description, uom, qty
FROM material.bom
WHERE full_description ILIKE '%RESTRICTION ORIFICE%EDUCTOR%';
