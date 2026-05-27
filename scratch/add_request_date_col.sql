-- pl_updates에 request_date 컬럼 추가
ALTER TABLE material.pl_updates
    ADD COLUMN IF NOT EXISTS request_date DATE;
