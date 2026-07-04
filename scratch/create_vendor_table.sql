-- Vendor(타사공급, Not-MTO) 자재 테이블 생성 — Others 탭과 동일 포맷, 입고/재고 계산 대상 아님(현장 설치 참고용)
create table if not exists public.vendor (
    id bigint generated always as identity primary key,
    mat_code text,
    category text default 'Others',
    tag text,
    system text,
    iso_dwg_no text,
    line_no text,
    full_description text,
    uom text default 'EA',
    qty numeric,
    mat1 text,
    mat2 text,
    created_at timestamptz default now()
);

alter table public.vendor enable row level security;

create policy "Public Access Select" on public.vendor
    for select using (true);

create policy "Public Access Insert" on public.vendor
    for insert with check (true);

create policy "Public Access Delete" on public.vendor
    for delete using (true);
