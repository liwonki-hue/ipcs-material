-- BOM에서 Speciality 항목 삭제 (FLEXIBLE HOSE/JOINT, AIR TRAP, STEAM TRAP, EDUCTOR, MIXER)
-- 실행 전 확인용 SELECT (삭제 대상 97건)
SELECT full_description, COUNT(*) AS cnt
FROM material.bom
WHERE full_description ILIKE '%FLEXIBLE HOSE%'
   OR full_description ILIKE '%FLEXIBLE JOINT%'
   OR full_description ILIKE '%AIR TRAP%'
   OR full_description ILIKE '%STEAM TRAP%'
   OR full_description ILIKE '%EDUCTOR%'
   OR full_description ILIKE '%MIXER%'
GROUP BY full_description
ORDER BY full_description;

-- 삭제 실행 (RESTRICTION ORIFICE 제외)
DELETE FROM material.bom
WHERE (
    full_description ILIKE '%FLEXIBLE HOSE%'
    OR full_description ILIKE '%FLEXIBLE JOINT%'
    OR full_description ILIKE '%AIR TRAP%'
    OR full_description ILIKE '%STEAM TRAP%'
    OR full_description ILIKE '%EDUCTOR%'
    OR full_description ILIKE '%MIXER%'
)
AND full_description NOT ILIKE '%RESTRICTION ORIFICE%';
