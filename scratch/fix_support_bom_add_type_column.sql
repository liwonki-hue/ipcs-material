-- support_bom 테이블에 누락된 type 컬럼 추가
ALTER TABLE public.support_bom ADD COLUMN IF NOT EXISTS type text;
