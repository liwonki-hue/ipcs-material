-- Speciality BOM/Received 수량 불일치 수정

-- SIGHT GLASS: qty 2 → 1 (B1/B2-SG-32007)
UPDATE material.receiving SET qty = 1 WHERE id = 3459;
UPDATE material.receiving SET qty = 1 WHERE id = 3460;

-- FLEXIBLE JOINT: 동일 Tag 중복 행 삭제 (8" x 350L 제거, 10" x 350L 유지)
-- B0-FJ-36004: id=2887 (10" 유지) / id=2911 (8" 삭제)
-- B0-FJ-36005: id=2888 (10" 유지) / id=2912 (8" 삭제)
DELETE FROM material.receiving WHERE id IN (2911, 2912);

-- 확인
SELECT id, tag, full_description, qty
FROM material.receiving
WHERE tag IN ('B0-FJ-36004','B0-FJ-36005','B1-SG-32007','B2-SG-32007')
ORDER BY tag;
