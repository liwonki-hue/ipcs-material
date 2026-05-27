-- pl_updates: Package List 편집 내용 저장 (pkg_no 기준 upsert)
CREATE TABLE IF NOT EXISTS material.pl_updates (
    pkg_no       TEXT PRIMARY KEY,
    status       TEXT,
    on_site      DATE,
    custom_clear DATE,
    issue_date   DATE,
    remark       TEXT,
    updated_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE material.pl_updates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_all" ON material.pl_updates
    FOR ALL TO anon USING (true) WITH CHECK (true);

GRANT ALL ON material.pl_updates TO anon;
