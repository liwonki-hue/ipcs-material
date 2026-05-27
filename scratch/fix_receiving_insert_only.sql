-- 0574 BOP-FRD 누락 행 추가 (id 명시)
-- UPDATE들은 이미 적용됨, INSERT 4건만 실행

-- FRD-005 추가: TP304 DN25 150EA × 6m = 900M
INSERT INTO material.receiving (id, doc_no, pkg_no, mat_code, qty, full_description, unit, category)
VALUES (1006, 'PGU-DE-0574', 'PGU-DE-0574-BOP-FRD-005',
        'PIS-SS04-D010-S40S-PE', 900,
        'PIPE SMLS A312-TP304 DN 25 S-40S', 'M', 'Pipe');

-- FRD-004 신규: TP304 DN50 138EA × 6m = 828M
INSERT INTO material.receiving (id, doc_no, pkg_no, mat_code, qty, full_description, unit, category)
VALUES (1007, 'PGU-DE-0574', 'PGU-DE-0574-BOP-FRD-004',
        'PIS-SS04-D020-S40S-PE', 828,
        'PIPE SMLS A312-TP304 DN 50 S-40S', 'M', 'Pipe');

-- FRD-007 신규: TP304 DN50 115EA × 6m = 690M
INSERT INTO material.receiving (id, doc_no, pkg_no, mat_code, qty, full_description, unit, category)
VALUES (1008, 'PGU-DE-0574', 'PGU-DE-0574-BOP-FRD-007',
        'PIS-SS04-D020-S40S-PE', 690,
        'PIPE SMLS A312-TP304 DN 50 S-40S', 'M', 'Pipe');

-- FRD-008 신규: TP316 DN25 414EA × 6m = 2484M
INSERT INTO material.receiving (id, doc_no, pkg_no, mat_code, qty, full_description, unit, category)
VALUES (1009, 'PGU-DE-0574', 'PGU-DE-0574-BOP-FRD-008',
        'PIS-SS16-D010-S40S-PE', 2484,
        'PIPE SMLS A312-TP316 DN 25 S-40S', 'M', 'Pipe');

-- 검증: 0574 FRD 전체 합계
SELECT pkg_no, SUM(qty) AS total_qty, MIN(unit) AS unit
FROM material.receiving
WHERE pkg_no LIKE 'PGU-DE-0574-BOP-FRD-%'
GROUP BY pkg_no
ORDER BY pkg_no;
