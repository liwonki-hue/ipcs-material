-- ORIFICE PLATE 수량 수정 (Tag Item 특별 케이스, 1개 이상 허용)
-- tag 컬럼 일치 기준

UPDATE material.bom SET qty = 1  WHERE tag = 'B1-R0-29001';
UPDATE material.bom SET qty = 1  WHERE tag = 'B2-R0-29001';
UPDATE material.bom SET qty = 2  WHERE tag = 'B1-R0-29002';
UPDATE material.bom SET qty = 2  WHERE tag = 'B2-R0-29002';
UPDATE material.bom SET qty = 1  WHERE tag = 'B1-R0-32001';
UPDATE material.bom SET qty = 1  WHERE tag = 'B2-R0-32001';
UPDATE material.bom SET qty = 1  WHERE tag = 'B1-R0-33001';
UPDATE material.bom SET qty = 1  WHERE tag = 'B2-R0-33001';
UPDATE material.bom SET qty = 1  WHERE tag = 'B1-R0-33002';
UPDATE material.bom SET qty = 1  WHERE tag = 'B2-R0-33002';
UPDATE material.bom SET qty = 2  WHERE tag = 'B1-R0-30001';
UPDATE material.bom SET qty = 2  WHERE tag = 'B2-R0-30001';
UPDATE material.bom SET qty = 2  WHERE tag = 'B1-R0-31001';
UPDATE material.bom SET qty = 2  WHERE tag = 'B2-R0-31001';
UPDATE material.bom SET qty = 1  WHERE tag = 'B1-R0-34001';
UPDATE material.bom SET qty = 1  WHERE tag = 'B2-R0-34001';
UPDATE material.bom SET qty = 1  WHERE tag = 'B1-R0-48001';
UPDATE material.bom SET qty = 1  WHERE tag = 'B2-R0-48002';
UPDATE material.bom SET qty = 2  WHERE tag = 'B1-R0-35071';
UPDATE material.bom SET qty = 2  WHERE tag = 'B2-R0-35071';
UPDATE material.bom SET qty = 1  WHERE tag = 'B1-R0-35028';
UPDATE material.bom SET qty = 1  WHERE tag = 'B2-R0-35028';
UPDATE material.bom SET qty = 1  WHERE tag = 'B0-R0-35001';
UPDATE material.bom SET qty = 10 WHERE tag = 'B1-R0-28001';
UPDATE material.bom SET qty = 10 WHERE tag = 'B2-R0-28001';
UPDATE material.bom SET qty = 10 WHERE tag = 'B1-R0-26001';
UPDATE material.bom SET qty = 10 WHERE tag = 'B2-R0-26001';
UPDATE material.bom SET qty = 10 WHERE tag = 'B1-R0-26002';
UPDATE material.bom SET qty = 10 WHERE tag = 'B2-R0-26002';

-- 결과 확인
SELECT tag, full_description, qty
FROM material.bom
WHERE tag IN (
  'B1-R0-29001','B2-R0-29001','B1-R0-29002','B2-R0-29002',
  'B1-R0-32001','B2-R0-32001','B1-R0-33001','B2-R0-33001',
  'B1-R0-33002','B2-R0-33002','B1-R0-30001','B2-R0-30001',
  'B1-R0-31001','B2-R0-31001','B1-R0-34001','B2-R0-34001',
  'B1-R0-48001','B2-R0-48002','B1-R0-35071','B2-R0-35071',
  'B1-R0-35028','B2-R0-35028','B0-R0-35001',
  'B1-R0-28001','B2-R0-28001','B1-R0-26001','B2-R0-26001',
  'B1-R0-26002','B2-R0-26002'
)
ORDER BY tag;
