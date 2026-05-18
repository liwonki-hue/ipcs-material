-- bom_revision_by_po.sql
-- 미매칭 분析 기반 BOM mat_code 수정 (실제 입고 사양 반영)
-- Supabase SQL Editor에서 실행

-- ⚠️  실행 전 반드시 영향 범위 확인 후 진행

-- ── PART 1: matcode_master 신규 등록 (PO사양 신규 코드) ──────────────

INSERT INTO material.matcode_master (mat_code,category,item_desc,matl_desc,size1,size2,class_desc,et_desc) SELECT 'EL9L-A234-WP22 CL1-D060-S40-BW',category,item_desc,matl_desc,size1,size2,'D060','S40' FROM material.matcode_master WHERE mat_code='EL9L-CS05-D060-S40-BW' LIMIT 1 ON CONFLICT (mat_code) DO NOTHING;
INSERT INTO material.matcode_master (mat_code,category,item_desc,matl_desc,size1,size2,class_desc,et_desc) SELECT 'FLB-CS05-D030-C150-RF',category,item_desc,matl_desc,size1,size2,'C150','RF' FROM material.matcode_master WHERE mat_code='FLB-SS04-D030-C150-RF' LIMIT 1 ON CONFLICT (mat_code) DO NOTHING;
INSERT INTO material.matcode_master (mat_code,category,item_desc,matl_desc,size1,size2,class_desc,et_desc) SELECT 'FLB-SS04-D060-C150-RF',category,item_desc,matl_desc,size1,size2,'C150','RF' FROM material.matcode_master WHERE mat_code='FLB-CS05-D060-C150-RF' LIMIT 1 ON CONFLICT (mat_code) DO NOTHING;
INSERT INTO material.matcode_master (mat_code,category,item_desc,matl_desc,size1,size2,class_desc,et_desc) SELECT 'FLN-CS05-D140-C300-RF',category,item_desc,matl_desc,size1,size2,'C300','RF' FROM material.matcode_master WHERE mat_code='FLN-CS05-D140-C150-RF' LIMIT 1 ON CONFLICT (mat_code) DO NOTHING;
INSERT INTO material.matcode_master (mat_code,category,item_desc,matl_desc,size1,size2,class_desc,et_desc) SELECT 'FLN-CS05-D200-C300-RF',category,item_desc,matl_desc,size1,size2,'C300','RF' FROM material.matcode_master WHERE mat_code='FLN-CS05-D200-C150-RF' LIMIT 1 ON CONFLICT (mat_code) DO NOTHING;

-- ── PART 2: bom mat_code UPDATE ────────────────────────────────────
-- ⚠️ 각 항목 영향 범위 확인 후 개별 실행 권장

-- [1] ELBOW: EL4L(45D) → EL9L(LR 90D) — ELBOW 타입 변경. 엔지니어링 확인 필요
-- BOM 4행 영향
-- UPDATE material.bom SET mat_code = 'EL9L-SS04-D080-S40S-BW' WHERE mat_code = 'EL4L-SS04-D080-S40S-BW';

-- [2] EL9L-CS05-D060: 재질 파싱 실패 (A234-WP22 CL1 = 잘못된 코드) → 실행 제외
-- 원본 BOM표기를 설계팀에 확인 후 수동 처리 필요

-- [3] FLANGE-BLIND DN150: A105 → A182-F304 재질 변경 (BOM 6행)
UPDATE material.bom SET mat_code = 'FLB-SS04-D060-C150-RF' WHERE mat_code = 'FLB-CS05-D060-C150-RF';

-- [4] FLANGE-BLIND DN80: A182-F304 → A105 재질 변경 (BOM 1행)
UPDATE material.bom SET mat_code = 'FLB-CS05-D030-C150-RF' WHERE mat_code = 'FLB-SS04-D030-C150-RF';

-- [5] FLANGE DN350: CL150 → CL300 등급 변경 (BOM 12행 전체 영향 — 프로젝트 전체)
-- ⚠️ 전체 12행 변경: 설계 의도 확인 후 실행
-- UPDATE material.bom SET mat_code = 'FLN-CS05-D140-C300-RF' WHERE mat_code = 'FLN-CS05-D140-C150-RF';

-- [6] FLANGE DN500: CL150 → CL300 등급 변경 (BOM 19행 전체 영향 — 프로젝트 전체)
-- ⚠️ 전체 19행 변경: 설계 의도 확인 후 실행
-- UPDATE material.bom SET mat_code = 'FLN-CS05-D200-C300-RF' WHERE mat_code = 'FLN-CS05-D200-C150-RF';

-- ── 결과 확인 ──────────────────────────────────────────────────────────
SELECT mat_code, COUNT(*) AS cnt FROM material.bom GROUP BY mat_code ORDER BY cnt DESC LIMIT 30;