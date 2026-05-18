-- fix_matcodes_pe_rename.sql
-- Small Bore Pipe matcode BW→PE 수정 및 오류 수정
-- BW→PE 수정 대상: 23건
-- Supabase SQL Editor에서 실행

-- ============================================================
-- PART 1: Small Bore Pipe matcode BW → PE 수정
-- ============================================================

-- PIN-AS91-D010-S80-BW → PIN-AS91-D010-S80-PE  (bom:4, receiving:2, issued:0)
UPDATE material.matcode_master SET mat_code='PIN-AS91-D010-S80-PE' WHERE mat_code='PIN-AS91-D010-S80-BW';
UPDATE material.bom SET mat_code='PIN-AS91-D010-S80-PE' WHERE mat_code='PIN-AS91-D010-S80-BW';
UPDATE material.receiving SET mat_code='PIN-AS91-D010-S80-PE' WHERE mat_code='PIN-AS91-D010-S80-BW';

-- PIN-CS06-D005-S80-BW → PIN-CS06-D005-S80-PE  (bom:4, receiving:0, issued:0)
UPDATE material.matcode_master SET mat_code='PIN-CS06-D005-S80-PE' WHERE mat_code='PIN-CS06-D005-S80-BW';
UPDATE material.bom SET mat_code='PIN-CS06-D005-S80-PE' WHERE mat_code='PIN-CS06-D005-S80-BW';

-- PIN-CS06-D010-S80-BW → PIN-CS06-D010-S80-PE  (bom:4, receiving:0, issued:0)
UPDATE material.matcode_master SET mat_code='PIN-CS06-D010-S80-PE' WHERE mat_code='PIN-CS06-D010-S80-BW';
UPDATE material.bom SET mat_code='PIN-CS06-D010-S80-PE' WHERE mat_code='PIN-CS06-D010-S80-BW';

-- PIN-SS04-D005-S40S-BW → PIN-SS04-D005-S40S-PE  (bom:4, receiving:0, issued:0)
UPDATE material.matcode_master SET mat_code='PIN-SS04-D005-S40S-PE' WHERE mat_code='PIN-SS04-D005-S40S-BW';
UPDATE material.bom SET mat_code='PIN-SS04-D005-S40S-PE' WHERE mat_code='PIN-SS04-D005-S40S-BW';

-- PIN-SS04-D010-S40S-BW → PIN-SS04-D010-S40S-PE  (bom:4, receiving:0, issued:0)
UPDATE material.matcode_master SET mat_code='PIN-SS04-D010-S40S-PE' WHERE mat_code='PIN-SS04-D010-S40S-BW';
UPDATE material.bom SET mat_code='PIN-SS04-D010-S40S-PE' WHERE mat_code='PIN-SS04-D010-S40S-BW';

-- PIN-SS04-D020-S40S-BW → PIN-SS04-D020-S40S-PE  (bom:4, receiving:0, issued:0)
UPDATE material.matcode_master SET mat_code='PIN-SS04-D020-S40S-PE' WHERE mat_code='PIN-SS04-D020-S40S-BW';
UPDATE material.bom SET mat_code='PIN-SS04-D020-S40S-PE' WHERE mat_code='PIN-SS04-D020-S40S-BW';

-- PIN-SS16-D010-S40S-BW → PIN-SS16-D010-S40S-PE  (bom:4, receiving:0, issued:0)
UPDATE material.matcode_master SET mat_code='PIN-SS16-D010-S40S-PE' WHERE mat_code='PIN-SS16-D010-S40S-BW';
UPDATE material.bom SET mat_code='PIN-SS16-D010-S40S-PE' WHERE mat_code='PIN-SS16-D010-S40S-BW';

-- PIS-AS22-D010-S80-BW → PIS-AS22-D010-S80-PE  (bom:4, receiving:1, issued:0)
UPDATE material.matcode_master SET mat_code='PIS-AS22-D010-S80-PE' WHERE mat_code='PIS-AS22-D010-S80-BW';
UPDATE material.bom SET mat_code='PIS-AS22-D010-S80-PE' WHERE mat_code='PIS-AS22-D010-S80-BW';
UPDATE material.receiving SET mat_code='PIS-AS22-D010-S80-PE' WHERE mat_code='PIS-AS22-D010-S80-BW';

-- PIS-AS22-D020-S80-BW → PIS-AS22-D020-S80-PE  (bom:4, receiving:1, issued:0)
UPDATE material.matcode_master SET mat_code='PIS-AS22-D020-S80-PE' WHERE mat_code='PIS-AS22-D020-S80-BW';
UPDATE material.bom SET mat_code='PIS-AS22-D020-S80-PE' WHERE mat_code='PIS-AS22-D020-S80-BW';
UPDATE material.receiving SET mat_code='PIS-AS22-D020-S80-PE' WHERE mat_code='PIS-AS22-D020-S80-BW';

-- PIS-AS91-D010-S80-BW → PIS-AS91-D010-S80-PE  (bom:4, receiving:2, issued:0)
UPDATE material.matcode_master SET mat_code='PIS-AS91-D010-S80-PE' WHERE mat_code='PIS-AS91-D010-S80-BW';
UPDATE material.bom SET mat_code='PIS-AS91-D010-S80-PE' WHERE mat_code='PIS-AS91-D010-S80-BW';
UPDATE material.receiving SET mat_code='PIS-AS91-D010-S80-PE' WHERE mat_code='PIS-AS91-D010-S80-BW';

-- PIS-AS91-D020-S80-BW → PIS-AS91-D020-S80-PE  (bom:4, receiving:2, issued:0)
UPDATE material.matcode_master SET mat_code='PIS-AS91-D020-S80-PE' WHERE mat_code='PIS-AS91-D020-S80-BW';
UPDATE material.bom SET mat_code='PIS-AS91-D020-S80-PE' WHERE mat_code='PIS-AS91-D020-S80-BW';
UPDATE material.receiving SET mat_code='PIS-AS91-D020-S80-PE' WHERE mat_code='PIS-AS91-D020-S80-BW';

-- PIS-CS06-D005-S80-BW → PIS-CS06-D005-S80-PE  (bom:4, receiving:0, issued:0)
UPDATE material.matcode_master SET mat_code='PIS-CS06-D005-S80-PE' WHERE mat_code='PIS-CS06-D005-S80-BW';
UPDATE material.bom SET mat_code='PIS-CS06-D005-S80-PE' WHERE mat_code='PIS-CS06-D005-S80-BW';

-- PIS-CS06-D010-S80-BW → PIS-CS06-D010-S80-PE  (bom:4, receiving:0, issued:0)
UPDATE material.matcode_master SET mat_code='PIS-CS06-D010-S80-PE' WHERE mat_code='PIS-CS06-D010-S80-BW';
UPDATE material.bom SET mat_code='PIS-CS06-D010-S80-PE' WHERE mat_code='PIS-CS06-D010-S80-BW';

-- PIS-CS06-D015-S80-BW → PIS-CS06-D015-S80-PE  (bom:4, receiving:0, issued:0)
UPDATE material.matcode_master SET mat_code='PIS-CS06-D015-S80-PE' WHERE mat_code='PIS-CS06-D015-S80-BW';
UPDATE material.bom SET mat_code='PIS-CS06-D015-S80-PE' WHERE mat_code='PIS-CS06-D015-S80-BW';

-- PIS-CS06-D020-S80-BW → PIS-CS06-D020-S80-PE  (bom:4, receiving:0, issued:0)
UPDATE material.matcode_master SET mat_code='PIS-CS06-D020-S80-PE' WHERE mat_code='PIS-CS06-D020-S80-BW';
UPDATE material.bom SET mat_code='PIS-CS06-D020-S80-PE' WHERE mat_code='PIS-CS06-D020-S80-BW';

-- PIS-SS04-D005-S40S-BW → PIS-SS04-D005-S40S-PE  (bom:4, receiving:0, issued:0)
UPDATE material.matcode_master SET mat_code='PIS-SS04-D005-S40S-PE' WHERE mat_code='PIS-SS04-D005-S40S-BW';
UPDATE material.bom SET mat_code='PIS-SS04-D005-S40S-PE' WHERE mat_code='PIS-SS04-D005-S40S-BW';

-- PIS-SS04-D008-S40S-BW → PIS-SS04-D008-S40S-PE  (bom:4, receiving:0, issued:0)
UPDATE material.matcode_master SET mat_code='PIS-SS04-D008-S40S-PE' WHERE mat_code='PIS-SS04-D008-S40S-BW';
UPDATE material.bom SET mat_code='PIS-SS04-D008-S40S-PE' WHERE mat_code='PIS-SS04-D008-S40S-BW';

-- PIS-SS04-D010-S40S-BW → PIS-SS04-D010-S40S-PE  (bom:4, receiving:0, issued:0)
UPDATE material.matcode_master SET mat_code='PIS-SS04-D010-S40S-PE' WHERE mat_code='PIS-SS04-D010-S40S-BW';
UPDATE material.bom SET mat_code='PIS-SS04-D010-S40S-PE' WHERE mat_code='PIS-SS04-D010-S40S-BW';

-- PIS-SS04-D015-S40S-BW → PIS-SS04-D015-S40S-PE  (bom:4, receiving:0, issued:0)
UPDATE material.matcode_master SET mat_code='PIS-SS04-D015-S40S-PE' WHERE mat_code='PIS-SS04-D015-S40S-BW';
UPDATE material.bom SET mat_code='PIS-SS04-D015-S40S-PE' WHERE mat_code='PIS-SS04-D015-S40S-BW';

-- PIS-SS04-D020-S40S-BW → PIS-SS04-D020-S40S-PE  (bom:4, receiving:0, issued:0)
UPDATE material.matcode_master SET mat_code='PIS-SS04-D020-S40S-PE' WHERE mat_code='PIS-SS04-D020-S40S-BW';
UPDATE material.bom SET mat_code='PIS-SS04-D020-S40S-PE' WHERE mat_code='PIS-SS04-D020-S40S-BW';

-- PIS-SS16-D005-S40S-BW → PIS-SS16-D005-S40S-PE  (bom:4, receiving:0, issued:0)
UPDATE material.matcode_master SET mat_code='PIS-SS16-D005-S40S-PE' WHERE mat_code='PIS-SS16-D005-S40S-BW';
UPDATE material.bom SET mat_code='PIS-SS16-D005-S40S-PE' WHERE mat_code='PIS-SS16-D005-S40S-BW';

-- PIS-SS16-D010-S40S-BW → PIS-SS16-D010-S40S-PE  (bom:4, receiving:0, issued:0)
UPDATE material.matcode_master SET mat_code='PIS-SS16-D010-S40S-PE' WHERE mat_code='PIS-SS16-D010-S40S-BW';
UPDATE material.bom SET mat_code='PIS-SS16-D010-S40S-PE' WHERE mat_code='PIS-SS16-D010-S40S-BW';

-- PIS-SS16-D020-S40S-BW → PIS-SS16-D020-S40S-PE  (bom:4, receiving:0, issued:0)
UPDATE material.matcode_master SET mat_code='PIS-SS16-D020-S40S-PE' WHERE mat_code='PIS-SS16-D020-S40S-BW';
UPDATE material.bom SET mat_code='PIS-SS16-D020-S40S-PE' WHERE mat_code='PIS-SS16-D020-S40S-BW';

-- ============================================================
-- PART 2: 0555 오류 수정
-- ============================================================

-- 2a. FLN-CS05-D030-C300-RF matcode_master 추가 (0555 CL300 Flange)
INSERT INTO material.matcode_master (mat_code, category, item_desc, matl_desc, size1, size2, class_desc, et_desc) VALUES ('FLN-CS05-D030-C300-RF', 'Fitting', 'FLANGE', 'A105', '3"', 'DN 80', 'CL300', 'WNRF') ON CONFLICT (mat_code) DO NOTHING;

-- 2b. receiving id=795 matcode 수정 (CL150→CL300)
UPDATE material.receiving SET mat_code='FLN-CS05-D030-C300-RF' WHERE id=795;

-- 2c. 0555 PIPE SMLS A106-C DN150 S-40 matcode 수정 (S-120→S-40)
-- id=341, 342: 설명이 "S-120"이므로 matcode PIS-CS06-D060-S120-BW는 정상일 수 있음 → 수정 제외
-- id=831: 설명은 "S-40"인데 S-120 matcode → 오류 수정
UPDATE material.receiving SET mat_code='PIS-CS06-D060-S40-BW' WHERE id=831;

-- ============================================================
-- PART 3: 0574 NULL mat_code 항목 matcode 할당 (9건)
-- ※ PART 1 실행 후 BW→PE 수정 완료 상태이므로 PE matcode 할당
-- ============================================================

-- PIPE SMLS A312-TP304 DN 15 (D005=1/2") S-40S → TP304
UPDATE material.receiving SET mat_code='PIS-SS04-D005-S40S-PE' WHERE id=958;

-- PIPE SMLS A312-TP304 DN 20 (D008=3/4") S-40S → TP304
UPDATE material.receiving SET mat_code='PIS-SS04-D008-S40S-PE' WHERE id=960;

-- PIPE SMLS A312-TP304 DN 25 (D010=1") S-40S → TP304
UPDATE material.receiving SET mat_code='PIS-SS04-D010-S40S-PE' WHERE id=962;

-- PIPE SMLS A312-TP304 DN 40 (D015=1.5") S-40S → TP304
UPDATE material.receiving SET mat_code='PIS-SS04-D015-S40S-PE' WHERE id=959;

-- PIPE SMLS A312-TP304 DN 50 (D020=2") S-40S → TP304
UPDATE material.receiving SET mat_code='PIS-SS04-D020-S40S-PE' WHERE id=963;

-- PIPE SMLS A312-TP316 DN 15 (D005=1/2") S-40S → TP316
UPDATE material.receiving SET mat_code='PIS-SS16-D005-S40S-PE' WHERE id=961;

-- PIPE SMLS A312-TP316 DN 25 (D010=1") S-40S → TP316
UPDATE material.receiving SET mat_code='PIS-SS16-D010-S40S-PE' WHERE id=965;

-- PIPE SMLS A312-TP316 DN 50 (D020=2") S-40S → TP316
UPDATE material.receiving SET mat_code='PIS-SS16-D020-S40S-PE' WHERE id=957;

-- PIPE SMLS A312-TP316H DN 25 (D010=1") S-40S → TP316H (SS16 공용)
UPDATE material.receiving SET mat_code='PIS-SS16-D010-S40S-PE' WHERE id=964;
