# Material Summary Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new "MATERIAL SUMMARY" tab to the Material Status section that shows every registered Piping/Fitting/Others BOM line (System/ISO/Line No/Item/Mat1/Mat2/Size/Unit/BOM Qty) alongside project-wide Received/Issued/Stock totals for that MatCode — no MatCode, Description, or Packing List columns.

**Architecture:** Pure frontend addition to the existing Flask + Supabase + vanilla JS SPA. New tab button + panel in `templates/index.html` inside `#material_status`; new render/filter/export functions in `static/js/app.js` that reuse the existing `bom_detail` table (same source as the BOM tab) and the existing in-memory `db.receiving`-based aggregation helpers (`buildRecvMaps`, `getIssuedQtyMap`) already used by the sibling STOCK tab. No backend route, no new SQL view, no schema change.

**Tech Stack:** Flask (backend, untouched), Supabase JS client (`supabaseClient`), vanilla JS, `templates/index.html`, `static/js/app.js`.

## Global Constraints

- Scope is **Piping/Fitting/Others only** — Valve/Speciality/Support/Spool are explicitly excluded (confirmed with user; their data models don't have matching System/Mat1/Mat2/BOM Qty/Issued Qty fields).
- Received/Issued/Stock are **MatCode-wide totals** (same project-wide number repeated on every BOM line sharing that MatCode), **not** per-line FIFO allocation — FIFO is intentionally not used here because it's only cheap for a single specified ISO Drawing (see `static/js/app.js:3720-3722` comment), and this tab must render the full ~39,272-row dataset.
- No Packing List / PKG / PKG NO / DOC columns or filters.
- **No automated test suite exists in this repository** (no `pytest`/`jest`/etc., verified via `Glob **/test*.py` → no results). Every task's "verify" step is a manual browser check against the local dev server, matching this project's existing convention (see prior smoke-test notes in `docs/superpowers/specs/2026-07-03-material-control-program-design.md`). Start the server with `python app.py` (serves on `http://localhost:5200`) before verifying each task.
- Design doc: `docs/superpowers/specs/2026-07-03-material-control-program-design.md` (section "Material Summary 탭 신설").

---

### Task 1: Tab shell — HTML panel + subtabs + base BOM-line render (no Received/Issued/Stock yet)

**Files:**
- Modify: `templates/index.html` (Material Status tab bar and panel block, around lines 1296–1400)
- Modify: `static/js/app.js` (Material Status tab-switch logic around line 1225–1260)

**Interfaces:**
- Produces: `_mssActiveTab` (module-level string state, `'piping'|'fitting'|'others'`), `currentMssPage` (module-level number), `renderMssTable()`, `renderActiveMssTab()`, `initMssTabs()`, `window._mssGoPage(p)` — all consumed by Task 2/3/4.
- Consumes: existing globals `supabaseClient`, `PAGE_SIZE`, `renderPagination(containerId, page, totalPages, gotoFnName)`, `window.extractSizeFromMatCode`, `window.extractSizeLengthFromMatCode`, `window.extractSizeFromLineNo`, `window.extractItemFromDesc`.

- [ ] **Step 1: Add the MATERIAL SUMMARY tab button**

In `templates/index.html`, find the Material Status tab bar (currently 3 buttons: STOCK/SHORTAGE/SURPLUS):

```html
                 <!-- Material Status Tab bar -->
                 <div style="display:flex;gap:0;border-bottom:2px solid #c8cfe0;margin-bottom:16px;">
                     <button class="ms-tab-btn" data-tab="stock" style="padding:8px 24px;border:none;border-bottom:3px solid #0A2540;font-size:12px;font-weight:700;cursor:pointer;background:#fff;color:#0A2540;margin-bottom:-2px;letter-spacing:0.5px;">STOCK</button>
                     <button class="ms-tab-btn" data-tab="shortage" style="padding:8px 24px;border:none;border-bottom:3px solid transparent;font-size:12px;font-weight:700;cursor:pointer;background:#fff;color:#888;margin-bottom:-2px;letter-spacing:0.5px;">SHORTAGE</button>
                     <button class="ms-tab-btn" data-tab="surplus" style="padding:8px 24px;border:none;border-bottom:3px solid transparent;font-size:12px;font-weight:700;cursor:pointer;background:#fff;color:#888;margin-bottom:-2px;letter-spacing:0.5px;">SURPLUS</button>
                 </div>
```

Replace it with (new button first, existing three unchanged):

```html
                 <!-- Material Status Tab bar -->
                 <div style="display:flex;gap:0;border-bottom:2px solid #c8cfe0;margin-bottom:16px;">
                     <button class="ms-tab-btn" data-tab="summary" style="padding:8px 24px;border:none;border-bottom:3px solid transparent;font-size:12px;font-weight:700;cursor:pointer;background:#fff;color:#888;margin-bottom:-2px;letter-spacing:0.5px;">MATERIAL SUMMARY</button>
                     <button class="ms-tab-btn" data-tab="stock" style="padding:8px 24px;border:none;border-bottom:3px solid #0A2540;font-size:12px;font-weight:700;cursor:pointer;background:#fff;color:#0A2540;margin-bottom:-2px;letter-spacing:0.5px;">STOCK</button>
                     <button class="ms-tab-btn" data-tab="shortage" style="padding:8px 24px;border:none;border-bottom:3px solid transparent;font-size:12px;font-weight:700;cursor:pointer;background:#fff;color:#888;margin-bottom:-2px;letter-spacing:0.5px;">SHORTAGE</button>
                     <button class="ms-tab-btn" data-tab="surplus" style="padding:8px 24px;border:none;border-bottom:3px solid transparent;font-size:12px;font-weight:700;cursor:pointer;background:#fff;color:#888;margin-bottom:-2px;letter-spacing:0.5px;">SURPLUS</button>
                 </div>
```

(The default active tab stays `stock` — `_msActiveTab` in JS is unchanged. The new button starts in the inactive visual style; `switchMaterialStatusTab()` will correct all button styles at runtime regardless of the hardcoded inline style.)

- [ ] **Step 2: Add the `msPanelSummary` panel**

Immediately after the tab bar `</div>` from Step 1 and before `<div id="msPanelStock">`, insert:

```html
                 <div id="msPanelSummary" style="display:none;">
                 <div class="panel filter-panel" style="margin-bottom: 20px;">
                      <div style="display: flex; align-items: flex-end; justify-content: space-between; width: 100%; gap: 10px; flex-wrap: nowrap;">
                          <div style="display: flex; align-items: flex-end; gap: 10px; flex: 1; min-width: 0;">
                              <div class="form-group" style="flex: 2; min-width: 0; margin-bottom: 0;">
                                  <label>Search (ISO / Line / Description)</label>
                                  <input type="text" id="mssSearch" class="form-control" style="width: 100%;" placeholder="ISO Drawing, Line No, Description...">
                              </div>
                              <div class="form-group" style="flex: 1; min-width: 0; margin-bottom: 0;">
                                  <label>System</label>
                                  <select id="mssSystemFilter" class="form-control" style="width: 100%;"><option value="All">All Systems</option></select>
                              </div>
                              <div class="form-group" style="flex: 1; min-width: 0; margin-bottom: 0;">
                                  <label>Item</label>
                                  <select id="mssItemFilter" class="form-control" style="width: 100%;"><option value="All">All Items</option></select>
                              </div>
                              <div class="form-group" style="flex: 1; min-width: 0; margin-bottom: 0;">
                                  <label>Mat 1</label>
                                  <select id="mssMat1Filter" class="form-control" style="width: 100%;"><option value="All">All Mat 1</option></select>
                              </div>
                              <div class="form-group" style="flex: 1; min-width: 0; margin-bottom: 0;">
                                  <label>Mat 2</label>
                                  <select id="mssMat2Filter" class="form-control" style="width: 100%;"><option value="All">All Mat 2</option></select>
                              </div>
                              <div class="form-group" style="flex: 1; min-width: 0; margin-bottom: 0;">
                                  <label>Size</label>
                                  <select id="mssSizeFilter" class="form-control" style="width: 100%;"><option value="All">All Sizes</option></select>
                              </div>
                              <div style="padding-bottom: 1px; display: flex; gap: 8px; flex-shrink: 0;">
                                  <button class="btn btn-primary" id="btnFilterMss" style="white-space: nowrap;"><i class="fas fa-search"></i> Search</button>
                                  <button class="btn btn-outline" id="btnClearMssFilters" style="white-space: nowrap;">Clear</button>
                              </div>
                          </div>
                          <div style="padding-bottom: 1px; display: flex; gap: 8px; flex-shrink: 0;">
                              <button class="btn btn-outline" id="btnExportMss" style="white-space: nowrap; display: flex; align-items: center; gap: 6px;"><i class="fas fa-file-excel" style="color:#1d6f42;"></i> Export Excel</button>
                          </div>
                      </div>
                  </div>

                 <div style="display:flex;gap:0;border-bottom:1px solid #c8cfe0;margin-bottom:16px;">
                     <button class="mss-bulk-tab" data-tab="piping" style="padding:6px 20px;border:none;border-bottom:3px solid #0A2540;font-size:11px;font-weight:600;cursor:pointer;background:#fff;color:#0A2540;margin-bottom:-1px;">Piping</button>
                     <button class="mss-bulk-tab" data-tab="fitting" style="padding:6px 20px;border:none;border-bottom:3px solid transparent;font-size:11px;font-weight:600;cursor:pointer;background:#fff;color:#888;margin-bottom:-1px;">Fitting</button>
                     <button class="mss-bulk-tab" data-tab="others" style="padding:6px 20px;border:none;border-bottom:3px solid transparent;font-size:11px;font-weight:600;cursor:pointer;background:#fff;color:#888;margin-bottom:-1px;">Others</button>
                 </div>

                 <div class="panel data-panel">
                     <div class="panel-header">
                         <h3 id="mssPanelTitle"><i class="fas fa-list-check"></i> Material Summary — Piping</h3>
                         <span id="mssCountLabel" style="font-size:11px; color:#666;"></span>
                     </div>
                     <div class="table-responsive">
                         <table class="data-table" id="mssTable" style="font-size:0.82em;table-layout:fixed;width:100%;">
                             <colgroup>
                                 <col style="width:7%;"><col style="width:15%;"><col style="width:13%;">
                                 <col style="width:9%;"><col style="width:7%;"><col style="width:8%;">
                                 <col style="width:6%;"><col style="width:5%;"><col style="width:8%;">
                                 <col style="width:8%;"><col style="width:8%;"><col style="width:6%;">
                             </colgroup>
                             <thead>
                                 <tr>
                                     <th style="text-align:center;">System</th>
                                     <th style="text-align:center;">ISO Drawing</th>
                                     <th style="text-align:center;">Line No.</th>
                                     <th style="text-align:center;">Item</th>
                                     <th style="text-align:center;">Mat 1</th>
                                     <th style="text-align:center;">Mat 2</th>
                                     <th style="text-align:center;">Size</th>
                                     <th style="text-align:center;">Unit</th>
                                     <th style="text-align:center;">BOM Qty</th>
                                     <th style="text-align:center;">Received</th>
                                     <th style="text-align:center;">Issued</th>
                                     <th style="text-align:center;">Stock</th>
                                 </tr>
                             </thead>
                             <tbody><tr><td colspan="12" style="text-align:center;color:#888;padding:20px;">Loading...</td></tr></tbody>
                         </table>
                     </div>
                     <div id="mssPagination"></div>
                 </div>
                 </div>

```

- [ ] **Step 3: Wire the tab into `switchMaterialStatusTab()`**

In `static/js/app.js`, find:

```js
function switchMaterialStatusTab(tab) {
    _msActiveTab = tab;
    document.querySelectorAll('.ms-tab-btn').forEach(b => {
        b.style.borderBottomColor = b.dataset.tab === tab ? '#0A2540' : 'transparent';
        b.style.color = b.dataset.tab === tab ? '#0A2540' : '#888';
    });
    document.getElementById('msPanelStock').style.display    = tab === 'stock'    ? '' : 'none';
    document.getElementById('msPanelShortage').style.display = tab === 'shortage' ? '' : 'none';
    document.getElementById('msPanelSurplus').style.display  = tab === 'surplus'  ? '' : 'none';

    if (tab === 'stock') {
        initStockFilters();
        initStockTabs();
    } else if (tab === 'shortage') {
```

Replace with:

```js
function switchMaterialStatusTab(tab) {
    _msActiveTab = tab;
    document.querySelectorAll('.ms-tab-btn').forEach(b => {
        b.style.borderBottomColor = b.dataset.tab === tab ? '#0A2540' : 'transparent';
        b.style.color = b.dataset.tab === tab ? '#0A2540' : '#888';
    });
    document.getElementById('msPanelSummary').style.display  = tab === 'summary'  ? '' : 'none';
    document.getElementById('msPanelStock').style.display    = tab === 'stock'    ? '' : 'none';
    document.getElementById('msPanelShortage').style.display = tab === 'shortage' ? '' : 'none';
    document.getElementById('msPanelSurplus').style.display  = tab === 'surplus'  ? '' : 'none';

    if (tab === 'summary') {
        initMssTabs();
    } else if (tab === 'stock') {
        initStockFilters();
        initStockTabs();
    } else if (tab === 'shortage') {
```

- [ ] **Step 4: Add the base render/subtab logic**

In `static/js/app.js`, immediately after the `initStockTabs()` function (right before the `// --- Material Shortage / Surplus 공용 ---` comment, i.e. right after the closing `}` that currently precedes that comment), add:

```js
// --- Material Summary (Material Status 섹션, Piping/Fitting/Others 전용) ---
let currentMssPage = 1;
let _mssActiveTab = 'piping'; // 'piping' | 'fitting' | 'others'

async function renderMssTable() {
    let tbody = document.querySelector('#mssTable tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="12" style="text-align:center;padding:20px;color:#888;">Loading...</td></tr>';

    const TAB_CAT = { piping: 'Pipe', fitting: 'Fitting', others: 'Others' };
    const cat = TAB_CAT[_mssActiveTab] || 'Pipe';

    const dataQ  = supabaseClient.from('bom_detail')
        .select('mat_code, system, iso_dwg_no, line_no, full_description, uom, qty, mat1, mat2')
        .eq('category', cat)
        .range((currentMssPage - 1) * PAGE_SIZE, currentMssPage * PAGE_SIZE - 1)
        .order('system', { ascending: true, nullsFirst: false })
        .order('iso_dwg_no', { ascending: true, nullsFirst: false });
    const countQ = supabaseClient.from('bom_detail')
        .select('*', { count: 'exact', head: true })
        .eq('category', cat);

    const [dataRes, countRes] = await Promise.all([dataQ, countQ]);
    if (dataRes.error) {
        tbody.innerHTML = `<tr><td colspan="12" style="color:red;text-align:center;">Error: ${dataRes.error.message}</td></tr>`;
        return;
    }

    const data = dataRes.data || [];
    const totalCount = countRes.count || 0;

    const label = document.getElementById('mssCountLabel');
    if (label) label.textContent = `(${totalCount.toLocaleString()} items)`;

    tbody.innerHTML = data.map(b => {
        const matUpper = (b.mat_code || '').toUpperCase();
        let size = (matUpper.startsWith('GSKT') || matUpper.startsWith('STB'))
            ? window.extractSizeLengthFromMatCode(b.mat_code)
            : window.extractSizeFromMatCode(b.mat_code);
        if (size === '-' && b.line_no) size = window.extractSizeFromLineNo(b.line_no);
        const desc = (b.full_description || '-').replace(/_/g, '-');
        const item = window.extractItemFromDesc(desc);
        if (size === '-' && /STEAM TRAP/i.test(item)) size = '1"';

        return `<tr>
            <td style="text-align:center;white-space:nowrap;">${b.system || '-'}</td>
            <td style="text-align:center;white-space:nowrap;">${b.iso_dwg_no || '-'}</td>
            <td style="text-align:center;white-space:nowrap;">${b.line_no || '-'}</td>
            <td style="text-align:center;font-weight:600;white-space:nowrap;">${item}</td>
            <td style="text-align:center;white-space:nowrap;">${b.mat1 || '-'}</td>
            <td style="text-align:center;white-space:nowrap;">${b.mat2 || '-'}</td>
            <td style="text-align:center;font-weight:600;white-space:nowrap;">${size}</td>
            <td style="text-align:center;white-space:nowrap;">${b.uom || 'EA'}</td>
            <td style="text-align:center;white-space:nowrap;">${parseFloat(b.qty || 0).toFixed(2)}</td>
            <td style="text-align:center;white-space:nowrap;">—</td>
            <td style="text-align:center;white-space:nowrap;">—</td>
            <td style="text-align:center;white-space:nowrap;font-weight:700;">—</td>
        </tr>`;
    }).join('');

    const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
    renderPagination('mssPagination', currentMssPage, totalPages, '_mssGoPage');
}
window._mssGoPage = function(p) { currentMssPage = p; renderMssTable(); };

function renderActiveMssTab() {
    const title = document.getElementById('mssPanelTitle');
    const TAB_LABEL = { piping: 'Piping', fitting: 'Fitting', others: 'Others' };
    if (title) title.innerHTML = `<i class="fas fa-list-check"></i> Material Summary — ${TAB_LABEL[_mssActiveTab] || 'Piping'}`;
    currentMssPage = 1;
    renderMssTable();
}

let _mssTabsInited = false;
function initMssTabs() {
    if (_mssTabsInited) { renderActiveMssTab(); return; }
    _mssTabsInited = true;
    document.querySelectorAll('.mss-bulk-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            _mssActiveTab = btn.dataset.tab;
            document.querySelectorAll('.mss-bulk-tab').forEach(b => {
                b.style.color        = b === btn ? '#0A2540' : '#888';
                b.style.borderBottom = b === btn ? '3px solid #0A2540' : '3px solid transparent';
            });
            renderActiveMssTab();
        });
    });
    renderActiveMssTab();
}
```

- [ ] **Step 5: Manual verification**

Run: `python app.py`
Open `http://localhost:5200` in a browser, open DevTools console.

1. Click sidebar "Material Status".
2. Click the new "MATERIAL SUMMARY" tab (leftmost). Expect: panel appears, title reads "Material Summary — Piping", table shows real rows with System/ISO Drawing/Line No./Item/Mat 1/Mat 2/Size/Unit/BOM Qty populated (non-`-`/non-empty for most rows) and Received/Issued/Stock showing `—`.
3. Click "Fitting" subtab. Expect: rows change to Fitting items (e.g. Item column shows ELBOW/TEE/FLANGE-type values), page resets to 1.
4. Click "Others" subtab. Expect: rows change to Others items (GSKT/STB), Size column shows size+length format (e.g. `2"x120mm`) where applicable.
5. Use the pagination control at the bottom to go to page 2. Expect: different rows load, count label unchanged.
6. Switch to STOCK/SHORTAGE/SURPLUS tabs and back to MATERIAL SUMMARY. Expect: still works, no duplicate event bindings (clicking a subtab only fires one re-render — check Network tab shows exactly one `bom_detail` request pair per click, not multiples).
7. Confirm zero errors in the browser console throughout.

- [ ] **Step 6: Commit**

```bash
git add templates/index.html static/js/app.js
git commit -m "feat: Material Summary 탭 골격 추가 (Piping/Fitting/Others BOM 라인 조회)"
```

---

### Task 2: Filters (Search / System / Item / Mat1 / Mat2 / Size)

**Files:**
- Modify: `static/js/app.js` (hoist `ITEM_PREFIX_MAP`, extend `renderMssTable()`, add `refreshMssItemFilter()` + `initMssFilters()`, update `renderActiveMssTab()` and `switchMaterialStatusTab()`)

**Interfaces:**
- Consumes: `getBomItemsForCat(cat)`, `getBomSizesForCatItem(cat, item)`, `parseSizeSortKey(sizeStr)`, `db.bom` (all already defined elsewhere in `app.js`), the module-level `ITEM_PREFIX_MAP` hoisted in Step 1 below.
- Produces: `initMssFilters()`, `refreshMssItemFilter()` — consumed by Task 4 (export button reuses the same filter element IDs and `ITEM_PREFIX_MAP`).

- [ ] **Step 1: Hoist `ITEM_PREFIX_MAP` to module scope so both BOM and Material Summary can use it**

In `static/js/app.js`, `renderBomTable()` currently declares this local constant (around line 1955):

```js
    // Item명 → MatCode prefix 역매핑 (extractItemFromMatCode와 동일 기준)
    const ITEM_PREFIX_MAP = {
        'PIPE':['PIS','PIW'], 'NIPPLE':['PIN'],
        'ELBOW 90D':['EL9L','EL9S'], 'ELBOW 45D':['EL4L','ELS','ELB'],
        'FLANGE':['FLN','FLB','FLS','FLO','FLR'],
        'TEE':['TEE'], 'TEE-RED':['TER'],
        'RED-CON':['RDC'], 'RED-ECC':['RDE'],
        'CAP':['CAP'],
        'COUPLING-FULL':['CPF'], 'COUPLING-HALF':['CPH'], 'COUPLING':['CPU'],
        'SWAGE-CON':['SWC','SCN'], 'SWAGE-ECC':['SWE'],
        'WELDOLET':['WOL'], 'SOCKOLET':['SOL'], 'THREADOLET':['TOL'],
        'NOZZLE':['NOZ'],
        'GATE VALVE':['GTV'], 'GLOBE VALVE':['GLV'], 'CHECK VALVE':['CHV'],
        'BUTTERFLY VALVE':['BFV'], 'BALL VALVE':['BAV'], 'PLUG VALVE':['PLV'],
        'SAFETY VALVE':['PSV','PRV'], 'VALVE':['GTV','GLV','CHV','BFV','BAV','PLV','PSV','PRV'],
        'GASKET':['GSKT','GSK'], 'STUD BOLT':['STB'], 'NUT':['NUT'], 'BOLT':['BOL'],
        'UNION':['UNI'], 'PLUG':['PLG'], 'BUSHING':['BUS'],
    };
```

Remove it from inside `renderBomTable()` and instead add it once, at module scope, right after `const PAGE_SIZE = 25;` near the top of the file:

```js
const PAGE_SIZE = 25;

// Item명 → MatCode prefix 역매핑 (extractItemFromMatCode와 동일 기준) — BOM 탭과 Material Summary 탭이 공유
const ITEM_PREFIX_MAP = {
    'PIPE':['PIS','PIW'], 'NIPPLE':['PIN'],
    'ELBOW 90D':['EL9L','EL9S'], 'ELBOW 45D':['EL4L','ELS','ELB'],
    'FLANGE':['FLN','FLB','FLS','FLO','FLR'],
    'TEE':['TEE'], 'TEE-RED':['TER'],
    'RED-CON':['RDC'], 'RED-ECC':['RDE'],
    'CAP':['CAP'],
    'COUPLING-FULL':['CPF'], 'COUPLING-HALF':['CPH'], 'COUPLING':['CPU'],
    'SWAGE-CON':['SWC','SCN'], 'SWAGE-ECC':['SWE'],
    'WELDOLET':['WOL'], 'SOCKOLET':['SOL'], 'THREADOLET':['TOL'],
    'NOZZLE':['NOZ'],
    'GATE VALVE':['GTV'], 'GLOBE VALVE':['GLV'], 'CHECK VALVE':['CHV'],
    'BUTTERFLY VALVE':['BFV'], 'BALL VALVE':['BAV'], 'PLUG VALVE':['PLV'],
    'SAFETY VALVE':['PSV','PRV'], 'VALVE':['GTV','GLV','CHV','BFV','BAV','PLV','PSV','PRV'],
    'GASKET':['GSKT','GSK'], 'STUD BOLT':['STB'], 'NUT':['NUT'], 'BOLT':['BOL'],
    'UNION':['UNI'], 'PLUG':['PLG'], 'BUSHING':['BUS'],
};
```

`renderBomTable()`'s existing references to `ITEM_PREFIX_MAP` (inside its `applyFilters` helper) keep working unchanged since they now resolve to the module-level constant.

- [ ] **Step 2: Extend `renderMssTable()` to apply filters**

Replace the query-building part of `renderMssTable()` (added in Task 1) — everything from `const TAB_CAT = ...` down to the `Promise.all` call — with:

```js
    const TAB_CAT = { piping: 'Pipe', fitting: 'Fitting', others: 'Others' };
    const cat    = TAB_CAT[_mssActiveTab] || 'Pipe';
    const search = (document.getElementById('mssSearch')?.value || '').trim();
    const sys    = document.getElementById('mssSystemFilter')?.value || 'All';
    const item   = document.getElementById('mssItemFilter')?.value || 'All';
    const mat1   = document.getElementById('mssMat1Filter')?.value || 'All';
    const mat2   = document.getElementById('mssMat2Filter')?.value || 'All';
    const size   = document.getElementById('mssSizeFilter')?.value || 'All';

    const applyFilters = (q) => {
        q = q.eq('category', cat);
        if (sys !== 'All') q = q.eq('system', sys);
        if (search) q = q.or(`iso_dwg_no.ilike.%${search}%,line_no.ilike.%${search}%,full_description.ilike.%${search}%`);
        if (mat1 !== 'All') q = q.eq('mat1', mat1);
        if (mat2 !== 'All') q = q.eq('mat2', mat2);
        if (item !== 'All') {
            const prefixes = ITEM_PREFIX_MAP[item];
            q = (prefixes && prefixes.length > 0)
                ? q.or(prefixes.map(p => `mat_code.ilike.${p}-*`).join(','))
                : q.ilike('full_description', `%${item}%`);
        }
        if (size !== 'All') {
            if (cat === 'Others') {
                const m = size.match(/^([\d\/\-]+)"(?:x(\d+)mm)?$/);
                if (m) q = q.ilike('mat_code', m[2] ? `%-${m[1]}"x${m[2]}%` : `%-${m[1]}"%`);
            } else {
                const toD = v => 'D' + Math.round(parseFloat(v) * 10).toString().padStart(3, '0');
                const single = size.match(/([\d.]+)"/);
                if (single) q = q.ilike('mat_code', `%-${toD(single[1])}-%`);
            }
        }
        return q;
    };

    const dataQ  = applyFilters(
        supabaseClient.from('bom_detail')
            .select('mat_code, system, iso_dwg_no, line_no, full_description, uom, qty, mat1, mat2')
            .range((currentMssPage - 1) * PAGE_SIZE, currentMssPage * PAGE_SIZE - 1)
            .order('system', { ascending: true, nullsFirst: false })
            .order('iso_dwg_no', { ascending: true, nullsFirst: false })
    );
    const countQ = applyFilters(
        supabaseClient.from('bom_detail').select('*', { count: 'exact', head: true })
    );
```

(The rest of `renderMssTable()` — the `Promise.all`, error check, row-mapping, pagination call — stays exactly as written in Task 1.)

- [ ] **Step 3: Add `refreshMssItemFilter()` and `initMssFilters()`**

Immediately after `initMssTabs()` (added in Task 1), add:

```js
function refreshMssItemFilter() {
    const TAB_CAT = { piping: 'Pipe', fitting: 'Fitting', others: 'Others' };
    const cat = TAB_CAT[_mssActiveTab] || 'Pipe';

    const itemEl = document.getElementById('mssItemFilter');
    if (itemEl) {
        const items = getBomItemsForCat(cat);
        itemEl.innerHTML = '<option value="All">All Items</option>'
            + items.map(i => `<option value="${i.replace(/"/g, '&quot;')}">${i}</option>`).join('');
    }

    const mat1El = document.getElementById('mssMat1Filter');
    const mat2El = document.getElementById('mssMat2Filter');
    const sizeEl = document.getElementById('mssSizeFilter');
    if (mat1El) mat1El.innerHTML = '<option value="All">All Mat 1</option>';
    if (mat2El) mat2El.innerHTML = '<option value="All">All Mat 2</option>';
    if (sizeEl) sizeEl.innerHTML = '<option value="All">All Sizes</option>';

    supabaseClient.from('bom_detail')
        .select('mat1, mat2, mat_code')
        .eq('category', cat)
        .not('mat1', 'is', null)
        .limit(10000)
        .then(({ data }) => {
            if (!data) return;
            const vals1 = [...new Set(data.map(r => r.mat1).filter(Boolean))].sort();
            const vals2 = [...new Set(data.map(r => r.mat2).filter(Boolean))].sort();
            if (mat1El) mat1El.innerHTML = '<option value="All">All Mat 1</option>'
                + vals1.map(v => `<option value="${v.replace(/"/g, '&quot;')}">${v}</option>`).join('');
            if (mat2El) mat2El.innerHTML = '<option value="All">All Mat 2</option>'
                + vals2.map(v => `<option value="${v.replace(/"/g, '&quot;')}">${v}</option>`).join('');
            if (sizeEl && cat === 'Others') {
                const sizes = [...new Set(data.map(r => window.extractSizeLengthFromMatCode(r.mat_code)).filter(v => v && v !== '-'))]
                    .sort((a, b) => parseSizeSortKey(a) - parseSizeSortKey(b));
                sizeEl.innerHTML = '<option value="All">All Sizes</option>'
                    + sizes.map(s => `<option value="${s.replace(/"/g, '&quot;')}">${s}</option>`).join('');
            } else if (sizeEl) {
                const sizes = getBomSizesForCatItem(cat, 'All');
                sizeEl.innerHTML = '<option value="All">All Sizes</option>'
                    + sizes.map(s => `<option value="${s.replace(/"/g, '&quot;')}">${s}</option>`).join('');
            }
        })
        .catch(err => console.error('refreshMssItemFilter mat1/mat2/size 로드 실패:', err));
}

let _mssFiltersInited = false;
function initMssFilters() {
    if (_mssFiltersInited) return;
    _mssFiltersInited = true;

    const sysEl = document.getElementById('mssSystemFilter');
    if (sysEl) {
        const systems = [...new Set(db.bom.map(b => b.system).filter(Boolean))].sort();
        sysEl.innerHTML = '<option value="All">All Systems</option>' + systems.map(s => `<option value="${s}">${s}</option>`).join('');
    }

    const itemEl = document.getElementById('mssItemFilter');
    if (itemEl) {
        itemEl.addEventListener('change', () => {
            const TAB_CAT = { piping: 'Pipe', fitting: 'Fitting', others: 'Others' };
            const cat = TAB_CAT[_mssActiveTab] || 'Pipe';
            const sizes = getBomSizesForCatItem(cat, itemEl.value);
            const sizeEl = document.getElementById('mssSizeFilter');
            if (sizeEl) sizeEl.innerHTML = '<option value="All">All Sizes</option>'
                + sizes.map(s => `<option value="${s.replace(/"/g, '&quot;')}">${s}</option>`).join('');
        });
    }

    document.getElementById('btnFilterMss')?.addEventListener('click', () => { currentMssPage = 1; renderMssTable(); });
    document.getElementById('btnClearMssFilters')?.addEventListener('click', () => {
        const searchEl = document.getElementById('mssSearch'); if (searchEl) searchEl.value = '';
        ['mssSystemFilter', 'mssItemFilter', 'mssMat1Filter', 'mssMat2Filter', 'mssSizeFilter'].forEach(id => {
            const el = document.getElementById(id); if (el) el.value = 'All';
        });
        currentMssPage = 1;
        renderMssTable();
    });

    refreshMssItemFilter();
}
```

- [ ] **Step 4: Call `refreshMssItemFilter()` on subtab switch, and `initMssFilters()` on first tab visit**

In `renderActiveMssTab()` (Task 1), change:

```js
function renderActiveMssTab() {
    const title = document.getElementById('mssPanelTitle');
    const TAB_LABEL = { piping: 'Piping', fitting: 'Fitting', others: 'Others' };
    if (title) title.innerHTML = `<i class="fas fa-list-check"></i> Material Summary — ${TAB_LABEL[_mssActiveTab] || 'Piping'}`;
    currentMssPage = 1;
    renderMssTable();
}
```

to:

```js
function renderActiveMssTab() {
    const title = document.getElementById('mssPanelTitle');
    const TAB_LABEL = { piping: 'Piping', fitting: 'Fitting', others: 'Others' };
    if (title) title.innerHTML = `<i class="fas fa-list-check"></i> Material Summary — ${TAB_LABEL[_mssActiveTab] || 'Piping'}`;
    currentMssPage = 1;
    refreshMssItemFilter();
    renderMssTable();
}
```

In `switchMaterialStatusTab()` (Task 1), change:

```js
    if (tab === 'summary') {
        initMssTabs();
    } else if (tab === 'stock') {
```

to:

```js
    if (tab === 'summary') {
        initMssFilters();
        initMssTabs();
    } else if (tab === 'stock') {
```

- [ ] **Step 5: Manual verification**

Run: `python app.py`, open `http://localhost:5200`, DevTools console open.

1. Navigate to Material Status → MATERIAL SUMMARY. Expect: System dropdown populated with real system codes (e.g. `AS`, `CCW`...), Item dropdown populated with Piping items (e.g. `PIPE`, `NIPPLE`), Mat1/Mat2/Size dropdowns populate shortly after (async).
2. Pick a System value, click Search. Expect: table narrows to that system only, count label updates.
3. Pick an Item (e.g. `PIPE`), click Search. Expect: Item column on every row reads that item.
4. Switch to "Others" subtab. Expect: Item/Mat1/Mat2/Size dropdowns repopulate with Others-specific values (e.g. Mat1 shows `S/S (304)`/`HDG`/etc.), Size dropdown shows size+length format.
5. Click "Clear". Expect: all filters reset to "All", search box empties, table reloads unfiltered.
6. Type a partial ISO Drawing number into Search, click Search. Expect: only matching rows shown.
7. Confirm zero console errors.

- [ ] **Step 6: Commit**

```bash
git add static/js/app.js
git commit -m "feat: Material Summary 탭에 Search/System/Item/Mat1/Mat2/Size 필터 추가"
```

---

### Task 3: Received / Issued / Stock columns (MatCode-wide totals)

**Files:**
- Modify: `static/js/app.js` (`renderMssTable()` row-rendering block)

**Interfaces:**
- Consumes: `buildRecvMaps(filterFn)` (returns `{recMap, docMap, pkgMap}`, each keyed by MatCode), `getIssuedQtyMap(filterFn)` (returns map keyed by MatCode), `isReceivingActive(plNo)`, `isKpiReceiving(r)` — all pre-existing globals in `app.js`.

- [ ] **Step 1: Build the Received/Issued maps and use them in the row template**

In `renderMssTable()`, right after the line `const data = dataRes.data || [];` and before `const totalCount = countRes.count || 0;`, add:

```js
    const { recMap } = buildRecvMaps(r =>
        isReceivingActive(r.plNo) && isKpiReceiving(r) &&
        ['Pipe', 'Fitting', 'Others'].includes(r.category)
    );
    const issMap = getIssuedQtyMap(r => ['Pipe', 'Fitting', 'Others'].includes(r.category));
```

Then replace the three placeholder `—` cells in the row template:

```js
            <td style="text-align:center;white-space:nowrap;">—</td>
            <td style="text-align:center;white-space:nowrap;">—</td>
            <td style="text-align:center;white-space:nowrap;font-weight:700;">—</td>
        </tr>`;
```

with:

```js
            <td style="text-align:center;white-space:nowrap;">${recQty.toFixed(2)}</td>
            <td style="text-align:center;white-space:nowrap;">${issQty.toFixed(2)}</td>
            <td style="text-align:center;white-space:nowrap;font-weight:700;">${stockQty.toFixed(2)}</td>
        </tr>`;
```

And immediately before the `return` statement inside the `.map(b => { ... })` row callback (after the existing `if (size === '-' && /STEAM TRAP/i.test(item)) size = '1"';` line), add:

```js
        const recQty = recMap[matUpper] || 0;
        const issQty = issMap[matUpper] || 0;
        const stockQty = Math.max(0, recQty - issQty);
```

- [ ] **Step 2: Manual verification**

Run: `python app.py`, open `http://localhost:5200`.

1. Navigate to Material Status → MATERIAL SUMMARY (Piping subtab). Expect: Received/Issued/Stock columns now show real numbers (not `—`), Stock = Received − Issued (never negative) for every row.
2. Pick any MatCode-identifying row (use the Search box to filter down to one specific ISO Drawing so you can see a small set of rows), note its Item/Size and the Received value shown.
3. Switch to Material Status → STOCK tab, filter/search for the same item/size to find the equivalent MatCode row there. Expect: the "Total Received" and "Stock (Balance)" numbers on STOCK match the "Received"/"Stock" numbers shown on the same MatCode's rows in MATERIAL SUMMARY (they should be identical — both come from the same `buildRecvMaps`/`getIssuedQtyMap` aggregation).
4. Confirm rows sharing the same MatCode across different ISO Drawings show identical Received/Issued/Stock values (expected — this is the MatCode-wide total, not a per-line FIFO split).
5. Confirm zero console errors and page-turning still works after this change.

- [ ] **Step 3: Commit**

```bash
git add static/js/app.js
git commit -m "feat: Material Summary 탭에 MatCode 전체 기준 Received/Issued/Stock 계산 추가"
```

---

### Task 4: Export Excel

**Files:**
- Modify: `static/js/app.js` (`initMssFilters()`)

**Interfaces:**
- Consumes: `ITEM_PREFIX_MAP` (module scope, from Task 2), `buildRecvMaps`, `getIssuedQtyMap`, `XLSX` (global, already loaded via script tag elsewhere in the app — same library `btnExportBom`/`btnExportVendor` already use).

- [ ] **Step 1: Add the export button handler inside `initMssFilters()`**

At the end of `initMssFilters()` (from Task 2), right before the final `refreshMssItemFilter();` line, add:

```js
    const btnExportMss = document.getElementById('btnExportMss');
    if (btnExportMss) {
        btnExportMss.addEventListener('click', async () => {
            btnExportMss.disabled = true;
            btnExportMss.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Exporting...';
            try {
                const TAB_CAT = { piping: 'Pipe', fitting: 'Fitting', others: 'Others' };
                const cat    = TAB_CAT[_mssActiveTab] || 'Pipe';
                const search = (document.getElementById('mssSearch')?.value || '').trim();
                const sys    = document.getElementById('mssSystemFilter')?.value || 'All';
                const item   = document.getElementById('mssItemFilter')?.value || 'All';
                const mat1   = document.getElementById('mssMat1Filter')?.value || 'All';
                const mat2   = document.getElementById('mssMat2Filter')?.value || 'All';
                const size   = document.getElementById('mssSizeFilter')?.value || 'All';

                let query = supabaseClient.from('bom_detail')
                    .select('mat_code, system, iso_dwg_no, line_no, full_description, uom, qty, mat1, mat2')
                    .eq('category', cat)
                    .order('iso_dwg_no')
                    .limit(100000);
                if (sys !== 'All') query = query.eq('system', sys);
                if (search) query = query.or(`iso_dwg_no.ilike.%${search}%,line_no.ilike.%${search}%,full_description.ilike.%${search}%`);
                if (mat1 !== 'All') query = query.eq('mat1', mat1);
                if (mat2 !== 'All') query = query.eq('mat2', mat2);
                if (item !== 'All') {
                    const prefixes = ITEM_PREFIX_MAP[item];
                    query = (prefixes && prefixes.length > 0)
                        ? query.or(prefixes.map(p => `mat_code.ilike.${p}-*`).join(','))
                        : query.ilike('full_description', `%${item}%`);
                }
                if (size !== 'All') {
                    if (cat === 'Others') {
                        const m = size.match(/^([\d\/\-]+)"(?:x(\d+)mm)?$/);
                        if (m) query = query.ilike('mat_code', m[2] ? `%-${m[1]}"x${m[2]}%` : `%-${m[1]}"%`);
                    } else {
                        const toD = v => 'D' + Math.round(parseFloat(v) * 10).toString().padStart(3, '0');
                        const single = size.match(/([\d.]+)"/);
                        if (single) query = query.ilike('mat_code', `%-${toD(single[1])}-%`);
                    }
                }

                const { data, error } = await query;
                if (error) throw error;

                const { recMap } = buildRecvMaps(r =>
                    isReceivingActive(r.plNo) && isKpiReceiving(r) &&
                    ['Pipe', 'Fitting', 'Others'].includes(r.category)
                );
                const issMap = getIssuedQtyMap(r => ['Pipe', 'Fitting', 'Others'].includes(r.category));

                const rows = (data || []).map(b => {
                    const matUpper = (b.mat_code || '').toUpperCase();
                    let sz = (matUpper.startsWith('GSKT') || matUpper.startsWith('STB'))
                        ? window.extractSizeLengthFromMatCode(b.mat_code)
                        : window.extractSizeFromMatCode(b.mat_code);
                    if (sz === '-' && b.line_no) sz = window.extractSizeFromLineNo(b.line_no);
                    const desc = (b.full_description || '-').replace(/_/g, '-');
                    const itemName = window.extractItemFromDesc(desc);
                    const recQty = recMap[matUpper] || 0;
                    const issQty = issMap[matUpper] || 0;

                    return {
                        'System':      b.system || '-',
                        'ISO Drawing': b.iso_dwg_no || '-',
                        'Line No':     b.line_no || '-',
                        'Item':        itemName,
                        'Mat 1':       b.mat1 || '-',
                        'Mat 2':       b.mat2 || '-',
                        'Size':        sz,
                        'Unit':        b.uom || 'EA',
                        'BOM Qty':     parseFloat(b.qty || 0),
                        'Received':    recQty,
                        'Issued':      issQty,
                        'Stock':       Math.max(0, recQty - issQty),
                    };
                });

                const ws = XLSX.utils.json_to_sheet(rows);
                ws['!cols'] = [8, 20, 18, 14, 10, 12, 8, 6, 10, 10, 10, 10].map(w => ({ wch: w }));
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, 'Material Summary');
                const today = new Date().toISOString().split('T')[0];
                XLSX.writeFile(wb, `Material_Summary_Export_${today}_${cat}.xlsx`);
            } catch (e) {
                alert('Export failed: ' + e.message);
            } finally {
                btnExportMss.disabled = false;
                btnExportMss.innerHTML = '<i class="fas fa-file-excel" style="color:#1d6f42;"></i> Export Excel';
            }
        });
    }

    refreshMssItemFilter();
```

(Note: `refreshMssItemFilter();` is the existing last line of `initMssFilters()` from Task 2 — the new block goes immediately before it, per the instruction above.)

- [ ] **Step 2: Manual verification**

Run: `python app.py`, open `http://localhost:5200`.

1. Navigate to Material Status → MATERIAL SUMMARY, leave filters at default, click "Export Excel". Expect: a file named `Material_Summary_Export_<today>_Pipe.xlsx` downloads.
2. Open the file. Expect: columns exactly `System, ISO Drawing, Line No, Item, Mat 1, Mat 2, Size, Unit, BOM Qty, Received, Issued, Stock` (no MatCode, no Description, no Packing List column), row count matches the on-screen count label, spot-check a few rows' Received/Issued/Stock match what's shown on screen for the same ISO/Line.
3. Set a System filter and an Item filter, click Search, then click "Export Excel" again. Expect: exported rows respect both filters (all rows match the selected System and Item).
4. Switch to "Others" subtab, export again. Expect: filename ends in `_Others.xlsx`, Size column shows size+length format for GSKT/STB rows.
5. Confirm zero console errors during export.

- [ ] **Step 3: Commit**

```bash
git add static/js/app.js
git commit -m "feat: Material Summary 탭에 Export Excel 버튼 추가"
```

---

### Task 5: Full regression smoke test

**Files:** none (verification only)

**Interfaces:** none

- [ ] **Step 1: Run the full manual smoke test**

Run: `python app.py`, open `http://localhost:5200`, DevTools console open throughout.

1. Dashboard loads with no console errors.
2. BOM tab (Piping/Fitting/Others/Vendor/MatCode Master subtabs) — confirm all 5 subtabs still work exactly as before (this validates the `ITEM_PREFIX_MAP` hoist from Task 2 didn't break `renderBomTable()`'s Item filter): pick an Item filter on each of Piping/Fitting/Others, confirm results still narrow correctly.
3. Material Status → STOCK tab — Piping/Others sub-tabs, filters, export — confirm unchanged behavior.
4. Material Status → SHORTAGE and SURPLUS tabs — confirm unchanged behavior.
5. Material Status → MATERIAL SUMMARY tab — repeat the full check from Tasks 1–4 (subtabs, filters, Received/Issued/Stock values, export) end to end in one pass.
6. Material Finding page (ISO Drawing / Support Tag / Item modes) — confirm unchanged (this validates nothing in the shared helpers `buildRecvMaps`/`getIssuedQtyMap` regressed).
7. Confirm zero console errors across the entire pass.

- [ ] **Step 2: Report results**

No commit for this task (verification only) — report the smoke-test outcome to the user. If any regression is found, fix it as a follow-up task before considering the feature complete.
