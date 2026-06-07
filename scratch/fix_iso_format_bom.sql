-- bom 테이블 ISO 형식 변환: CCP-W-...(XOFn) → CCP-W-...-X
-- 예: CCP-W-B028-PI-140-AS-002(1OF6) → CCP-W-B028-PI-140-AS-002-1
-- 영향: ~3,838개 unique ISO (전체 ~45,763행)

UPDATE material.bom
SET iso_dwg_no = regexp_replace(iso_dwg_no, '\((\d+)OF\d+\)', '-\1', 'i')
WHERE iso_dwg_no ~ '\(\d+OF\d+\)';
