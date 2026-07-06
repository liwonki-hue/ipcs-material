# System Health Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 5th card ("System Health") to the Data Health tab (built in the `2026-07-06-data-health-tab.md` plan) that detects the recurring "RLS policy missing → query silently returns 0 rows" failure mode (documented in `project_valve_bucket_tag_fix.md` and `project_v_support_kpi_semantics.md`) by checking row counts on the core tables via lightweight `head:true` count queries.

**Architecture:** Extends the existing Data Health tab's card grid from 4 to 5 columns and reuses its click-to-expand + export pattern exactly. A single async function queries `count: 'exact', head: true` against each core table and flags any table expected to hold data that comes back 0.

**Tech Stack:** Vanilla JS, Supabase JS client (`supabaseClient`, already global).

## Global Constraints

- **Depends on the Data Health tab plan (`2026-07-06-data-health-tab.md`) being implemented first.** This plan only adds the 5th card to markup/functions that plan created — do not start this plan until that one's Task 8 (final smoke test) is done.
- Scope is read-side 0-row detection only. View semantic validation (e.g. re-deriving `v_support_kpi` from source tables) is explicitly out of scope for this round, per brainstorming decision — do not add it.
- `head: true` count queries must not fetch row data — this needs to stay cheap enough to run automatically every time the Data Health tab opens (no manual trigger button).

---

### Task 1: `computeSystemHealth` — table row-count probe

**Files:**
- Modify: `static/js/app.js` — add function right after `computeSupportUnmatched` (added by the Data Health tab plan's Task 5)

**Interfaces:**
- Produces: `async function computeSystemHealth()` → `Promise<{ rows: Array<{table: string, count: number, status: 'ok'|'warn'}> }>`
- Consumes: `supabaseClient` (global)

- [ ] **Step 1: Implement the health-check function**

```javascript
// Data Health Card 5 (System Health): RLS 정책 누락 시 anon key 쿼리가 에러 없이 0행을
// 반환하는 패턴(project_valve_bucket_tag_fix, project_v_support_kpi_semantics에서 실제 발생)을
// 감지한다. 이번 범위는 read-side 0행 감지만 — 뷰 의미 검증(v_support_kpi류)은 범위 밖.
const SYSTEM_HEALTH_TABLES = ['bom', 'receiving', 'matcode_master', 'support_bom', 'support_receiving', 'pl_updates', 'vendor'];

async function computeSystemHealth() {
    const results = await Promise.all(SYSTEM_HEALTH_TABLES.map(async table => {
        const { count, error } = await supabaseClient
            .from(table)
            .select('*', { count: 'exact', head: true });
        if (error) {
            console.error(`computeSystemHealth: ${table} 조회 실패`, error);
            return { table, count: -1, status: 'warn' };
        }
        return { table, count: count || 0, status: (count || 0) > 0 ? 'ok' : 'warn' };
    }));
    return { rows: results };
}
```

- [ ] **Step 2: Manually verify in browser console**

Run: `python app.py`, open the app, wait for initial load, open DevTools console, run `await computeSystemHealth()`.
Expected: resolves to `{ rows: [...] }` with 7 entries, each `count > 0` and `status: 'ok'` for every table (since all 7 tables are known to currently hold data per project memory — `bom` ~45k rows, `receiving`, `matcode_master` ~660, `support_bom` ~14k, `support_receiving`, `pl_updates`, `vendor` ~2.3k). If any table unexpectedly shows `count: 0`, that is a real finding, not a bug in this function — investigate that table's RLS policy before proceeding (do not silence or work around it here).

- [ ] **Step 3: Commit**

```bash
git add static/js/app.js
git commit -m "feat: System Health 카드 계산 함수(테이블 0행 감지) 추가"
```

---

### Task 2: Add the 5th card + detail table to the Data Health tab markup

**Files:**
- Modify: `templates/index.html` (inside `msPanelDataHealth`, added by the Data Health tab plan's Task 1)

**Interfaces:**
- Produces: DOM ids `dhCard-health`, `dhCard-health-pct`, `dhCard-health-sub`, `dhDetail-health`, `dhTable-health`, `dhExport-health`.

- [ ] **Step 1: Widen the card grid to 5 columns and add the 5th card**

In `templates/index.html`, inside `msPanelDataHealth`, change:

```html
                     <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);">
```

to:

```html
                     <div class="kpi-grid" style="grid-template-columns:repeat(5,1fr);">
```

Then, right after the "Unregistered MatCode" card's closing `</div>` (the 4th `kpi-card`) and before the `</div>` that closes `.kpi-grid`, add:

```html
                         <div class="kpi-card" id="dhCard-health" style="cursor:pointer;">
                             <div class="kpi-info" style="flex:1;">
                                 <div class="kpi-title" style="display:flex;align-items:center;gap:5px;">
                                     <i class="fas fa-heartbeat" style="color:#c62828;font-size:10px;"></i> System Health
                                 </div>
                                 <div class="kpi-value" id="dhCard-health-pct">—</div>
                                 <div class="kpi-desc" id="dhCard-health-sub" style="margin-top:2px;">Loading...</div>
                             </div>
                         </div>
```

- [ ] **Step 2: Add the 5th detail panel**

Right after the `dhDetail-newmat` panel's closing `</div>` (and before `msPanelDataHealth`'s own closing `</div>`), add:

```html
                     <div id="dhDetail-health" class="panel data-panel" style="display:none;margin-top:16px;">
                         <div class="panel-header">
                             <h3><i class="fas fa-heartbeat"></i> Table Row Count (RLS 0-row check)</h3>
                             <button class="btn btn-outline" id="dhExport-health" style="height:32px;font-size:12px;display:flex;align-items:center;gap:6px;"><i class="fas fa-file-excel" style="color:#1d6f42;"></i> Export</button>
                         </div>
                         <div class="table-responsive">
                             <table class="data-table" id="dhTable-health">
                                 <thead><tr><th style="text-align:center;">Table</th><th style="text-align:center;">Row Count</th><th style="text-align:center;">Status</th></tr></thead>
                                 <tbody></tbody>
                             </table>
                         </div>
                     </div>
```

- [ ] **Step 3: Manually verify markup**

Run: `python app.py`, go to Material Status → DATA HEALTH.
Expected: 5 cards now show in a row (System Health shows "—"/"Loading..." until Task 3 wires it up), no console errors, no layout overflow (5 cards should fit the same way 4 did since `grid-template-columns:repeat(5,1fr)` reflows automatically).

- [ ] **Step 4: Commit**

```bash
git add templates/index.html
git commit -m "feat: Data Health 탭에 System Health 카드/상세 패널 마크업 추가"
```

---

### Task 3: Wire the 5th card into `renderDataHealthCards`

**Files:**
- Modify: `static/js/app.js` (`renderDataHealthCards`, `DH_COLUMNS`, `_dhRows`, `_dhToggle`'s accordion-close list — all added by the Data Health tab plan)

**Interfaces:**
- Consumes: `computeSystemHealth()` (Task 1), `exportHealthList()` (from the Data Health tab plan)

- [ ] **Step 1: Extend `_dhRows` and `DH_COLUMNS`**

Change:

```javascript
let _dhRows = { valve: [], support: [], bucket: [], newmat: [] };
```

to:

```javascript
let _dhRows = { valve: [], support: [], bucket: [], newmat: [], health: [] };
```

Change the `DH_COLUMNS` object to add a `health` entry:

```javascript
const DH_COLUMNS = {
    valve:   [{header:'Tag',key:'tag'},{header:'Category',key:'category'},{header:'Item',key:'item'},{header:'ISO Drawing',key:'iso'}],
    support: [{header:'Support Tag',key:'supportTag'},{header:'Item',key:'item'},{header:'Matl',key:'matl'},{header:'Size/Type',key:'sizeOrType'},{header:'Qty',key:'qty'}],
    bucket:  [{header:'Tag',key:'tag'},{header:'Category',key:'category'},{header:'PKG NO',key:'plNo'},{header:'Description',key:'desc'}],
    newmat:  [{header:'MatCode',key:'matCode'},{header:'Category',key:'category'},{header:'Description',key:'desc'},{header:'Qty',key:'qty'}],
    health:  [{header:'Table',key:'table'},{header:'Row Count',key:'count'},{header:'Status',key:'status'}]
};
```

- [ ] **Step 2: Add `health` to the accordion-close list in `_dhToggle`**

Change:

```javascript
    ['valve', 'support', 'bucket', 'newmat'].forEach(k => {
        document.getElementById(`dhDetail-${k}`).style.display = 'none';
    });
```

to:

```javascript
    ['valve', 'support', 'bucket', 'newmat', 'health'].forEach(k => {
        document.getElementById(`dhDetail-${k}`).style.display = 'none';
    });
```

- [ ] **Step 3: Call `computeSystemHealth` and set the card in `renderDataHealthCards`**

Change:

```javascript
async function renderDataHealthCards() {
    const valveResult  = computeValveTagMismatch();
    const bucketResult = computeBucketTagRegression();
    const newmatResult = computeNewMatUnregistered();
    const supportResult = await computeSupportUnmatched();

    _dhRows.valve   = valveResult.unmatchedRows;
    _dhRows.bucket  = bucketResult.rows;
    _dhRows.newmat  = newmatResult.rows;
    _dhRows.support = supportResult.rows;
```

to:

```javascript
async function renderDataHealthCards() {
    const valveResult  = computeValveTagMismatch();
    const bucketResult = computeBucketTagRegression();
    const newmatResult = computeNewMatUnregistered();
    const [supportResult, healthResult] = await Promise.all([
        computeSupportUnmatched(),
        computeSystemHealth(),
    ]);

    _dhRows.valve   = valveResult.unmatchedRows;
    _dhRows.bucket  = bucketResult.rows;
    _dhRows.newmat  = newmatResult.rows;
    _dhRows.support = supportResult.rows;
    _dhRows.health  = healthResult.rows;
```

Then, right after the existing `_dhSetCard('newmat', ...)` call, add:

```javascript
    const warnCount = _dhRows.health.filter(r => r.status === 'warn').length;
    _dhSetCard('health', warnCount,
        warnCount > 0 ? `${warnCount} table(s) returned 0 rows — check RLS policy` : 'All core tables OK');
```

And change the two remaining `forEach`/`addEventListener` lists (the "열려있는 상세 패널" refresh loop, and the click/export wiring block) to include `health`:

```javascript
    // 열려있는 상세 패널이 있으면 새 데이터로 다시 그림
    ['valve', 'support', 'bucket', 'newmat', 'health'].forEach(key => {
        const panel = document.getElementById(`dhDetail-${key}`);
        if (panel && panel.style.display !== 'none') _dhRenderTable(key, DH_COLUMNS[key]);
    });

    if (!_dhInited) {
        _dhInited = true;
        document.getElementById('dhCard-valve').addEventListener('click', () => _dhToggle('valve', DH_COLUMNS.valve));
        document.getElementById('dhCard-support').addEventListener('click', () => _dhToggle('support', DH_COLUMNS.support));
        document.getElementById('dhCard-bucket').addEventListener('click', () => _dhToggle('bucket', DH_COLUMNS.bucket));
        document.getElementById('dhCard-newmat').addEventListener('click', () => _dhToggle('newmat', DH_COLUMNS.newmat));
        document.getElementById('dhCard-health').addEventListener('click', () => _dhToggle('health', DH_COLUMNS.health));

        document.getElementById('dhExport-valve').addEventListener('click', () => exportHealthList(_dhRows.valve, DH_COLUMNS.valve, 'Valve Tag Mismatch', 'DataHealth_ValveTag'));
        document.getElementById('dhExport-support').addEventListener('click', () => exportHealthList(_dhRows.support, DH_COLUMNS.support, 'Support Unmatched', 'DataHealth_Support'));
        document.getElementById('dhExport-bucket').addEventListener('click', () => exportHealthList(_dhRows.bucket, DH_COLUMNS.bucket, 'Bucket Tag Regression', 'DataHealth_BucketTag'));
        document.getElementById('dhExport-newmat').addEventListener('click', () => exportHealthList(_dhRows.newmat, DH_COLUMNS.newmat, 'Unregistered MatCode', 'DataHealth_NewMat'));
        document.getElementById('dhExport-health').addEventListener('click', () => exportHealthList(_dhRows.health, DH_COLUMNS.health, 'System Health', 'DataHealth_SystemHealth'));
    }
}
```

- [ ] **Step 4: Manually verify full flow**

Run: `python app.py`, go to Material Status → DATA HEALTH.
Expected: System Health card shows a count (0 if all tables are healthy, styled green; >0 and red if any table is flagged) and a sub-text. Clicking it opens a table listing all 7 tables with their row count and status. Clicking Export downloads an `.xlsx` with those rows. Accordion behavior (only one detail panel open at a time) still works across all 5 cards.

- [ ] **Step 5: Commit**

```bash
git add static/js/app.js
git commit -m "feat: System Health 카드를 Data Health 렌더링/아코디언/Export에 연결"
```

---

### Task 4: Full smoke test (regression check)

**Files:** none (verification only)

- [ ] **Step 1: Full smoke test**

Run: `python app.py`, click through every sidebar item once, paying particular attention to Material Status → Data Health (all 5 cards) and re-checking Stock/Shortage/Surplus are unaffected.
Expected: no console errors anywhere; all 5 Data Health cards populate; accordion/export works for all 5.

- [ ] **Step 2: Commit (only if a fix was needed)**

```bash
git add -A
git commit -m "fix: System Health 카드 추가 후 발견된 회귀 수정"
```
