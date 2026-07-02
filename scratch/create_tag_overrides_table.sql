-- 미매칭 Tag(BOM에 없는 Valve/Speciality Tag)에 수동으로 ISO Drawing/Line No를 지정하기 위한 테이블
create table if not exists tag_overrides (
    tag text primary key,
    iso_dwg_no text,
    line_no text,
    updated_at timestamptz default now()
);
alter table tag_overrides enable row level security;
create policy "Public Access" on tag_overrides for all using (true) with check (true);
