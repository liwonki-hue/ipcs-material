# Data Health Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Data Health" tab to the Material Status section that surfaces four data-quality metrics (Valve/Speciality Tag matching, Support unmatched Tags, bucket-tag regression, unregistered NEW-MAT codes) that today can only be found by an engineer running ad-hoc SQL.

**Architecture:** New 4th `ms-tab-btn` inside the existing `#material_status` section, following the exact Stock/Shortage/Surplus pattern already in `templates/index.html` and `static/js/app.js` (`_msActiveTab` / `switchMaterialStatusTab`). Four summary cards reuse the existing `.kpi-card` CSS class. Three of the four metrics are computed entirely client-side from data already loaded into `db.bom` / `db.receiving` / `db.bomTagMap` at app startup — no new network calls. The Support metric needs one new lightweight Supabase query against `support_bom`. Clicking a card toggles a detail `<table>` below it; each detail table has an Export-to-Excel button reusing the project's existing `XLSX` (SheetJS) pattern.

**Tech Stack:** Vanilla JS (no build step), Supabase JS client (already loaded as `supabaseClient` global), SheetJS `XLSX` (already loaded globally for other Export buttons), existing `.kpi-card` / `.data-table` CSS.

## Global Constraints

- No test framework exists for stateful/DOM-coupled JS in this project (confirmed: only pure parsing helpers get Node unit tests, added separately in the matching-rules-consolidation plan). Every task in this plan is verified by **manually loading the app in a browser and checking behavior**, per this project's existing convention (`CLAUDE.md` §8 "no test setup → verify build/works").
- Follow existing code style exactly: inline `style="..."` attributes (no new CSS classes unless one already exists to reuse), 4-space indent in `app.js`, Korean comments only where the *why* is non-obvious (per this project's CLAUDE.md comment policy).
- Do not touch Stock/Shortage/Surplus panels — only add new sibling markup/functions.
- Category display for Card ① comes from `window.getCategory(fullDescription, matCode)` — this already exists in `app.js:142` and must not be duplicated.

---

### Task 1: HTML scaffold — tab button, 4 cards, 4 detail panels

**Files:**
- Modify: `templates/index.html:1379` (tab bar — add 4th button after SURPLUS)
- Modify: `templates/index.html:1817` (insert new `msPanelDataHealth` div right before the `</section>` that closes `#material_status`, i.e. right after the closing `</div>` of `msPanelSurplus`)

**Interfaces:**
- Produces: DOM ids `msPanelDataHealth`, `dhCard-valve`, `dhCard-support`, `dhCard-bucket`, `dhCard-newmat`, `dhDetail-valve`, `dhDetail-support`, `dhDetail-bucket`, `dhDetail-newmat`, `dhTable-valve` (`<tbody>` inside), `dhTable-support`, `dhTable-bucket`, `dhTable-newmat`, and Export buttons `dhExport-valve`, `dhExport-support`, `dhExport-bucket`, `dhExport-newmat`. Task 7 (JS orchestration) consumes these exact ids.

- [ ] **Step 1: Add the 4th tab button**

In `templates/index.html`, the tab bar currently ends with (line 1379):

```html
                     <button class="ms-tab-btn" data-tab="surplus" style="padding:8px 24px;border:none;border-bottom:3px solid transparent;font-size:12px;font-weight:700;cursor:pointer;background:#fff;color:#888;margin-bottom:-2px;letter-spacing:0.5px;">SURPLUS</button>
                 </div>
```

Change it to:

```html
                     <button class="ms-tab-btn" data-tab="surplus" style="padding:8px 24px;border:none;border-bottom:3px solid transparent;font-size:12px;font-weight:700;cursor:pointer;background:#fff;color:#888;margin-bottom:-2px;letter-spacing:0.5px;">SURPLUS</button>
                     <button class="ms-tab-btn" data-tab="datahealth" style="padding:8px 24px;border:none;border-bottom:3px solid transparent;font-size:12px;font-weight:700;cursor:pointer;background:#fff;color:#888;margin-bottom:-2px;letter-spacing:0.5px;">DATA HEALTH</button>
                 </div>
```

- [ ] **Step 2: Add the Data Health panel**

Right after `msPanelSurplus`'s closing `</div>` (currently `templates/index.html:1817`, immediately before `</section>` that closes `#material_status`), insert:

```html
                 <div id="msPanelDataHealth" style="display:none;">
                     <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);">
                         <div class="kpi-card" id="dhCard-valve" style="cursor:pointer;">
                             <div class="kpi-info" style="flex:1;">
                                 <div class="kpi-title" style="display:flex;align-items:center;gap:5px;">
                                     <i class="fas fa-faucet" style="color:#00838f;font-size:10px;"></i> Valve/Speciality Tag Match
                                 </div>
                                 <div class="kpi-value" id="dhCard-valve-pct">—</div>
                                 <div class="kpi-desc" id="dhCard-valve-sub" style="margin-top:2px;">Loading...</div>
                             </div>
                         </div>
                         <div class="kpi-card" id="dhCard-support" style="cursor:pointer;">
                             <div class="kpi-info" style="flex:1;">
                                 <div class="kpi-title" style="display:flex;align-items:center;gap:5px;">
                                     <i class="fas fa-tools" style="color:#455a64;font-size:10px;"></i> Support Unmatched
                                 </div>
                                 <div class="kpi-value" id="dhCard-support-pct">—</div>
                                 <div class="kpi-desc" id="dhCard-support-sub" style="margin-top:2px;">Loading...</div>
                             </div>
                         </div>
                         <div class="kpi-card" id="dhCard-bucket" style="cursor:pointer;">
                             <div class="kpi-info" style="flex:1;">
                                 <div class="kpi-title" style="display:flex;align-items:center;gap:5px;">
                                     <i class="fas fa-exclamation-triangle" style="color:#f57f17;font-size:10px;"></i> Bucket-Tag Regression
                                 </div>
                                 <div class="kpi-value" id="dhCard-bucket-pct">—</div>
                                 <div class="kpi-desc" id="dhCard-bucket-sub" style="margin-top:2px;">Loading...</div>
                             </div>
                         </div>
                         <div class="kpi-card" id="dhCard-newmat" style="cursor:pointer;">
                             <div class="kpi-info" style="flex:1;">
                                 <div class="kpi-title" style="display:flex;align-items:center;gap:5px;">
                                     <i class="fas fa-barcode" style="color:#6a1b9a;font-size:10px;"></i> Unregistered MatCode
                                 </div>
                                 <div class="kpi-value" id="dhCard-newmat-pct">—</div>
                                 <div class="kpi-desc" id="dhCard-newmat-sub" style="margin-top:2px;">Loading...</div>
                             </div>
                         </div>
                     </div>

                     <div id="dhDetail-valve" class="panel data-panel" style="display:none;margin-top:16px;">
                         <div class="panel-header">
                             <h3><i class="fas fa-faucet"></i> Valve/Speciality Tags without Receiving</h3>
                             <button class="btn btn-outline" id="dhExport-valve" style="height:32px;font-size:12px;display:flex;align-items:center;gap:6px;"><i class="fas fa-file-excel" style="color:#1d6f42;"></i> Export</button>
                         </div>
                         <div class="table-responsive">
                             <table class="data-table" id="dhTable-valve">
                                 <thead><tr><th style="text-align:center;">Tag</th><th style="text-align:center;">Category</th><th style="text-align:center;">Item</th><th style="text-align:center;">ISO Drawing</th></tr></thead>
                                 <tbody></tbody>
                             </table>
                         </div>
                     </div>

                     <div id="dhDetail-support" class="panel data-panel" style="display:none;margin-top:16px;">
                         <div class="panel-header">
                             <h3><i class="fas fa-tools"></i> Support Tags Missing System/ISO (not in Drawing DB)</h3>
                             <button class="btn btn-outline" id="dhExport-support" style="height:32px;font-size:12px;display:flex;align-items:center;gap:6px;"><i class="fas fa-file-excel" style="color:#1d6f42;"></i> Export</button>
                         </div>
                         <div class="table-responsive">
                             <table class="data-table" id="dhTable-support">
                                 <thead><tr><th style="text-align:center;">Support Tag</th><th style="text-align:center;">Item</th><th style="text-align:center;">Matl</th><th style="text-align:center;">Size/Type</th><th style="text-align:center;">Qty</th></tr></thead>
                                 <tbody></tbody>
                             </table>
                         </div>
                     </div>

                     <div id="dhDetail-bucket" class="panel data-panel" style="display:none;margin-top:16px;">
                         <div class="panel-header">
                             <h3><i class="fas fa-exclamation-triangle"></i> Bucket-Tag Regression (should be 0)</h3>
                             <button class="btn btn-outline" id="dhExport-bucket" style="height:32px;font-size:12px;display:flex;align-items:center;gap:6px;"><i class="fas fa-file-excel" style="color:#1d6f42;"></i> Export</button>
                         </div>
                         <div class="table-responsive">
                             <table class="data-table" id="dhTable-bucket">
                                 <thead><tr><th style="text-align:center;">Tag</th><th style="text-align:center;">Category</th><th style="text-align:center;">PKG NO</th><th style="text-align:center;">Description</th></tr></thead>
                                 <tbody></tbody>
                             </table>
                         </div>
                     </div>

                     <div id="dhDetail-newmat" class="panel data-panel" style="display:none;margin-top:16px;">
                         <div class="panel-header">
                             <h3><i class="fas fa-barcode"></i> Unregistered MatCode (NEW-MAT)</h3>
                             <button class="btn btn-outline" id="dhExport-newmat" style="height:32px;font-size:12px;display:flex;align-items:center;gap:6px;"><i class="fas fa-file-excel" style="color:#1d6f42;"></i> Export</button>
                         </div>
                         <div class="table-responsive">
                             <table class="data-table" id="dhTable-newmat">
                                 <thead><tr><th style="text-align:center;">MatCode</th><th style="text-align:center;">Category</th><th style="text-align:center;">Description</th><th style="text-align:center;">Qty</th></tr></thead>
                                 <tbody></tbody>
                             </table>
                         </div>
                     </div>
                 </div>
```

- [ ] **Step 3: Manually verify markup renders**

Run: `python app.py`, open `http://127.0.0.1:5200`, go to Material Status. A 4th "DATA HEALTH" tab button should appear (inactive style, gray). Clicking it does nothing yet (no JS wired) but must not throw a console error, and the 4 cards should render with "—" values and "Loading..." sub-text.
Expected: no console errors; DATA HEALTH button visible; clicking it does not yet switch panels (that's Task 2).

- [ ] **Step 4: Commit**

```bash
git add templates/index.html
git commit -m "feat: Material Status에 Data Health 탭 HTML 스캐폴드 추가"
```

---

### Task 2: Wire the 4th tab into `_msActiveTab` / `switchMaterialStatusTab`

**Files:**
- Modify: `static/js/app.js:1513` (`_msActiveTab` comment)
- Modify: `static/js/app.js:1522-1548` (`switchMaterialStatusTab`)

**Interfaces:**
- Consumes: DOM ids from Task 1 (`msPanelDataHealth`).
- Produces: calls `renderDataHealthCards()` (defined in Task 7) when tab becomes active. Until Task 7 exists, add a temporary no-op guard (`typeof renderDataHealthCards === 'function' && renderDataHealthCards()`) so this task is independently testable without forward-referencing an undefined function.

- [ ] **Step 1: Extend the tab comment and panel switch**

In `static/js/app.js`, change:

```javascript
let _msActiveTab = 'stock'; // 'stock' | 'shortage' | 'surplus'
```

to:

```javascript
let _msActiveTab = 'stock'; // 'stock' | 'shortage' | 'surplus' | 'datahealth'
```

Then in `switchMaterialStatusTab`, change:

```javascript
    document.getElementById('msPanelStock').style.display    = tab === 'stock'    ? '' : 'none';
    document.getElementById('msPanelShortage').style.display = tab === 'shortage' ? '' : 'none';
    document.getElementById('msPanelSurplus').style.display  = tab === 'surplus'  ? '' : 'none';
```

to:

```javascript
    document.getElementById('msPanelStock').style.display      = tab === 'stock'      ? '' : 'none';
    document.getElementById('msPanelShortage').style.display   = tab === 'shortage'   ? '' : 'none';
    document.getElementById('msPanelSurplus').style.display    = tab === 'surplus'    ? '' : 'none';
    document.getElementById('msPanelDataHealth').style.display = tab === 'datahealth' ? '' : 'none';
```

And change the tab-specific branch block from:

```javascript
    if (tab === 'stock') {
        initStockFilters();
        initStockTabs();
    } else if (tab === 'shortage') {
        syncShortageData();
        if (!shortageRefreshTimer) {
            shortageRefreshTimer = setInterval(syncShortageData, SHORTAGE_REFRESH_INTERVAL_MS);
        }
    } else if (tab === 'surplus') {
        renderSurplusTable();
    }
```

to:

```javascript
    if (tab === 'stock') {
        initStockFilters();
        initStockTabs();
    } else if (tab === 'shortage') {
        syncShortageData();
        if (!shortageRefreshTimer) {
            shortageRefreshTimer = setInterval(syncShortageData, SHORTAGE_REFRESH_INTERVAL_MS);
        }
    } else if (tab === 'surplus') {
        renderSurplusTable();
    } else if (tab === 'datahealth') {
        if (typeof renderDataHealthCards === 'function') renderDataHealthCards();
    }
```

- [ ] **Step 2: Manually verify tab switching**

Run: `python app.py`, open the app, go to Material Status → click "DATA HEALTH".
Expected: STOCK/SHORTAGE/SURPLUS panels hide, the new Data Health panel (cards) shows, no console error (the guarded no-op means nothing renders into the cards yet — that's expected until Task 7).

- [ ] **Step 3: Commit**

```bash
git add static/js/app.js
git commit -m "feat: Data Health 탭 전환 로직 연결"
```

---

### Task 3: Pure compute functions — Card ① (Valve/Speciality Tag match) and Card ④ (NEW-MAT)

**Files:**
- Modify: `static/js/app.js` — add two new functions right after `_sortByCatItemSize` (around line 2177, before `_enrichRow`)

**Interfaces:**
- Produces:
  - `computeValveTagMismatch()` → `{ totalBomTags: number, unmatchedRows: Array<{tag: string, category: string, item: string, iso: string}> }`
  - `computeNewMatUnregistered()` → `{ rows: Array<{matCode: string, category: string, desc: string, qty: number}> }`
- Consumes: `db.bomTagMap` (already populated — `{matCode, fullDescription, lineNo, iso_dwg_no}` keyed by uppercase tag), `db.receiving` (array with `.category`, `.tag`), `db.bom` (array with `.matCode`, `.category`, `.qty`), `db.bomDesc` (map matCode→full_description), `isKpiReceiving(r)` (`app.js:136`, already exists), `window.getCategory(desc, matCode)` (`app.js:142`, already exists), `window.extractItemFromDesc(desc)` (`app.js:170`, already exists).

- [ ] **Step 1: Implement `computeValveTagMismatch`**

```javascript
// Data Health Card ①: db.bomTagMap(Valve/Speciality Tag 전체, bom_detail 기준)에는 있는데
// db.receiving에는 없는(=아직 입고 안 됐거나 Tag 불일치) 것을 찾는다.
function computeValveTagMismatch() {
    const bomTags = Object.keys(db.bomTagMap);
    const recTagSet = new Set(
        db.receiving
            .filter(r => (r.category === 'Valve' || r.category === 'Speciality') && isKpiReceiving(r))
            .map(r => r.tag.toUpperCase())
    );
    const unmatchedRows = [];
    bomTags.forEach(tag => {
        if (recTagSet.has(tag)) return;
        const info = db.bomTagMap[tag];
        unmatchedRows.push({
            tag,
            category: window.getCategory(info.fullDescription, info.matCode),
            item: window.extractItemFromDesc(info.fullDescription),
            iso: info.iso_dwg_no || '-'
        });
    });
    return { totalBomTags: bomTags.length, unmatchedRows };
}
```

- [ ] **Step 2: Implement `computeNewMatUnregistered`**

```javascript
// Data Health Card ④: bom.mat_code에 'NEW-MAT'가 포함된 건 = matcode_master에 정식 등록되지 않고
// 화면에서 자동 생성된 임시 코드 (BOM 탭 배지 warn 처리와 동일 기준, app.js:2958 참고)
function computeNewMatUnregistered() {
    const rows = db.bom
        .filter(b => b.matCode.includes('NEW-MAT'))
        .map(b => ({
            matCode: b.matCode,
            category: b.category,
            desc: db.bomDesc[b.matCode] || '-',
            qty: b.qty
        }));
    return { rows };
}
```

- [ ] **Step 3: Manually verify in browser console**

Run: `python app.py`, open the app in a browser, wait for initial load to finish (so `db.bom`/`db.receiving`/`db.bomTagMap` are populated), open DevTools console and run:

```javascript
computeValveTagMismatch()
computeNewMatUnregistered()
```

Expected: both return objects matching the shapes above (no `undefined`/`NaN`); `computeValveTagMismatch().totalBomTags` should be roughly 2,747+ (Valve BOM tag count documented in project memory) plus Speciality tags; `computeNewMatUnregistered().rows` length should be small or 0 depending on current data state — either is fine, the point is no error is thrown.

- [ ] **Step 4: Commit**

```bash
git add static/js/app.js
git commit -m "feat: Data Health Card 1/4 계산 함수(Valve Tag 매칭, NEW-MAT) 추가"
```

---

### Task 4: Pure compute function — Card ③ (Bucket-Tag Regression)

**Files:**
- Modify: `static/js/app.js` — add function right after `computeNewMatUnregistered` from Task 3

**Interfaces:**
- Produces: `computeBucketTagRegression()` → `{ rows: Array<{tag: string, category: string, plNo: string, desc: string}> }`
- Consumes: `db.receiving` (array with `.category`, `.tag`, `.plNo`, `.desc`)

- [ ] **Step 1: Implement `computeBucketTagRegression`**

```javascript
// Data Health Card ③: 2026-07-02에 한 번 수정 완료된 "통짜 Tag" 문제(project_valve_bucket_tag_fix)가
// 새 데이터 업로드로 재발했는지 감시. 수정 후에는 tag가 {parent_tag}-{일련번호}로 바뀌므로,
// 정확히 아래 리터럴 값과 일치하는 tag가 있다면 아직 처리 전(=회귀)이라는 뜻.
// Speciality의 NULL tag는 db.receiving 매핑 시 '-'로 대체되므로 '-'도 같은 방식으로 감지한다.
const BUCKET_TAG_LITERALS = new Set([
    'TOOL', 'COMMISSIONING', 'STEAM BLOW TOOL', 'HYDRO TEST TOOL', 'HP TBS D-TUBE', 'LP TBS D-TUBE', '-'
]);
function computeBucketTagRegression() {
    const rows = db.receiving
        .filter(r => (r.category === 'Valve' || r.category === 'Speciality') && BUCKET_TAG_LITERALS.has((r.tag || '').toUpperCase()))
        .map(r => ({ tag: r.tag, category: r.category, plNo: r.plNo, desc: r.desc }));
    return { rows };
}
```

- [ ] **Step 2: Manually verify in browser console**

Same setup as Task 3 Step 3. Run `computeBucketTagRegression()` in DevTools console.
Expected: returns `{ rows: [] }` (empty) if no regression exists, or a populated array if the known 2026-07-02 fix has been undone by a later data reload — either is a valid result as long as no exception is thrown.

- [ ] **Step 3: Commit**

```bash
git add static/js/app.js
git commit -m "feat: Data Health Card 3 계산 함수(통짜 Tag 회귀 감지) 추가"
```

---

### Task 5: Async compute function — Card ② (Support unmatched)

**Files:**
- Modify: `static/js/app.js` — add function right after `computeBucketTagRegression` from Task 4

**Interfaces:**
- Produces: `async function computeSupportUnmatched()` → `Promise<{ rows: Array<{supportTag: string, item: string, matl: string, sizeOrType: string, qty: number}> }>`
- Consumes: `supabaseClient` (global, already initialized elsewhere in `app.js`), Supabase table `support_bom` (columns confirmed via `scratch/import_support_bom_v2.py`: `system`, `iso_dwg_no`, `support_tag`, `item`, `matl`, `size_or_type`, `qty`).

- [ ] **Step 1: Implement `computeSupportUnmatched`**

```javascript
// Data Health Card ②: support_bom에 System/ISO DWG NO.가 공란인 Tag = 도면 DB(ipcs-drawing)에
// 매칭되지 않아 남아있는 항목 (project_support_bom_openpyxl_dataloss / Support 적용 사례 참고)
async function computeSupportUnmatched() {
    const { data, error } = await supabaseClient
        .from('support_bom')
        .select('support_tag, item, matl, size_or_type, qty')
        .or('system.is.null,iso_dwg_no.is.null')
        .not('support_tag', 'is', null)
        .limit(5000);
    if (error) {
        console.error('computeSupportUnmatched 조회 실패:', error);
        return { rows: [] };
    }
    const rows = data.map(r => ({
        supportTag: r.support_tag,
        item: r.item || '-',
        matl: r.matl || '-',
        sizeOrType: r.size_or_type || '-',
        qty: r.qty || 0
    }));
    return { rows };
}
```

- [ ] **Step 2: Manually verify in browser console**

Same setup as Task 3. Run `await computeSupportUnmatched()` in DevTools console (console supports top-level `await`).
Expected: resolves to `{ rows: [...] }` with no thrown error. Per project memory, expect roughly 1,960+ GENERAL rows (unique tags, not row count) plus a couple SB rows — exact count doesn't need to match memory precisely, just confirm the query succeeds and returns a reasonable non-crashing shape.

- [ ] **Step 3: Commit**

```bash
git add static/js/app.js
git commit -m "feat: Data Health Card 2 계산 함수(Support 미매칭) 추가"
```

---

### Task 6: Generic Excel export helper for Data Health tables

**Files:**
- Modify: `static/js/app.js` — add function near `_exportDiffList` (around line 2344)

**Interfaces:**
- Produces: `function exportHealthList(rows, columns, sheetName, filenamePrefix)` where `columns` is `Array<{header: string, key: string}>`.
- Consumes: `XLSX` (global, already loaded via `<script src=".../xlsx.full.min.js">` in `templates/index.html`).

- [ ] **Step 1: Implement the generic export helper**

```javascript
// Data Health 상세 리스트 공용 Export — _exportDiffList와 같은 패턴이지만 컬럼을 인자로 받아 범용화
function exportHealthList(rows, columns, sheetName, filenamePrefix) {
    const excelRows = rows.map(r => {
        const o = {};
        columns.forEach(c => { o[c.header] = r[c.key]; });
        return o;
    });
    const ws = XLSX.utils.json_to_sheet(excelRows);
    ws['!cols'] = columns.map(() => ({ wch: 18 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    const today = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `${filenamePrefix}_Export_${today}.xlsx`);
}
```

- [ ] **Step 2: Manually verify in browser console**

Run: `exportHealthList([{a:1,b:2}], [{header:'A',key:'a'},{header:'B',key:'b'}], 'Test', 'DH_Test')` in DevTools console.
Expected: a file named `DH_Test_Export_<today>.xlsx` downloads with one row (A=1, B=2), no console error.

- [ ] **Step 3: Commit**

```bash
git add static/js/app.js
git commit -m "feat: Data Health 상세 리스트 공용 Excel Export 헬퍼 추가"
```

---

### Task 7: Orchestration — `renderDataHealthCards` + click-to-expand + wire Export buttons

**Files:**
- Modify: `static/js/app.js` — add function right after `exportHealthList` from Task 6

**Interfaces:**
- Consumes: `computeValveTagMismatch()`, `computeNewMatUnregistered()`, `computeBucketTagRegression()` (Tasks 3-4, sync), `computeSupportUnmatched()` (Task 5, async), `exportHealthList()` (Task 6), DOM ids from Task 1.
- Produces: `renderDataHealthCards()` — the function referenced by the guard added in Task 2.

- [ ] **Step 1: Implement card rendering + toggle + export wiring**

```javascript
let _dhRows = { valve: [], support: [], bucket: [], newmat: [] };
let _dhInited = false;

function _dhSetCard(key, count, subText) {
    const pctEl = document.getElementById(`dhCard-${key}-pct`);
    const subEl = document.getElementById(`dhCard-${key}-sub`);
    if (pctEl) {
        pctEl.textContent = count;
        pctEl.style.color = count > 0 ? '#c62828' : '#2e7d32';
    }
    if (subEl) subEl.textContent = subText;
}

function _dhRenderTable(key, columns) {
    const tbody = document.querySelector(`#dhTable-${key} tbody`);
    if (!tbody) return;
    const rows = _dhRows[key];
    if (rows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${columns.length}" style="text-align:center;color:#666;padding:16px;">No issues found.</td></tr>`;
        return;
    }
    tbody.innerHTML = rows.map(r =>
        `<tr>${columns.map(c => `<td style="text-align:center;">${r[c.key]}</td>`).join('')}</tr>`
    ).join('');
}

function _dhToggle(key, columns) {
    const panel = document.getElementById(`dhDetail-${key}`);
    const isOpen = panel.style.display !== 'none';
    // 다른 상세 패널은 닫고 클릭한 것만 토글 (아코디언)
    ['valve', 'support', 'bucket', 'newmat'].forEach(k => {
        document.getElementById(`dhDetail-${k}`).style.display = 'none';
    });
    if (!isOpen) {
        panel.style.display = '';
        _dhRenderTable(key, columns);
    }
}

const DH_COLUMNS = {
    valve:   [{header:'Tag',key:'tag'},{header:'Category',key:'category'},{header:'Item',key:'item'},{header:'ISO Drawing',key:'iso'}],
    support: [{header:'Support Tag',key:'supportTag'},{header:'Item',key:'item'},{header:'Matl',key:'matl'},{header:'Size/Type',key:'sizeOrType'},{header:'Qty',key:'qty'}],
    bucket:  [{header:'Tag',key:'tag'},{header:'Category',key:'category'},{header:'PKG NO',key:'plNo'},{header:'Description',key:'desc'}],
    newmat:  [{header:'MatCode',key:'matCode'},{header:'Category',key:'category'},{header:'Description',key:'desc'},{header:'Qty',key:'qty'}]
};

async function renderDataHealthCards() {
    const valveResult  = computeValveTagMismatch();
    const bucketResult = computeBucketTagRegression();
    const newmatResult = computeNewMatUnregistered();
    const supportResult = await computeSupportUnmatched();

    _dhRows.valve   = valveResult.unmatchedRows;
    _dhRows.bucket  = bucketResult.rows;
    _dhRows.newmat  = newmatResult.rows;
    _dhRows.support = supportResult.rows;

    _dhSetCard('valve', _dhRows.valve.length,
        `${_dhRows.valve.length} of ${valveResult.totalBomTags} BOM Tags unmatched`);
    _dhSetCard('support', _dhRows.support.length,
        `${_dhRows.support.length} Support Tags missing System/ISO`);
    _dhSetCard('bucket', _dhRows.bucket.length,
        _dhRows.bucket.length > 0 ? `${_dhRows.bucket.length} bucket-tag rows found` : 'No regression detected');
    _dhSetCard('newmat', _dhRows.newmat.length,
        `${_dhRows.newmat.length} unregistered MatCode`);

    // 열려있는 상세 패널이 있으면 새 데이터로 다시 그림
    ['valve', 'support', 'bucket', 'newmat'].forEach(key => {
        const panel = document.getElementById(`dhDetail-${key}`);
        if (panel && panel.style.display !== 'none') _dhRenderTable(key, DH_COLUMNS[key]);
    });

    if (!_dhInited) {
        _dhInited = true;
        document.getElementById('dhCard-valve').addEventListener('click', () => _dhToggle('valve', DH_COLUMNS.valve));
        document.getElementById('dhCard-support').addEventListener('click', () => _dhToggle('support', DH_COLUMNS.support));
        document.getElementById('dhCard-bucket').addEventListener('click', () => _dhToggle('bucket', DH_COLUMNS.bucket));
        document.getElementById('dhCard-newmat').addEventListener('click', () => _dhToggle('newmat', DH_COLUMNS.newmat));

        document.getElementById('dhExport-valve').addEventListener('click', () => exportHealthList(_dhRows.valve, DH_COLUMNS.valve, 'Valve Tag Mismatch', 'DataHealth_ValveTag'));
        document.getElementById('dhExport-support').addEventListener('click', () => exportHealthList(_dhRows.support, DH_COLUMNS.support, 'Support Unmatched', 'DataHealth_Support'));
        document.getElementById('dhExport-bucket').addEventListener('click', () => exportHealthList(_dhRows.bucket, DH_COLUMNS.bucket, 'Bucket Tag Regression', 'DataHealth_BucketTag'));
        document.getElementById('dhExport-newmat').addEventListener('click', () => exportHealthList(_dhRows.newmat, DH_COLUMNS.newmat, 'Unregistered MatCode', 'DataHealth_NewMat'));
    }
}
```

- [ ] **Step 2: Manually verify full flow in browser**

Run: `python app.py`, open the app, go to Material Status → DATA HEALTH tab.
Expected:
1. All 4 cards populate with a number (not "—") and a sub-text within ~1-2 seconds.
2. Clicking "Valve/Speciality Tag Match" card opens a table below listing Tag/Category/Item/ISO Drawing rows (or "No issues found." if empty).
3. Clicking a different card closes the first table and opens the new one (accordion behavior).
4. Clicking the same card again closes it.
5. Clicking "Export" on an open detail table downloads an `.xlsx` file with the same rows shown on screen.
6. No console errors throughout.

- [ ] **Step 3: Commit**

```bash
git add static/js/app.js
git commit -m "feat: Data Health 카드 렌더링/아코디언/Export 연결 완료"
```

---

### Task 8: Final smoke test across the whole app (regression check)

**Files:** none (verification only)

- [ ] **Step 1: Full smoke test**

Run: `python app.py`, open the app, and click through every sidebar item once (Dashboard, Material Finding, BOM sub-tabs, Bulk Item Piping/Fitting/Others, TAG Item Valve/Speciality/Spool/Support, Material Status Stock/Shortage/Surplus/Data Health, Material Summary, Shipping).
Expected: no console errors anywhere, and Stock/Shortage/Surplus behave exactly as before this plan (unchanged).

- [ ] **Step 2: Commit (only if any fix was needed in Step 1)**

```bash
git add -A
git commit -m "fix: Data Health 추가 후 발견된 회귀 수정"
```
