-- Valve/Speciality 부속품의 원래 소속 밸브 Tag를 보존하기 위한 컬럼 추가
ALTER TABLE public.receiving ADD COLUMN IF NOT EXISTS parent_tag text;
