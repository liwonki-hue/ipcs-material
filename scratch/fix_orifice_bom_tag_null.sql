-- 미입고 Orifice BOM 4건 tag → NULL (PL 미등록 항목)
-- B0-RO-46001/46002: FUEL OIL TO BSEDG DAY TANK
-- B1/B2-RO-33003: SPRAY WATER LINE FOR FLASH TANK

UPDATE material.bom SET tag = NULL
WHERE tag IN ('B0-RO-46001', 'B0-RO-46002', 'B1-RO-33003', 'B2-RO-33003');

-- 확인
SELECT tag, full_description, qty, system, iso_dwg_no
FROM material.bom
WHERE full_description ILIKE '%RO-46001%'
   OR full_description ILIKE '%RO-46002%'
   OR full_description ILIKE '%SPRAY WATER LINE FOR FLASH TANK%';
