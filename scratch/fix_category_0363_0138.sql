-- 0363/0138 category Speciality → Valve 변경

UPDATE material.receiving SET category = 'Valve' WHERE doc_no = 'PGU-DE-0363';
UPDATE material.receiving SET category = 'Valve' WHERE doc_no = 'PGU-DE-0138';

-- 확인
SELECT doc_no, category, COUNT(*) AS cnt
FROM material.receiving
WHERE doc_no IN ('PGU-DE-0363', 'PGU-DE-0138')
GROUP BY doc_no, category
ORDER BY doc_no;
