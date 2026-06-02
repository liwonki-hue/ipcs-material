-- Orifice Plate BOM 수량을 PL 입고 수량 기준으로 수정

-- qty 10으로 수정 (B1/B2-RO-26001, 26002, 28001)
UPDATE material.bom SET qty = 10 WHERE tag = 'B1-RO-26001';
UPDATE material.bom SET qty = 10 WHERE tag = 'B2-RO-26001';
UPDATE material.bom SET qty = 10 WHERE tag = 'B1-RO-26002';
UPDATE material.bom SET qty = 10 WHERE tag = 'B2-RO-26002';
UPDATE material.bom SET qty = 10 WHERE tag = 'B1-RO-28001';
UPDATE material.bom SET qty = 10 WHERE tag = 'B2-RO-28001';

-- qty 2로 수정 (B1/B2-RO-29002, 30001, 31001, 35071)
UPDATE material.bom SET qty = 2 WHERE tag = 'B1-RO-29002';
UPDATE material.bom SET qty = 2 WHERE tag = 'B2-RO-29002';
UPDATE material.bom SET qty = 2 WHERE tag = 'B1-RO-30001';
UPDATE material.bom SET qty = 2 WHERE tag = 'B2-RO-30001';
UPDATE material.bom SET qty = 2 WHERE tag = 'B1-RO-31001';
UPDATE material.bom SET qty = 2 WHERE tag = 'B2-RO-31001';
UPDATE material.bom SET qty = 2 WHERE tag = 'B1-RO-35071';
UPDATE material.bom SET qty = 2 WHERE tag = 'B2-RO-35071';

-- 확인
SELECT tag, full_description, qty
FROM material.bom
WHERE tag IN (
  'B1-RO-26001','B2-RO-26001','B1-RO-26002','B2-RO-26002',
  'B1-RO-28001','B2-RO-28001','B1-RO-29002','B2-RO-29002',
  'B1-RO-30001','B2-RO-30001','B1-RO-31001','B2-RO-31001',
  'B1-RO-35071','B2-RO-35071'
)
ORDER BY tag;
