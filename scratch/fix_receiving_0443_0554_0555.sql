-- 0443/0554/0555 receiving 수정 (SQL Editor 실행)
-- matcode_master 신규 5건은 이미 등록 완료 (FLN-SS04-D080-C600-RF, RDC-CS05-D24/28xx)

-- ── 0443 SPRAY NOZZLE matcode 할당 (id=1005) ─────────────────────────
UPDATE material.receiving
SET mat_code = 'NOZ-AS22-D020-C3K-SW'
WHERE id = 1005;

-- ── 0443 id=281 Description 오류 수정: CAP → TEE-RED ──────────────────
UPDATE material.receiving
SET full_description = 'TEE-RED A403-WP304W / DN 200 x DN 100 / S-10S x S-10S'
WHERE id = 281;

-- ── 0554 INSULATION KIT matcode 할당 (id=922) ────────────────────────
UPDATE material.receiving
SET mat_code = 'GSKT-INS-D030'
WHERE id = 922;

-- ── 0555 PIP-009: CL150 → CL300 수정 (id=771, 773) ──────────────────
UPDATE material.receiving
SET mat_code = 'FLN-CS05-D140-C300-RF',
    full_description = 'FLANGE A105 DN 350 CL300 X STD WNRF'
WHERE id = 771;

UPDATE material.receiving
SET mat_code = 'FLN-CS05-D200-C300-RF',
    full_description = 'FLANGE A105 DN 500 CL300 X STD WNRF'
WHERE id = 773;

-- ── 0555 PIP-011: DN200 CL600 설명/matcode 수정 (id=799) ────────────
UPDATE material.receiving
SET mat_code = 'FLN-SS04-D080-C600-RF',
    full_description = 'FLANGE A182-F304 DN 200 CL600 X S-40 WNRF'
WHERE id = 799;

-- ── 0555 PIP-016: REDUCER-CON matcode RDE → RDC (id=822~825) ────────
UPDATE material.receiving SET mat_code = 'RDC-CS05-D240D140-STD-BW' WHERE id = 822;
UPDATE material.receiving SET mat_code = 'RDC-CS05-D280D200-STD-BW' WHERE id = 823;
UPDATE material.receiving SET mat_code = 'RDC-CS05-D240D200-STD-BW' WHERE id = 824;
UPDATE material.receiving SET mat_code = 'RDC-CS05-D280D140-STD-BW' WHERE id = 825;

-- ── 검증 ────────────────────────────────────────────────────────────────
SELECT id, pkg_no, mat_code, full_description
FROM material.receiving
WHERE id IN (1005, 281, 922, 771, 773, 799, 822, 823, 824, 825)
ORDER BY id;
