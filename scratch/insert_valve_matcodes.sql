-- 신규 Valve MatCode INSERT (matcode_master)
-- Supabase SQL Editor에서 실행

INSERT INTO material.matcode_master (mat_code, category, item_desc, matl_desc, size1, size2, class_desc, et_desc) VALUES ('GLV-SS16-D020-C600-SW', 'Valve', 'GLOBE VALVE', 'A182-F316L', '2"', '-', '600#', 'SW') ON CONFLICT (mat_code) DO NOTHING;
INSERT INTO material.matcode_master (mat_code, category, item_desc, matl_desc, size1, size2, class_desc, et_desc) VALUES ('GLV-SS3F-D010-C600-SW', 'Valve', 'GLOBE VALVE', 'A182-F304', '1"', '-', '600#', 'SW') ON CONFLICT (mat_code) DO NOTHING;
INSERT INTO material.matcode_master (mat_code, category, item_desc, matl_desc, size1, size2, class_desc, et_desc) VALUES ('GLV-SS3F-D020-C600-SW', 'Valve', 'GLOBE VALVE', 'A182-F304', '2"', '-', '600#', 'SW') ON CONFLICT (mat_code) DO NOTHING;
