-- Valve Receiving 화면 개선: Operation Type/Valve Type 구분 표시 + Mat1/Mat2 분리 + BOM 기준 Size/Rating 보정을 위한 컬럼 추가
ALTER TABLE public.receiving ADD COLUMN IF NOT EXISTS op_type text;
ALTER TABLE public.receiving ADD COLUMN IF NOT EXISTS valve_type text;
ALTER TABLE public.receiving ADD COLUMN IF NOT EXISTS mat1 text;
ALTER TABLE public.receiving ADD COLUMN IF NOT EXISTS mat2 text;
ALTER TABLE public.receiving ADD COLUMN IF NOT EXISTS size text;
ALTER TABLE public.receiving ADD COLUMN IF NOT EXISTS rating text;
