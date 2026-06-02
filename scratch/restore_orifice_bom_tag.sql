-- 미입고 Orifice BOM 4건 tag 복원 (미입고 상태로 관리)

UPDATE material.bom SET tag = 'B1-RO-33003'
WHERE full_description ILIKE '%SPRAY WATER LINE FOR FLASH TANK #1%';

UPDATE material.bom SET tag = 'B2-RO-33003'
WHERE full_description ILIKE '%SPRAY WATER LINE FOR FLASH TANK #2%';

UPDATE material.bom SET tag = 'B0-RO-46001'
WHERE full_description ILIKE '%FUEL OIL TO BSEDG DAY TANK A%';

UPDATE material.bom SET tag = 'B0-RO-46002'
WHERE full_description ILIKE '%FUEL OIL TO BSEDG DAY TANK B%';

-- 확인
SELECT tag, full_description, qty
FROM material.bom
WHERE tag IN ('B1-RO-33003','B2-RO-33003','B0-RO-46001','B0-RO-46002');
