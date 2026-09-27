# Issue Date가 On-Site Date보다 빠른 PKG의 Issue Date를 On-Site Date로 정정 — 변경 전 값은 JSON으로 백업
import json
import sys
import psycopg2

url = [l.split('=', 1)[1].strip() for l in open('.env', encoding='utf-8') if l.startswith('SUPABASE_DB_URL')][0]
conn = psycopg2.connect(url)
cur = conn.cursor()
cur.execute("""select pkg_no, status, on_site::text, issue_date::text, updated_at::text
               from pl_updates where issue_date is not null and on_site is not null and issue_date < on_site
               order by pkg_no""")
rows = cur.fetchall()
backup = [dict(zip(['pkg_no', 'status', 'on_site', 'issue_date', 'updated_at'], r)) for r in rows]
json.dump(backup, open('scratch/BACKUP_issue_before_onsite_20260927.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('targets', len(rows))
by_gap = {}
for b in backup:
    by_gap.setdefault((b['issue_date'], b['on_site']), 0)
    by_gap[(b['issue_date'], b['on_site'])] += 1
for k, v in sorted(by_gap.items()):
    print('  issue', k[0], '-> on_site', k[1], ':', v)
cur.execute("""update pl_updates set issue_date = on_site, updated_at = now()
               where issue_date is not null and on_site is not null and issue_date < on_site""")
print('updated', cur.rowcount)
cur.execute("select count(*) from pl_updates where issue_date < on_site")
print('remaining', cur.fetchone()[0])
if '--commit' in sys.argv:
    conn.commit()
    print('committed')
else:
    conn.rollback()
    print('dry-run (rolled back)')
