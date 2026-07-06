# Safe Reload Helper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reusable Python helper (`scripts/supabase_reload.py`) that wraps the "delete category rows → reinsert from Excel" pattern this project already uses (confirmed in `scratch/reload_valve_receiving.py`) with a mandatory pre-delete JSON backup and count verification at each step, so a failed reload can always be recovered from and a silent partial failure is never mistaken for success.

**Architecture:** A single-file Python module with one public function, `safe_reload(...)`, that takes already-prepared row dicts (category-specific Excel parsing stays in each one-off `scratch/*.py` script, unchanged) and performs the risky delete+insert sequence. It talks to Supabase via plain `requests` calls (matching the existing scripts' style — no new dependency like `supabase-py`). Backups are plain JSON files written to `scratch/backups/`.

**Tech Stack:** Python 3, `requests` (already a transitive need — every existing `scratch/*.py` reload script already imports it), standard library `json`/`os`/`datetime`.

## Global Constraints

- Do not modify any existing `scratch/*.py` script — they already ran and their job is done. This plan only adds a new reusable helper for *future* reload scripts to import.
- `scripts/supabase_reload.py` must not hardcode a Supabase URL/key — the caller passes them in, since different one-off scripts may target either the ipcs-material project or (read-only, per `CLAUDE.md`) the separate ipcs-drawing project.
- The function must never proceed past a step whose safety check fails — no `--force` escape hatch. If verification fails, the script must exit non-zero after printing exactly what mismatched.
- Preserve the existing `--dry-run` CLI convention already used by every `scratch/*.py` reload script (checked via `'--dry-run' in sys.argv`).

---

### Task 1: `scripts/supabase_reload.py` — backup step

**Files:**
- Create: `scripts/supabase_reload.py`
- Create: `scratch/backups/` (directory — created at runtime by the helper if missing, not committed empty)

**Interfaces:**
- Produces: `backup_existing_rows(url, key, table, category_field, category_value, backup_dir='scratch/backups')` → returns `(backup_path: str, rows: list[dict])`

- [ ] **Step 1: Write the backup function**

```python
# scripts/supabase_reload.py
# Supabase 테이블을 category 단위로 삭제 후 재적재할 때 쓰는 안전장치 헬퍼.
# 기존 scratch/reload_*.py 스크립트들은 삭제 전 백업이 없어, 삽입 단계에서 실패하면
# 복구 수단이 없었다 (project_support_bom_openpyxl_dataloss 사고와 같은 계열의 위험).
import json
import os
import sys
from datetime import datetime

import requests


def backup_existing_rows(url, key, table, category_field, category_value, backup_dir='scratch/backups'):
    """삭제 전 해당 category의 기존 행 전체를 조회해서 타임스탬프 JSON 파일로 저장한다.
    읽기 전용 단계라 이 함수 자체는 절대 데이터를 바꾸지 않는다."""
    headers = {'apikey': key, 'Authorization': f'Bearer {key}'}
    rows = []
    offset = 0
    while True:
        r = requests.get(
            f'{url}/rest/v1/{table}',
            headers=headers,
            params={'select': '*', category_field: f'eq.{category_value}', 'limit': 1000, 'offset': offset},
        )
        r.raise_for_status()
        batch = r.json()
        rows.extend(batch)
        if len(batch) < 1000:
            break
        offset += 1000

    os.makedirs(backup_dir, exist_ok=True)
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    backup_path = os.path.join(backup_dir, f'{table}_{category_value}_{timestamp}.json')
    with open(backup_path, 'w', encoding='utf-8') as f:
        json.dump(rows, f, ensure_ascii=False, indent=2)

    print(f'백업 완료: {len(rows)}행 -> {backup_path}')
    return backup_path, rows
```

- [ ] **Step 2: Manually verify against a real (read-only) query**

Run this ad-hoc check against the live `receiving` table (Valve category, read-only — no delete/insert involved yet):

```bash
python -c "
from scripts.supabase_reload import backup_existing_rows
URL = 'https://ognhvfvlboqblueuldlm.supabase.co'
KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nbmh2ZnZsYm9xYmx1ZXVsZGxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3MzY2NTUsImV4cCI6MjA4ODMxMjY1NX0.paO5jr16M7yTySUAp9LgberoatDds9rTNa_eCU_ET_I'
path, rows = backup_existing_rows(URL, KEY, 'receiving', 'category', 'Valve')
print('rows:', len(rows))
"
```

Expected: prints `백업 완료: <N>행 -> scratch/backups/receiving_Valve_<timestamp>.json` where N matches the currently known Valve receiving row count (~3,892 per project memory — exact number may have changed since, that's fine, just confirm it's a large plausible number, not 0 or an error). Confirm the JSON file exists and `len(json.load(open(path)))` matches N.

- [ ] **Step 3: Commit**

```bash
git add scripts/supabase_reload.py
git commit -m "feat: 재적재 안전장치 헬퍼 - 삭제 전 백업 함수 추가"
```

---

### Task 2: `safe_reload` — sanity print, dry-run gate, delete-with-verification

**Files:**
- Modify: `scripts/supabase_reload.py` (append to the file created in Task 1)

**Interfaces:**
- Consumes: `backup_existing_rows` (Task 1)
- Produces: `_delete_category(url, key, table, category_field, category_value, expected_count)` → returns `int` (actual deleted count), raises `RuntimeError` if it doesn't match `expected_count`.

- [ ] **Step 1: Write the sanity-print + delete-with-verification helpers**

Append to `scripts/supabase_reload.py`:

```python
def _print_sanity_check(backup_rows, new_rows, qty_field='qty'):
    """삭제 전 마지막 확인 — 기존 데이터와 새 데이터의 규모가 터무니없이 다르면 사람이 알아챌 수 있게 출력."""
    old_qty = sum(float(r.get(qty_field) or 0) for r in backup_rows)
    new_qty = sum(float(r.get(qty_field) or 0) for r in new_rows)
    print(f'기존: {len(backup_rows)}행, qty 합계 {old_qty:,.1f}')
    print(f'신규: {len(new_rows)}행, qty 합계 {new_qty:,.1f}')


def _delete_category(url, key, table, category_field, category_value, expected_count):
    """category 전체 삭제. Prefer: return=representation으로 실제 삭제된 행수를 받아
    백업 시점 행수(expected_count)와 일치하는지 확인 — 불일치하면 아직 삽입 전이므로 안전하게 중단."""
    headers = {
        'apikey': key, 'Authorization': f'Bearer {key}',
        'Content-Type': 'application/json', 'Prefer': 'return=representation',
    }
    r = requests.delete(
        f'{url}/rest/v1/{table}',
        headers=headers,
        params={category_field: f'eq.{category_value}'},
    )
    r.raise_for_status()
    deleted = len(r.json())
    print(f'삭제 완료: {deleted}행 (백업 시점 {expected_count}행)')
    if deleted != expected_count:
        raise RuntimeError(
            f'삭제 건수({deleted})가 백업 건수({expected_count})와 일치하지 않습니다. '
            f'백업 파일을 확인하고 수동으로 복구하세요 — 아직 재삽입 전이라 데이터는 남아있지 않을 수 있습니다.'
        )
    return deleted
```

- [ ] **Step 2: Manually verify the sanity-print helper (no network needed)**

```bash
python -c "
from scripts.supabase_reload import _print_sanity_check
_print_sanity_check([{'qty': 10}, {'qty': 20}], [{'qty': 15}, {'qty': 15}, {'qty': 5}])
"
```

Expected output:
```
기존: 2행, qty 합계 30.0
신규: 3행, qty 합계 35.0
```

- [ ] **Step 3: Commit**

```bash
git add scripts/supabase_reload.py
git commit -m "feat: 재적재 안전장치 헬퍼 - 수량 대조 출력 및 삭제 검증 함수 추가"
```

---

### Task 3: `safe_reload` — batch insert + final count verification + orchestration

**Files:**
- Modify: `scripts/supabase_reload.py` (append)

**Interfaces:**
- Consumes: `backup_existing_rows`, `_print_sanity_check`, `_delete_category` (Tasks 1-2)
- Produces: `safe_reload(url, key, table, category_field, category_value, new_rows, qty_field='qty', backup_dir='scratch/backups', batch_size=500)` — the single public entry point future reload scripts import.

- [ ] **Step 1: Write batch insert + final verification + the orchestrating `safe_reload`**

Append to `scripts/supabase_reload.py`:

```python
def _batch_insert(url, key, table, rows, batch_size=500):
    headers = {
        'apikey': key, 'Authorization': f'Bearer {key}',
        'Content-Type': 'application/json', 'Prefer': 'return=minimal',
    }
    ok, fail = 0, 0
    for i in range(0, len(rows), batch_size):
        chunk = rows[i:i + batch_size]
        resp = requests.post(f'{url}/rest/v1/{table}', headers=headers, json=chunk)
        if resp.status_code in (200, 201):
            ok += len(chunk)
        else:
            fail += len(chunk)
            print(f'  삽입 실패 batch {i}: {resp.status_code} {resp.text[:300]}')
    print(f'삽입 완료: ok={ok} fail={fail}')
    return ok, fail


def _verify_final_count(url, key, table, category_field, category_value, expected_count):
    headers = {'apikey': key, 'Authorization': f'Bearer {key}', 'Prefer': 'count=exact'}
    r = requests.get(
        f'{url}/rest/v1/{table}',
        headers=headers,
        params={'select': category_field, category_field: f'eq.{category_value}', 'limit': 1},
    )
    r.raise_for_status()
    content_range = r.headers.get('Content-Range', '')
    actual_count = int(content_range.split('/')[-1]) if '/' in content_range else -1
    print(f'최종 DB 행수: {actual_count} (기대값 {expected_count})')
    if actual_count != expected_count:
        raise RuntimeError(
            f'최종 행수({actual_count})가 신규 데이터 행수({expected_count})와 일치하지 않습니다. '
            f'삽입이 일부만 성공했을 수 있습니다 — 백업 파일로 복구를 검토하세요.'
        )


def safe_reload(url, key, table, category_field, category_value, new_rows,
                 qty_field='qty', backup_dir='scratch/backups', batch_size=500, dry_run=False):
    """category 단위 삭제+재적재를 안전하게 수행한다.
    순서: 백업 -> 수량 대조 출력 -> (dry_run이면 여기서 종료) -> 삭제(+건수검증) -> 배치삽입 -> 최종건수검증."""
    _, backup_rows = backup_existing_rows(url, key, table, category_field, category_value, backup_dir)
    _print_sanity_check(backup_rows, new_rows, qty_field)

    if dry_run:
        print('[DRY RUN] 여기서 종료합니다. 삭제/삽입은 실행되지 않았습니다.')
        return

    _delete_category(url, key, table, category_field, category_value, len(backup_rows))
    _batch_insert(url, key, table, new_rows, batch_size)
    _verify_final_count(url, key, table, category_field, category_value, len(new_rows))
    print(f'safe_reload 완료: {table}.{category_field}={category_value}, {len(new_rows)}행')


if __name__ == '__main__':
    print(__doc__ or 'scripts/supabase_reload.py는 직접 실행하는 스크립트가 아니라 import해서 쓰는 헬퍼 모듈입니다.')
```

- [ ] **Step 2: Manually verify `--dry-run` semantics with a tiny throwaway table probe**

Since there is no disposable test table, verify the dry-run path only (never touches real data) against the real `receiving`/Valve category:

```bash
python -c "
from scripts.supabase_reload import safe_reload
URL = 'https://ognhvfvlboqblueuldlm.supabase.co'
KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nbmh2ZnZsYm9xYmx1ZXVsZGxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3MzY2NTUsImV4cCI6MjA4ODMxMjY1NX0.paO5jr16M7yTySUAp9LgberoatDds9rTNa_eCU_ET_I'
safe_reload(URL, KEY, 'receiving', 'category', 'Valve', new_rows=[{'qty': 1}], dry_run=True)
"
```

Expected: prints the backup line, the sanity-check comparison, then `[DRY RUN] 여기서 종료합니다...` and returns — **no delete or insert must occur**. Verify by re-running Task 1's Step 2 backup check afterward and confirming the Valve row count is unchanged.

- [ ] **Step 3: Commit**

```bash
git add scripts/supabase_reload.py
git commit -m "feat: safe_reload 공개 함수 완성 (백업-삭제-삽입-검증 전체 오케스트레이션)"
```

---

### Task 4: Document usage for future reload scripts

**Files:**
- Modify: `docs/superpowers/specs/2026-07-06-data-quality-engineering-design.md` (append a short "사용법" note under the section 3 already written)

**Interfaces:** none (documentation only)

- [ ] **Step 1: Add a usage example to the spec doc**

Append this snippet under the existing "## 3. 안전 재적재 스크립트" section of `docs/superpowers/specs/2026-07-06-data-quality-engineering-design.md`:

```markdown
### 사용 예시 (다음 재적재 스크립트부터 적용)

```python
import sys
sys.path.insert(0, '.')  # scratch/*.py에서 프로젝트 루트의 scripts/를 import하기 위함
from scripts.supabase_reload import safe_reload

# ... 기존처럼 Excel 파싱해서 new_rows(list[dict]) 준비 ...

safe_reload(
    url=URL, key=KEY, table='receiving',
    category_field='category', category_value='Valve',
    new_rows=new_rows,
    dry_run='--dry-run' in sys.argv,
)
```
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-07-06-data-quality-engineering-design.md
git commit -m "docs: safe_reload 사용 예시를 스펙 문서에 추가"
```
