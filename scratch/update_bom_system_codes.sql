-- BOM 시스템 코드 통일화 (기존 시스템과 일치)
-- Supabase SQL Editor에서 실행

UPDATE material.bom SET system = 'HW'      WHERE system IN ('HWR', 'HWS');
UPDATE material.bom SET system = 'GT MISC' WHERE system = 'IG';
UPDATE material.bom SET system = 'FW'      WHERE system = 'BWF';
UPDATE material.bom SET system = 'CCW'     WHERE system IN ('CWR', 'CWS');
UPDATE material.bom SET system = 'SW'      WHERE system = 'UW';
UPDATE material.bom SET system = 'N2'      WHERE system = 'LN';
UPDATE material.bom SET system = 'LP'      WHERE system = 'LS';
UPDATE material.bom SET system = 'HP'      WHERE system = 'HS';
