-- support_receiving 테이블에 PKG, PACKAGE NO 컬럼 추가
ALTER TABLE public.support_receiving
    ADD COLUMN IF NOT EXISTS pkg        text,
    ADD COLUMN IF NOT EXISTS package_no text;
