-- BOM tag 오타 수정: BO-SP-2844x (영문 O) → B0-SP-2844x (숫자 0)
UPDATE material.bom SET tag = 'B0-SP-28441' WHERE tag = 'BO-SP-28441';
UPDATE material.bom SET tag = 'B0-SP-28445' WHERE tag = 'BO-SP-28445';
UPDATE material.bom SET tag = 'B0-SP-28449' WHERE tag = 'BO-SP-28449';

-- 확인
SELECT tag, full_description FROM material.bom WHERE tag IN ('B0-SP-28441','B0-SP-28445','B0-SP-28449');
