-- receiving 수량 수정 (A/B/C 통합)
-- A: 0525 BOP-FDR-005~010,014~025 → qty ÷ 6 (PL Summary 기준)
-- B: 0524-PIP-023 qty 18→72M / 0554-PIP-001 id=737 qty 132M→22EA
-- C: 0574 BOP-FRD 수량 수정 및 누락 행 추가 (PL Summary 기준)

-- ============================================================
-- A. 0525 BOP-FDR qty ÷ 6
-- ============================================================
UPDATE material.receiving SET qty =   9 WHERE id = 700;  -- FDR-005: 54→9
UPDATE material.receiving SET qty =   7 WHERE id = 701;  -- FDR-006: 42→7
UPDATE material.receiving SET qty =   7 WHERE id = 702;  -- FDR-007: 42→7
UPDATE material.receiving SET qty =   5 WHERE id = 703;  -- FDR-008: 30→5
UPDATE material.receiving SET qty =   1 WHERE id = 704;  -- FDR-008:  6→1
UPDATE material.receiving SET qty =  76 WHERE id = 705;  -- FDR-009: 456→76
UPDATE material.receiving SET qty =  25 WHERE id = 706;  -- FDR-010: 150→25
UPDATE material.receiving SET qty =   1 WHERE id = 707;  -- FDR-010:   6→1
UPDATE material.receiving SET qty =   5 WHERE id = 724;  -- FDR-014: 30→5
UPDATE material.receiving SET qty =   5 WHERE id = 725;  -- FDR-015: 30→5
UPDATE material.receiving SET qty =   5 WHERE id = 726;  -- FDR-016: 30→5
UPDATE material.receiving SET qty =   4 WHERE id = 727;  -- FDR-017: 24→4
UPDATE material.receiving SET qty =  30 WHERE id = 728;  -- FDR-018: 180→30
UPDATE material.receiving SET qty =  30 WHERE id = 729;  -- FDR-019: 180→30
UPDATE material.receiving SET qty =  30 WHERE id = 730;  -- FDR-020: 180→30
UPDATE material.receiving SET qty =  24 WHERE id = 731;  -- FDR-021: 144→24
UPDATE material.receiving SET qty =  30 WHERE id = 732;  -- FDR-022: 180→30
UPDATE material.receiving SET qty =  30 WHERE id = 733;  -- FDR-023: 180→30
UPDATE material.receiving SET qty =  30 WHERE id = 734;  -- FDR-024: 180→30
UPDATE material.receiving SET qty =   2 WHERE id = 735;  -- FDR-025:  12→2

-- ============================================================
-- B. 0524-PIP-023 / 0554-PIP-001 수정
-- ============================================================
-- 0524-BOP-PIP-023: 18M → 72M (PL 12EA × 6m)
UPDATE material.receiving SET qty = 72 WHERE id = 416;

-- 0554-BOP-PIP-001 id=737: 132M → 22EA (PIPE NIPPLE 22EA 단위 오기)
UPDATE material.receiving
SET qty = 22, unit = 'EA'
WHERE id = 737;

-- ============================================================
-- C. 0574 BOP-FRD 수정
-- ============================================================
-- FRD-002 (id=962): 3108M → 2208M (368EA × 6m)
UPDATE material.receiving SET qty = 2208 WHERE id = 962;

-- FRD-003 (id=963): 2196M → 678M (113EA × 6m)
UPDATE material.receiving SET qty = 678 WHERE id = 963;

-- FRD-005 (id=964): 408M 유지 (TP316H 68EA 부분 정상)
-- FRD-005 누락분 추가: TP304 DN25 150EA × 6m = 900M
INSERT INTO material.receiving (doc_no, pkg_no, mat_code, qty, full_description, unit, category)
VALUES ('PGU-DE-0574', 'PGU-DE-0574-BOP-FRD-005',
        'PIS-SS04-D010-S40S-PE', 900,
        'PIPE SMLS A312-TP304 DN 25 S-40S', 'M', 'Pipe');

-- FRD-006 (id=965): 4620M → 2136M (356EA × 6m)
UPDATE material.receiving SET qty = 2136 WHERE id = 965;

-- FRD-004 신규: TP304 DN50 138EA × 6m = 828M
INSERT INTO material.receiving (doc_no, pkg_no, mat_code, qty, full_description, unit, category)
VALUES ('PGU-DE-0574', 'PGU-DE-0574-BOP-FRD-004',
        'PIS-SS04-D020-S40S-PE', 828,
        'PIPE SMLS A312-TP304 DN 50 S-40S', 'M', 'Pipe');

-- FRD-007 신규: TP304 DN50 115EA × 6m = 690M
INSERT INTO material.receiving (doc_no, pkg_no, mat_code, qty, full_description, unit, category)
VALUES ('PGU-DE-0574', 'PGU-DE-0574-BOP-FRD-007',
        'PIS-SS04-D020-S40S-PE', 690,
        'PIPE SMLS A312-TP304 DN 50 S-40S', 'M', 'Pipe');

-- FRD-008 신규: TP316 DN25 414EA × 6m = 2484M
INSERT INTO material.receiving (doc_no, pkg_no, mat_code, qty, full_description, unit, category)
VALUES ('PGU-DE-0574', 'PGU-DE-0574-BOP-FRD-008',
        'PIS-SS16-D010-S40S-PE', 2484,
        'PIPE SMLS A312-TP316 DN 25 S-40S', 'M', 'Pipe');

-- ============================================================
-- 검증
-- ============================================================
-- A: 0525 FDR-005~010 합계 확인
SELECT pkg_no, SUM(qty) AS total_qty, MIN(unit) AS unit
FROM material.receiving
WHERE pkg_no LIKE 'PGU-DE-0525-BOP-FDR-%'
GROUP BY pkg_no
ORDER BY pkg_no;

-- B: 수정 확인
SELECT id, pkg_no, qty, unit FROM material.receiving
WHERE id IN (416, 737);

-- C: 0574 FRD 합계 확인
SELECT pkg_no, SUM(qty) AS total_qty, MIN(unit) AS unit
FROM material.receiving
WHERE pkg_no LIKE 'PGU-DE-0574-BOP-FRD-%'
GROUP BY pkg_no
ORDER BY pkg_no;
