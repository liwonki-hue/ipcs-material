-- update_matcode_master_missing.sql
-- bom/receiving에 존재하나 matcode_master에 없는 mat_code INSERT
-- Supabase SQL Editor에서 실행

INSERT INTO material.matcode_master (mat_code,category,item_desc,matl_desc,size1,size2,class_desc,et_desc) VALUES ('CAP-CS05-D280-STD-BW','Fitting','CAP','A105','28"','DN 700','STD','BW')
ON CONFLICT (mat_code) DO NOTHING;
INSERT INTO material.matcode_master (mat_code,category,item_desc,matl_desc,size1,size2,class_desc,et_desc) VALUES ('CAP-SS04-D030-S10S-BW','Fitting','CAP','A182-F304','3"','DN 80','S10S','BW')
ON CONFLICT (mat_code) DO NOTHING;
INSERT INTO material.matcode_master (mat_code,category,item_desc,matl_desc,size1,size2,class_desc,et_desc) VALUES ('CAP-SS04-D060-S10S-BW','Fitting','CAP','A182-F304','6"','DN 150','S10S','BW')
ON CONFLICT (mat_code) DO NOTHING;
INSERT INTO material.matcode_master (mat_code,category,item_desc,matl_desc,size1,size2,class_desc,et_desc) VALUES ('EL9S-SS04-D040-S10S-BW','Fitting','ELBOW SR 90D','A182-F304','4"','DN 100','S10S','BW')
ON CONFLICT (mat_code) DO NOTHING;
INSERT INTO material.matcode_master (mat_code,category,item_desc,matl_desc,size1,size2,class_desc,et_desc) VALUES ('FLB-CS05-D100-C150-RF','Fitting','FLANGE-BLIND','A105','10"','DN 250','C150','RF')
ON CONFLICT (mat_code) DO NOTHING;
INSERT INTO material.matcode_master (mat_code,category,item_desc,matl_desc,size1,size2,class_desc,et_desc) VALUES ('FLN-AS91-D010-C1.5K-RF','Fitting','FLANGE','A182-F91','1"','DN 25','C1.5K','RF')
ON CONFLICT (mat_code) DO NOTHING;
INSERT INTO material.matcode_master (mat_code,category,item_desc,matl_desc,size1,size2,class_desc,et_desc) VALUES ('FLN-CS05-D220-C150-RF','Fitting','FLANGE','A105','22"','DN 550','C150','RF')
ON CONFLICT (mat_code) DO NOTHING;
INSERT INTO material.matcode_master (mat_code,category,item_desc,matl_desc,size1,size2,class_desc,et_desc) VALUES ('FLN-SS04-D025-C150-RF','Fitting','FLANGE','A182-F304','2-1/2"','DN 65','C150','RF')
ON CONFLICT (mat_code) DO NOTHING;
INSERT INTO material.matcode_master (mat_code,category,item_desc,matl_desc,size1,size2,class_desc,et_desc) VALUES ('PIS-CS06-D180-STD-BW','Pipe','PIPE','A106-B','18"','DN 450','STD','BW')
ON CONFLICT (mat_code) DO NOTHING;
INSERT INTO material.matcode_master (mat_code,category,item_desc,matl_desc,size1,size2,class_desc,et_desc) VALUES ('PIW-SS04-D040-S10S-BW','Pipe','PIPE','A312-TP304W','4"','DN 100','S10S','BW')
ON CONFLICT (mat_code) DO NOTHING;
INSERT INTO material.matcode_master (mat_code,category,item_desc,matl_desc,size1,size2,class_desc,et_desc) VALUES ('RDC-CS05-D120D100-STD-BW','Fitting','REDUCER-CON','A234-WPB','12" x 10"','DN 300 x DN 250','STD','BW')
ON CONFLICT (mat_code) DO NOTHING;
INSERT INTO material.matcode_master (mat_code,category,item_desc,matl_desc,size1,size2,class_desc,et_desc) VALUES ('RDC-CS05-D140D120-STD-BW','Fitting','REDUCER-CON','A234-WPB','14" x 12"','DN 350 x DN 300','STD','BW')
ON CONFLICT (mat_code) DO NOTHING;
INSERT INTO material.matcode_master (mat_code,category,item_desc,matl_desc,size1,size2,class_desc,et_desc) VALUES ('RDC-SS04-D080D060-S10S-BW','Fitting','REDUCER-CON','A403-WP304','8" x 6"','DN 200 x DN 150','S10S','BW')
ON CONFLICT (mat_code) DO NOTHING;
INSERT INTO material.matcode_master (mat_code,category,item_desc,matl_desc,size1,size2,class_desc,et_desc) VALUES ('RDC-SS04-D100D080-S10S-BW','Fitting','REDUCER-CON','A403-WP304','10" x 8"','DN 250 x DN 200','S10S','BW')
ON CONFLICT (mat_code) DO NOTHING;
INSERT INTO material.matcode_master (mat_code,category,item_desc,matl_desc,size1,size2,class_desc,et_desc) VALUES ('RDE-CS05-D140D060-S40-BW','Fitting','REDUCER-ECC','A234-WPB','14" x 6"','DN 350 x DN 150','S40','BW')
ON CONFLICT (mat_code) DO NOTHING;
INSERT INTO material.matcode_master (mat_code,category,item_desc,matl_desc,size1,size2,class_desc,et_desc) VALUES ('RDE-CS05-D160D140-S40-BW','Fitting','REDUCER-ECC','A234-WPB','16" x 14"','DN 400 x DN 350','S40','BW')
ON CONFLICT (mat_code) DO NOTHING;
INSERT INTO material.matcode_master (mat_code,category,item_desc,matl_desc,size1,size2,class_desc,et_desc) VALUES ('RDE-CS05-D180D120-STD-BW','Fitting','REDUCER-ECC','A234-WPB','18" x 12"','DN 450 x DN 300','STD','BW')
ON CONFLICT (mat_code) DO NOTHING;
INSERT INTO material.matcode_master (mat_code,category,item_desc,matl_desc,size1,size2,class_desc,et_desc) VALUES ('RDE-CS05-D200D160-STD-BW','Fitting','REDUCER-ECC','A234-WPB','20" x 16"','DN 500 x DN 400','STD','BW')
ON CONFLICT (mat_code) DO NOTHING;
INSERT INTO material.matcode_master (mat_code,category,item_desc,matl_desc,size1,size2,class_desc,et_desc) VALUES ('RDE-CS05-D280D140-STD-BW','Fitting','REDUCER-ECC','A234-WPB','28" x 14"','DN 700 x DN 350','STD','BW')
ON CONFLICT (mat_code) DO NOTHING;
INSERT INTO material.matcode_master (mat_code,category,item_desc,matl_desc,size1,size2,class_desc,et_desc) VALUES ('RDE-SS04-D030D025-S10S-BW','Fitting','REDUCER-ECC','A403-WP304','3" x 2-1/2"','DN 80 x DN 65','S10S','BW')
ON CONFLICT (mat_code) DO NOTHING;
INSERT INTO material.matcode_master (mat_code,category,item_desc,matl_desc,size1,size2,class_desc,et_desc) VALUES ('RDE-SS04-D060D030-S10S-BW','Fitting','REDUCER-ECC','A403-WP304','6" x 3"','DN 150 x DN 80','S10S','BW')
ON CONFLICT (mat_code) DO NOTHING;
INSERT INTO material.matcode_master (mat_code,category,item_desc,matl_desc,size1,size2,class_desc,et_desc) VALUES ('STB-B160-D120','Others','STUD BOLT','B16','12"','DN 300','L150','NA')
ON CONFLICT (mat_code) DO NOTHING;
INSERT INTO material.matcode_master (mat_code,category,item_desc,matl_desc,size1,size2,class_desc,et_desc) VALUES ('STB-B160-D160','Others','STUD BOLT','B16','16"','DN 400','L150','NA')
ON CONFLICT (mat_code) DO NOTHING;
INSERT INTO material.matcode_master (mat_code,category,item_desc,matl_desc,size1,size2,class_desc,et_desc) VALUES ('STB-B700-D010','Others','STUD BOLT','B7','1"','DN 25','L150','NA')
ON CONFLICT (mat_code) DO NOTHING;
INSERT INTO material.matcode_master (mat_code,category,item_desc,matl_desc,size1,size2,class_desc,et_desc) VALUES ('STB-B700-D040','Others','STUD BOLT','B7','4"','DN 100','L150','NA')
ON CONFLICT (mat_code) DO NOTHING;
INSERT INTO material.matcode_master (mat_code,category,item_desc,matl_desc,size1,size2,class_desc,et_desc) VALUES ('STB-B700-D060','Others','STUD BOLT','B7','6"','DN 150','L150','NA')
ON CONFLICT (mat_code) DO NOTHING;
INSERT INTO material.matcode_master (mat_code,category,item_desc,matl_desc,size1,size2,class_desc,et_desc) VALUES ('STB-B700-D080','Others','STUD BOLT','B7','8"','DN 200','L150','NA')
ON CONFLICT (mat_code) DO NOTHING;
INSERT INTO material.matcode_master (mat_code,category,item_desc,matl_desc,size1,size2,class_desc,et_desc) VALUES ('STB-B700-D100','Others','STUD BOLT','B7','10"','DN 250','L150','NA')
ON CONFLICT (mat_code) DO NOTHING;
INSERT INTO material.matcode_master (mat_code,category,item_desc,matl_desc,size1,size2,class_desc,et_desc) VALUES ('STB-B700-D160','Others','STUD BOLT','B7','16"','DN 400','L150','NA')
ON CONFLICT (mat_code) DO NOTHING;
INSERT INTO material.matcode_master (mat_code,category,item_desc,matl_desc,size1,size2,class_desc,et_desc) VALUES ('STB-B700-D200','Others','STUD BOLT','B7','20"','DN 500','L150','NA')
ON CONFLICT (mat_code) DO NOTHING;
INSERT INTO material.matcode_master (mat_code,category,item_desc,matl_desc,size1,size2,class_desc,et_desc) VALUES ('STB-B800-D040','Others','STUD BOLT','B8','4"','DN 100','L150','NA')
ON CONFLICT (mat_code) DO NOTHING;
INSERT INTO material.matcode_master (mat_code,category,item_desc,matl_desc,size1,size2,class_desc,et_desc) VALUES ('STB-B800-D060','Others','STUD BOLT','B8','6"','DN 150','L150','NA')
ON CONFLICT (mat_code) DO NOTHING;
INSERT INTO material.matcode_master (mat_code,category,item_desc,matl_desc,size1,size2,class_desc,et_desc) VALUES ('TEE-SS04-D060-S10S-BW','Fitting','TEE','A182-F304','6"','DN 150','S10S','BW')
ON CONFLICT (mat_code) DO NOTHING;
INSERT INTO material.matcode_master (mat_code,category,item_desc,matl_desc,size1,size2,class_desc,et_desc) VALUES ('TER-CS05-D040D030-S40-BW','Fitting','TEE-RED','A105','4" x 3"','DN 100 x DN 80','S40','BW')
ON CONFLICT (mat_code) DO NOTHING;
INSERT INTO material.matcode_master (mat_code,category,item_desc,matl_desc,size1,size2,class_desc,et_desc) VALUES ('TER-CS05-D120D060-S40-BW','Fitting','TEE-RED','A105','12" x 6"','DN 300 x DN 150','S40','BW')
ON CONFLICT (mat_code) DO NOTHING;
INSERT INTO material.matcode_master (mat_code,category,item_desc,matl_desc,size1,size2,class_desc,et_desc) VALUES ('TER-CS05-D140D120-S40-BW','Fitting','TEE-RED','A105','14" x 12"','DN 350 x DN 300','S40','BW')
ON CONFLICT (mat_code) DO NOTHING;
INSERT INTO material.matcode_master (mat_code,category,item_desc,matl_desc,size1,size2,class_desc,et_desc) VALUES ('TER-CS05-D280D180-S40-BW','Fitting','TEE-RED','A105','28" x 18"','DN 700 x DN 450','S40','BW')
ON CONFLICT (mat_code) DO NOTHING;
INSERT INTO material.matcode_master (mat_code,category,item_desc,matl_desc,size1,size2,class_desc,et_desc) VALUES ('TER-SS04-D060D040-S10S-BW','Fitting','TEE-RED','A182-F304','6" x 4"','DN 150 x DN 100','S10S','BW')
ON CONFLICT (mat_code) DO NOTHING;
INSERT INTO material.matcode_master (mat_code,category,item_desc,matl_desc,size1,size2,class_desc,et_desc) VALUES ('WOL-CS05-D180D030-STD-BW','Fitting','WELDOLET','A105','18" x 3"','DN 450 x DN 80','STD','BW')
ON CONFLICT (mat_code) DO NOTHING;
INSERT INTO material.matcode_master (mat_code,category,item_desc,matl_desc,size1,size2,class_desc,et_desc) VALUES ('WOL-CS05-D220D060-STD-BW','Fitting','WELDOLET','A105','22" x 6"','DN 550 x DN 150','STD','BW')
ON CONFLICT (mat_code) DO NOTHING;
INSERT INTO material.matcode_master (mat_code,category,item_desc,matl_desc,size1,size2,class_desc,et_desc) VALUES ('WOL-SS04-D060D030-S10S-BW','Fitting','WELDOLET','A182-F304','6" x 3"','DN 150 x DN 80','S10S','BW')
ON CONFLICT (mat_code) DO NOTHING;

-- ── 결과 확인 ──────────────────────────────────────────────────────
SELECT COUNT(*) AS total FROM material.matcode_master;