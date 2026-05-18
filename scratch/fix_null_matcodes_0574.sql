-- fix_null_matcodes_0574.sql
-- 0574 Fitting NULL matcode 38건 matcode 할당
-- PART 1: 신규 matcode matcode_master 등록 (10건)
-- PART 2: receiving 기존 matcode 할당 (24건)
-- PART 3: receiving 신규 matcode 할당 (14건)
-- Supabase SQL Editor에서 실행

-- ============================================================
-- PART 1: 신규 matcode_master 등록 (미존재 matcode 10건)
-- ============================================================

-- EL4L (ELBOW 45D) SS316 small bore
INSERT INTO material.matcode_master (mat_code,category,item_desc,matl_desc,size1,size2,class_desc,et_desc) VALUES
  ('EL4L-SS16-D010-C3K-SW','Fitting','ELBOW 45D','A182-F316','1"','DN 25','CL3000','SW')
ON CONFLICT (mat_code) DO NOTHING;

INSERT INTO material.matcode_master (mat_code,category,item_desc,matl_desc,size1,size2,class_desc,et_desc) VALUES
  ('EL4L-SS16-D020-C3K-SW','Fitting','ELBOW 45D','A182-F316','2"','DN 50','CL3000','SW')
ON CONFLICT (mat_code) DO NOTHING;

-- TER (TEE-REDUCING) SS316 small bore
INSERT INTO material.matcode_master (mat_code,category,item_desc,matl_desc,size1,size2,class_desc,et_desc) VALUES
  ('TER-SS16-D020D010-C3K-SW','Fitting','TEE-RED','A182-F316','2" x 1"','DN 50 x DN 25','CL3000','SW')
ON CONFLICT (mat_code) DO NOTHING;

-- CAP SS316 small bore SW (기존 TH만 존재 → SW 추가)
INSERT INTO material.matcode_master (mat_code,category,item_desc,matl_desc,size1,size2,class_desc,et_desc) VALUES
  ('CAP-SS16-D010-C3K-SW','Fitting','CAP','A182-F316','1"','DN 25','CL3000','SW')
ON CONFLICT (mat_code) DO NOTHING;

-- CPF (COUPLING-FULL) SS316 small bore
INSERT INTO material.matcode_master (mat_code,category,item_desc,matl_desc,size1,size2,class_desc,et_desc) VALUES
  ('CPF-SS16-D005-C3K-SW','Fitting','COUPLING-FULL','A182-F316','1/2"','DN 15','CL3000','SW')
ON CONFLICT (mat_code) DO NOTHING;

INSERT INTO material.matcode_master (mat_code,category,item_desc,matl_desc,size1,size2,class_desc,et_desc) VALUES
  ('CPF-SS16-D010-C3K-SW','Fitting','COUPLING-FULL','A182-F316','1"','DN 25','CL3000','SW')
ON CONFLICT (mat_code) DO NOTHING;

INSERT INTO material.matcode_master (mat_code,category,item_desc,matl_desc,size1,size2,class_desc,et_desc) VALUES
  ('CPF-SS16-D020-C3K-SW','Fitting','COUPLING-FULL','A182-F316','2"','DN 50','CL3000','SW')
ON CONFLICT (mat_code) DO NOTHING;

-- CPF (COUPLING-FULL) F91 small bore
INSERT INTO material.matcode_master (mat_code,category,item_desc,matl_desc,size1,size2,class_desc,et_desc) VALUES
  ('CPF-AS91-D010-C3K-SW','Fitting','COUPLING-FULL','A182-F91','1"','DN 25','CL3000','SW')
ON CONFLICT (mat_code) DO NOTHING;

INSERT INTO material.matcode_master (mat_code,category,item_desc,matl_desc,size1,size2,class_desc,et_desc) VALUES
  ('CPF-AS91-D020-C3K-SW','Fitting','COUPLING-FULL','A182-F91','2"','DN 50','CL3000','SW')
ON CONFLICT (mat_code) DO NOTHING;

-- SCN (SWAGED CON NIPPLE)
INSERT INTO material.matcode_master (mat_code,category,item_desc,matl_desc,size1,size2,class_desc,et_desc) VALUES
  ('SCN-SS16-D010D005-S40S-SW','Fitting','SWAGED CON NIPPLE','A182-F316','1" x 1/2"','DN 25 x DN 15','S-40S','SW')
ON CONFLICT (mat_code) DO NOTHING;

INSERT INTO material.matcode_master (mat_code,category,item_desc,matl_desc,size1,size2,class_desc,et_desc) VALUES
  ('SCN-AS91-D020D010-S80-SW','Fitting','SWAGED CON NIPPLE','A182-F91','2" x 1"','DN 50 x DN 25','S-80','SW')
ON CONFLICT (mat_code) DO NOTHING;

-- ============================================================
-- PART 2: receiving 기존 matcode 할당 (24건)
-- ============================================================

-- FLANGE A105
UPDATE material.receiving SET mat_code='FLN-CS05-D020-C300-RF' WHERE id=966;  -- DN50 CL300
UPDATE material.receiving SET mat_code='FLN-CS05-D020-C150-RF' WHERE id=967;  -- DN50 CL150
UPDATE material.receiving SET mat_code='FLN-CS05-D010-C300-RF' WHERE id=968;  -- DN25 CL300
UPDATE material.receiving SET mat_code='FLN-CS05-D010-C150-RF' WHERE id=969;  -- DN25 CL150

-- FLANGE A182-F304
UPDATE material.receiving SET mat_code='FLN-SS04-D010-C150-RF' WHERE id=970;  -- DN25 CL150
UPDATE material.receiving SET mat_code='FLN-SS04-D020-C150-RF' WHERE id=971;  -- DN50 CL150
UPDATE material.receiving SET mat_code='FLN-SS04-D015-C150-RF' WHERE id=972;  -- DN40 CL150

-- FLANGE A182-F316
UPDATE material.receiving SET mat_code='FLN-SS16-D005-C150-RF' WHERE id=973;  -- DN15 CL150
UPDATE material.receiving SET mat_code='FLN-SS16-D010-C150-RF' WHERE id=974;  -- DN25 CL150

-- FLANGE-BLIND A105
UPDATE material.receiving SET mat_code='FLB-CS05-D010-C150-RF' WHERE id=975;  -- DN25 CL150
UPDATE material.receiving SET mat_code='FLB-CS05-D020-C150-RF' WHERE id=976;  -- DN50 CL150

-- FLANGE-BLIND A182-F304
UPDATE material.receiving SET mat_code='FLB-SS04-D010-C150-RF' WHERE id=977;  -- DN25 CL150
UPDATE material.receiving SET mat_code='FLB-SS04-D020-C150-RF' WHERE id=978;  -- DN50 CL150

-- ELBOW LR 90D A182-F316
UPDATE material.receiving SET mat_code='EL9L-SS16-D010-C3K-SW' WHERE id=979;  -- DN25 CL3000
UPDATE material.receiving SET mat_code='EL9L-SS16-D020-C3K-SW' WHERE id=980;  -- DN50 CL3000
UPDATE material.receiving SET mat_code='EL9L-SS16-D005-C3K-SW' WHERE id=982;  -- DN15 CL3000

-- ELBOW LR 90D A182-F91
UPDATE material.receiving SET mat_code='EL9L-AS91-D010-C3K-SW' WHERE id=981;  -- DN25 CL3000
UPDATE material.receiving SET mat_code='EL9L-AS91-D020-C3K-SW' WHERE id=983;  -- DN50 CL3000
UPDATE material.receiving SET mat_code='EL9L-AS91-D020-C3K-SW' WHERE id=984;  -- SA182-F91 DN50

-- ELBOW 45D A182-F91
UPDATE material.receiving SET mat_code='EL4L-AS91-D020-C3K-SW' WHERE id=986;  -- DN50 CL3000
UPDATE material.receiving SET mat_code='EL4L-AS91-D010-C3K-SW' WHERE id=987;  -- DN25 CL3000

-- TEE A182-F316
UPDATE material.receiving SET mat_code='TEE-SS16-D010-C3K-SW'  WHERE id=991;  -- DN25 CL3000
UPDATE material.receiving SET mat_code='TEE-SS16-D020-C3K-SW'  WHERE id=993;  -- DN50 CL3000

-- TEE A182-F91
UPDATE material.receiving SET mat_code='TEE-AS91-D010-C3K-SW'  WHERE id=989;  -- DN25 CL3000
UPDATE material.receiving SET mat_code='TEE-AS91-D010-C3K-SW'  WHERE id=992;  -- SA182-F91 DN25

-- CAP A182-F91
UPDATE material.receiving SET mat_code='CAP-AS91-D010-C3K-SW'  WHERE id=994;  -- SA182-F91 DN25
UPDATE material.receiving SET mat_code='CAP-AS91-D010-C3K-SW'  WHERE id=996;  -- DN25 CL3000

-- ============================================================
-- PART 3: receiving 신규 matcode 할당 (14건)
-- ※ PART 1 실행 후 matcode_master에 등록된 코드 사용
-- ============================================================

-- ELBOW 45D A182-F316 (신규 EL4L-SS16)
UPDATE material.receiving SET mat_code='EL4L-SS16-D010-C3K-SW' WHERE id=985;  -- DN25 CL3000
UPDATE material.receiving SET mat_code='EL4L-SS16-D020-C3K-SW' WHERE id=988;  -- DN50 CL3000

-- TEE-RED A182-F316 (신규 TER-SS16)
UPDATE material.receiving SET mat_code='TER-SS16-D020D010-C3K-SW' WHERE id=990;

-- CAP A182-F316 (신규 CAP-SS16-SW)
UPDATE material.receiving SET mat_code='CAP-SS16-D010-C3K-SW' WHERE id=995;   -- DN25 CL3000

-- COUPLING-FULL A182-F316 (신규 CPF-SS16)
UPDATE material.receiving SET mat_code='CPF-SS16-D005-C3K-SW' WHERE id=999;   -- DN15 CL3000
UPDATE material.receiving SET mat_code='CPF-SS16-D010-C3K-SW' WHERE id=997;   -- DN25 CL3000
UPDATE material.receiving SET mat_code='CPF-SS16-D020-C3K-SW' WHERE id=998;   -- DN50 CL3000

-- COUPLING-FULL A182-F91 (신규 CPF-AS91)
UPDATE material.receiving SET mat_code='CPF-AS91-D020-C3K-SW' WHERE id=1000;  -- DN50 CL3000
UPDATE material.receiving SET mat_code='CPF-AS91-D010-C3K-SW' WHERE id=1002;  -- SA182-F91 DN25

-- SWAGED CON NIPPLE (신규 SCN)
UPDATE material.receiving SET mat_code='SCN-SS16-D010D005-S40S-SW' WHERE id=1003;
UPDATE material.receiving SET mat_code='SCN-AS91-D020D010-S80-SW'  WHERE id=1004;

-- ============================================================
-- 결과 확인 쿼리
-- ============================================================
SELECT id, doc_no, mat_code, full_description, qty
FROM material.receiving
WHERE id IN (966,967,968,969,970,971,972,973,974,975,976,977,978,
             979,980,981,982,983,984,985,986,987,988,989,990,991,
             992,993,994,995,996,997,998,999,1000,1002,1003,1004)
ORDER BY id;
