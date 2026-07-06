# Matching Rules Consolidation + Unit Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the pure MatCode/Description parsing functions out of `static/js/app.js` into a dedicated `static/js/matching.js`, add one new function (`extractItemDisplayFromMatCode`) that removes the PIS/PIW SMLS/WELDED duplication discovered and partially fixed during this session, and add a Node-based unit test suite for these functions so the same class of bug is caught automatically next time.

**Architecture:** `static/js/matching.js` is a classic (non-module) `<script>` loaded before `app.js` in `templates/index.html`. Classic scripts share one global lexical scope in the browser, so top-level `const`/`function` declarations in `matching.js` remain visible to `app.js` verbatim — no `app.js` call sites change except the two duplicated PIS/PIW blocks. A conditional `module.exports` at the bottom of `matching.js` (guarded by `typeof module !== 'undefined'`) makes the same file `require`-able from Node for tests, with zero effect on browser behavior. Tests use Node's built-in `node:test` + `assert` — no new npm dependency.

**Tech Stack:** Vanilla JS, Node.js built-in `node:test` runner (Node 18+), no bundler, no new runtime dependency.

## Global Constraints

- **Do not merge `ITEM_PREFIX_MAP` and `extractItemFromMatCode`'s internal prefix→item map.** Confirmed during brainstorming that they are not true inverses (`ITEM_PREFIX_MAP.'SAFETY VALVE' = ['PSV','PRV']` groups two prefixes the other map treats as separate display items 'SAFETY VALVE'/'RELIEF VALVE'; `ITEM_PREFIX_MAP.'VALVE'` has no counterpart at all). Move both tables as-is; do not change their contents.
- Every relocated function's behavior must be byte-for-byte identical to today except `extractItemDisplayFromMatCode`, which is new.
- No new npm dependencies. No `package.json` beyond the minimal one this plan adds.
- Preserve exact code style: 4-space indent, existing Korean comment conventions.

---

### Task 1: Create `static/js/matching.js` with relocated functions (no behavior change)

**Files:**
- Create: `static/js/matching.js`
- Modify: `static/js/app.js:81-97` (delete `ITEM_PREFIX_MAP`)
- Modify: `static/js/app.js:170-229` (delete `extractItemFromDesc`)
- Modify: `static/js/app.js:241-308` (delete `extractItemFromMatCode`, `extractSizeFromMatCode`, `extractSizeLengthFromMatCode`, `extractDnSizeFromDesc`)
- Modify: `templates/index.html:2364` (add `<script src=".../matching.js">` before `app.js`)

**Interfaces:**
- Produces: `window.extractItemFromMatCode`, `window.extractSizeFromMatCode`, `window.extractSizeLengthFromMatCode`, `window.extractDnSizeFromDesc`, `window.extractItemFromDesc`, top-level `const ITEM_PREFIX_MAP` — identical signatures/behavior to what `app.js` had before this task.
- Consumes: nothing external (pure functions/data only).

- [ ] **Step 1: Create `static/js/matching.js`**

```javascript
// 자재 매칭 순수 함수 모음 — MatCode/Description 문자열만으로 Item/Size를 판별한다.
// db, window.parseSpecialityDesc 등 외부 상태에 의존하지 않아 app.js에서 분리했다.
// 브라우저에서는 app.js보다 먼저 로드되는 일반 <script>로 동작(top-level const/function은
// 같은 문서의 다른 classic script와 전역 스코프를 공유하므로 app.js 쪽 참조는 그대로 유효하다).
// 파일 맨 아래 module.exports는 Node 테스트(tests/matching.test.js)에서만 쓰인다.

// Item명 → MatCode prefix 역매핑 (extractItemFromMatCode와 동일 기준은 아님 — 아래 주석 참고)
// 주의: 이 테이블은 extractItemFromMatCode의 prefix→item MAP과 완전한 역함수가 아니다.
// 예) 'SAFETY VALVE':['PSV','PRV']는 필터링 목적으로 두 prefix를 하나로 묶지만,
// extractItemFromMatCode는 PSV→'SAFETY VALVE', PRV→'RELIEF VALVE'로 별개 취급한다.
// 'VALVE':[...] 항목은 반대쪽에 대응하는 단일 prefix가 아예 없는 상위 그룹이다.
// 두 테이블을 강제로 통합하지 말 것 — BOM 탭 필터 동작이 조용히 바뀔 수 있다.
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

window.extractItemFromDesc = function(desc) {
    if (!desc) return '-';
    // Strip leading "#N " prefix (e.g., "#1 Steam Trap..." → "Steam Trap...")
    const desc2 = desc.replace(/^#\d+\s+/, '');
    // Check compound item names first (order matters — longer first)
    const COMPOUND = [
        'FLEXIBLE HOSE', 'FLEXIBLE JOINT',
        'AIR TRAP', 'STEAM TRAP', 'FLOW NOZZLE', 'LINE MIXER', 'SPRAY NOZZLE',
        'RESTRICTION ORIFICE',
        'TEE-RED', 'REDUCER-CON', 'REDUCER-ECC',
        'FLANGE-BLIND', 'FLANGE-SLIP', 'FLANGE-WELD', 'FLANGE-LAP',
        'COUPLING-HALF', 'COUPLING-FULL',
        'SWAGE-CON', 'SWAGE-ECC',
        'Y-STRAINER',
        'ELBOW LR', 'ELBOW SR',
        'NIPPLE', 'WELDOLET', 'SOCKOLET', 'THREADOLET',
    ];
    const upper = desc2.toUpperCase().trim();
    // Steam Trap 세부 재질 감지 — "(High Alloy)" 공백 유무 모두 처리
    if (/STEAM TRAP\s*\(HIGH ALLOY\)/i.test(desc2)) return 'STEAM TRAP (HIGH ALLOY)';
    if (/STEAM TRAP\s*\(LOW ALLOY\)/i.test(desc2))  return 'STEAM TRAP (LOW ALLOY)';
    for (const c of COMPOUND) {
        if (upper.startsWith(c)) return c;
    }
    // Safety / Control Valve 직접 감지 (description 전체 기준)
    if (/SAFETY VALVE|\bPSV\b|\bPRV\b/.test(upper)) return 'SAFETY VALVE';
    if (/\b(TCV|LCV|FCV|PCV)\b/.test(upper) || /\bXV\b/.test(upper) || /CONTROL VALVE/.test(upper)) return 'CONTROL VALVE';
    // Valve Receiving/Packing List 형식 감지: "6\" 300 A216-WCB Flexible wedge GATE Valve"처럼
    // Item이 맨 앞이 아니라 맨 뒤에 오는 포맷 — 앞쪽 자재 스펙(A216 등)을 Item으로 오인하지 않도록
    // "{TYPE} VALVE"를 문자열 어디서든 우선 탐지
    const valveTail = upper.match(/\b(GATE|GLOBE|BALL|CHECK|BUTTERFLY|PLUG|NEEDLE|DIAPHRAGM)\s+VALVE\b/);
    if (valveTail) return valveTail[1] + ' VALVE';
    // 1단계: 앞의 치수 제거 (3", DN80, 2"x1" 등) — 숫자·따옴표·슬래시 연속 제거
    let s = desc2.replace(/^[\d"'\s\/\-×xX]+/, '').trim();
    // 2단계: 치수 뒤에 오는 스펙 표기 제거 (300#, Sch 120, Class 150, 단독 # 등)
    // "10\" 300# Flow Nozzle" → 1단계 후 "# Flow Nozzle" (300의 숫자는 위에서 소비됨)
    s = s.replace(/^#\s*/, '').trim();                              // 단독 # 제거
    s = s.replace(/^\d+#\s+/i, '')                                  // "300# " 형태
         .replace(/^Sch(?:edule)?\s+\d+\s+/i, '')                   // "Sch 120 " 형태
         .replace(/^Class\s+\d+\s+/i, '').trim();                   // "Class 150 " 형태
    // 2단계 제거 후 COMPOUND 재검사
    const sUpper = s.toUpperCase();
    for (const c of COMPOUND) {
        if (sUpper.startsWith(c)) return c;
    }
    if (!s) return '-';
    // ( 도 구분자로 처리 (FLEXIBLE HOSE (AIR HOSE REEL) 등 괄호 형식 대응)
    const m = s.match(/^([A-Za-z][A-Za-z\s]*?)(?:\s*[-\/,(]|$)/);
    const raw = m ? m[1].trim().toUpperCase() : s.split(/[\s\-\/,_(]/)[0].toUpperCase();
    // Normalize short item names to full names
    const ITEM_MAP = {
        'BALL': 'BALL VALVE', 'GATE': 'GATE VALVE',
        'GLOBE': 'GLOBE VALVE', 'CHECK': 'CHECK VALVE',
        'CHCK': 'CHECK VALVE', 'BUTTERFLY': 'BUTTERFLY VALVE',
        'BTFY': 'BUTTERFLY VALVE', 'CONTROL': 'CONTROL VALVE',
        'FILTER FOR Y': 'FILTER',
    };
    if (ITEM_MAP[raw]) return ITEM_MAP[raw];
    return raw;
};

window.extractItemFromMatCode = function(matCode) {
    const prefix = (matCode || '').split('-')[0].toUpperCase();
    const MAP = {
        'PIS':'PIPE', 'PIW':'PIPE', 'PIN':'NIPPLE',
        'EL9L':'ELBOW 90D', 'EL9S':'ELBOW 90D',
        'EL4L':'ELBOW 45D', 'ELS':'ELBOW 45D', 'ELB':'ELBOW 45D',
        'FLN':'FLANGE', 'FLB':'FLANGE', 'FLS':'FLANGE', 'FLO':'FLANGE', 'FLR':'FLANGE',
        'TEE':'TEE', 'TER':'TEE-RED',
        'RDC':'RED-CON', 'RDE':'RED-ECC',
        'CAP':'CAP',
        'CPF':'COUPLING-FULL', 'CPH':'COUPLING-HALF', 'CPU':'COUPLING',
        'SWC':'SWAGE-CON', 'SWE':'SWAGE-ECC', 'SCN':'SWAGE-CON',
        'WOL':'WELDOLET', 'SOL':'SOCKOLET', 'TOL':'THREADOLET', 'LAT':'LATROLET',
        'TR':'TRANSITION PIECE',
        'NOZ':'NOZZLE', 'FNO':'FLOW ELEMENT', 'STP':'STEAM TRAP (HIGH)', 'ATP':'AIR TRAP',
        'VLV':'VALVE', 'VBL':'BALL VALVE', 'VGA':'GATE VALVE', 'VGL':'GLOBE VALVE',
        'VCH':'CHECK VALVE', 'CHV':'CHECK VALVE', 'VBF':'BUTTERFLY VALVE',
        'BAV':'BALL VALVE', 'GTV':'GATE VALVE', 'GLV':'GLOBE VALVE',
        'BFV':'BUTTERFLY VALVE', 'PLV':'PLUG VALVE',
        'CON':'CONTROL VALVE', 'FCV':'CONTROL VALVE', 'TCV':'CONTROL VALVE',
        'LCV':'CONTROL VALVE', 'PCV':'CONTROL VALVE', 'XV':'CONTROL VALVE',
        'MOV':'MOV',
        'PSV':'SAFETY VALVE', 'PRV':'RELIEF VALVE',
        'STB':'STUD BOLT',
        'GSKT':'GASKET', 'GSK':'GASKET',
        'STD':'STUD', 'NUT':'NUT', 'BOL':'BOLT',
        'UNI':'UNION', 'PLG':'PLUG', 'BUS':'BUSHING',
        'INS':'INSTRUMENT', 'SPT':'SUPPORT',
        'INSULATION KIT':'INSULATION KIT', // 정식 MatCode 형식이 아니라 "Insulation Kit" 문자열 그대로 저장된 항목
    };
    return MAP[prefix] || '-';
};

// Pipe MatCode 접두어(PIS/PIW)만 SMLS/WELDED로 세분화해서 보여줄 때 쓰는 표시 전용 함수.
// extractItemFromMatCode는 필터 드롭다운이 여전히 'PIPE' 단일값을 쓰기 때문에 그대로 두고,
// 화면 표시가 필요한 곳에서는 이 함수를 대신 호출한다 (Receiving 리스트, Shortage/Surplus 공용).
window.extractItemDisplayFromMatCode = function(matCode) {
    const prefix = (matCode || '').split('-')[0].toUpperCase();
    if (prefix === 'PIS') return 'PIPE SMLS';
    if (prefix === 'PIW') return 'PIPE WELDED';
    return window.extractItemFromMatCode(matCode);
};

window.extractSizeFromMatCode = function(matCode) {
    if (!matCode) return '-';
    // Dual-size: D060D040 → "6\"×4\""
    let dDual = matCode.match(/D(\d{3})D(\d{3})/i);
    if (dDual) {
        const v1 = parseInt(dDual[1], 10) / 10;
        const v2 = parseInt(dDual[2], 10) / 10;
        return v1 + '"×' + v2 + '"';
    }
    let dnMatch = matCode.match(/DN(\d+)/i);
    if (dnMatch) {
        let val = parseInt(dnMatch[1], 10);
        return (val / 10).toString() + '"';
    }
    let dMatch = matCode.match(/D(\d{3})/i);
    if (dMatch) {
        let val = parseInt(dMatch[1], 10);
        return (val / 10).toString() + '"';
    }
    return '-';
};

// GSKT/STB MatCode에 직접 박힌 사이즈(볼트는 Size+길이mm)를 그대로 추출
// 예: GSKT-SW304-8"-CL150 → 8" | STB-A193-B7-HDG-3/4"x120 → 3/4"x120mm
window.extractSizeLengthFromMatCode = function(matCode) {
    const m = (matCode || '').match(/-([\d\/\-]+)"(?:x(\d+))?/);
    if (!m) return '-';
    return m[2] ? `${m[1]}"x${m[2]}mm` : `${m[1]}"`;
};

// Valve(MatCode 없음) 등 description에 "DN xx" 형태로 박힌 사이즈 추출 — "DN 25" → "DN 25"
window.extractDnSizeFromDesc = function(desc) {
    const m = (desc || '').match(/\bDN\s*(\d+)\b/i);
    return m ? 'DN ' + m[1] : null;
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        ITEM_PREFIX_MAP,
        extractItemFromDesc: window.extractItemFromDesc,
        extractItemFromMatCode: window.extractItemFromMatCode,
        extractItemDisplayFromMatCode: window.extractItemDisplayFromMatCode,
        extractSizeFromMatCode: window.extractSizeFromMatCode,
        extractSizeLengthFromMatCode: window.extractSizeLengthFromMatCode,
        extractDnSizeFromDesc: window.extractDnSizeFromDesc,
    };
}
```

- [ ] **Step 2: Delete the relocated code from `app.js`**

In `static/js/app.js`, delete the `ITEM_PREFIX_MAP` block (currently lines 81-97) — this includes its preceding comment line `// Item명 → MatCode prefix 역매핑 ...` (currently line 80). Delete the `extractItemFromDesc` function (currently lines 170-229). Delete `extractItemFromMatCode`, `extractSizeFromMatCode`, `extractSizeLengthFromMatCode`, `extractDnSizeFromDesc` and their preceding comment lines (currently lines 241-308, i.e. everything from `window.extractItemFromMatCode = function(matCode) {` through the end of `extractDnSizeFromDesc`'s closing `};`). Leave `window.parseSpecialityDesc` (currently starting at line 312) and everything else untouched.

- [ ] **Step 3: Load `matching.js` before `app.js`**

In `templates/index.html`, change:

```html
    <script src="{{ url_for('static', filename='js/app.js') }}?v=20260629r"></script>
```

to:

```html
    <script src="{{ url_for('static', filename='js/matching.js') }}?v=20260706a"></script>
    <script src="{{ url_for('static', filename='js/app.js') }}?v=20260629r"></script>
```

- [ ] **Step 4: Manually verify no behavior change**

Run: `python app.py`, open the app in a browser with DevTools open. Go to BOM tab (Piping sub-tab) — Item column should still show values like "PIPE" for rows using MatCode-based extraction (unchanged from before this task). Go to Material Status → Shortage tab — Item column should still show "PIPE SMLS"/"PIPE WELDED" split (the fix from earlier this session, now sourced from `matching.js` instead of inline `app.js` code). Check DevTools console for `ReferenceError` on any `extractItemFromMatCode`/`extractSizeFromMatCode`/`ITEM_PREFIX_MAP`/`extractItemFromDesc` — there must be none.
Expected: identical visual output to before this task, zero console errors.

- [ ] **Step 5: Commit**

```bash
git add static/js/matching.js static/js/app.js templates/index.html
git commit -m "refactor: MatCode/Description 순수 파싱 함수를 matching.js로 분리"
```

---

### Task 2: Replace the two duplicated PIS/PIW blocks with `extractItemDisplayFromMatCode`

**Files:**
- Modify: `static/js/app.js` (Shortage/Surplus `_enrichRow`, the block that currently reads `const _matPrefix = ...` through `const itemDisplay = ...`)
- Modify: `static/js/app.js` (Receiving list renderer, the block that currently reads `const _matPrefixR = ...` through `const _rawItemR = ...`)

**Interfaces:**
- Consumes: `window.extractItemDisplayFromMatCode(matCode)` from Task 1.

- [ ] **Step 1: Replace in `_enrichRow`**

Find (currently around where `_enrichRow` computes `item`/`itemDisplay`):

```javascript
    const _itemMc = window.extractItemFromMatCode(matCode);
    const item = (_itemMc && _itemMc !== '-') ? _itemMc : window.extractItemFromDesc(desc);
    // Pipe는 Item 필터 드롭다운이 여전히 'PIPE'(SMLS/WELDED 합산) 기준이라 필터 매칭용 item은 그대로 두고,
    // 화면 표시용 itemDisplay만 MatCode 접두어(PIS/PIW)로 SMLS/WELDED를 구분
    const _matPrefix = (matCode || '').split('-')[0].toUpperCase();
    const itemDisplay = _matPrefix === 'PIS' ? 'PIPE SMLS'
        : _matPrefix === 'PIW' ? 'PIPE WELDED'
        : item;
```

Replace with:

```javascript
    const _itemMc = window.extractItemFromMatCode(matCode);
    const item = (_itemMc && _itemMc !== '-') ? _itemMc : window.extractItemFromDesc(desc);
    // Pipe는 Item 필터 드롭다운이 여전히 'PIPE'(SMLS/WELDED 합산) 기준이라 필터 매칭용 item은 그대로 두고,
    // 화면 표시용 itemDisplay만 matching.js의 공용 함수로 SMLS/WELDED를 구분
    const itemDisplay = window.extractItemDisplayFromMatCode(matCode);
```

- [ ] **Step 2: Replace in the Receiving list renderer**

Find:

```javascript
        const _mcItemR  = window.extractItemFromMatCode(effMat);
        // Pipe는 MatCode 접두어(PIS/PIW)가 SMLS/WELDED 구분 없이 'PIPE'로 뭉뚱그려지는데,
        // Receiving desc는 BOM처럼 콤마로 구분돼 있지 않아 Description 파싱으로도 구분이 안 됨 —
        // BOM 탭과 동일하게 보이도록 MatCode 접두어로 직접 SMLS/WELDED를 구분
        const _matPrefixR = (effMat || '').split('-')[0].toUpperCase();
        const _rawItemR = _matPrefixR === 'PIS' ? 'PIPE SMLS'
            : _matPrefixR === 'PIW' ? 'PIPE WELDED'
            : (_mcItemR && _mcItemR !== '-') ? _mcItemR : window.extractItemFromDesc(bomFullDesc || r.desc);
```

Replace with:

```javascript
        const _mcItemR  = window.extractItemFromMatCode(effMat);
        // Pipe는 MatCode 접두어(PIS/PIW)가 SMLS/WELDED 구분 없이 'PIPE'로 뭉뚱그려지는데,
        // Receiving desc는 BOM처럼 콤마로 구분돼 있지 않아 Description 파싱으로도 구분이 안 됨 —
        // matching.js의 공용 함수로 MatCode 접두어에서 직접 SMLS/WELDED를 구분
        const _matPrefixR = (effMat || '').split('-')[0].toUpperCase();
        const _rawItemR = (_matPrefixR === 'PIS' || _matPrefixR === 'PIW')
            ? window.extractItemDisplayFromMatCode(effMat)
            : (_mcItemR && _mcItemR !== '-') ? _mcItemR : window.extractItemFromDesc(bomFullDesc || r.desc);
```

(This keeps the exact same `_matPrefixR === 'PIS'` / `'PIW'` comparison the original code used — behavior is byte-for-byte identical to before this task, just delegating the two matched branches to the shared function instead of inlining the string literals twice.)

- [ ] **Step 3: Manually verify**

Run: `python app.py`, open the app. Go to Bulk Item (Receiving) → Piping — Item column shows "PIPE SMLS"/"PIPE WELDED" exactly as before Task 2. Go to Material Status → Shortage/Surplus — same check. Go to Material Status → Surplus, Export Excel, confirm the "Item" column in the downloaded file still shows the split labels.
Expected: no visual change from before this task, no console errors.

- [ ] **Step 4: Commit**

```bash
git add static/js/app.js
git commit -m "refactor: PIS/PIW SMLS-WELDED 중복 로직을 extractItemDisplayFromMatCode로 통합"
```

---

### Task 3: Node test suite for `matching.js`

**Files:**
- Create: `package.json`
- Create: `tests/matching.test.js`

**Interfaces:**
- Consumes: `require('../static/js/matching.js')` → `{ ITEM_PREFIX_MAP, extractItemFromDesc, extractItemFromMatCode, extractItemDisplayFromMatCode, extractSizeFromMatCode, extractSizeLengthFromMatCode, extractDnSizeFromDesc }` (from Task 1's `module.exports`).

- [ ] **Step 1: Create minimal `package.json`**

```json
{
  "name": "ipcs-material",
  "private": true,
  "scripts": {
    "test": "node --test tests/"
  }
}
```

- [ ] **Step 2: Write the failing test file**

```javascript
const test = require('node:test');
const assert = require('node:assert/strict');
const {
    extractItemFromMatCode,
    extractItemDisplayFromMatCode,
    extractSizeFromMatCode,
    extractSizeLengthFromMatCode,
    extractDnSizeFromDesc,
    extractItemFromDesc,
    ITEM_PREFIX_MAP,
} = require('../static/js/matching.js');

test('extractItemFromMatCode: PIS/PIW both collapse to PIPE (unchanged legacy behavior)', () => {
    assert.equal(extractItemFromMatCode('PIS-CS06-D060-S40-BW'), 'PIPE');
    assert.equal(extractItemFromMatCode('PIW-CS06-D060-S40-BW'), 'PIPE');
});

test('extractItemFromMatCode: known prefixes map correctly', () => {
    assert.equal(extractItemFromMatCode('FLN-CS06-D060-CL150-RF'), 'FLANGE');
    assert.equal(extractItemFromMatCode('GSKT-SW304-D060'), 'GASKET');
    assert.equal(extractItemFromMatCode('PSV-CS06-D060'), 'SAFETY VALVE');
    assert.equal(extractItemFromMatCode('PRV-CS06-D060'), 'RELIEF VALVE');
});

test('extractItemFromMatCode: unknown prefix returns "-"', () => {
    assert.equal(extractItemFromMatCode('ZZZ-CS06-D060'), '-');
});

test('extractItemFromMatCode: empty/null input returns "-"', () => {
    assert.equal(extractItemFromMatCode(''), '-');
    assert.equal(extractItemFromMatCode(null), '-');
    assert.equal(extractItemFromMatCode(undefined), '-');
});

test('extractItemDisplayFromMatCode: PIS/PIW split into SMLS/WELDED (regression case for the bug fixed 2026-07-06)', () => {
    assert.equal(extractItemDisplayFromMatCode('PIS-CS06-D060-S40-BW'), 'PIPE SMLS');
    assert.equal(extractItemDisplayFromMatCode('PIW-CS06-D060-S40-BW'), 'PIPE WELDED');
});

test('extractItemDisplayFromMatCode: non-Pipe codes fall through to extractItemFromMatCode unchanged', () => {
    assert.equal(extractItemDisplayFromMatCode('FLN-CS06-D060-CL150-RF'), 'FLANGE');
    assert.equal(extractItemDisplayFromMatCode('ZZZ-CS06-D060'), '-');
});

test('extractSizeFromMatCode: single D-code', () => {
    assert.equal(extractSizeFromMatCode('PIS-CS06-D060-S40-BW'), '6"');
});

test('extractSizeFromMatCode: dual D-code (reducer)', () => {
    assert.equal(extractSizeFromMatCode('RDC-CS06-D060D040-S40-BW'), '6"×4"');
});

test('extractSizeFromMatCode: DN format', () => {
    assert.equal(extractSizeFromMatCode('SOMECODE-DN80-XYZ'), '8"');
});

test('extractSizeFromMatCode: no size pattern returns "-"', () => {
    assert.equal(extractSizeFromMatCode('GSKT-SW304'), '-');
});

test('extractSizeLengthFromMatCode: bolt with length', () => {
    assert.equal(extractSizeLengthFromMatCode('STB-A193-B7-HDG-3/4"x120'), '3/4"x120mm');
});

test('extractSizeLengthFromMatCode: gasket without length', () => {
    assert.equal(extractSizeLengthFromMatCode('GSKT-SW304-8"-CL150'), '8"');
});

test('extractDnSizeFromDesc: finds DN pattern', () => {
    assert.equal(extractDnSizeFromDesc('6" 300# DN 25 Gate Valve'), 'DN 25');
});

test('extractDnSizeFromDesc: no DN pattern returns null', () => {
    assert.equal(extractDnSizeFromDesc('6" 300# Gate Valve'), null);
});

test('extractItemFromDesc: compound item detected', () => {
    assert.equal(extractItemFromDesc('Steam Trap (High Alloy) Assembly'), 'STEAM TRAP (HIGH ALLOY)');
});

test('extractItemFromDesc: valve tail format detected', () => {
    assert.equal(extractItemFromDesc('6" 300 A216-WCB Flexible wedge GATE Valve'), 'GATE VALVE');
});

test('extractItemFromDesc: empty input returns "-"', () => {
    assert.equal(extractItemFromDesc(''), '-');
    assert.equal(extractItemFromDesc(null), '-');
});

test('ITEM_PREFIX_MAP: Safety Valve groups both PSV and PRV (documented asymmetry, must not be "fixed")', () => {
    assert.deepEqual(ITEM_PREFIX_MAP['SAFETY VALVE'], ['PSV', 'PRV']);
});
```

- [ ] **Step 3: Run tests to verify they fail before Task 1/2 exist, or pass if run after**

Run: `npm test`
Expected (if run *after* Task 1 and 2 are complete, which is the normal order since this is Task 3): all tests PASS. If you are verifying TDD-style *before* `matching.js` exists, this command fails with `Error: Cannot find module '../static/js/matching.js'` — that confirms the test file is correctly wired to the not-yet-created module.

- [ ] **Step 4: If any test fails, fix `matching.js` (not the test) unless the test itself has a typo**

Re-run `npm test` until all tests report `pass`.

- [ ] **Step 5: Commit**

```bash
git add package.json tests/matching.test.js
git commit -m "test: matching.js 파싱 함수 Node 단위 테스트 추가"
```

---

### Task 4: Full smoke test (regression check)

**Files:** none (verification only)

- [ ] **Step 1: Run the test suite one more time**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 2: Full browser smoke test**

Run: `python app.py`, click through every sidebar item once (Dashboard, Material Finding, BOM sub-tabs incl. Piping/Fitting/Valve/Speciality/Others, Bulk Item Piping/Fitting/Others, TAG Item Valve/Speciality/Spool/Support, Material Status Stock/Shortage/Surplus, Material Summary, Shipping).
Expected: no console errors; Item columns everywhere show the same values as before this plan (Pipe rows still show PIPE/PIPE SMLS/PIPE WELDED in the same places as before).

- [ ] **Step 3: Commit (only if a fix was needed)**

```bash
git add -A
git commit -m "fix: matching.js 분리 후 발견된 회귀 수정"
```
