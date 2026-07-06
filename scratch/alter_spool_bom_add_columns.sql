-- spool_bom에 MAT1/MAT2/RATING 컬럼 추가 (Spool BOM Raw File 재적재 준비)
ALTER TABLE public.spool_bom
    ADD COLUMN IF NOT EXISTS mat1 text,
    ADD COLUMN IF NOT EXISTS mat2 text,
    ADD COLUMN IF NOT EXISTS rating text;
