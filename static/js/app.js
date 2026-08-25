/* global Chart */
// Supabase 설정
const SUPABASE_URL = 'https://ognhvfvlboqblueuldlm.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nbmh2ZnZsYm9xYmx1ZXVsZGxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3MzY2NTUsImV4cCI6MjA4ODMxMjY1NX0.paO5jr16M7yTySUAp9LgberoatDds9rTNa_eCU_ET_I';
let supabaseClient = null;
try {
    if (typeof window.supabase !== 'undefined' && SUPABASE_URL) {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    }
} catch (e) {
    console.error("Supabase initialization failed:", e);
}


let db = {
    matCodeMaster: [],
    bom: [],           // bom_agg: aggregated by matCode+category+system
    bomIsoList: [],    // bom_iso_list: distinct system+iso_dwg_no pairs for dropdowns
    isoBoreMap: {},    // iso_dwg_no → Set('Small'|'Large') — line_no 기반 Bore 필터/드롭다운 연동용
    bomDesc: {},       // bom_desc view: matCode → full_description (BOM 설계 원문)
    bomTagMap: {},     // bom_detail: tag → {matCode, fullDescription, lineNo, iso_dwg_no} (NULL matCode 입고 레코드 매칭용)
    specialityItems: [], // Speciality category distinct items (mat_code NULL → desc 기반)
    receiving: []
};

// Material Shortage 탭 자동 갱신 타이머
let shortageRefreshTimer = null;
const SHORTAGE_REFRESH_INTERVAL_MS = 60 * 1000; // 60초
let _stockFiltersInitialized = false;

// bom_agg 원본 행 → db.bom 행 매핑 (syncShortageData/syncFromSupabase 공용)
// Valve/Speciality는 mat_code가 없어(Tag가 고유 키) matCode 대신 tag를 key로 사용
function _mapBomAggRow(b) {
    const matCode = (b.mat_code || '').trim().toUpperCase();
    const tag = (b.tag || '').trim().toUpperCase();
    return {
        matCode, tag, key: matCode || tag,
        category: b.category || '-',
        system: b.system,
        uom: b.uom || 'EA',
        qty: parseFloat(b.total_qty || b.qty) || 0
    };
}

// receiving 원본 행 → db.receiving 행 매핑 (syncShortageData/syncFromSupabase 공용)
// Untagged Items(부속품/공구, {PKG NO}-ACC-nnn / -SPARE-nnn 합성 Tag)는 BOM에
// 대응 항목이 없어 key로 쓰면 Surplus에 대량 오탐이 생김 — 매칭 키에서 제외
function _mapReceivingRow(r) {
    const matCode = (r.mat_code || '').trim().toUpperCase();
    const tagRaw = r.tag || '-';
    const tag = tagRaw.trim().toUpperCase();
    const isSynthetic = /-ACC-\d|-SPARE-\d/i.test(tagRaw);
    return {
        id:       r.id,
        matCode,  tag: tagRaw,
        key:      matCode || (isSynthetic ? '' : tag),
        category: r.category || '-',
        docNo:    r.doc_no || '-',
        plNo:     r.pkg_no || '-',
        desc:     r.full_description || '-',
        unit:     r.unit || 'EA',
        qty:      parseFloat(r.qty) || 0,
        purpose:  r.purpose || '',
        opType:   r.op_type || '-',
        valveType: r.valve_type || '-',
        mat1:     r.mat1 || '-',
        mat2:     r.mat2 || '-',
        size:     r.size || '-',
        rating:   r.rating || '-',
    };
}

async function syncShortageData() {
    if (!supabaseClient) return;
    try {
        const [bomRaw, recvRaw] = await Promise.all([
            supabaseClient.from('bom_agg').select('*').then(r => r.data || []),
            fetchAllRows('receiving')
        ]);
        if (bomRaw.length > 0) {
            db.bom = bomRaw.map(_mapBomAggRow).filter(b => b.qty > 0 && b.key);
        }
        if (recvRaw.length > 0) {
            db.receiving = recvRaw.map(_mapReceivingRow).filter(r => r.qty > 0);
        }
        renderShortageTable();
    } catch (e) {
        console.error('syncShortageData error:', e);
    }
}

// 전체 테이블 공통 페이지 크기
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
    'SWAGECON':['SWC'], 'SWAGEECC':['SWE'],
    'WELDOLET':['WOL'], 'SOCKOLET':['SOL'], 'THREADOLET':['TOL'],
    'NOZZLE':['NOZ'],
    'GATE VALVE':['GTV'], 'GLOBE VALVE':['GLV'], 'CHECK VALVE':['CHV'],
    'BUTTERFLY VALVE':['BFV'], 'BALL VALVE':['BAV'], 'PLUG VALVE':['PLV'],
    'SAFETY VALVE':['PSV','PRV'], 'VALVE':['GTV','GLV','CHV','BFV','BAV','PLV','PSV','PRV'],
    'GASKET':['GSKT','GSK'], 'STUD BOLT':['STB'], 'NUT':['NUT'], 'BOLT':['BOL'],
    'UNION':['UNI'], 'PLUG':['PLG'], 'BUSHING':['BUS'],
};

// Valve/Speciality 부속품/스페어파트 판별 정규식 — updateCategoryCharts()의 Speciality 집계와
// Spare 탭 분류에서 공유 (2026-07-06 모듈 top-level로 승격)
const ACCESSORY_RE = /STUD BOLT|SUTD BOLT|NUT |GASKET|FLANGE|BODY |PACKING SET|PACKING GUIDE|STEM PACKING|SPARE PARTS|SPECIAL TOOLS|BLIND FLANGE|BONNET GASKET|TRIM PARTS|SCREW|WASHER|SLEEVE|SPACER|O-RING|PLUG M|SPRING |SEAT COVER|COVER HOLDER|SLOTTED NUT|LOCK WASHER|STUD :|PIPE |B16\.5|GASKET KIT|PRESSURE SEAL|STEM GUIDE|BALANCE SEAL|PISTON RING|WAVE SPRING|DUMMY BONNET|DUMMY CAGE|DUMMY SEAT|FLUSHING|HYDRO TEST|EYE BOLT|BLOW OUT|BLOW THROUGH|TEST PRESSURE|HINGE PIN|SEAL RING| RING FOR|PIN RING/;

// Valve/Speciality Receiving 중 "SPARE" 합성 태그가 붙은 예비 밸브/기기 본체 판별
// (Accessory/Fitting 부속품은 false — 기존 탭 제외 필터 및 Spare 탭 분류에서 공유)
function isSpareBodyRow(r) {
    if (r.category !== 'Valve' && r.category !== 'Speciality') return false;
    if (!/SPARE/i.test(r.tag || '')) return false;
    return !ACCESSORY_RE.test((r.desc || '').toUpperCase());
}

// 공통 페이지네이터 렌더러 — Previous 1/2/3 ... Next 형식
function renderPagination(containerId, page, totalPages, gotoFnName) {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (totalPages <= 1) { container.innerHTML = ''; return; }

    const base = 'min-width:32px;height:28px;padding:0 10px;border-radius:4px;font-size:12px;font-weight:600;cursor:pointer;border:1px solid ';
    const sActive  = base + '#0A2540;background:#0A2540;color:#fff;cursor:default;';
    const sInact   = base + '#ccc;background:#fff;color:#333;';
    const sDis     = base + '#e0e0e0;background:#f5f5f5;color:#bbb;cursor:not-allowed;';

    let html = `<div style="display:flex;align-items:center;justify-content:center;gap:4px;padding:10px 0;flex-wrap:wrap;">`;

    const prevDis = page <= 1;
    html += `<button style="${prevDis ? sDis : sInact}" ${prevDis ? 'disabled' : `onclick="${gotoFnName}(${page - 1})"`}>&#8249; Prev</button>`;

    const delta = 2;
    const pageSet = new Set([1, totalPages]);
    for (let i = Math.max(2, page - delta); i <= Math.min(totalPages - 1, page + delta); i++) pageSet.add(i);
    const sorted = [...pageSet].sort((a, b) => a - b);
    let prev = 0;
    sorted.forEach(p => {
        if (prev && p - prev > 1) html += `<span style="padding:0 4px;color:#aaa;">…</span>`;
        const isActive = p === page;
        html += `<button style="${isActive ? sActive : sInact}" ${isActive ? 'disabled' : `onclick="${gotoFnName}(${p})"`}>${p}</button>`;
        prev = p;
    });

    const nextDis = page >= totalPages;
    html += `<button style="${nextDis ? sDis : sInact}" ${nextDis ? 'disabled' : `onclick="${gotoFnName}(${page + 1})"`}>Next &#8250;</button>`;
    html += `</div>`;
    container.innerHTML = html;
}

// --- Helper Functions (Globally Available) ---

// KPI/Chart 집계 포함 여부: Valve/Speciality는 Tag 항목만, 나머지는 전체
function isKpiReceiving(r) {
    if (r.category === 'Valve' || r.category === 'Speciality') {
        return r.tag && r.tag !== '-';
    }
    return true;
}
window.getCategory = function(desc, matCode) {
    if (!desc && !matCode) return 'Others';
    let d = ((desc||'') + ' ' + (matCode||'')).toUpperCase();
    let m = (matCode || '').toUpperCase();
    
    // 1. Valve Detection (MOV/CON/PSV 포함)
    if (d.includes('VALVE') || d.includes('VLV') ||
        /^(BAV|GLV|GTV|CHV|BFV|PLV|PSV|PRV|CON|MOV|CV-)/.test(m)) return 'Valve';

    // 2. Pipe Detection (TUBE는 배관재 맥락에서만 — 밸브 이후 체크)
    if (d.includes('PIPE') || m.startsWith('PIS-') || m.startsWith('PIP-') ||
        (/\bTUBE\b/.test(d) && !m.startsWith('MOV'))) return 'Pipe';

    // 3. Support Detection
    if (d.includes('SUPPORT') || d.includes('SHOE') || d.includes('GUIDE') || d.includes('U-BOLT') || d.includes('UBOLT')) return 'Support';

    // 4. Speciality Detection
    if (d.includes('TRAP') || d.includes('STRAINER') || d.includes('SIGHT') || d.includes('HOSE') || d.includes('SPECIALTY') || m.startsWith('SP-')) return 'Speciality';

    // 5. Others / Bolting / Gasket
    if (d.includes('GASKET') || d.includes('BOLT') || /\bNUT\b/.test(d) || m.startsWith('GSKT-') || m.startsWith('STB-') || m.startsWith('NUT-')) return 'Others';

    // 6. Fitting Detection
    if (d.includes('ELBOW') || d.includes('TEE') || d.includes('REDUCER') || d.includes('CAP') || d.includes('OLET') || d.includes('FLANGE') || d.includes('NIPPLE') || d.includes('COUPLING') || d.includes('UNION') || d.includes('BLIND') || d.includes('FLN') || d.includes('EL9') || d.includes('EL4') || m.startsWith('ELB-') || m.startsWith('TEE-') || m.startsWith('RED-') || m.startsWith('CAP-') || m.startsWith('FLN-') || m.startsWith('PIN-') || m.startsWith('CPF-') || m.startsWith('CPH-') || m.startsWith('CPU-') || m.startsWith('SWC-') || m.startsWith('SWE-')) return 'Fitting';

    return 'Others';
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
    // COMPOUND 매칭 문자열(원문 표기)과 화면 표시용 통일 라벨이 다른 경우의 별칭
    const COMPOUND_LABEL_ALIAS = { 'SWAGE-CON': 'SWAGECON', 'SWAGE-ECC': 'SWAGEECC' };
    const upper = desc2.toUpperCase().trim();
    // Steam Trap 세부 재질 감지 — "(High Alloy)" 공백 유무 모두 처리
    if (/STEAM TRAP\s*\(HIGH ALLOY\)/i.test(desc2)) return 'STEAM TRAP (HIGH ALLOY)';
    if (/STEAM TRAP\s*\(LOW ALLOY\)/i.test(desc2))  return 'STEAM TRAP (LOW ALLOY)';
    for (const c of COMPOUND) {
        if (upper.startsWith(c)) return COMPOUND_LABEL_ALIAS[c] || c;
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
        if (sUpper.startsWith(c)) return COMPOUND_LABEL_ALIAS[c] || c;
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

// MOV/AOV/SOV/HOV 등 구동방식 코드가 PKG NO(예: PGU-DE-125-MOV-BFV-012)에 포함돼 있는데
// Description에 실제 밸브 본체 표현("GATE VALVE" 등)이 없으면, 그 밸브에 딸린 부속품
// (스터드볼트/개스킷 등)으로 보고 "{구동방식} ACCESSORY"로 분류. 밸브 본체 행은 그대로 둠.
window.getValveOpAccessoryItem = function(plNo, desc) {
    const opMatch = (plNo || '').toUpperCase().match(/-(MOV|AOV|SOV|HOV)-/);
    if (!opMatch) return null;
    const isValveBody = /\b(GATE|GLOBE|BALL|CHECK|BUTTERFLY|PLUG|NEEDLE|DIAPHRAGM)\s+VALVE\b/.test((desc || '').toUpperCase());
    return isValveBody ? null : `${opMatch[1]} ACCESSORY`;
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
        'SWC':'SWAGECON', 'SWE':'SWAGEECC',
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
    // matCode는 로딩 시 전체가 toUpperCase되므로 (7/8"x130 → 7/8"X130) 대소문자 무관하게 매칭
    const m = (matCode || '').match(/-([\d\/\-]+)"(?:x(\d+))?/i);
    if (!m) return '-';
    return m[2] ? `${m[1]}"x${m[2]}mm` : `${m[1]}"`;
};

// Valve(MatCode 없음) 등 description에 "DN xx" 형태로 박힌 사이즈 추출 — "DN 25" → "DN 25"
window.extractDnSizeFromDesc = function(desc) {
    const m = (desc || '').match(/\bDN\s*(\d+)\b/i);
    return m ? 'DN ' + m[1] : null;
};

// Speciality(MatCode 없음) full_description = "{ITEM}, {MAT2}, {SIZE}, {RATING}, {END TYPE}"
// Rating 표기가 300#/SCH.40 등 제각각이라 CL### 정규식 대신 콤마 위치로 직접 파싱
window.parseSpecialityDesc = function(desc) {
    const parts = (desc || '').split(',').map(s => s.trim());
    return { size: parts[2] || '-', rating: parts[3] || '-', endType: parts[4] || '-' };
};

// D-code가 없는 Speciality 품목 등을 위해 description에서 인치 사이즈 파싱
window.extractSizeFromDesc = function(desc) {
    if (!desc || desc === '-') return '-';
    const m = desc.match(/(\d+(?:[- ]\d+\/\d+)?)"/);
    return m ? m[1] + '"' : '-';
};

// 통합 사이즈 추출: matCode D-code → description → size1 → item 기본값 순으로 폴백
window.getEffectiveSize = function(matCode, fullDesc, size1) {
    const fromCode = window.extractSizeFromMatCode(matCode);
    if (fromCode && fromCode !== '-') return fromCode;
    const fromDesc = window.extractSizeFromDesc(fullDesc);
    if (fromDesc && fromDesc !== '-') return fromDesc;
    if (size1 && size1 !== '-') return size1;
    // Steam Trap: description에 사이즈 없을 때 기본값 1" (확인된 사실)
    if (/STEAM TRAP/i.test(fullDesc || '')) return '1"';
    return '-';
};

// Speciality LINE NO 앞부분에서 사이즈 추출: "6\"-PW-..." → "6\""
window.extractSizeFromLineNo = function(lineNo) {
    if (!lineNo) return '-';
    const m = lineNo.match(/^(\d+(?:[- ]\d+\/\d+)?)"/);
    return m ? m[1] + '"' : '-';
};

// Line No 앞자리 사이즈로 Bore 판정: 2" 이하 Small, 그 외(2.5" 이상) Large
window.getBoreFromLineNo = function(lineNo) {
    const sizeStr = window.extractSizeFromLineNo(lineNo);
    if (!sizeStr || sizeStr === '-') return null;
    const inch = parseFloat(sizeStr);
    return isNaN(inch) ? null : (inch <= 2 ? 'Small' : 'Large');
};

// TAG 정보로부터 사이즈 추출: lineNo → description → item 기본값 순으로 폴백
// buildRecvMaps, issMap, stockGetSizesForCatItem 에서 공통 사용
window.getSizeFromTagInfo = function(tagInfo) {
    if (!tagInfo) return '-';
    const fromLine = window.extractSizeFromLineNo(tagInfo.lineNo);
    if (fromLine && fromLine !== '-') return fromLine;
    const fromDesc = window.extractSizeFromDesc(tagInfo.fullDescription);
    if (fromDesc && fromDesc !== '-') return fromDesc;
    if (/STEAM TRAP/i.test(tagInfo.fullDescription || '')) return '1"';
    return '-';
};

// 재고 테이블 복합키 파싱: "STR-STAI-40-150-WN__6\"" → {matCode, sizeOverride}
window.parseStockKey = function(key) {
    const sep = key.indexOf('__');
    if (sep === -1) return { matCode: key, sizeOverride: null };
    return { matCode: key.substring(0, sep), sizeOverride: key.substring(sep + 2) };
};

function showLoading(show) {
    const loader = document.getElementById('globalLoader');
    if (loader) loader.style.display = show ? 'flex' : 'none';
}

const TABLES_WITH_ID = new Set(['receiving', 'issued', 'bom']);
const CAT_BADGE = { Pipe:'info', Fitting:'ok', Valve:'warn', Speciality:'warn', Spool:'info', Support:'ok', Others:'ok' };
const getCatBadge = cat => CAT_BADGE[cat] || 'ok';

// Supabase 쿼리가 일시적 DB statement timeout(57014) 등으로 실패할 때 재시도하는 공용 래퍼.
// fetchIsoBoreMap()에서 이미 검증된 "최대 3회 재시도" 패턴을 공용화한 것.
// queryFactory는 호출할 때마다 새 쿼리를 만들어야 함(같은 쿼리 객체를 재사용하면 안 됨).
async function fetchWithRetry(queryFactory, label, maxAttempts = 3) {
    let data = null, error = null, count = null;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const res = await queryFactory();
        data = res.data; error = res.error; count = res.count;
        if (!error) break; // head:true 쿼리는 data가 항상 null이므로 error 유무로 성공 판정
        console.warn(`${label} retry (attempt ${attempt + 1}):`, error.message);
    }
    if (error) console.error(`${label} gave up after ${maxAttempts} attempts:`, error);
    return { data, error, count };
}

async function fetchAllRows(tableName) {
    let allData = [];
    let from = 0;
    let step = 5000;
    let hasMore = true;

    while (hasMore) {
        const rangeFrom = from, rangeTo = from + step - 1;
        const { data, error } = await fetchWithRetry(() => {
            let q = supabaseClient.from(tableName).select('*');
            if (TABLES_WITH_ID.has(tableName)) q = q.order('id', { ascending: true });
            return q.range(rangeFrom, rangeTo);
        }, `fetchAllRows(${tableName}) offset ${rangeFrom}`);

        if (error && !data) {
            break;
        }

        if (data && data.length > 0) {
            allData = allData.concat(data);
            from += step;
            if (data.length < step) hasMore = false;
            if (allData.length > 100000) hasMore = false;
        } else {
            hasMore = false;
        }
    }
    return allData;
}

// bom 테이블 전체를 iso_dwg_no/line_no만 가볍게 스캔해 ISO → Bore(Small/Large) 매핑 구성
// (ISO Drawing 검색창의 Bore 연동 드롭다운용 — bom_iso_list 뷰에는 line_no가 없어 별도 조회)
// 병렬 요청은 Supabase 커넥션이 몰려 500 에러 및 일부 페이지 누락(불완전한 매핑)을 유발함을 확인했음.
// 순차 조회 + 페이지별 재시도로 느리더라도 완전하고 정확한 매핑을 보장 (Material Finding 탭 진입 시 1회만 실행)
async function fetchIsoBoreMap() {
    const map = {};
    let from = 0, step = 5000, hasMore = true, ok = true;
    while (hasMore) {
        let data = null, error = null;
        for (let attempt = 0; attempt < 3 && !data; attempt++) {
            const res = await supabaseClient.from('bom').select('iso_dwg_no,line_no').range(from, from + step - 1);
            data = res.data; error = res.error;
            if (error) console.warn(`fetchIsoBoreMap retry (attempt ${attempt + 1}) at offset ${from}:`, error.message);
        }
        if (error && !data) { console.error('fetchIsoBoreMap gave up at offset', from, error); ok = false; break; }
        if (!data || data.length === 0) { hasMore = false; break; }
        data.forEach(r => {
            const bore = window.getBoreFromLineNo(r.line_no);
            if (!bore || !r.iso_dwg_no) return;
            if (!map[r.iso_dwg_no]) map[r.iso_dwg_no] = new Set();
            map[r.iso_dwg_no].add(bore);
        });
        from += step;
        if (data.length < step) hasMore = false;
    }
    return { map, ok };
}

async function syncFromSupabase() {
    if (!supabaseClient) return;
    
    showLoading(true);
    try {
        const [matMasterRaw, bomRaw, bomIsoRaw, recvRaw, bomDescRaw, specialityRaw, bomTagRaw] = await Promise.all([
            fetchAllRows('matcode_master'),
            fetchWithRetry(() => supabaseClient.from('bom_agg').select('*').limit(10000), 'bom_agg').then(r => r.data || []),
            fetchWithRetry(() => supabaseClient.from('bom_iso_list').select('*').limit(10000), 'bom_iso_list').then(r => r.data || []),
            fetchAllRows('receiving'),
            fetchWithRetry(() => supabaseClient.from('bom_desc').select('mat_code,full_description').limit(10000), 'bom_desc').then(r => r.data || []),
            fetchWithRetry(() => supabaseClient.from('bom_detail').select('full_description').eq('category', 'Speciality').not('full_description', 'is', null).limit(1000), 'bom_detail(Speciality desc)').then(r => r.data || []),
            fetchWithRetry(() => supabaseClient.from('bom_detail').select('tag,mat_code,full_description,line_no,iso_dwg_no,mat1,mat2').not('tag', 'is', null).limit(10000), 'bom_detail(tag map)').then(r => r.data || [])
        ]);
        // isoBoreMap은 bom 테이블 전체 스캔이 필요해 무거움 — Material Finding 탭 진입 시 지연 로딩(loadIsoBoreMapOnce)

        if (matMasterRaw.length > 0) {
            db.matCodeMaster = matMasterRaw.map(m => ({
                matCode: (m.mat_code || '').trim().toUpperCase(),
                category: m.category || '-',
                itemDesc: m.item_desc || '-',
                matlDesc: m.matl_desc || '-',
                size1: m.size1 || '-',
                size2: m.size2 || '-',
                classDesc: m.class_desc || '-',
                etDesc: m.et_desc || '-'
            }));
        }

        if (bomRaw.length > 0) {
            db.bom = bomRaw.map(_mapBomAggRow).filter(b => b.qty > 0 && b.key);
        }
        bomDescRaw.forEach(b => {
            if (b.mat_code && b.full_description) {
                db.bomDesc[b.mat_code.trim().toUpperCase()] = b.full_description;
            }
        });
        db.bomTagMap = {};
        bomTagRaw.forEach(b => {
            if (!b.tag) return;
            const key = b.tag.trim().toUpperCase();
            if (!db.bomTagMap[key]) {
                db.bomTagMap[key] = {
                    matCode: b.mat_code ? b.mat_code.trim().toUpperCase() : '',
                    fullDescription: b.full_description || '',
                    lineNo: b.line_no || '',
                    iso_dwg_no: b.iso_dwg_no || '',
                    mat1: b.mat1 || '',
                    mat2: b.mat2 || ''
                };
            }
        });
        db.specialityItems = [...new Set(
            specialityRaw.map(b => window.extractItemFromDesc(b.full_description)).filter(v => v && v !== '-')
        )].sort();
        db.bomIsoList = bomIsoRaw.map(r => ({
            system: r.system || '-',
            iso: r.iso || '-'
        })).filter(r => r.iso !== '-');
        
        if (recvRaw.length > 0) {
            db.receiving = recvRaw.map(_mapReceivingRow).filter(r => r.qty > 0);
        }

        await loadPlUpdates();
        // Shipping 캐시 무효화 — 전역 동기화 후 다음 탭 진입 시 재빌드
        _shippingData         = null;
        _spoolShippingCache   = null;
        _supportShippingCache = null;
        // Material Summary / Bulk Receiving Mat1/Mat2/Rating 캐시·필터 옵션 무효화
        _mssItemAggCache = null;
        ['plMat1Filter','plMat2Filter','plRatingFilter',
         'fitMat1Filter','fitMat2Filter','fitRatingFilter',
         'othMat1Filter','othMat2Filter','othRatingFilter'].forEach(id => {
            const el = document.getElementById(id);
            if (el) delete el.dataset.filled;
        });
        renderAllViews();
        initFilterOptions();

        // Refresh active table if user is looking at one
        const activeView = document.querySelector('.view-section.active');
        if (activeView) {
            const id = activeView.id;
            // Use setTimeout to ensure UI is ready for rendering large tables
            setTimeout(() => {
                if(id === 'piping_bom') { initBomTabs(); renderActiveBomTab(); }
                if(id === 'receiving') { initReceivingTabs(); renderActiveReceivingTab(); }
            }, 200);
        }

    } catch (err) {
        console.error("syncFromSupabase Sync Fail:", err);
    } finally {
        showLoading(false);
    }
}

// ==========================================
// Initialization & Navigation
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    initNavigation();

    // initFilterOptions()/updateDashboard()는 로컬 캐시가 아니라 Supabase에 직접 쿼리하는 부분이
    // 섞여있어, 여기서 먼저 불러도 "일찍 보여주는" 효과 없이 syncFromSupabase() 완료 후
    // renderAllViews()/initFilterOptions() 재호출과 완전히 같은 쿼리 세트를 한 번 더 쏘기만 함
    // (중복 네트워크 요청, 2026-07-06 발견/제거). 초기 화면은 HTML의 "—" 플레이스홀더로 이미
    // 표시되고 있으므로 sync 완료 후 한 번만 채우면 충분.

    if (supabaseClient) {
        syncFromSupabase();
    } else {
        console.warn("Supabase not configured.");
        initFilterOptions();
        updateDashboard();
    }

    attachEventListeners();
});

function initNavigation() {
    const navItems = document.querySelectorAll('.sidebar .nav-item');
    const sections = document.querySelectorAll('.main-content .view-section');

    const REC_TAB_MAP = {
        rec_bulk_piping:    { sec: 'bulk', tab: 'piping' },
        rec_bulk_fitting:   { sec: 'bulk', tab: 'fitting' },
        rec_bulk_others:    { sec: 'bulk', tab: 'others' },
        rec_tag_spool:      { sec: 'tag',  tab: 'spool' },
        rec_tag_valve:      { sec: 'tag',  tab: 'valve' },
        rec_tag_speciality: { sec: 'tag',  tab: 'speciality' },
        rec_tag_support:    { sec: 'tag',  tab: 'support' },
        rec_tag_spare:      { sec: 'tag',  tab: 'spare' },
    };

    // Material Status 계열 — Shortage/Surplus를 별도 사이드바 항목으로 분리(2026-08-07)하면서도
    // 물리적으로는 하나의 #material_status 섹션을 공유(receiving 섹션의 REC_TAB_MAP과 동일 패턴)
    const MS_TAB_MAP = {
        material_stock:    'stock',
        material_shortage: 'shortage',
        material_surplus:  'surplus',
    };

    window.showSection = function(targetId) {
        navItems.forEach(n => n.classList.remove('active'));
        sections.forEach(s => s.classList.remove('active'));

        const navItem = Array.from(navItems).find(n => n.getAttribute('data-target') === targetId);
        if (navItem) navItem.classList.add('active');

        if (REC_TAB_MAP[targetId]) {
            document.getElementById('receiving').classList.add('active');
            initReceivingTabs();
            const { sec, tab } = REC_TAB_MAP[targetId];
            switchReceivingTab(sec, tab);
            return;
        }

        if (MS_TAB_MAP[targetId]) {
            document.getElementById('material_status').classList.add('active');
            initMaterialStatusTabs();
            switchMaterialStatusTab(MS_TAB_MAP[targetId]);
            return;
        }

        const section = document.getElementById(targetId);
        if (section) section.classList.add('active');

        if(targetId === 'dashboard') updateDashboard();
        if(targetId === 'issue') renderIssueOptions();
        if(targetId === 'piping_bom') { initBomTabs(); renderActiveBomTab(); }
        if(targetId === 'receiving') { initReceivingTabs(); renderActiveReceivingTab(); }
        if(targetId === 'material_summary') initMssTabs();
        if(targetId === 'shipping') initShipping();

        if (shortageRefreshTimer) {
            clearInterval(shortageRefreshTimer);
            shortageRefreshTimer = null;
        }
    };

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            showSection(item.getAttribute('data-target'));
        });
    });
}

function renderAllViews() {
    updateDashboard();
}

function renderBulkProgressBars(categories) {
    const container = document.getElementById('bulkProgressChart');
    if (!container) return;

    container.innerHTML = categories.map(({ label, unit, bom, rec }) => {
        const pct      = bom > 0 ? (rec / bom) * 100 : 0;
        const surplus  = rec > bom ? rec - bom : 0;
        const shortage = rec < bom ? bom - rec : 0;
        const fillPct  = Math.min(pct, 100);
        // 부족(Shortage)은 문제가 아니라 순차 입고 진행 중인 정상 상태 — 연한 파랑/초록으로 차분하게 표시
        const barColor = pct >= 90 ? '#66bb6a' : '#42a5f5';
        const pctColor = pct >= 90 ? '#66bb6a' : '#42a5f5';

        const diffHtml = surplus > 0
            ? `<span style="color:#e65100;font-weight:700;">Surplus +${Math.round(surplus).toLocaleString()} ${unit}</span>`
            : shortage > 0
            ? `<span style="color:#42a5f5;font-weight:700;">Shortage -${Math.round(shortage).toLocaleString()} ${unit}</span>`
            : `<span style="color:#66bb6a;font-weight:700;">✓ Complete</span>`;

        return `
        <div style="margin-bottom:10px;">
            <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:3px;">
                <span style="font-size:12px;font-weight:700;color:#0A2540;">
                    ${label} <span style="font-size:10px;font-weight:400;color:#888;">(${unit})</span>
                </span>
                <span style="font-size:13px;font-weight:800;color:${pctColor};">${pct.toFixed(1)}%</span>
            </div>
            <div style="position:relative;height:16px;background:#e8edf5;border-radius:4px;overflow:hidden;">
                <div style="position:absolute;left:0;top:0;height:100%;width:${fillPct.toFixed(1)}%;background:${barColor};border-radius:4px;"></div>
                ${surplus > 0 ? `<div style="position:absolute;right:0;top:0;height:100%;width:5px;background:#e65100;"></div>` : ''}
            </div>
            <div style="display:flex;justify-content:space-between;margin-top:2px;font-size:10px;color:#555;">
                <span>BOM <b style="color:#0A2540;">${Math.round(bom).toLocaleString()} ${unit}</b></span>
                <span>Received <b style="color:#1565c0;">${Math.round(rec).toLocaleString()} ${unit}</b></span>
                ${diffHtml}
            </div>
        </div>`;
    }).join('');
}

function updateDashboard() {
    if (!supabaseClient) return;

    if (typeof updateCategoryCharts === 'function') updateCategoryCharts();
    if (typeof renderPendingItemsList === 'function') renderPendingItemsList();

    fetchWithRetry(() => supabaseClient.from('v_iso_stage_status').select('*').limit(10000), 'v_iso_stage_status').then(({ data, error }) => {
        if (error && !data) return;
        if (!data || data.length === 0) return;

        // Count by stage
        let erectionReady = 0, spoolReady = 0, spoolInProg = 0, critical = 0;
        data.forEach(iso => {
            const sp = parseFloat(iso.spool_score || 0);
            const fd = parseFloat(iso.field_score || 0);
            if (fd >= 100) erectionReady++;
            else if (sp >= 100) spoolReady++;
            else if (sp >= 50) spoolInProg++;
            else critical++;
        });

        // Donut chart — 4 stage segments
        if (window.isoChart) window.isoChart.destroy();
        const ctx = document.getElementById('isoReadinessChart');
        if (ctx && typeof Chart !== 'undefined') {
            window.isoChart = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: [
                        `Erection Ready (${erectionReady})`,
                        `Spool Ready (${spoolReady})`,
                        `Spool In Prog (${spoolInProg})`,
                        `Critical (${critical})`
                    ],
                    datasets: [{
                        data: [erectionReady, spoolReady, spoolInProg, critical],
                        backgroundColor: ['#2e7d32', '#1565c0', '#f57f17', '#c62828']
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    layout: { padding: { top: 8, bottom: 4 } },
                    plugins: {
                        legend: {
                            position: 'bottom',
                            align: 'center',
                            labels: { font: { size: 12 }, padding: 20, boxWidth: 14, boxHeight: 14 }
                        }
                    }
                }
            });
        }
    }).catch(err => console.error("Dashboard Sync Fail:", err));
}

// Pipe/Fitting을 대표 Item+Size 단위로 집계(Mat1/Mat2는 무시). Item 이름은 카테고리별로
// 겹치지 않으므로(예: PIPE=Pipe 전용, ELBOW 90D=Fitting 전용) category 없이 item+size로만 묶어도 안전.
function computeItemSizeSummary() {
    const sizeAgg = {}; // "item|size" -> { category, item, size, unit, bom, rec }

    const recByMatCode = {};
    db.receiving.forEach(r => {
        if (!isReceivingActive(r.plNo)) return;
        if (!['Pipe', 'Fitting'].includes(r.category)) return;
        recByMatCode[r.matCode] = (recByMatCode[r.matCode] || 0) + (r.qty || 0);
    });
    db.bom.forEach(b => {
        if (!['Pipe', 'Fitting'].includes(b.category)) return;
        const item = window.extractItemFromMatCode(b.matCode);
        if (!item || item === '-') return;
        const size = window.extractSizeFromMatCode(b.matCode) || '-';
        const key = `${item}|${size}`;
        if (!sizeAgg[key]) sizeAgg[key] = { category: b.category, item, size, unit: b.category === 'Pipe' ? 'M' : 'EA', bom: 0, rec: 0 };
        sizeAgg[key].bom += b.qty;
    });
    Object.keys(recByMatCode).forEach(mc => {
        const item = window.extractItemFromMatCode(mc);
        if (!item || item === '-') return;
        const size = window.extractSizeFromMatCode(mc) || '-';
        const key = `${item}|${size}`;
        if (!sizeAgg[key]) return;
        sizeAgg[key].rec += recByMatCode[mc];
    });

    return Object.values(sizeAgg);
}

// "BOM 물량은 많은데 입고가 안 된" 대표 Item Top 10 — Pipe 2개(대표 Size) + Fitting 8개(수량 많고 입고율 낮은 순).
// updateDashboard()가 초기 로딩 시 데이터 동기화 전/후로 두 번 호출되는데, 비동기 조회 순서가
// 뒤바뀌면 먼저 시작된(데이터 없는) 호출이 나중에 끝나 화면을 덮어쓸 수 있음 — 요청 순번으로 방지.
const PENDING_ITEMS_LOW_PCT = 50; // "입고율이 낮다"의 기준선(%) — 이보다 낮은 것만 대상
let _pendingItemsReqId = 0;
async function renderPendingItemsList() {
    const container = document.getElementById('pendingItemsList');
    if (!container) return;
    const reqId = ++_pendingItemsReqId;

    const rows = computeItemSizeSummary();
    if (reqId !== _pendingItemsReqId) return; // 이후에 시작된 더 최신 호출이 있으면 이 결과는 폐기

    const withPct = rows
        .filter(r => r.bom > 0 && r.rec < r.bom)
        .map(r => ({ ...r, pct: r.rec / r.bom * 100 }));

    // KPI 카드 ③: 실제 부족 Item+Size 전체 개수(아래 목록은 대표 Top 10만 표시하므로 별도 집계)
    const pipeShortCount = withPct.filter(r => r.category === 'Pipe').length;
    const fitShortCount  = withPct.filter(r => r.category === 'Fitting').length;
    const elPending = document.getElementById('kpi-pending-count');
    if (elPending) elPending.textContent = withPct.length;
    const elPendingSub = document.getElementById('kpi-pending-sub');
    if (elPendingSub) elPendingSub.textContent = `Pipe ${pipeShortCount} / Fitting ${fitShortCount}`;

    // Pipe: 대표 Size 2개(부족 수량이 가장 큰 순) — 소구경이 후순위로 밀리는 경향 확인용
    const pipeRows = withPct
        .filter(r => r.category === 'Pipe')
        .map(r => ({ item: `PIPE (${r.size})`, unit: r.unit, bom: r.bom, rec: r.rec, pct: r.pct }))
        .sort((a, b) => (b.bom - b.rec) - (a.bom - a.rec))
        .slice(0, 2);

    // Fitting: 입고율이 낮은(< 50%) 것만 대상으로, 그중 BOM 물량(=부족 수량)이 큰 순 8개
    const fittingRows = withPct
        .filter(r => r.category === 'Fitting' && r.pct < PENDING_ITEMS_LOW_PCT)
        .map(r => ({ item: `${r.item} (${r.size})`, unit: r.unit, bom: r.bom, rec: r.rec, pct: r.pct }))
        .sort((a, b) => (b.bom - b.rec) - (a.bom - a.rec))
        .slice(0, 8);

    const pending = [...pipeRows, ...fittingRows];

    if (pending.length === 0) {
        container.innerHTML = '<div class="empty-state-small">All representative items are 100% received.</div>';
        return;
    }

    container.innerHTML = pending.map(r => {
        // 부족(Shortage)은 순차 입고 진행 중인 정상 상태 — 연한 파랑으로 차분하게 표시
        const color = '#42a5f5';
        const shortage = r.bom - r.rec;
        return `
        <div style="margin-bottom:10px;">
            <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:3px;">
                <span style="font-size:12px;font-weight:700;color:#0A2540;">${r.item} <span style="font-size:10px;font-weight:400;color:#888;">(${r.unit})</span></span>
                <span style="font-size:13px;font-weight:800;color:${color};">${r.pct.toFixed(1)}%</span>
            </div>
            <div style="position:relative;height:14px;background:#e8edf5;border-radius:4px;overflow:hidden;">
                <div style="position:absolute;left:0;top:0;height:100%;width:${Math.min(r.pct,100).toFixed(1)}%;background:${color};border-radius:4px;"></div>
            </div>
            <div style="display:flex;justify-content:space-between;margin-top:2px;font-size:10px;color:#555;">
                <span>BOM <b style="color:#0A2540;">${Math.round(r.bom).toLocaleString()} ${r.unit}</b></span>
                <span>Received <b style="color:${color};">${Math.round(r.rec).toLocaleString()} ${r.unit}</b></span>
                <span style="color:${color};font-weight:700;">Shortage -${Math.round(shortage).toLocaleString()} ${r.unit}</span>
            </div>
        </div>`;
    }).join('');
}

function updateCategoryCharts() {
    if (!supabaseClient) return;

    // Fetch category summary + Valve/Speciality tag-based receiving + Spool BOM/Received tag 목록 + Support
    // (일시적 DB statement timeout에 대비해 각 쿼리를 fetchWithRetry로 감쌈)
    Promise.all([
        fetchWithRetry(() => supabaseClient.from('v_category_readiness').select('*'), 'v_category_readiness'),
        fetchWithRetry(() => supabaseClient.from('receiving').select('category, qty, tag, full_description, pkg_no').not('tag', 'is', null).in('category', ['Valve', 'Speciality']).limit(10000), 'receiving(Valve/Speciality tag)'),
        fetchWithRetry(() => supabaseClient.from('spool_bom').select('tag_no').limit(2000), 'spool_bom(tag_no)'),
        fetchWithRetry(() => supabaseClient.from('spool_receiving').select('tag_no').limit(2000), 'spool_receiving(tag_no)'),
        fetchWithRetry(() => supabaseClient.from('v_support_kpi').select('total_bom, total_received').single(), 'v_support_kpi'),
        fetchWithRetry(() => supabaseClient.from('bom').select('tag', { count: 'exact', head: true }).eq('category', 'Speciality'), 'bom(Speciality tag count)'),
    ]).then(([catRes, tagRecRes, spoolBomRes, spoolRecRes, suppKpiRes, splTagCountRes]) => {
        const data = catRes.data;
        if (catRes.error || !data) {
            console.error("❌ Chart Sync Error:", catRes.error);
            return;
        }

        // Spool: spool_bom/spool_receiving 모두 Tag 목록만 가져와 클라이언트에서 매칭
        // (두 테이블은 서로 다른 시점 데이터라 완전히 겹치지 않음 — project_spool_bom_reintroduction 메모리 참고)
        const spoolBomTagSet = new Set((spoolBomRes.data || []).map(r => (r.tag_no || '').trim()).filter(Boolean));
        const spoolRecTagSet = new Set((spoolRecRes.data || []).map(r => (r.tag_no || '').trim()).filter(Boolean));
        let spoolMatched = 0;
        spoolBomTagSet.forEach(t => { if (spoolRecTagSet.has(t)) spoolMatched++; });

        const catLabels = ['Pipe', 'Fitting', 'Valve', 'Speciality', 'Support', 'Others'];
        const bomDataArr = catLabels.map(l => {
            const match = data.find(d => d.category === l);
            return match ? parseFloat(match.total_bom) : 0;
        });

        // Pipe/Fitting/Support/Others: db.receiving 기반 (matCode 집계)
        const activeRecByCategory = {};
        db.receiving.filter(r => isReceivingActive(r.plNo)).forEach(r => {
            if (r.category === 'Valve' || r.category === 'Speciality') return; // 별도 처리
            const cat = r.category !== '-' ? r.category : null;
            if (cat) activeRecByCategory[cat] = (activeRecByCategory[cat] || 0) + r.qty;
        });

        // Valve/Speciality: DB 직접 쿼리 (Tag Item만)
        // Speciality: B0/B1/B2- 형식 tag만 + 부속 아이템(플랜지/볼트/가스켓 등) 제외

        // Speciality는 QTY 합계 대신 "받은 Tag 개수" 기준 — Orifice 등 일부 품목은 조립품 1개가
        // Packing List에는 여러 Item으로 쪼개져 기재되어 QTY 합계만으로는 입고율이 왜곡됨(사용자 확인, 2026-07-06)
        const specialityRecTagSet = new Set();

        if (tagRecRes.data) {
            tagRecRes.data.forEach(r => {
                const cat = r.category;
                const qty = parseFloat(r.qty || 0);
                const tag = (r.tag || '').trim();
                const desc = (r.full_description || '').toUpperCase();

                if (cat === 'Speciality') {
                    // Speciality는 BOM Tag와 정확히 일치하는 항목만 집계 — PKG 통짜 Tag(부속품/스페어파트)는
                    // BOM에 없는 Tag라 자동 제외됨(Valve처럼 Accessory 키워드 추정 대신 실제 Tag 매칭 사용)
                    if (!db.bomTagMap[tag.toUpperCase()]) return;
                    if (!isReceivingActive(r.pkg_no)) return;
                    specialityRecTagSet.add(tag);
                } else {
                    if (!/^B[0-2]-/i.test(tag)) return;
                    if (ACCESSORY_RE.test(desc)) return;
                    if (!isReceivingActive(r.pkg_no)) return;
                }

                activeRecByCategory[cat] = (activeRecByCategory[cat] || 0) + qty;
            });
        }

        const recDataArr = catLabels.map(l => activeRecByCategory[l] || 0);
        // Speciality는 Qty 합계 대신 Tag 개수 기준으로 교체 (BOM=전체 Tag 수, Received=매칭된 Tag 수)
        bomDataArr[3] = splTagCountRes.count || 0;
        recDataArr[3] = specialityRecTagSet.size;

        // Category KPI cards — % progress per category (반환값은 Overall 평균 계산에 재사용)
        function setCatKpi(pctId, subId, bom, rec, unit) {
            const pct = bom > 0 ? (rec / bom * 100) : 0;
            // 자재는 순차적으로 입고되는 중 — 진행률이 낮다고 경고색을 쓰지 않고 연한 파랑/초록만 사용
            const color = pct >= 90 ? '#66bb6a' : '#42a5f5';
            const elPct = document.getElementById(pctId);
            if (elPct) { elPct.textContent = pct.toFixed(1) + '%'; elPct.style.color = color; }
            const elSub = document.getElementById(subId);
            if (elSub) elSub.textContent = `${Math.round(rec).toLocaleString()} / ${Math.round(bom).toLocaleString()} ${unit}`;
            return pct;
        }
        const pctPipe  = setCatKpi('kpi-pipe-pct',  'kpi-pipe-sub',  bomDataArr[0], recDataArr[0], 'M');
        const pctFit   = setCatKpi('kpi-fit-pct',   'kpi-fit-sub',   bomDataArr[1], recDataArr[1], 'EA');
        const pctValve = setCatKpi('kpi-valve-pct', 'kpi-valve-sub', bomDataArr[2], recDataArr[2], 'EA');
        const pctSpc   = setCatKpi('kpi-spc-pct',   'kpi-spc-sub',   bomDataArr[3], recDataArr[3], 'EA');
        const pctOth   = setCatKpi('kpi-oth-pct',   'kpi-oth-sub',   bomDataArr[5], recDataArr[5], 'EA');

        // Support: v_support_kpi 뷰에서 집계값 직접 사용
        const supportBom = parseFloat(suppKpiRes.data?.total_bom || 0);
        const supportRec = parseFloat(suppKpiRes.data?.total_received || 0);
        const pctSup = setCatKpi('kpi-sup-pct', 'kpi-sup-sub', supportBom, supportRec, 'EA');

        // Spool: Tag 매칭 개수를 "받은 수량"으로 취급 (Valve/Speciality와 동일한 방식)
        const pctSpool = setCatKpi('kpi-spool-pct', 'kpi-spool-sub', spoolBomTagSet.size, spoolMatched, 'EA');

        // Overall — 7개 카테고리(Pipe/Fitting/Valve/Speciality/Others/Support/Spool) 진행률 단순 평균
        // (단위가 서로 달라 수량 합산 대신 %를 평균 — 카드별 표시값과 일관성 유지)
        const overallPct = (pctPipe + pctFit + pctValve + pctSpc + pctOth + pctSup + pctSpool) / 7;
        const overallColor = overallPct >= 90 ? '#66bb6a' : '#42a5f5';
        const elOverall = document.getElementById('kpi-overall-pct');
        if (elOverall) { elOverall.textContent = overallPct.toFixed(1) + '%'; elOverall.style.color = overallColor; }

        // KPI 카드: Pipe/Fitting Shortage 수량 (BOM - Received, 미달분만 표시)
        const pipeShortage = Math.max(0, bomDataArr[0] - recDataArr[0]);
        const elPipeShort = document.getElementById('kpi-pipe-shortage');
        if (elPipeShort) elPipeShort.textContent = Math.round(pipeShortage).toLocaleString();
        const elPipeShortSub = document.getElementById('kpi-pipe-shortage-sub');
        if (elPipeShortSub) elPipeShortSub.textContent = `of ${Math.round(bomDataArr[0]).toLocaleString()} M BOM`;

        const fitShortage = Math.max(0, bomDataArr[1] - recDataArr[1]);
        const elFitShort = document.getElementById('kpi-fit-shortage');
        if (elFitShort) elFitShort.textContent = Math.round(fitShortage).toLocaleString();
        const elFitShortSub = document.getElementById('kpi-fit-shortage-sub');
        if (elFitShortSub) elFitShortSub.textContent = `of ${Math.round(bomDataArr[1]).toLocaleString()} EA BOM`;

        // Bulk Material Progress Bars (Pipe / Fitting / Valve / Speciality / Others / Support)
        renderBulkProgressBars([
            { label: 'Pipe',       unit: 'M',  bom: bomDataArr[0], rec: recDataArr[0] },
            { label: 'Fitting',    unit: 'EA', bom: bomDataArr[1], rec: recDataArr[1] },
            { label: 'Valve',      unit: 'EA', bom: bomDataArr[2], rec: recDataArr[2] },
            { label: 'Speciality', unit: 'EA', bom: bomDataArr[3], rec: recDataArr[3] },
            { label: 'Others',     unit: 'EA', bom: bomDataArr[5], rec: recDataArr[5] },
            { label: 'Support',    unit: 'EA', bom: supportBom,    rec: supportRec    },
        ]);

    }).catch(err => console.error("Category Chart Sync Fail:", err));
}

// --- 6. Stock Ledger ---
function initStockFilters() {
    const stockCatEl    = document.getElementById('stockCatFilter');
    const stockItemEl   = document.getElementById('stockItemFilter');
    const stockMatlEl   = document.getElementById('stockMatlFilter');
    const stockSizeEl   = document.getElementById('stockSizeFilter');
    const stockRatingEl = document.getElementById('stockRatingFilter');

    // 선택값 보존 (탭 재진입 시 초기화 방지)
    const savedDoc    = document.getElementById('stockDocFilter')?.value  || 'All';
    const savedPkg    = document.getElementById('stockPkgFilter')?.value  || 'All';
    const savedCat    = stockCatEl?.value  || 'All';
    const savedItem   = stockItemEl?.value || 'All';
    const savedMatl   = stockMatlEl?.value || 'All';
    const savedSize   = stockSizeEl?.value || 'All';
    const savedRating = stockRatingEl?.value || 'All';

    const docs  = [...new Set(db.receiving.map(r => r.docNo).filter(Boolean))].sort();
    const pkgs  = [...new Set(db.receiving.map(r => r.plNo).filter(Boolean))].sort();
    const cats  = [...new Set(db.receiving.map(r => r.category).filter(Boolean))].sort();
    const sel = (id, opts, all) => {
        const el = document.getElementById(id); if (!el) return;
        el.innerHTML = `<option value="All">${all}</option>` + opts.map(o => `<option value="${o}">${o}</option>`).join('');
    };
    sel('stockDocFilter', docs, 'All DOCs');
    sel('stockPkgFilter', pkgs, 'All PKGs');
    sel('stockCatFilter', cats, 'All Categories');

    function stockGetItemsForCat(cat) {
        const src = cat === 'All' ? db.receiving : db.receiving.filter(r => (r.category || '') === cat);
        return [...new Set(src.map(r => window.extractItemFromMatCode(r.matCode)).filter(v => v && v !== '-'))].sort();
    }
    function stockGetSizesForCatItem(cat, item) {
        let src = cat === 'All' ? db.receiving : db.receiving.filter(r => (r.category || '') === cat);
        if (item !== 'All') src = src.filter(r => window.extractItemFromMatCode(r.matCode) === item);
        return [...new Set(src.map(r => {
            const tagInfo = db.bomTagMap[(r.tag || '').toUpperCase()];
            const fromTag = window.getSizeFromTagInfo(tagInfo);
            if (fromTag && fromTag !== '-') return fromTag;
            return window.getEffectiveSize(r.matCode, r.desc, null);
        }).filter(v => v && v !== '-'))].sort();
    }
    function refreshStockItemOptions(cat) {
        if (!stockItemEl) return;
        const items = stockGetItemsForCat(cat);
        stockItemEl.innerHTML = '<option value="All">All Items</option>' + items.map(i => `<option value="${i.replace(/"/g,'&quot;')}">${i}</option>`).join('');
    }
    function refreshStockMatlOptions(cat) {
        if (!stockMatlEl) return;
        const src = cat === 'All' ? db.receiving : db.receiving.filter(r => (r.category || '') === cat);
        const matls = [...new Set(src.map(r => (r.matCode || '').split('-')[1]).filter(Boolean))].sort();
        stockMatlEl.innerHTML = '<option value="All">All Materials</option>' + matls.map(m => `<option value="${m}">${m}</option>`).join('');
    }
    function refreshStockSizeOptions(cat, item) {
        if (!stockSizeEl) return;
        const sizes = stockGetSizesForCatItem(cat, item);
        stockSizeEl.innerHTML = '<option value="All">All Sizes</option>' + sizes.map(s => `<option value="${s.replace(/"/g,'&quot;')}">${s}</option>`).join('');
    }
    function stockGetRatingsForCat(cat) {
        const src = cat === 'All' ? db.receiving : db.receiving.filter(r => (r.category || '') === cat);
        const masterMap = _buildMasterMap();
        return [...new Set(src.map(r => getRatingForMatCode(r.matCode, masterMap)).filter(v => v && v !== '-'))].sort();
    }
    function refreshStockRatingOptions(cat) {
        if (!stockRatingEl) return;
        const ratings = stockGetRatingsForCat(cat);
        stockRatingEl.innerHTML = '<option value="All">All Ratings</option>' + ratings.map(r => `<option value="${r}">${r}</option>`).join('');
    }

    // 카테고리 → 아이템 → Material → 사이즈 → Rating 순서로 재빌드 후 저장값 복원
    if (stockCatEl && [...stockCatEl.options].some(o => o.value === savedCat)) stockCatEl.value = savedCat;
    refreshStockItemOptions(stockCatEl?.value || 'All');
    refreshStockMatlOptions(stockCatEl?.value || 'All');
    refreshStockRatingOptions(stockCatEl?.value || 'All');
    const docEl = document.getElementById('stockDocFilter');
    const pkgEl = document.getElementById('stockPkgFilter');
    if (docEl && [...docEl.options].some(o => o.value === savedDoc)) docEl.value = savedDoc;
    if (pkgEl && [...pkgEl.options].some(o => o.value === savedPkg)) pkgEl.value = savedPkg;
    if (stockItemEl && [...stockItemEl.options].some(o => o.value === savedItem)) stockItemEl.value = savedItem;
    if (stockMatlEl && [...stockMatlEl.options].some(o => o.value === savedMatl)) stockMatlEl.value = savedMatl;
    refreshStockSizeOptions(stockCatEl?.value || 'All', stockItemEl?.value || 'All');
    if (stockSizeEl && [...stockSizeEl.options].some(o => o.value === savedSize)) stockSizeEl.value = savedSize;
    if (stockRatingEl && [...stockRatingEl.options].some(o => o.value === savedRating)) stockRatingEl.value = savedRating;

    // 이벤트 리스너 1회만 등록 (탭 재진입 시 중복 방지)
    if (!_stockFiltersInitialized) {
        _stockFiltersInitialized = true;
        if (stockCatEl) {
            stockCatEl.addEventListener('change', () => {
                refreshStockItemOptions(stockCatEl.value);
                refreshStockMatlOptions(stockCatEl.value);
                refreshStockSizeOptions(stockCatEl.value, 'All');
                refreshStockRatingOptions(stockCatEl.value);
            });
        }
        if (stockItemEl) {
            stockItemEl.addEventListener('change', () => {
                const cat = stockCatEl ? stockCatEl.value : 'All';
                refreshStockSizeOptions(cat, stockItemEl.value);
            });
        }

    const btn   = document.getElementById('btnStockSearch');
    const clear = document.getElementById('btnStockClear');
    if (btn)   btn.addEventListener('click',   () => { _stockPage = 1; renderActiveStockTab(); });
    if (clear) clear.addEventListener('click', () => {
        _stockPage = 1;
        ['stockSearch','stockDocFilter','stockPkgFilter'].forEach(id => {
            const el = document.getElementById(id); if(el) el.value = el.tagName==='SELECT' ? 'All' : '';
        });
        if (stockCatEl) { stockCatEl.value = 'All'; stockCatEl.dispatchEvent(new Event('change')); }
        if (stockItemEl) stockItemEl.value = 'All';
        if (stockMatlEl) stockMatlEl.value = 'All';
        if (stockSizeEl) stockSizeEl.value = 'All';
        if (stockRatingEl) stockRatingEl.value = 'All';
        renderActiveStockTab();
    });

    const btnExportStock = document.getElementById('btnExportStock');
    if (btnExportStock) {
        btnExportStock.addEventListener('click', () => {
            // 화면에 보이는 Stock 서브탭(Piping/Others)과 동일한 카테고리·필터만 내보냄
            const forcedCats = _stActiveBulkTab === 'others' ? ['Others'] : ['Pipe', 'Fitting'];
            const rows = _buildStockRows(forcedCats).map(r => ({
                'PKG':             r.docs.length ? r.docs.join(', ') : '-',
                'PKG NO':          r.pkgs.length ? r.pkgs.join(', ') : '-',
                'MatCode':         r.matCode,
                'Category':        r.cat,
                'Full Description': r.fullDesc,
                'Item':            r.item,
                'Size':            r.size,
                'Rating':          r.rating,
                'Unit':            r.unitStr,
                'Total Received':  r.rec,
                'Total Issued':    r.iss,
                'Stock (Balance)': r.stock,
                'Status':          r.stock > 0 ? 'In Stock' : 'Out of Stock',
            }));
            const ws = XLSX.utils.json_to_sheet(rows);
            ws['!cols'] = [18, 28, 26, 12, 40, 14, 8, 10, 6, 14, 12, 14, 12].map(w => ({ wch: w }));
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Stock');
            const today = new Date().toISOString().split('T')[0];
            const tabLabel = _stActiveBulkTab === 'others' ? 'Others' : 'PipeFitting';
            XLSX.writeFile(wb, `Stock_${tabLabel}_Export_${today}.xlsx`);
        });
    }
    } // end _stockFiltersInitialized guard
}

function buildRecvMaps(filterFn) {
    const recMap = {}, docMap = {}, pkgMap = {};
    db.receiving.filter(filterFn).forEach(r => {
        const tagInfo = db.bomTagMap[(r.tag || '').toUpperCase()];
        const effMat = r.matCode || (tagInfo ? tagInfo.matCode : '');
        if (!effMat) return;
        // TAG → BOM에서 size 추출 (lineNo → desc → 기본값 순)
        const size = window.getSizeFromTagInfo(tagInfo);
        const key = (size && size !== '-') ? `${effMat}__${size}` : effMat;
        recMap[key] = (recMap[key] || 0) + r.qty;
        if (!docMap[key]) docMap[key] = new Set();
        if (!pkgMap[key]) pkgMap[key] = new Set();
        docMap[key].add(r.docNo);
        pkgMap[key].add(r.plNo);
    });
    return { recMap, docMap, pkgMap };
}

// Material Stock (Piping/Others 공용) 필터+집계 — 화면 렌더러와 Export 버튼이 동일하게 사용해
// "화면엔 카테고리/필터 걸었는데 Export는 전체가 나오는" 불일치를 원천 차단
function _buildStockRows(forcedCats) {
    // Filter values
    const search   = (document.getElementById('stockSearch')    ?.value || '').toLowerCase();
    const fDoc     = document.getElementById('stockDocFilter')  ?.value || 'All';
    const fPkg     = document.getElementById('stockPkgFilter')  ?.value || 'All';
    const fCat     = document.getElementById('stockCatFilter')  ?.value || 'All';
    const fItem    = document.getElementById('stockItemFilter')  ?.value || 'All';
    const fMatl    = document.getElementById('stockMatlFilter')  ?.value || 'All';
    const fSize    = document.getElementById('stockSizeFilter')  ?.value || 'All';
    const fRating  = document.getElementById('stockRatingFilter')?.value || 'All';

    // Pre-build maps
    const masterMap = {};
    db.matCodeMaster.forEach(m => { masterMap[m.matCode] = m; });
    const bomLookup = {};
    db.bom.forEach(b => { bomLookup[b.matCode] = { unit: b.uom }; });

    // Aggregate Receiving per MatCode (TAG 우선 원칙)
    const { recMap, docMap, pkgMap } = buildRecvMaps(r =>
        isReceivingActive(r.plNo) && isKpiReceiving(r) &&
        (fDoc === 'All' || r.docNo === fDoc) &&
        (fPkg === 'All' || r.plNo  === fPkg) &&
        (!Array.isArray(forcedCats) || forcedCats.includes(r.category))
    );

    // Aggregate Issued per MatCode — PKG Issue Date 기준 (pl_updates.issue_date 존재 여부)
    const issMap = getIssuedQtyMap(r => {
        const mData = masterMap[r.matCode] || {};
        const cat = mData.category && mData.category !== '-'
            ? mData.category
            : window.getCategory(mData.itemDesc, r.matCode);
        return !Array.isArray(forcedCats) || forcedCats.includes(cat);
    });

    // activeCodes: recMap 기준 (issued만 있는 항목은 재고 0 → 표시 불필요)
    const activeCodes = [...new Set(Object.keys(recMap))].sort();

    // pre-build receiving desc fallback map (O(n) 1회)
    const recDescMap = {};
    db.receiving.forEach(r => { if (r.matCode && !recDescMap[r.matCode]) recDescMap[r.matCode] = r.desc; });

    // pre-build Valve MatCode → 실제 TAG 카테고리 fallback map (O(n) 1회, bom 우선 → receiving)
    const valveTagCatMap = {};
    db.bom.forEach(b => { if (b.matCode && b.category !== 'BULK' && b.category !== 'Valve' && !(b.matCode in valveTagCatMap)) valveTagCatMap[b.matCode] = b.category; });
    db.receiving.forEach(r => { if (r.matCode && r.category !== 'BULK' && r.category !== 'Valve' && !(r.matCode in valveTagCatMap)) valveTagCatMap[r.matCode] = r.category; });

    // Apply remaining filters
    const filtered = activeCodes.filter(key => {
        const { matCode, sizeOverride } = window.parseStockKey(key);
        if(matCode.includes('None') && recMap[key] === undefined) return false;
        const mData = masterMap[matCode] || {};
        let cat  = mData.category && mData.category !== '-' ? mData.category : window.getCategory(mData.itemDesc, matCode);
        const item = window.extractItemFromMatCode(matCode);
        const matl = (matCode.split('-')[1]) || '-';
        const fullDesc = db.bomDesc[matCode] || recDescMap[matCode] || '-';
        const size = sizeOverride || window.getEffectiveSize(matCode, fullDesc, mData.size1);
        const rating = getRatingForMatCode(matCode, masterMap);
        if (!Array.isArray(forcedCats) && fCat !== 'All' && cat !== fCat) return false;
        if (fItem !== 'All' && item !== fItem)  return false;
        if (fMatl !== 'All' && matl !== fMatl)  return false;
        if (fSize !== 'All' && size !== fSize)  return false;
        if (fRating !== 'All' && rating !== fRating) return false;
        if (search && !matCode.toLowerCase().includes(search) &&
            !(mData.itemDesc || '').toLowerCase().includes(search)) return false;
        return true;
    });

    return filtered.map(key => {
        const { matCode, sizeOverride } = window.parseStockKey(key);
        let rec   = recMap[key] || 0;
        let iss   = issMap[matCode] || 0;  // matCode 기준 (복합키 제거)
        let stock = Math.max(0, rec - iss);

        const mData = masterMap[matCode] || { category: '-', itemDesc: '-', size1: '-' };
        let cat = mData.category && mData.category !== '-' ? mData.category : window.getCategory(mData.itemDesc, matCode);
        if (cat === 'Valve' && valveTagCatMap[matCode]) cat = valveTagCatMap[matCode];
        const item    = mData.itemDesc || '-';
        const matl    = (matCode.split('-')[1]) || '-';
        const fullDesc = db.bomDesc[matCode] || recDescMap[matCode] || '-';
        const size    = sizeOverride || window.getEffectiveSize(matCode, fullDesc, mData.size1);
        const unitStr = bomLookup[matCode]?.unit || 'EA';
        const rating  = getRatingForMatCode(matCode, masterMap);
        const docs    = docMap[key] ? [...docMap[key]].sort() : [];
        const pkgs    = pkgMap[key] ? [...pkgMap[key]].sort() : [];

        return { key, matCode, cat, item, matl, fullDesc, size, unitStr, rating, rec, iss, stock, docs, pkgs };
    });
}

function renderStockTable(forcedCats, hideMatCode) {
    let tbody = document.querySelector('#stockTable tbody');
    if(!tbody) return;
    tbody.innerHTML = '';

    const rows = _buildStockRows(forcedCats);

    const label = document.getElementById('stockCountLabel');
    if (label) label.textContent = `(${rows.length.toLocaleString()} items)`;

    const stTotalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    if (_stockPage > stTotalPages) _stockPage = 1;
    const stStart = (_stockPage - 1) * PAGE_SIZE;
    const display = rows.slice(stStart, stStart + PAGE_SIZE);

    const stockRows = display.map(r => {
        const badge = r.stock > 0 ? '<span class="status-badge ok">In Stock</span>' : '<span class="status-badge err">Out of Stock</span>';
        const docs  = r.docs.length ? r.docs.join('<br>') : '-';
        const pkgs  = r.pkgs.length ? r.pkgs.join('<br>') : '-';

        return `<tr>
            <td>${docs}</td>
            <td>${pkgs}</td>
            <td style="${hideMatCode ? 'padding:0;width:0;overflow:hidden;' : 'font-weight:600;color:var(--color-primary);'}">${hideMatCode ? '' : r.matCode}</td>
            <td><strong>${r.cat}</strong></td>
            <td>${r.item}</td>
            <td>${r.matl}</td>
            <td>${r.size}</td>
            <td style="text-align:center;">${r.rating}</td>
            <td>${r.unitStr}</td>
            <td style="text-align:center;">${r.rec.toFixed(2)}</td>
            <td style="text-align:center;">${r.iss.toFixed(2)}</td>
            <td style="font-weight:700;text-align:center;">${r.stock.toFixed(2)}</td>
            <td>${badge}</td>
        </tr>`;
    });
    tbody.innerHTML = stockRows.join('');
    renderPagination('stockPagination', _stockPage, stTotalPages, '_stockGoPage');
}
let _stockPage = 1;
window._stockGoPage = function(p) { _stockPage = p; renderActiveStockTab(); };

let _stActiveBulkTab = 'piping', _stTabsInited = false;

function _setStockMatCodeCol(visible) {
    const cols = document.querySelectorAll('#stockTable colgroup col');
    const ths  = document.querySelectorAll('#stockTable thead th');
    if (!cols.length) return;
    // null = auto(width 미지정), 0 = 0px(완전 숨김), 숫자 = 해당 px
    // 순서: PKG, PKG NO, MatCode, Category, Item, Material, Size, Rating, Unit, Received, Issued, Stock, Status
    const W = visible
        ? [90,  150, 140,  70,  95, 70, 55, 55, 50, 75, 70, 75, 75]
        : [ 90, 165,   0,  75, 110, 80, 65, 65, 55, 80, 75, 80, 85];
    cols.forEach((c, i) => { c.style.width = W[i] === null ? '' : W[i] + 'px'; });
    // display:none 대신 width:0+padding:0으로 처리 (헤더/데이터 정렬 유지)
    if (ths[2]) {
        ths[2].style.padding  = visible ? '' : '0';
        ths[2].style.overflow = 'hidden';
        ths[2].textContent    = visible ? 'MatCode' : '';
    }
}

function renderActiveStockTab() {
    const title = document.getElementById('stPanelTitle');
    const defaultFilterPanel = document.getElementById('stockDefaultFilterPanel');
    const defaultTablePanel  = document.getElementById('stTablePanel');
    const valvePanel         = document.getElementById('stockValvePanel');
    const specialityPanel    = document.getElementById('stockSpecialityPanel');
    const isValve = _stActiveBulkTab === 'valve';
    const isSpeciality = _stActiveBulkTab === 'speciality';
    if (defaultFilterPanel) defaultFilterPanel.style.display = (isValve || isSpeciality) ? 'none' : '';
    if (defaultTablePanel)  defaultTablePanel.style.display  = (isValve || isSpeciality) ? 'none' : '';
    if (valvePanel)         valvePanel.style.display         = isValve ? '' : 'none';
    if (specialityPanel)    specialityPanel.style.display    = isSpeciality ? '' : 'none';

    if (isValve) {
        initStockValveFilters();
        renderValveStockTable();
        return;
    }
    if (isSpeciality) {
        initStockSpecialityFilters();
        renderSpecialityStockTable();
        return;
    }
    _setStockMatCodeCol(true);
    if (_stActiveBulkTab === 'piping') {
        if (title) title.innerHTML = '<i class="fas fa-warehouse"></i> Stock — Pipe & Fitting';
        renderStockTable(['Pipe', 'Fitting'], false);
    } else {
        if (title) title.innerHTML = '<i class="fas fa-warehouse"></i> Stock — Others';
        renderStockTable(['Others'], false);
    }
}

// --- Stock (Valve/Speciality — Tag 기준, MatCode 없음) ---
// category별 bom_detail 조회/집계 공용 함수 (Valve/Speciality Stock·Material Summary 탭 공용)
const _tagStockBomCache = {};
async function loadTagStockBom(category) {
    if (_tagStockBomCache[category]) return _tagStockBomCache[category];
    let all = [];
    let from = 0;
    const step = 2000;
    let ok = true;
    while (true) {
        const { data, error } = await supabaseClient.from('bom_detail')
            .select('tag, system, iso_dwg_no, line_no, full_description, mat1, mat2, qty')
            .eq('category', category)
            .range(from, from + step - 1);
        if (error) { console.error(`loadTagStockBom(${category}) 조회 실패:`, error); ok = false; break; }
        if (!data || data.length === 0) break;
        all = all.concat(data);
        if (data.length < step) break;
        from += step;
    }
    if (ok) _tagStockBomCache[category] = all; // 실패 시 캐싱하지 않아야 다음 호출에서 재시도됨(빈 배열도 truthy라 캐시되면 영구 고착)
    return all;
}

// Tag별 Received/Issued 집계 — MatCode 대신 Tag로 직접 매칭.
// BOM Tag와 정확히 일치하는 항목만 집계 — PKG 통짜 Tag(부속품/스페어파트 등 BOM에 없는 Tag)는 자동 제외
function buildTagRecvMaps(category, bomRows) {
    const bomTagSet = new Set((bomRows || []).map(b => b.tag));
    const recMap = {}, issMap = {};
    db.receiving.forEach(r => {
        if (r.category !== category || !r.tag || r.tag === '-') return;
        if (!isReceivingActive(r.plNo)) return;
        if (!bomTagSet.has(r.tag)) return;
        recMap[r.tag] = (recMap[r.tag] || 0) + (r.qty || 0);
        if (isPkgIssued(r.plNo)) issMap[r.tag] = (issMap[r.tag] || 0) + (r.qty || 0);
    });
    return { recMap, issMap };
}

let _stockValveFiltersInited = false;
function initStockValveFilters() {
    const itemEl = document.getElementById('stockValveItemFilter');
    if (itemEl && itemEl.options.length <= 1) {
        const items = ['GATE VALVE', 'GLOBE VALVE', 'CHECK VALVE', 'BUTTERFLY VALVE', 'BALL VALVE'];
        itemEl.innerHTML = '<option value="All">All Items</option>'
            + items.map(i => `<option value="${i}">${i}</option>`).join('');
    }
    const ratingEl = document.getElementById('stockValveRatingFilter');
    if (ratingEl && ratingEl.options.length <= 1) {
        ratingEl.innerHTML = '<option value="All">All Ratings</option>'
            + ['CL150', 'CL300', 'CL600', 'CL1500'].map(r => `<option value="${r}">${r}</option>`).join('');
    }
    if (!_stockValveFiltersInited) {
        _stockValveFiltersInited = true;
        document.getElementById('btnStockValveSearch')?.addEventListener('click', () => { _stockPage = 1; renderValveStockTable(); });
        document.getElementById('btnStockValveClear')?.addEventListener('click', () => {
            document.getElementById('stockValveSearch').value = '';
            if (itemEl) itemEl.value = 'All';
            if (ratingEl) ratingEl.value = 'All';
            _stockPage = 1; renderValveStockTable();
        });
    }
}

async function renderValveStockTable() {
    const tbody = document.querySelector('#stockValveTable tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;padding:20px;color:#888;">Loading...</td></tr>';

    const bomRows = await loadTagStockBom('Valve');
    const { recMap, issMap } = buildTagRecvMaps('Valve', bomRows);

    const search   = (document.getElementById('stockValveSearch')?.value || '').trim().toUpperCase();
    const itemF    = document.getElementById('stockValveItemFilter')?.value || 'All';
    const ratingF  = document.getElementById('stockValveRatingFilter')?.value || 'All';

    const filtered = bomRows.filter(b => {
        const descUpper = (b.full_description || '').toUpperCase();
        if (itemF !== 'All' && !descUpper.includes(itemF)) return false;
        if (ratingF !== 'All' && !descUpper.includes(ratingF)) return false;
        if (search && !(b.tag || '').toUpperCase().includes(search) && !descUpper.includes(search)) return false;
        return true;
    });

    const label = document.getElementById('stockValveCountLabel');
    if (label) label.textContent = `(${filtered.length.toLocaleString()} items)`;

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    if (_stockPage > totalPages) _stockPage = 1;
    const start = (_stockPage - 1) * PAGE_SIZE;
    const display = filtered.slice(start, start + PAGE_SIZE);

    tbody.innerHTML = display.map(b => {
        const rec = recMap[b.tag] || 0;
        const iss = issMap[b.tag] || 0;
        const stock = Math.max(0, rec - iss);
        const item = window.extractItemFromDesc(b.full_description);
        const rating = getRatingForMatCode(null, null, b.full_description);
        const size = window.extractDnSizeFromDesc(b.full_description) || '-';
        return `<tr>
            <td style="text-align:center;font-weight:600;">${b.tag || '-'}</td>
            <td style="text-align:center;">${b.system || '-'}</td>
            <td style="text-align:center;">${b.iso_dwg_no || '-'}</td>
            <td style="text-align:center;">${b.line_no || '-'}</td>
            <td style="text-align:center;">${item}</td>
            <td style="text-align:center;">${b.mat1 || '-'}</td>
            <td style="text-align:center;">${b.mat2 || '-'}</td>
            <td style="text-align:center;">${size}</td>
            <td style="text-align:center;">${rating}</td>
            <td style="text-align:center;">${rec.toFixed(2)}</td>
            <td style="text-align:center;font-weight:700;">${stock.toFixed(2)}</td>
        </tr>`;
    }).join('');

    renderPagination('stockValvePagination', _stockPage, totalPages, '_stockGoPage');
}

// --- Stock (Speciality — Tag 기준, MatCode 없음) — loadTagStockBom/buildTagRecvMaps 공용 사용 ---
let _stockSpecialityFiltersInited = false;
function initStockSpecialityFilters() {
    const itemEl = document.getElementById('stockSpecialityItemFilter');
    if (itemEl && itemEl.options.length <= 1) {
        const items = db.specialityItems || [];
        itemEl.innerHTML = '<option value="All">All Items</option>'
            + items.map(i => `<option value="${i.replace(/"/g, '&quot;')}">${i}</option>`).join('');
    }
    const ratingEl = document.getElementById('stockSpecialityRatingFilter');
    if (ratingEl && ratingEl.dataset.filled !== '1') {
        loadTagStockBom('Speciality').then(bomRows => {
            const ratings = [...new Set(bomRows.map(b => window.parseSpecialityDesc(b.full_description).rating).filter(v => v && v !== '-'))].sort();
            ratingEl.innerHTML = '<option value="All">All Ratings</option>'
                + ratings.map(r => `<option value="${r.replace(/"/g, '&quot;')}">${r}</option>`).join('');
            ratingEl.dataset.filled = '1';
        });
    }
    if (!_stockSpecialityFiltersInited) {
        _stockSpecialityFiltersInited = true;
        document.getElementById('btnStockSpecialitySearch')?.addEventListener('click', () => { _stockPage = 1; renderSpecialityStockTable(); });
        document.getElementById('btnStockSpecialityClear')?.addEventListener('click', () => {
            document.getElementById('stockSpecialitySearch').value = '';
            if (itemEl) itemEl.value = 'All';
            if (ratingEl) ratingEl.value = 'All';
            _stockPage = 1; renderSpecialityStockTable();
        });
    }
}

async function renderSpecialityStockTable() {
    const tbody = document.querySelector('#stockSpecialityTable tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;padding:20px;color:#888;">Loading...</td></tr>';

    const bomRows = await loadTagStockBom('Speciality');
    const { recMap, issMap } = buildTagRecvMaps('Speciality', bomRows);

    const search  = (document.getElementById('stockSpecialitySearch')?.value || '').trim().toUpperCase();
    const itemF   = document.getElementById('stockSpecialityItemFilter')?.value || 'All';
    const ratingF = document.getElementById('stockSpecialityRatingFilter')?.value || 'All';

    const filtered = bomRows.filter(b => {
        const item = window.extractItemFromDesc(b.full_description);
        const { rating } = window.parseSpecialityDesc(b.full_description);
        if (itemF !== 'All' && item !== itemF) return false;
        if (ratingF !== 'All' && rating !== ratingF) return false;
        if (search && !(b.tag || '').toUpperCase().includes(search) && !(b.full_description || '').toUpperCase().includes(search)) return false;
        return true;
    });

    const label = document.getElementById('stockSpecialityCountLabel');
    if (label) label.textContent = `(${filtered.length.toLocaleString()} items)`;

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    if (_stockPage > totalPages) _stockPage = 1;
    const start = (_stockPage - 1) * PAGE_SIZE;
    const display = filtered.slice(start, start + PAGE_SIZE);

    tbody.innerHTML = display.map(b => {
        const rec = recMap[b.tag] || 0;
        const iss = issMap[b.tag] || 0;
        const stock = Math.max(0, rec - iss);
        const item = window.extractItemFromDesc(b.full_description);
        const { size, rating } = window.parseSpecialityDesc(b.full_description);
        return `<tr>
            <td style="text-align:center;font-weight:600;">${b.tag || '-'}</td>
            <td style="text-align:center;">${b.system || '-'}</td>
            <td style="text-align:center;">${b.iso_dwg_no || '-'}</td>
            <td style="text-align:center;">${b.line_no || '-'}</td>
            <td style="text-align:center;">${item}</td>
            <td style="text-align:center;">${b.mat1 || '-'}</td>
            <td style="text-align:center;">${b.mat2 || '-'}</td>
            <td style="text-align:center;">${size}</td>
            <td style="text-align:center;">${rating}</td>
            <td style="text-align:center;">${rec.toFixed(2)}</td>
            <td style="text-align:center;font-weight:700;">${stock.toFixed(2)}</td>
        </tr>`;
    }).join('');

    renderPagination('stockSpecialityPagination', _stockPage, totalPages, '_stockGoPage');
}

let _msActiveTab = 'stock'; // 'stock' | 'shortage' | 'surplus' | 'datahealth'
let _msTabsInited = false;
function initMaterialStatusTabs() {
    if (_msTabsInited) return;
    _msTabsInited = true;
    document.querySelectorAll('.ms-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchMaterialStatusTab(btn.dataset.tab));
    });
}
// Shortage/Surplus는 별도 사이드바 항목(2026-08-07)이라 STOCK/DATA HEALTH 탭바를 숨기고
// 페이지 제목도 진입 경로에 맞게 바꿔준다 — 물리적으로는 #material_status 섹션 하나를 공유.
const MS_PAGE_INFO = {
    stock:      { title: 'Material Stock',    sub: 'BOM vs Received/Issued/Stock status.', showTabBar: true },
    datahealth: { title: 'Material Stock',    sub: 'Data quality checks — Tag matching, bucket-tag regression, unregistered MatCode.', showTabBar: true },
    shortage:   { title: 'Material Shortage', sub: 'Items where Received quantity falls short of BOM.', showTabBar: false },
    surplus:    { title: 'Material Surplus',  sub: 'Items where Received quantity exceeds BOM.', showTabBar: false },
};
function switchMaterialStatusTab(tab) {
    _msActiveTab = tab;
    document.querySelectorAll('.ms-tab-btn').forEach(b => {
        b.style.borderBottomColor = b.dataset.tab === tab ? '#0A2540' : 'transparent';
        b.style.color = b.dataset.tab === tab ? '#0A2540' : '#888';
    });
    document.getElementById('msPanelStock').style.display      = tab === 'stock'      ? '' : 'none';
    document.getElementById('msPanelShortage').style.display   = tab === 'shortage'   ? '' : 'none';
    document.getElementById('msPanelSurplus').style.display    = tab === 'surplus'    ? '' : 'none';
    document.getElementById('msPanelDataHealth').style.display = tab === 'datahealth' ? '' : 'none';

    const info = MS_PAGE_INFO[tab] || MS_PAGE_INFO.stock;
    const titleEl = document.getElementById('msPageTitle');
    const subEl   = document.getElementById('msPageSubtitle');
    const tabBar  = document.getElementById('msTabBar');
    if (titleEl) titleEl.textContent = info.title;
    if (subEl)   subEl.textContent   = info.sub;
    if (tabBar)  tabBar.style.display = info.showTabBar ? '' : 'none';

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

    if (tab !== 'shortage' && shortageRefreshTimer) {
        clearInterval(shortageRefreshTimer);
        shortageRefreshTimer = null;
    }
}
function initStockTabs() {
    if (_stTabsInited) { renderActiveStockTab(); return; }
    _stTabsInited = true;
    document.querySelectorAll('.st-bulk-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            _stActiveBulkTab = btn.dataset.tab;
            document.querySelectorAll('.st-bulk-tab').forEach(b => {
                b.style.color        = b === btn ? '#0A2540' : '#888';
                b.style.borderBottom = b === btn ? '3px solid #0A2540' : '3px solid transparent';
            });
            _stockPage = 1; renderActiveStockTab();
        });
    });
    renderActiveStockTab();
}

// --- Material Summary (독립 사이드바 섹션, Item 단위 현황: Piping/Fitting/Valve/Speciality/Support/Others) ---
let currentMssPage = 1;
let _mssActiveTab = 'piping'; // 'piping' | 'fitting' | 'valve' | 'speciality' | 'support' | 'others'

// BOM 대비 Received 과부족(diff = received - bomQty)을 Shortage/Surplus 두 열로 나눠 표시 — 전 서브탭 공용.
// 필터링이 열 단위로 명확하도록 각 열은 해당 상태일 때만 값을 채우고 아니면 '-'.
function _mssShortageCellHtml(diff) {
    const v = Math.round(diff * 100) / 100;
    return v < 0
        ? `<td style="text-align:center;font-weight:700;white-space:nowrap;color:#d32f2f;">${Math.abs(v).toFixed(2)}</td>`
        : `<td style="text-align:center;color:#ccc;">-</td>`;
}
function _mssSurplusCellHtml(diff) {
    const v = Math.round(diff * 100) / 100;
    return v > 0
        ? `<td style="text-align:center;font-weight:700;white-space:nowrap;color:#2e7d32;">${v.toFixed(2)}</td>`
        : `<td style="text-align:center;color:#ccc;">-</td>`;
}
// diff 값과 Status 필터값('All'/'Shortage'/'Surplus'/'Balanced')을 비교
function _mssMatchesStatus(diff, statusF) {
    if (statusF === 'Shortage') return diff < 0;
    if (statusF === 'Surplus')  return diff > 0;
    if (statusF === 'Balanced') return diff === 0;
    return true;
}

// bom_detail(Pipe/Fitting/Others)을 MatCode 단위로 집계(BOM Qty 합산)해 1회 캐싱.
// System/ISO Drawing/Line No는 더 이상 표시 대상이 아니므로 MatCode가 곧 행의 고유 키.
let _mssItemAggCache = null;
let _mssItemAggInflight = null; // 완료된 결과가 아니라 "진행 중인 요청 자체"를 캐싱 — 동시 호출이 4.5만행
                                 // 조회를 중복 실행하던 문제 수정(2026-07-06, initFilterOptions가 Shortage/
                                 // Surplus 필터를 초기화하며 거의 동시에 두 번 호출해 실제로 중복 발생했음)
async function loadMssItemAgg() {
    if (_mssItemAggCache) return _mssItemAggCache;
    if (_mssItemAggInflight) return _mssItemAggInflight;
    _mssItemAggInflight = _loadMssItemAggFetch();
    try {
        return await _mssItemAggInflight;
    } finally {
        _mssItemAggInflight = null;
    }
}

// bom_mat12_agg는 서버 사이드에서 이미 mat_code 단위로 집계된 뷰(2026-07-06 신설, 408행) —
// 예전엔 bom_detail(Pipe/Fitting/Others, 45,272행)을 9번 순차 페이지네이션해서 클라이언트에서
// 집계했는데, DB에서 미리 SUM(qty) GROUP BY mat_code 해두면 요청 1번(408행)으로 끝남.
// mat1/mat2는 같은 mat_code라도 데이터상 드물게 값이 갈리는 행이 있어(재질 표기 이슈), 그 경우
// DISTINCT ON으로 대표값 1개만 사용 — 기존 클라이언트 로직(첫 행 값 채택)과 동일한 방식.
async function _loadMssItemAggFetch() {
    const { data, error } = await supabaseClient.from('bom_mat12_agg').select('mat_code, category, mat1, mat2, uom, bom_qty');
    if (error) {
        console.error('loadMssItemAgg 조회 실패:', error);
        return [];
    }
    const result = (data || []).map(r => ({
        matCode: (r.mat_code || '').trim().toUpperCase(),
        category: r.category,
        mat1: r.mat1,
        mat2: r.mat2,
        unit: r.uom || 'EA',
        bomQty: parseFloat(r.bom_qty) || 0
    }));
    _mssItemAggCache = result;
    return result;
}

// 현재 서브탭+필터를 적용한 Item 단위 현황 리스트 (renderMssTable/Export 공용)
async function getMssFilteredRows() {
    const TAB_CAT = { piping: 'Pipe', fitting: 'Fitting', others: 'Others' };
    const cat = TAB_CAT[_mssActiveTab] || 'Pipe';
    const agg = await loadMssItemAgg();

    const search = (document.getElementById('mssSearch')?.value || '').trim().toUpperCase();
    const item    = document.getElementById('mssItemFilter')?.value || 'All';
    const mat1    = document.getElementById('mssMat1Filter')?.value || 'All';
    const mat2    = document.getElementById('mssMat2Filter')?.value || 'All';
    const size    = document.getElementById('mssSizeFilter')?.value || 'All';
    const rating  = document.getElementById('mssRatingFilter')?.value || 'All';
    const statusF = document.getElementById('mssStatusFilter')?.value || 'All';

    const { recMap } = buildRecvMaps(r =>
        isReceivingActive(r.plNo) && isKpiReceiving(r) &&
        ['Pipe', 'Fitting', 'Others'].includes(r.category)
    );
    const issMap = getIssuedQtyMap(r => ['Pipe', 'Fitting', 'Others'].includes(r.category));
    const masterMap = _buildMasterMap();

    const rows = agg.filter(r => r.category === cat).map(r => {
        const matUpper = r.matCode;
        const itemName = window.extractItemFromMatCode(matUpper) || '-';
        const sz = (matUpper.startsWith('GSKT') || matUpper.startsWith('STB'))
            ? window.extractSizeLengthFromMatCode(matUpper)
            : window.extractSizeFromMatCode(matUpper);
        const recQty = recMap[matUpper] || 0;
        const issQty = issMap[matUpper] || 0;
        return {
            matCode: matUpper, item: itemName, mat1: r.mat1 || '-', mat2: r.mat2 || '-',
            size: sz, rating: getRatingForMatCode(matUpper, masterMap), unit: r.unit, bomQty: r.bomQty, recQty, issQty,
            stockQty: Math.max(0, recQty - issQty), diff: recQty - r.bomQty,
        };
    }).filter(r => {
        if (item !== 'All' && r.item !== item) return false;
        if (mat1 !== 'All' && r.mat1 !== mat1) return false;
        if (mat2 !== 'All' && r.mat2 !== mat2) return false;
        if (size !== 'All' && r.size !== size) return false;
        if (rating !== 'All' && r.rating !== rating) return false;
        if (!_mssMatchesStatus(r.diff, statusF)) return false;
        if (search && !(`${r.item} ${r.mat1} ${r.mat2} ${r.size}`).toUpperCase().includes(search)) return false;
        return true;
    });

    rows.sort((a, b) => {
        const ia = a.item.toUpperCase(), ib = b.item.toUpperCase();
        if (ia !== ib) return ia.localeCompare(ib);
        return (parseFloat((a.size || '0').replace(/[^0-9.]/g, '')) || 0) -
               (parseFloat((b.size || '0').replace(/[^0-9.]/g, '')) || 0);
    });

    return rows;
}

async function renderMssTable() {
    let tbody = document.querySelector('#mssTable tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="12" style="text-align:center;padding:20px;color:#888;">Loading...</td></tr>';

    const rows = await getMssFilteredRows();

    const label = document.getElementById('mssCountLabel');
    if (label) label.textContent = `(${rows.length.toLocaleString()} items)`;

    if (rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="12" style="text-align:center;color:#888;padding:20px;">No items found.</td></tr>';
        const pg = document.getElementById('mssPagination'); if (pg) pg.innerHTML = '';
        return;
    }

    const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    if (currentMssPage > totalPages) currentMssPage = 1;
    const start = (currentMssPage - 1) * PAGE_SIZE;
    const display = rows.slice(start, start + PAGE_SIZE);

    tbody.innerHTML = display.map(r => `<tr>
        <td style="text-align:center;font-weight:600;white-space:nowrap;">${r.item}</td>
        <td style="text-align:center;white-space:nowrap;">${r.mat1}</td>
        <td style="text-align:center;white-space:nowrap;">${r.mat2}</td>
        <td style="text-align:center;font-weight:600;">${r.size}</td>
        <td style="text-align:center;white-space:nowrap;">${r.rating}</td>
        <td style="text-align:center;white-space:nowrap;">${r.unit}</td>
        <td style="text-align:center;white-space:nowrap;">${r.bomQty.toFixed(2)}</td>
        <td style="text-align:center;white-space:nowrap;">${r.recQty.toFixed(2)}</td>
        ${_mssShortageCellHtml(r.diff)}
        ${_mssSurplusCellHtml(r.diff)}
        <td style="text-align:center;white-space:nowrap;">${r.issQty.toFixed(2)}</td>
        <td style="text-align:center;white-space:nowrap;font-weight:700;">${r.stockQty.toFixed(2)}</td>
    </tr>`).join('');

    renderPagination('mssPagination', currentMssPage, totalPages, '_mssGoPage');
}
window._mssGoPage = function(p) { currentMssPage = p; renderMssTable(); };

function renderActiveMssTab() {
    const defaultFilterPanel = document.getElementById('mssDefaultFilterPanel');
    const defaultTablePanel  = document.getElementById('mssDefaultTablePanel');
    const valvePanel         = document.getElementById('mssValvePanel');
    const specialityPanel    = document.getElementById('mssSpecialityPanel');
    const supportPanel       = document.getElementById('mssSupportPanel');
    const isValve = _mssActiveTab === 'valve';
    const isSpeciality = _mssActiveTab === 'speciality';
    const isSupport = _mssActiveTab === 'support';
    const isCustom = isValve || isSpeciality || isSupport;
    if (defaultFilterPanel) defaultFilterPanel.style.display = isCustom ? 'none' : '';
    if (defaultTablePanel)  defaultTablePanel.style.display  = isCustom ? 'none' : '';
    if (valvePanel)         valvePanel.style.display         = isValve ? '' : 'none';
    if (specialityPanel)    specialityPanel.style.display    = isSpeciality ? '' : 'none';
    if (supportPanel)       supportPanel.style.display       = isSupport ? '' : 'none';

    if (isValve) {
        initMssValveFilters();
        renderMssValveTable();
        return;
    }
    if (isSpeciality) {
        initMssSpecialityFilters();
        renderMssSpecialityTable();
        return;
    }
    if (isSupport) {
        initMssSupportFilters();
        renderMssSupportTable();
        return;
    }
    const title = document.getElementById('mssPanelTitle');
    const TAB_LABEL = { piping: 'Piping', fitting: 'Fitting', others: 'Others' };
    if (title) title.innerHTML = `<i class="fas fa-list-check"></i> Material Summary — ${TAB_LABEL[_mssActiveTab] || 'Piping'}`;
    currentMssPage = 1;
    refreshMssItemFilter();
    renderMssTable();
}

// --- Material Summary (Valve — 순수 Item 기준 통합, Tag/System/ISO/Line 미표시) ---
// 같은 Item+Mat1+Mat2+Size+Rating이면 여러 Tag를 하나의 행으로 합산(BOM Qty/Received/Issued/Stock).
let currentMssValvePage = 1;
let _mssValveFiltersInited = false;
function _valveAggKey(b) {
    const item = window.extractItemFromDesc(b.full_description);
    const rating = getRatingForMatCode(null, null, b.full_description);
    const size = window.extractDnSizeFromDesc(b.full_description) || '-';
    return { item, mat1: b.mat1 || '-', mat2: b.mat2 || '-', size, rating };
}

function initMssValveFilters() {
    const itemEl = document.getElementById('mssValveItemFilter');
    if (itemEl && itemEl.options.length <= 1) {
        const items = ['GATE VALVE', 'GLOBE VALVE', 'CHECK VALVE', 'BUTTERFLY VALVE', 'BALL VALVE'];
        itemEl.innerHTML = '<option value="All">All Items</option>'
            + items.map(i => `<option value="${i}">${i}</option>`).join('');
    }
    const ratingEl = document.getElementById('mssValveRatingFilter');
    if (ratingEl && ratingEl.options.length <= 1) {
        ratingEl.innerHTML = '<option value="All">All Ratings</option>'
            + ['CL150', 'CL300', 'CL600', 'CL1500'].map(r => `<option value="${r}">${r}</option>`).join('');
    }
    const mat1El = document.getElementById('mssValveMat1Filter');
    const mat2El = document.getElementById('mssValveMat2Filter');
    const sizeEl = document.getElementById('mssValveSizeFilter');
    if ((mat1El && mat1El.dataset.filled !== '1') || (mat2El && mat2El.dataset.filled !== '1') || (sizeEl && sizeEl.dataset.filled !== '1')) {
        loadTagStockBom('Valve').then(bomRows => {
            const keys = bomRows.map(_valveAggKey);
            if (mat1El && mat1El.dataset.filled !== '1') {
                const vals = [...new Set(keys.map(k => k.mat1).filter(v => v && v !== '-'))].sort();
                mat1El.innerHTML = '<option value="All">All Mat 1</option>' + vals.map(v => `<option value="${v.replace(/"/g,'&quot;')}">${v}</option>`).join('');
                mat1El.dataset.filled = '1';
            }
            if (mat2El && mat2El.dataset.filled !== '1') {
                const vals = [...new Set(keys.map(k => k.mat2).filter(v => v && v !== '-'))].sort();
                mat2El.innerHTML = '<option value="All">All Mat 2</option>' + vals.map(v => `<option value="${v.replace(/"/g,'&quot;')}">${v}</option>`).join('');
                mat2El.dataset.filled = '1';
            }
            if (sizeEl && sizeEl.dataset.filled !== '1') {
                const sizes = [...new Set(keys.map(k => k.size).filter(v => v && v !== '-'))]
                    .sort((a, b) => parseFloat(a.replace(/\D/g, '')) - parseFloat(b.replace(/\D/g, '')));
                sizeEl.innerHTML = '<option value="All">All Sizes</option>' + sizes.map(s => `<option value="${s.replace(/"/g,'&quot;')}">${s}</option>`).join('');
                sizeEl.dataset.filled = '1';
            }
        });
    }
    if (!_mssValveFiltersInited) {
        _mssValveFiltersInited = true;
        document.getElementById('btnFilterMssValve')?.addEventListener('click', () => { currentMssValvePage = 1; renderMssValveTable(); });
        document.getElementById('btnClearMssValveFilters')?.addEventListener('click', () => {
            document.getElementById('mssValveSearch').value = '';
            if (itemEl) itemEl.value = 'All';
            if (mat1El) mat1El.value = 'All';
            if (mat2El) mat2El.value = 'All';
            if (sizeEl) sizeEl.value = 'All';
            if (ratingEl) ratingEl.value = 'All';
            const statusEl = document.getElementById('mssValveStatusFilter'); if (statusEl) statusEl.value = 'All';
            currentMssValvePage = 1; renderMssValveTable();
        });
    }
}

async function renderMssValveTable() {
    const tbody = document.querySelector('#mssValveTable tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="12" style="text-align:center;padding:20px;color:#888;">Loading...</td></tr>';

    const bomRows = await loadTagStockBom('Valve');
    const { recMap, issMap } = buildTagRecvMaps('Valve', bomRows);

    // Tag 단위 BOM을 Item/Mat1/Mat2/Size/Rating 기준으로 집계 — System/ISO/Line은 이 탭에서 다루지 않음
    const agg = {};
    bomRows.forEach(b => {
        const k = _valveAggKey(b);
        const key = [k.item, k.mat1, k.mat2, k.size, k.rating].join('__');
        if (!agg[key]) agg[key] = { ...k, bomQty: 0, received: 0, issued: 0 };
        agg[key].bomQty += (b.qty || 0);
        agg[key].received += recMap[b.tag] || 0;
        agg[key].issued += issMap[b.tag] || 0;
    });

    const search  = (document.getElementById('mssValveSearch')?.value || '').trim().toUpperCase();
    const itemF   = document.getElementById('mssValveItemFilter')?.value || 'All';
    const mat1F   = document.getElementById('mssValveMat1Filter')?.value || 'All';
    const mat2F   = document.getElementById('mssValveMat2Filter')?.value || 'All';
    const sizeF   = document.getElementById('mssValveSizeFilter')?.value || 'All';
    const ratingF = document.getElementById('mssValveRatingFilter')?.value || 'All';
    const statusF = document.getElementById('mssValveStatusFilter')?.value || 'All';

    const filtered = Object.values(agg).map(row => ({ ...row, diff: row.received - row.bomQty })).filter(row => {
        if (itemF   !== 'All' && row.item   !== itemF)   return false;
        if (mat1F   !== 'All' && row.mat1   !== mat1F)   return false;
        if (mat2F   !== 'All' && row.mat2   !== mat2F)   return false;
        if (sizeF   !== 'All' && row.size   !== sizeF)   return false;
        if (ratingF !== 'All' && row.rating !== ratingF) return false;
        if (!_mssMatchesStatus(row.diff, statusF)) return false;
        if (search && ![row.item, row.mat1, row.mat2, row.size].some(v => (v || '').toUpperCase().includes(search))) return false;
        return true;
    }).sort((a, b) => a.item.localeCompare(b.item) || a.mat1.localeCompare(b.mat1) || a.mat2.localeCompare(b.mat2)
        || (parseFloat(a.size.replace(/\D/g, '')) || 0) - (parseFloat(b.size.replace(/\D/g, '')) || 0));

    const label = document.getElementById('mssValveCountLabel');
    if (label) label.textContent = `(${filtered.length.toLocaleString()} items)`;

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    if (currentMssValvePage > totalPages) currentMssValvePage = 1;
    const start = (currentMssValvePage - 1) * PAGE_SIZE;
    const display = filtered.slice(start, start + PAGE_SIZE);

    tbody.innerHTML = display.map(row => {
        const stock = Math.max(0, row.received - row.issued);
        return `<tr>
            <td style="text-align:center;font-weight:600;">${row.item}</td>
            <td style="text-align:center;">${row.mat1}</td>
            <td style="text-align:center;">${row.mat2}</td>
            <td style="text-align:center;">${row.size}</td>
            <td style="text-align:center;">${row.rating}</td>
            <td style="text-align:center;">EA</td>
            <td style="text-align:center;">${row.bomQty.toFixed(2)}</td>
            <td style="text-align:center;">${row.received.toFixed(2)}</td>
            ${_mssShortageCellHtml(row.diff)}
            ${_mssSurplusCellHtml(row.diff)}
            <td style="text-align:center;">${row.issued.toFixed(2)}</td>
            <td style="text-align:center;font-weight:700;">${stock.toFixed(2)}</td>
        </tr>`;
    }).join('');

    renderPagination('mssValvePagination', currentMssValvePage, totalPages, '_mssValveGoPage');
}
window._mssValveGoPage = function(p) { currentMssValvePage = p; renderMssValveTable(); };

// --- Material Summary (Speciality — 순수 Item 기준 통합) — Valve와 동일 패턴 ---
let currentMssSpecialityPage = 1;
let _mssSpecialityFiltersInited = false;
function _specialityAggKey(b) {
    const item = window.extractItemFromDesc(b.full_description);
    const { size, rating } = window.parseSpecialityDesc(b.full_description);
    return { item, mat1: b.mat1 || '-', mat2: b.mat2 || '-', size, rating };
}

function initMssSpecialityFilters() {
    const itemEl = document.getElementById('mssSpecialityItemFilter');
    if (itemEl && itemEl.options.length <= 1) {
        const items = db.specialityItems || [];
        itemEl.innerHTML = '<option value="All">All Items</option>'
            + items.map(i => `<option value="${i.replace(/"/g, '&quot;')}">${i}</option>`).join('');
    }
    const mat1El = document.getElementById('mssSpecialityMat1Filter');
    const mat2El = document.getElementById('mssSpecialityMat2Filter');
    const sizeEl = document.getElementById('mssSpecialitySizeFilter');
    const ratingEl = document.getElementById('mssSpecialityRatingFilter');
    if ((mat1El && mat1El.dataset.filled !== '1') || (mat2El && mat2El.dataset.filled !== '1')
        || (sizeEl && sizeEl.dataset.filled !== '1') || (ratingEl && ratingEl.dataset.filled !== '1')) {
        loadTagStockBom('Speciality').then(bomRows => {
            const keys = bomRows.map(_specialityAggKey);
            if (mat1El && mat1El.dataset.filled !== '1') {
                const vals = [...new Set(keys.map(k => k.mat1).filter(v => v && v !== '-'))].sort();
                mat1El.innerHTML = '<option value="All">All Mat 1</option>' + vals.map(v => `<option value="${v.replace(/"/g,'&quot;')}">${v}</option>`).join('');
                mat1El.dataset.filled = '1';
            }
            if (mat2El && mat2El.dataset.filled !== '1') {
                const vals = [...new Set(keys.map(k => k.mat2).filter(v => v && v !== '-'))].sort();
                mat2El.innerHTML = '<option value="All">All Mat 2</option>' + vals.map(v => `<option value="${v.replace(/"/g,'&quot;')}">${v}</option>`).join('');
                mat2El.dataset.filled = '1';
            }
            if (sizeEl && sizeEl.dataset.filled !== '1') {
                const sizes = [...new Set(keys.map(k => k.size).filter(v => v && v !== '-'))]
                    .sort((a, b) => (parseFloat(a.replace(/\D/g, '')) || 0) - (parseFloat(b.replace(/\D/g, '')) || 0));
                sizeEl.innerHTML = '<option value="All">All Sizes</option>' + sizes.map(s => `<option value="${s.replace(/"/g,'&quot;')}">${s}</option>`).join('');
                sizeEl.dataset.filled = '1';
            }
            if (ratingEl && ratingEl.dataset.filled !== '1') {
                const vals = [...new Set(keys.map(k => k.rating).filter(v => v && v !== '-'))].sort();
                ratingEl.innerHTML = '<option value="All">All Ratings</option>' + vals.map(v => `<option value="${v.replace(/"/g,'&quot;')}">${v}</option>`).join('');
                ratingEl.dataset.filled = '1';
            }
        });
    }
    if (!_mssSpecialityFiltersInited) {
        _mssSpecialityFiltersInited = true;
        document.getElementById('btnFilterMssSpeciality')?.addEventListener('click', () => { currentMssSpecialityPage = 1; renderMssSpecialityTable(); });
        document.getElementById('btnClearMssSpecialityFilters')?.addEventListener('click', () => {
            document.getElementById('mssSpecialitySearch').value = '';
            if (itemEl) itemEl.value = 'All';
            if (mat1El) mat1El.value = 'All';
            if (mat2El) mat2El.value = 'All';
            if (sizeEl) sizeEl.value = 'All';
            if (ratingEl) ratingEl.value = 'All';
            const statusEl = document.getElementById('mssSpecialityStatusFilter'); if (statusEl) statusEl.value = 'All';
            currentMssSpecialityPage = 1; renderMssSpecialityTable();
        });
    }
}

async function renderMssSpecialityTable() {
    const tbody = document.querySelector('#mssSpecialityTable tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="12" style="text-align:center;padding:20px;color:#888;">Loading...</td></tr>';

    const bomRows = await loadTagStockBom('Speciality');
    const { recMap, issMap } = buildTagRecvMaps('Speciality', bomRows);

    const agg = {};
    bomRows.forEach(b => {
        const k = _specialityAggKey(b);
        const key = [k.item, k.mat1, k.mat2, k.size, k.rating].join('__');
        if (!agg[key]) agg[key] = { ...k, bomQty: 0, received: 0, issued: 0 };
        agg[key].bomQty += (b.qty || 0);
        agg[key].received += recMap[b.tag] || 0;
        agg[key].issued += issMap[b.tag] || 0;
    });

    const search  = (document.getElementById('mssSpecialitySearch')?.value || '').trim().toUpperCase();
    const itemF   = document.getElementById('mssSpecialityItemFilter')?.value || 'All';
    const mat1F   = document.getElementById('mssSpecialityMat1Filter')?.value || 'All';
    const mat2F   = document.getElementById('mssSpecialityMat2Filter')?.value || 'All';
    const sizeF   = document.getElementById('mssSpecialitySizeFilter')?.value || 'All';
    const ratingF = document.getElementById('mssSpecialityRatingFilter')?.value || 'All';
    const statusF = document.getElementById('mssSpecialityStatusFilter')?.value || 'All';

    const filtered = Object.values(agg).map(row => ({ ...row, diff: row.received - row.bomQty })).filter(row => {
        if (itemF   !== 'All' && row.item   !== itemF)   return false;
        if (mat1F   !== 'All' && row.mat1   !== mat1F)   return false;
        if (mat2F   !== 'All' && row.mat2   !== mat2F)   return false;
        if (sizeF   !== 'All' && row.size   !== sizeF)   return false;
        if (ratingF !== 'All' && row.rating !== ratingF) return false;
        if (!_mssMatchesStatus(row.diff, statusF)) return false;
        if (search && ![row.item, row.mat1, row.mat2, row.size].some(v => (v || '').toUpperCase().includes(search))) return false;
        return true;
    }).sort((a, b) => a.item.localeCompare(b.item) || a.mat1.localeCompare(b.mat1) || a.mat2.localeCompare(b.mat2)
        || (parseFloat(a.size.replace(/\D/g, '')) || 0) - (parseFloat(b.size.replace(/\D/g, '')) || 0));

    const label = document.getElementById('mssSpecialityCountLabel');
    if (label) label.textContent = `(${filtered.length.toLocaleString()} items)`;

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    if (currentMssSpecialityPage > totalPages) currentMssSpecialityPage = 1;
    const start = (currentMssSpecialityPage - 1) * PAGE_SIZE;
    const display = filtered.slice(start, start + PAGE_SIZE);

    tbody.innerHTML = display.map(row => {
        const stock = Math.max(0, row.received - row.issued);
        return `<tr>
            <td style="text-align:center;font-weight:600;">${row.item}</td>
            <td style="text-align:center;">${row.mat1}</td>
            <td style="text-align:center;">${row.mat2}</td>
            <td style="text-align:center;">${row.size}</td>
            <td style="text-align:center;">${row.rating}</td>
            <td style="text-align:center;">EA</td>
            <td style="text-align:center;">${row.bomQty.toFixed(2)}</td>
            <td style="text-align:center;">${row.received.toFixed(2)}</td>
            ${_mssShortageCellHtml(row.diff)}
            ${_mssSurplusCellHtml(row.diff)}
            <td style="text-align:center;">${row.issued.toFixed(2)}</td>
            <td style="text-align:center;font-weight:700;">${stock.toFixed(2)}</td>
        </tr>`;
    }).join('');

    renderPagination('mssSpecialityPagination', currentMssSpecialityPage, totalPages, '_mssSpecialityGoPage');
}
window._mssSpecialityGoPage = function(p) { currentMssSpecialityPage = p; renderMssSpecialityTable(); };

// --- Material Summary (Support — support_bom/support_receiving 전용, Item 기준 통합) ---
// Support는 bom/receiving 공용 테이블이 아니라 별도 테이블(support_bom/support_receiving)을 쓰고
// Mat1/Mat2 분리, Rating 개념이 없다(단일 MATL 필드) — Mat1=matl, Mat2/Rating은 '-' 고정.
// Tag 없는 Bulk 구조재(support_tag 공란)는 v_support_kpi와 동일하게 이 집계에서 제외한다.
let currentMssSupportPage = 1;
let _mssSupportFiltersInited = false;
let _mssSupportBomCache = null;
let _mssSupportRecvCache = null;

async function loadSupportBomTagRows() {
    if (_mssSupportBomCache) return _mssSupportBomCache;
    let all = [];
    let from = 0;
    const step = 2000;
    let ok = true;
    while (true) {
        const { data, error } = await supabaseClient.from('support_bom')
            .select('support_tag, part_no, item, matl, size_or_type, qty')
            .range(from, from + step - 1);
        if (error) { console.error('loadSupportBomTagRows 조회 실패:', error); ok = false; break; }
        if (!data || data.length === 0) break;
        all = all.concat(data);
        if (data.length < step) break;
        from += step;
    }
    const filtered = all.filter(r => r.support_tag && r.support_tag.trim() !== '' && r.support_tag !== '-');
    if (ok) _mssSupportBomCache = filtered; // 실패 시 캐싱하지 않아야 다음 호출에서 재시도됨(빈 배열도 truthy라 캐시되면 영구 고착)
    return filtered;
}

async function loadSupportReceivingRows() {
    if (_mssSupportRecvCache) return _mssSupportRecvCache;
    let all = [];
    let from = 0;
    const step = 2000;
    let ok = true;
    while (true) {
        const { data, error } = await supabaseClient.from('support_receiving')
            .select('support_tag, part_no, package_no, qty')
            .range(from, from + step - 1);
        if (error) { console.error('loadSupportReceivingRows 조회 실패:', error); ok = false; break; }
        if (!data || data.length === 0) break;
        all = all.concat(data);
        if (data.length < step) break;
        from += step;
    }
    if (ok) _mssSupportRecvCache = all; // 실패 시 캐싱하지 않아야 다음 호출에서 재시도됨
    return all;
}

function _supportAggKey(b) {
    return { item: b.item || '-', mat1: b.matl || '-', mat2: '-', size: b.size_or_type || '-', rating: '-' };
}

function initMssSupportFilters() {
    const itemEl = document.getElementById('mssSupportItemFilter');
    const mat1El = document.getElementById('mssSupportMat1Filter');
    const sizeEl = document.getElementById('mssSupportSizeFilter');
    if ((itemEl && itemEl.dataset.filled !== '1') || (mat1El && mat1El.dataset.filled !== '1') || (sizeEl && sizeEl.dataset.filled !== '1')) {
        loadSupportBomTagRows().then(bomRows => {
            if (itemEl && itemEl.dataset.filled !== '1') {
                const vals = [...new Set(bomRows.map(r => r.item).filter(Boolean))].sort();
                itemEl.innerHTML = '<option value="All">All Items</option>' + vals.map(v => `<option value="${v.replace(/"/g,'&quot;')}">${v}</option>`).join('');
                itemEl.dataset.filled = '1';
            }
            if (mat1El && mat1El.dataset.filled !== '1') {
                const vals = [...new Set(bomRows.map(r => r.matl).filter(Boolean))].sort();
                mat1El.innerHTML = '<option value="All">All Mat 1</option>' + vals.map(v => `<option value="${v.replace(/"/g,'&quot;')}">${v}</option>`).join('');
                mat1El.dataset.filled = '1';
            }
            if (sizeEl && sizeEl.dataset.filled !== '1') {
                const vals = [...new Set(bomRows.map(r => r.size_or_type).filter(Boolean))].sort();
                sizeEl.innerHTML = '<option value="All">All Sizes</option>' + vals.map(v => `<option value="${v.replace(/"/g,'&quot;')}">${v}</option>`).join('');
                sizeEl.dataset.filled = '1';
            }
        });
    }
    if (!_mssSupportFiltersInited) {
        _mssSupportFiltersInited = true;
        document.getElementById('btnFilterMssSupport')?.addEventListener('click', () => { currentMssSupportPage = 1; renderMssSupportTable(); });
        document.getElementById('btnClearMssSupportFilters')?.addEventListener('click', () => {
            document.getElementById('mssSupportSearch').value = '';
            if (itemEl) itemEl.value = 'All';
            if (mat1El) mat1El.value = 'All';
            if (sizeEl) sizeEl.value = 'All';
            const statusEl = document.getElementById('mssSupportStatusFilter'); if (statusEl) statusEl.value = 'All';
            currentMssSupportPage = 1; renderMssSupportTable();
        });
    }
}

async function renderMssSupportTable() {
    const tbody = document.querySelector('#mssSupportTable tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="12" style="text-align:center;padding:20px;color:#888;">Loading...</td></tr>';

    const [bomRows, recvRows] = await Promise.all([loadSupportBomTagRows(), loadSupportReceivingRows()]);

    const recvByKey = {};
    recvRows.forEach(r => {
        const key = `${r.support_tag}::${r.part_no}`;
        if (!recvByKey[key]) recvByKey[key] = {};
        recvByKey[key][r.package_no] = (recvByKey[key][r.package_no] || 0) + (r.qty || 0);
    });

    const agg = {};
    bomRows.forEach(b => {
        const k = _supportAggKey(b);
        const key = [k.item, k.mat1, k.size].join('__');
        if (!agg[key]) agg[key] = { ...k, bomQty: 0, received: 0, issued: 0 };
        agg[key].bomQty += (b.qty || 0);
        const pkgMap = recvByKey[`${b.support_tag}::${b.part_no}`] || {};
        Object.entries(pkgMap).forEach(([pkg, qty]) => {
            agg[key].received += qty;
            if (isPkgIssued(pkg)) agg[key].issued += qty;
        });
    });

    const search  = (document.getElementById('mssSupportSearch')?.value || '').trim().toUpperCase();
    const itemF   = document.getElementById('mssSupportItemFilter')?.value || 'All';
    const mat1F   = document.getElementById('mssSupportMat1Filter')?.value || 'All';
    const sizeF   = document.getElementById('mssSupportSizeFilter')?.value || 'All';
    const statusF = document.getElementById('mssSupportStatusFilter')?.value || 'All';

    const filtered = Object.values(agg).map(row => ({ ...row, diff: row.received - row.bomQty })).filter(row => {
        if (itemF !== 'All' && row.item !== itemF) return false;
        if (mat1F !== 'All' && row.mat1 !== mat1F) return false;
        if (sizeF !== 'All' && row.size !== sizeF) return false;
        if (!_mssMatchesStatus(row.diff, statusF)) return false;
        if (search && ![row.item, row.mat1, row.size].some(v => (v || '').toUpperCase().includes(search))) return false;
        return true;
    }).sort((a, b) => a.item.localeCompare(b.item) || a.mat1.localeCompare(b.mat1)
        || (parseFloat(a.size.replace(/\D/g, '')) || 0) - (parseFloat(b.size.replace(/\D/g, '')) || 0));

    const label = document.getElementById('mssSupportCountLabel');
    if (label) label.textContent = `(${filtered.length.toLocaleString()} items)`;

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    if (currentMssSupportPage > totalPages) currentMssSupportPage = 1;
    const start = (currentMssSupportPage - 1) * PAGE_SIZE;
    const display = filtered.slice(start, start + PAGE_SIZE);

    tbody.innerHTML = display.map(row => {
        const stock = Math.max(0, row.received - row.issued);
        return `<tr>
            <td style="text-align:center;font-weight:600;">${row.item}</td>
            <td style="text-align:center;">${row.mat1}</td>
            <td style="text-align:center;">${row.mat2}</td>
            <td style="text-align:center;">${row.size}</td>
            <td style="text-align:center;">${row.rating}</td>
            <td style="text-align:center;">EA</td>
            <td style="text-align:center;">${row.bomQty.toFixed(2)}</td>
            <td style="text-align:center;">${row.received.toFixed(2)}</td>
            ${_mssShortageCellHtml(row.diff)}
            ${_mssSurplusCellHtml(row.diff)}
            <td style="text-align:center;">${row.issued.toFixed(2)}</td>
            <td style="text-align:center;font-weight:700;">${stock.toFixed(2)}</td>
        </tr>`;
    }).join('');

    renderPagination('mssSupportPagination', currentMssSupportPage, totalPages, '_mssSupportGoPage');
}
window._mssSupportGoPage = function(p) { currentMssSupportPage = p; renderMssSupportTable(); };

let _mssTabsInited = false;
function initMssTabs() {
    if (_mssTabsInited) { renderActiveMssTab(); return; }
    _mssTabsInited = true;
    initMssFilters();
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

async function refreshMssItemFilter() {
    const TAB_CAT = { piping: 'Pipe', fitting: 'Fitting', others: 'Others' };
    const cat = TAB_CAT[_mssActiveTab] || 'Pipe';

    const itemEl = document.getElementById('mssItemFilter');
    if (itemEl) {
        const items = getBomItemsForCat(cat);
        itemEl.innerHTML = '<option value="All">All Items</option>'
            + items.map(i => `<option value="${i.replace(/"/g, '&quot;')}">${i}</option>`).join('');
    }

    const agg = await loadMssItemAgg();
    const catRows = agg.filter(r => r.category === cat);

    const mat1El = document.getElementById('mssMat1Filter');
    if (mat1El) {
        const vals1 = [...new Set(catRows.map(r => r.mat1).filter(Boolean))].sort();
        mat1El.innerHTML = '<option value="All">All Mat 1</option>'
            + vals1.map(v => `<option value="${v.replace(/"/g, '&quot;')}">${v}</option>`).join('');
    }
    const mat2El = document.getElementById('mssMat2Filter');
    if (mat2El) {
        const vals2 = [...new Set(catRows.map(r => r.mat2).filter(Boolean))].sort();
        mat2El.innerHTML = '<option value="All">All Mat 2</option>'
            + vals2.map(v => `<option value="${v.replace(/"/g, '&quot;')}">${v}</option>`).join('');
    }
    const sizeEl = document.getElementById('mssSizeFilter');
    if (sizeEl) {
        const sizes = cat === 'Others'
            ? [...new Set(catRows.map(r => window.extractSizeLengthFromMatCode(r.matCode)).filter(v => v && v !== '-'))]
                .sort((a, b) => parseSizeSortKey(a) - parseSizeSortKey(b))
            : getBomSizesForCatItem(cat, 'All');
        sizeEl.innerHTML = '<option value="All">All Sizes</option>'
            + sizes.map(s => `<option value="${s.replace(/"/g, '&quot;')}">${s}</option>`).join('');
    }
    const ratingEl = document.getElementById('mssRatingFilter');
    if (ratingEl) {
        const ratings = Object.keys(getRatingMatCodesForCat(cat)).sort();
        ratingEl.innerHTML = '<option value="All">All Ratings</option>'
            + ratings.map(r => `<option value="${r.replace(/"/g, '&quot;')}">${r}</option>`).join('');
    }
}

let _mssFiltersInited = false;
function initMssFilters() {
    if (_mssFiltersInited) return;
    _mssFiltersInited = true;

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
        ['mssItemFilter', 'mssMat1Filter', 'mssMat2Filter', 'mssSizeFilter', 'mssRatingFilter', 'mssStatusFilter'].forEach(id => {
            const el = document.getElementById(id); if (el) el.value = 'All';
        });
        currentMssPage = 1;
        renderMssTable();
    });

    const btnExportMss = document.getElementById('btnExportMss');
    if (btnExportMss) {
        btnExportMss.addEventListener('click', async () => {
            btnExportMss.disabled = true;
            btnExportMss.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Exporting...';
            try {
                const TAB_CAT = { piping: 'Pipe', fitting: 'Fitting', others: 'Others' };
                const cat = TAB_CAT[_mssActiveTab] || 'Pipe';
                const rows = await getMssFilteredRows();

                const exportRows = rows.map(r => ({
                    'Item':     r.item,
                    'Mat 1':    r.mat1,
                    'Mat 2':    r.mat2,
                    'Size':     r.size,
                    'Rating':   r.rating,
                    'Unit':     r.unit,
                    'BOM Qty':  r.bomQty,
                    'Received': r.recQty,
                    'Shortage': r.diff < 0 ? Math.abs(r.diff) : 0,
                    'Surplus':  r.diff > 0 ? r.diff : 0,
                    'Issued':   r.issQty,
                    'Stock':    r.stockQty,
                }));

                const ws = XLSX.utils.json_to_sheet(exportRows);
                ws['!cols'] = [16, 12, 14, 12, 10, 6, 10, 10, 10, 10, 10, 10].map(w => ({ wch: w }));
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
}

// --- Material Shortage / Surplus 공용 ---
const CAT_ORDER = { 'Pipe': 0, 'Fitting': 1, 'Valve': 2, 'Spool': 3, 'Support': 4, 'Others': 5, 'Speciality': 6 };

// key = MatCode(Pipe/Fitting/Others) 또는 Tag(Valve/Speciality, mat_code가 없어 Tag가 고유 키)
function _buildBomMap() {
    const m = {};
    db.bom.forEach(b => {
        if (!b.key) return;
        if (!m[b.key]) m[b.key] = { qty: 0, uom: b.uom, category: b.category };
        m[b.key].qty += b.qty;
    });
    return m;
}

function _buildRecMap() {
    const m = {};
    db.receiving
        .filter(r => (r.purpose === 'Permanent' || r.purpose === '') && isReceivingActive(r.plNo))
        .forEach(r => {
            if (!r.key) return;
            if (!m[r.key]) m[r.key] = { qty: 0, desc: r.desc, unit: r.unit, category: r.category, mat1: r.mat1, mat2: r.mat2, size: r.size, rating: r.rating };
            m[r.key].qty += r.qty;
        });
    return m;
}

function _buildMasterMap() {
    const m = {};
    db.matCodeMaster.forEach(md => { m[md.matCode] = md; });
    return m;
}

// Rating(Class/Schedule): MatCode Master의 Class 우선, 없으면 MatCode 4번째 세그먼트가
// 실제 Rating 패턴(CL150/S40/SCH40/XS/XXS/STD 등)일 때만 사용. STB는 matcode_master의
// class_desc 컬럼 자체에 재질 마감 라벨(HDG/ALLOY/SS304 등)이 들어있어(Rating 아님) 제외.
const RATING_SEGMENT_RE = /^(CL\d+|SCH\d+|S\d+|XS|XXS|STD)$/i;

// Mat1/Mat2(Receiving Bulk 탭): bom_mat12_agg는 bom에 있는 mat_code만 커버 —
// BOM에 없는 사이즈/길이 변형으로 입고된 STB는 여기서 빠짐. STB는 matcode_master의
// class_desc(재질 마감 라벨)=mat1, matl_desc(A193-Bx 규격)=mat2로 필드 의미가 반전돼
// 있어(위 rating 주석과 동일 이유) 다른 카테고리와 같이 다룰 수 없음 — STB 전용 폴백.
function getStbMat1Mat2Fallback(matCode, masterMap) {
    if (!/^STB-/i.test(matCode || '')) return null;
    const mData = masterMap && masterMap[matCode];
    if (!mData) return null;
    return { mat1: mData.classDesc || '-', mat2: mData.matlDesc || '-' };
}
function getRatingForMatCode(matCode, masterMap, fullDescription) {
    const mData = (masterMap && masterMap[matCode]) || {};
    const isStb = /^STB-/i.test(matCode || '');
    if (mData.classDesc && mData.classDesc !== '-' && !isStb) return mData.classDesc;
    const seg = (matCode || '').split('-')[3] || '';
    if (RATING_SEGMENT_RE.test(seg)) return seg;
    // Valve(MatCode 없음)는 Description에 박힌 CL### 표기에서 직접 추출
    const m = (fullDescription || '').match(/\bCL\d+\b/i);
    if (m) return m[0].toUpperCase();
    // Speciality(MatCode 없음, CL### 표기도 없음)는 "{ITEM}, {MAT2}, {SIZE}, {RATING}, {END TYPE}" 4번째 콤마 세그먼트
    const specRating = window.parseSpecialityDesc ? window.parseSpecialityDesc(fullDescription).rating : '-';
    return specRating || '-';
}

// 카테고리(Pipe/Fitting/Others) 내 Rating 값 → 해당 MatCode 목록. BOM 탭의 Rating
// 필터 드롭다운 채우기와, 서버 쿼리에 .in('mat_code', [...]) 로 넘길 후보 산출에 공용.
function getRatingMatCodesForCat(cat) {
    const masterMap = _buildMasterMap();
    const src = (cat === 'All' || cat === 'ALL') ? db.bom : db.bom.filter(b => b.category === cat);
    const map = {};
    src.forEach(b => {
        const rating = getRatingForMatCode(b.matCode, masterMap);
        if (rating === '-') return;
        if (!map[rating]) map[rating] = new Set();
        map[rating].add(b.matCode);
    });
    return map;
}

function _sortByCatItemSize(list) {
    list.sort((a, b) => {
        const oa = CAT_ORDER[a.cat] ?? 9, ob = CAT_ORDER[b.cat] ?? 9;
        if (oa !== ob) return oa - ob;
        const ia = (a.item || '').toUpperCase(), ib = (b.item || '').toUpperCase();
        if (ia !== ib) return ia.localeCompare(ib);
        return (parseFloat((a.size || '0').replace(/[^0-9.]/g, '')) || 0) -
               (parseFloat((b.size || '0').replace(/[^0-9.]/g, '')) || 0);
    });
}

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

// Data Health Card ④: bom.mat_code에 'NEW-MAT'가 포함된 건 = matcode_master에 정식 등록되지 않고
// 화면에서 자동 생성된 임시 코드 (BOM 탭 배지 warn 처리와 동일 기준, app.js:2961 참고)
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

// Data Health Card ②: support_bom에 System/ISO DWG NO.가 공란인 Tag = 도면 DB(ipcs-drawing)에
// 매칭되지 않아 남아있는 항목 (project_support_bom_openpyxl_dataloss / Support 적용 사례 참고)
async function computeSupportUnmatched() {
    const { data, error } = await supabaseClient
        .from('support_bom')
        .select('support_tag, system, iso_dwg_no, type, item, matl, size_or_type, qty')
        .or('system.is.null,iso_dwg_no.is.null')
        .not('support_tag', 'is', null)
        .limit(5000);
    if (error) {
        console.error('computeSupportUnmatched 조회 실패:', error);
        return { rows: [] };
    }
    // System/ISO 중 한쪽만 공란인 경우도 섞여 있어(둘 다 공란은 아님) 값이 있는 쪽은 그대로 보여줘서
    // 검증 시 참고할 수 있게 한다 — Support는 Line No 컬럼 자체가 없어(support_bom 스키마에 없음) 제공 불가.
    const rows = data.map(r => ({
        supportTag: r.support_tag,
        system: r.system || '-',
        iso: r.iso_dwg_no || '-',
        type: r.type || '-',
        item: r.item || '-',
        matl: r.matl || '-',
        sizeOrType: r.size_or_type || '-',
        qty: r.qty || 0
    }));
    return { rows };
}

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

// Data Health의 'valve' 표에서 웹에서 바로 고칠 수 있게 열어둔 필드 — Tag(조인키)와 Category는
// 리스크가 커서(다른 화면 매칭이 다 깨질 수 있음) 제외하고, 실제로 흔히 틀리는 ISO Drawing/Item만 편집 허용.
const DH_EDITABLE_FIELDS = { valve: new Set(['iso', 'item']) };

function _dhRenderTable(key, columns) {
    const tbody = document.querySelector(`#dhTable-${key} tbody`);
    if (!tbody) return;
    const rows = _dhRows[key];
    if (rows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${columns.length}" style="text-align:center;color:#666;padding:16px;">No issues found.</td></tr>`;
        return;
    }
    const editable = DH_EDITABLE_FIELDS[key] || new Set();
    tbody.innerHTML = rows.map(r => `<tr data-dh-tag="${r.tag || ''}">${columns.map(c => {
        if (c.key === 'action') {
            const iso = r.iso;
            return (iso && iso !== '-')
                ? `<td style="text-align:center;"><button class="btn btn-outline dh-search-iso" data-iso="${iso}" style="font-size:11px;padding:2px 10px;height:26px;">🔍 Search</button></td>`
                : `<td style="text-align:center;color:#aaa;">-</td>`;
        }
        const val = r[c.key] ?? '';
        if (editable.has(c.key)) {
            const safeVal = String(val).replace(/"/g, '&quot;');
            return `<td style="text-align:center;cursor:pointer;" class="dh-editable-cell" data-field="${c.key}" data-raw="${safeVal}" title="클릭해서 수정">${val} <i class="fas fa-pencil-alt" style="font-size:9px;color:#aaa;"></i></td>`;
        }
        return `<td style="text-align:center;">${val}</td>`;
    }).join('')}</tr>`).join('');
}

// Data Health 상세 표의 "🔍 Search" 버튼 → Material Finding(ISO 모드)으로 이동해 해당 ISO를 바로 조회
// (Excel 왕복 없이 이 Tag가 실제로 다른 이름으로 입고됐는지 웹에서 바로 확인할 수 있게 함)
document.addEventListener('click', (e) => {
    const btn = e.target.closest('.dh-search-iso');
    if (!btn) return;
    const iso = btn.dataset.iso;
    window.showSection('issue');
    const isoModeBtn = document.querySelector('.mf-mode-btn[data-mode="iso"]');
    if (isoModeBtn && !isoModeBtn.classList.contains('active')) isoModeBtn.click();
    const isoInput = document.getElementById('issueIsoSearch');
    if (isoInput) isoInput.value = iso;
    document.getElementById('btnFilterIssue')?.click();
});

// Data Health ISO Drawing/Item 셀 클릭 → 인라인 입력폼으로 전환 (Excel 왕복 없이 BOM 값을 바로 고침)
document.addEventListener('click', (e) => {
    const cell = e.target.closest('.dh-editable-cell');
    if (!cell || cell.classList.contains('dh-editing')) return;
    cell.classList.add('dh-editing');
    const field = cell.dataset.field;
    const raw = cell.dataset.raw;
    cell.innerHTML = `
        <input type="text" class="form-control dh-edit-input" value="${raw}" style="width:160px;display:inline-block;font-size:11px;">
        <button class="btn btn-primary dh-edit-save" data-field="${field}" style="font-size:11px;padding:2px 8px;">Save</button>
        <button class="btn btn-outline dh-edit-cancel" style="font-size:11px;padding:2px 8px;">✕</button>
    `;
    cell.querySelector('.dh-edit-input')?.focus();
});

document.addEventListener('click', (e) => {
    if (e.target.closest('.dh-edit-cancel')) {
        _dhRenderTable('valve', DH_COLUMNS.valve);
    }
});

// Valve/Speciality BOM 원본(bom 테이블)에 직접 PATCH — tag는 Valve+Speciality 전체에서 유니크함이
// 확인됨(2026-07-06, 중복 0건)이라 tag만으로 정확히 1행을 특정 가능.
document.addEventListener('click', async (e) => {
    const saveBtn = e.target.closest('.dh-edit-save');
    if (!saveBtn) return;
    const cell = saveBtn.closest('.dh-editable-cell');
    const tr = saveBtn.closest('tr');
    const tag = tr?.dataset.dhTag;
    const field = saveBtn.dataset.field;
    const newVal = (cell.querySelector('.dh-edit-input')?.value || '').trim();
    if (!tag || !newVal) { alert('값을 입력해주세요.'); return; }

    const info = db.bomTagMap[tag.toUpperCase()];
    let patch;
    if (field === 'iso') {
        patch = { iso_dwg_no: newVal };
    } else if (field === 'item') {
        // full_description = "{ITEM}, {MAT2}, {SIZE}, {RATING}, {END TYPE}" — 첫 세그먼트(ITEM)만 교체
        const rest = (info?.fullDescription || '').split(',').slice(1).map(s => s.trim());
        const newDesc = [newVal, ...rest].join(', ');
        patch = { full_description: newDesc };
    } else {
        return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = '...';
    const { error } = await supabaseClient.from('bom').update(patch).eq('tag', tag);
    if (error) {
        alert('저장 실패: ' + error.message);
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save';
        return;
    }

    // 로컬 캐시(db.bomTagMap)와 화면에 표시 중인 행(_dhRows.valve) 갱신
    if (info) {
        if (field === 'iso') info.iso_dwg_no = newVal;
        else if (field === 'item') info.fullDescription = patch.full_description;
    }
    const row = _dhRows.valve.find(r => r.tag === tag);
    if (row) row[field] = newVal;
    _dhRenderTable('valve', DH_COLUMNS.valve);
});

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
    valve:   [{header:'ISO Drawing',key:'iso'},{header:'Tag',key:'tag'},{header:'Category',key:'category'},{header:'Item',key:'item'},{header:'Action',key:'action'}],
    support: [{header:'Support Tag',key:'supportTag'},{header:'System',key:'system'},{header:'ISO Drawing',key:'iso'},{header:'Type',key:'type'},{header:'Item',key:'item'},{header:'Matl',key:'matl'},{header:'Size/Type',key:'sizeOrType'},{header:'Qty',key:'qty'}],
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

        document.getElementById('dhExport-valve').addEventListener('click', () => exportHealthList(_dhRows.valve, DH_COLUMNS.valve.filter(c => c.key !== 'action'), 'Valve Tag Mismatch', 'DataHealth_ValveTag'));
        document.getElementById('dhExport-support').addEventListener('click', () => exportHealthList(_dhRows.support, DH_COLUMNS.support, 'Support Unmatched', 'DataHealth_Support'));
        document.getElementById('dhExport-bucket').addEventListener('click', () => exportHealthList(_dhRows.bucket, DH_COLUMNS.bucket, 'Bucket Tag Regression', 'DataHealth_BucketTag'));
        document.getElementById('dhExport-newmat').addEventListener('click', () => exportHealthList(_dhRows.newmat, DH_COLUMNS.newmat, 'Unregistered MatCode', 'DataHealth_NewMat'));
    }
}

// MatCode의 MATL 세그먼트(2번째 "-" 구간, 예: SS04/CS05/AS91)만으로 Mat1이 정해지는 것을
// mat12Map(BOM 매칭된 다른 사이즈)에서 역으로 학습해 세그먼트→Mat1 룩업을 만든다.
// BOM에 전혀 없는(bomQty=0) matCode의 Mat1 폴백용 — 같은 세그먼트를 쓰는 다른 사이즈가
// 이미 BOM에 있으면 그 라벨을 그대로 재사용(Item에 따라 값이 갈리는 Mat2는 대상 아님).
function _buildSegToMat1(mat12Map) {
    const m = {};
    Object.entries(mat12Map).forEach(([matCode, v]) => {
        const seg = (matCode || '').split('-')[1];
        if (seg && v.mat1 && v.mat1 !== '-' && !(seg in m)) m[seg] = v.mat1;
    });
    return m;
}

function _enrichRow(key, bomMap, recMap, masterMap, mat12Map, segToMat1) {
    const bomEntry = bomMap[key] || {};
    const recEntry = recMap[key] || {};
    const cat = bomEntry.category || recEntry.category || '-';

    // Valve/Speciality — key는 MatCode가 아니라 Tag(mat_code가 없어 Tag가 고유 키).
    // db.bomTagMap(bom_detail 기준, mat1/mat2/full_description 보유)에서 정보를 가져온다.
    if (cat === 'Valve' || cat === 'Speciality') {
        const tagInfo = db.bomTagMap[key] || {};
        const desc = tagInfo.fullDescription || (recEntry.desc !== '-' ? recEntry.desc : null) || '-';
        const item = window.extractItemFromDesc(desc);
        // BOM(Tag) 매칭이 없는 항목(=Surplus 전용)은 desc에서 뽑을 게 없으므로 receiving 원본 컬럼으로 폴백
        const descSize = cat === 'Speciality'
            ? (window.parseSpecialityDesc(desc).size || '-')
            : (window.extractDnSizeFromDesc(desc) || '-');
        const size = (descSize !== '-') ? descSize : (recEntry.size || '-');
        const descRating = getRatingForMatCode(null, null, desc);
        const rating = (descRating !== '-') ? descRating : (recEntry.rating || '-');
        const mat1 = tagInfo.mat1 || recEntry.mat1 || '-';
        const mat2 = tagInfo.mat2 || recEntry.mat2 || '-';
        const unit = recEntry.unit || bomEntry.uom || 'EA';
        const bomQty = bomEntry.qty ?? 0;
        const recQty = recEntry.qty ?? 0;
        return { matCode: key, cat, desc, item, itemDisplay: item, mat1, mat2, size, rating, unit, bomQty, recQty };
    }

    const matCode = key;
    const mData = masterMap[matCode] || {};
    const desc = db.bomDesc[matCode] || (recMap[matCode]?.desc !== '-' ? recMap[matCode]?.desc : null) || mData.itemDesc || '-';
    const _itemMc = window.extractItemFromMatCode(matCode);
    const item = (_itemMc && _itemMc !== '-') ? _itemMc : window.extractItemFromDesc(desc);
    // Pipe는 Item 필터 드롭다운이 여전히 'PIPE'(SMLS/WELDED 합산) 기준이라 필터 매칭용 item은 그대로 두고,
    // 화면 표시용 itemDisplay만 MatCode 접두어(PIS/PIW)로 SMLS/WELDED를 구분
    const _matPrefix = (matCode || '').split('-')[0].toUpperCase();
    const itemDisplay = _matPrefix === 'PIS' ? 'PIPE SMLS'
        : _matPrefix === 'PIW' ? 'PIPE WELDED'
        : item;
    const _sc = window.extractSizeFromMatCode(matCode);
    const size = (_sc && _sc !== '-') ? _sc : (mData.size1 || '-');
    const finalCat = mData.category || window.getCategory(mData.itemDesc || '', matCode);
    // mat12Map(bom_mat12_agg)는 bom에 있는 mat_code만 커버 — BOM에 없는(bomQty=0, 순수 입고초과)
    // 변형은 여기서 빠짐. Mat1은 같은 MATL 세그먼트를 쓰는 다른 사이즈에서 역추출(segToMat1),
    // Mat2는 MatCode Master의 matl_desc(해당 MatCode 고유 규격)로 폴백한다.
    const m12  = (mat12Map && mat12Map[matCode]) || {};
    const stbFallback = getStbMat1Mat2Fallback(matCode, masterMap);
    const segMat1 = segToMat1 && segToMat1[(matCode || '').split('-')[1]];
    const mat1 = m12.mat1 || stbFallback?.mat1 || segMat1 || recEntry.mat1 || '-';
    const mat2 = m12.mat2 || stbFallback?.mat2 || (mData.matlDesc && mData.matlDesc !== '-' ? mData.matlDesc : null) || recEntry.mat2 || '-';
    const rating = getRatingForMatCode(matCode, masterMap);
    const unit = recMap[matCode]?.unit || bomMap[matCode]?.uom || 'EA';
    const bomQty = bomMap[matCode]?.qty ?? 0;
    const recQty = recMap[matCode]?.qty ?? 0;
    return { matCode, cat: finalCat, desc, item, itemDisplay, mat1, mat2, size, rating, unit, bomQty, recQty };
}

const _TABLE_ROW_TPL = ({ matCode, cat, itemDisplay, mat1, mat2, size, rating, unit, bomQty, recQty, diffQty, diffColor }) => `<tr>
    <td style="text-align:center;"><strong>${cat}</strong></td>
    <td style="text-align:center;font-weight:600;color:var(--color-primary);white-space:nowrap;">${matCode}</td>
    <td style="text-align:center;">${itemDisplay}</td>
    <td style="text-align:center;">${mat1}</td>
    <td style="text-align:center;">${mat2}</td>
    <td style="text-align:center;">${size}</td>
    <td style="text-align:center;">${rating}</td>
    <td style="text-align:center;">${unit}</td>
    <td style="text-align:center;">${Math.round(bomQty).toLocaleString()}</td>
    <td style="text-align:center;">${Math.round(recQty).toLocaleString()}</td>
    <td style="text-align:center;font-weight:700;color:${diffColor};">${Math.round(diffQty).toLocaleString()}</td>
</tr>`;

// --- Material Shortage ---
let _shortagePage = 1;
let _shortageList = [];

async function renderShortageTable() {
    const tbody = document.querySelector('#shortageTable tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const bomMap = _buildBomMap();
    const recMap = _buildRecMap();
    const masterMap = _buildMasterMap();
    const mat12Map = {};
    (await loadMssItemAgg()).forEach(r => { mat12Map[r.matCode] = { mat1: r.mat1, mat2: r.mat2 }; });
    const segToMat1 = _buildSegToMat1(mat12Map);

    const catFilter    = (document.getElementById('shortCatFilter')    || {}).value || 'ALL';
    const itemFilter   = (document.getElementById('shortItemFilter')   || {}).value || 'ALL';
    const mat1Filter   = (document.getElementById('shortMat1Filter')   || {}).value || 'ALL';
    const mat2Filter   = (document.getElementById('shortMat2Filter')   || {}).value || 'ALL';
    const sizeFilter   = (document.getElementById('shortSizeFilter')   || {}).value || 'ALL';
    const ratingFilter = (document.getElementById('shortRatingFilter') || {}).value || 'ALL';
    const searchQ      = ((document.getElementById('shortSearch')      || {}).value || '').toUpperCase();

    const list = [];
    Object.keys(bomMap).forEach(matCode => {
        const row = _enrichRow(matCode, bomMap, recMap, masterMap, mat12Map, segToMat1);
        const diffQty = row.bomQty - row.recQty;
        if (diffQty <= 0.01) return;
        if (!['Pipe', 'Fitting', 'Others', 'Valve', 'Speciality'].includes(row.cat)) return;
        if (catFilter    !== 'ALL' && row.cat    !== catFilter)    return;
        if (itemFilter   !== 'ALL' && row.item   !== itemFilter)   return;
        if (mat1Filter   !== 'ALL' && row.mat1   !== mat1Filter)   return;
        if (mat2Filter   !== 'ALL' && row.mat2   !== mat2Filter)   return;
        if (sizeFilter   !== 'ALL' && row.size   !== sizeFilter)   return;
        if (ratingFilter !== 'ALL' && row.rating !== ratingFilter) return;
        if (searchQ && ![row.matCode, row.item, row.mat1, row.mat2, row.size].some(v => (v||'').toUpperCase().includes(searchQ))) return;
        list.push({ ...row, diffQty });
    });
    _sortByCatItemSize(list);

    _shortageList = list;
    _shortagePage = Math.min(_shortagePage, Math.max(1, Math.ceil(list.length / PAGE_SIZE)));
    const countEl = document.getElementById('shortageCount');
    if (countEl) countEl.textContent = list.length > 0 ? `${list.length} items` : '';

    if (list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;color:#666;padding:20px;">No shortage items found.</td></tr>';
        const sp = document.getElementById('shortagePagination'); if (sp) sp.innerHTML = '';
        return;
    }
    const start = (_shortagePage - 1) * PAGE_SIZE;
    tbody.innerHTML = list.slice(start, start + PAGE_SIZE)
        .map(r => _TABLE_ROW_TPL({ ...r, diffColor: '#d32f2f' })).join('');
    renderPagination('shortagePagination', _shortagePage, Math.max(1, Math.ceil(list.length / PAGE_SIZE)), 'goShortagePage');
}

function goShortagePage(p) {
    const total = Math.max(1, Math.ceil(_shortageList.length / PAGE_SIZE));
    if (p < 1 || p > total) return;
    _shortagePage = p;
    renderShortageTable();
}

// --- Surplus Material ---
let _surplusPage = 1;
let _surplusList = [];

async function renderSurplusTable() {
    const tbody = document.querySelector('#surplusTable tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const bomMap = _buildBomMap();
    const recMap = _buildRecMap();
    const masterMap = _buildMasterMap();
    const mat12Map = {};
    (await loadMssItemAgg()).forEach(r => { mat12Map[r.matCode] = { mat1: r.mat1, mat2: r.mat2 }; });
    const segToMat1 = _buildSegToMat1(mat12Map);

    const catFilter    = (document.getElementById('surplusCatFilter')    || {}).value || 'ALL';
    const itemFilter   = (document.getElementById('surplusItemFilter')   || {}).value || 'ALL';
    const mat1Filter   = (document.getElementById('surplusMat1Filter')   || {}).value || 'ALL';
    const mat2Filter   = (document.getElementById('surplusMat2Filter')   || {}).value || 'ALL';
    const sizeFilter   = (document.getElementById('surplusSizeFilter')   || {}).value || 'ALL';
    const ratingFilter = (document.getElementById('surplusRatingFilter') || {}).value || 'ALL';
    const searchQ      = ((document.getElementById('surplusSearch')      || {}).value || '').toUpperCase();

    const allMatCodes = new Set([...Object.keys(bomMap), ...Object.keys(recMap)]);
    const list = [];
    allMatCodes.forEach(matCode => {
        const row = _enrichRow(matCode, bomMap, recMap, masterMap, mat12Map, segToMat1);
        const diffQty = row.recQty - row.bomQty;
        if (diffQty <= 0.01) return;
        if (!['Pipe', 'Fitting', 'Others', 'Valve', 'Speciality'].includes(row.cat)) return;
        if (catFilter    !== 'ALL' && row.cat    !== catFilter)    return;
        if (itemFilter   !== 'ALL' && row.item   !== itemFilter)   return;
        if (mat1Filter   !== 'ALL' && row.mat1   !== mat1Filter)   return;
        if (mat2Filter   !== 'ALL' && row.mat2   !== mat2Filter)   return;
        if (sizeFilter   !== 'ALL' && row.size   !== sizeFilter)   return;
        if (ratingFilter !== 'ALL' && row.rating !== ratingFilter) return;
        if (searchQ && ![row.matCode, row.item, row.mat1, row.mat2, row.size].some(v => (v||'').toUpperCase().includes(searchQ))) return;
        list.push({ ...row, diffQty });
    });
    _sortByCatItemSize(list);

    _surplusList = list;
    _surplusPage = Math.min(_surplusPage, Math.max(1, Math.ceil(list.length / PAGE_SIZE)));
    const countEl = document.getElementById('surplusCount');
    if (countEl) countEl.textContent = list.length > 0 ? `${list.length} items` : '';

    if (list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;color:#666;padding:20px;">No surplus items found.</td></tr>';
        const sp = document.getElementById('surplusPagination'); if (sp) sp.innerHTML = '';
        return;
    }
    const start = (_surplusPage - 1) * PAGE_SIZE;
    tbody.innerHTML = list.slice(start, start + PAGE_SIZE)
        .map(r => _TABLE_ROW_TPL({ ...r, diffColor: '#1976d2' })).join('');
    renderPagination('surplusPagination', _surplusPage, Math.max(1, Math.ceil(list.length / PAGE_SIZE)), 'goSurplusPage');
}

function goSurplusPage(p) {
    const total = Math.max(1, Math.ceil(_surplusList.length / PAGE_SIZE));
    if (p < 1 || p > total) return;
    _surplusPage = p;
    renderSurplusTable();
}

function _exportDiffList(list, sheetName, filenamePrefix) {
    const rows = list.map(r => ({
        'Category':      r.cat,
        'MatCode / Tag': r.matCode,
        'Item':          r.itemDisplay,
        'Mat 1':         r.mat1,
        'Mat 2':         r.mat2,
        'Size':          r.size,
        'Rating':        r.rating,
        'Unit':          r.unit,
        'BOM QTY':       Math.round(r.bomQty),
        'Receiving QTY': Math.round(r.recQty),
        [`${filenamePrefix} QTY`]: Math.round(r.diffQty),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [12, 22, 18, 10, 14, 10, 10, 8, 12, 14, 14].map(w => ({ wch: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    const today = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `${filenamePrefix}_Export_${today}.xlsx`);
}

// ── Packing List Modal ─────────────────────────────────────────
window.openPackingListModal = function(pkgNo, packing) {
    const modal   = document.getElementById('plModal');
    const area    = document.getElementById('plPrintArea');
    if (!modal || !area) return;
    modal.style.display = 'flex';

    const isSpool = (_spoolShippingCache || []).some(s => s.pkg_no === pkgNo);
    const merged  = mergeRow({ pkg_no: pkgNo, packing, description: '', qty: 0, unit: '', purpose: '', status: '', on_site: '', custom_clear: '', issue_date: '', remark: '' });
    const today   = new Date().toISOString().slice(0, 10);

    const infoHtml = `
        <table style="width:100%;border-collapse:collapse;margin-bottom:6px;font-size:11pt;">
            <tr>
                <td style="width:50%;padding:4px 0;"><strong>Packing (PKG):</strong> ${packing}</td>
                <td style="width:50%;padding:4px 0;"><strong>Package No:</strong> ${pkgNo}</td>
            </tr>
            <tr>
                <td style="padding:4px 0;"><strong>Status:</strong> ${merged.status || '—'}</td>
                <td style="padding:4px 0;"><strong>On-Site Date:</strong> ${merged.on_site || '—'}</td>
            </tr>
            <tr>
                <td style="padding:4px 0;"><strong>Custom Clear:</strong> ${merged.custom_clear || '—'}</td>
                <td style="padding:4px 0;"><strong>Issue Date:</strong> ${merged.issue_date || '—'}</td>
            </tr>
        </table>`;

    let tableHtml = '';
    if (isSpool) {
        const rows = (_spoolShippingCache || []).filter(s => s.pkg_no === pkgNo);
        tableHtml = `<table style="width:100%;border-collapse:collapse;">
            <thead><tr style="background:#0A2540;color:#fff;">
                <th style="padding:6px;text-align:center;width:40px;">No</th>
                <th style="padding:6px;text-align:center;">System</th>
                <th style="padding:6px;text-align:left;">Description</th>
                <th style="padding:6px;text-align:center;">Unit</th>
                <th style="padding:6px;text-align:center;">Q'TY</th>
            </tr></thead>
            <tbody>${rows.map((r, i) => `<tr style="${i%2?'background:#f8fafc':''}">
                <td style="padding:5px;text-align:center;">${i+1}</td>
                <td style="padding:5px;text-align:center;">${r.system || '—'}</td>
                <td style="padding:5px;">${r.description || '—'}</td>
                <td style="padding:5px;text-align:center;">${r.unit || 'EA'}</td>
                <td style="padding:5px;text-align:center;font-weight:600;">${r.qty ?? '—'}</td>
            </tr>`).join('')}</tbody>
        </table>`;
    } else {
        const rows = db.receiving.filter(r => r.plNo === pkgNo);
        tableHtml = `<table style="width:100%;border-collapse:collapse;">
            <thead><tr style="background:#0A2540;color:#fff;">
                <th style="padding:6px;text-align:center;width:36px;">No</th>
                <th style="padding:6px;text-align:center;min-width:90px;">Tag</th>
                <th style="padding:6px;text-align:center;min-width:80px;">Item</th>
                <th style="padding:6px;text-align:left;">Description</th>
                <th style="padding:6px;text-align:center;min-width:80px;">Material</th>
                <th style="padding:6px;text-align:center;min-width:60px;">Size</th>
                <th style="padding:6px;text-align:center;">Unit</th>
                <th style="padding:6px;text-align:center;">Q'TY</th>
            </tr></thead>
            <tbody>${rows.map((r, i) => {
                const parts = (r.matCode || '').split('-');
                const item  = window.extractItemFromMatCode(r.matCode) || '—';
                const matl  = parts[1] || '—';
                const size  = window.extractSizeFromMatCode(r.matCode) || parts[2] || '—';
                return `<tr style="${i%2?'background:#f8fafc':''}">
                <td style="padding:5px;text-align:center;">${i+1}</td>
                <td style="padding:5px;text-align:center;font-size:10px;">${r.tag || '—'}</td>
                <td style="padding:5px;text-align:center;">${item}</td>
                <td style="padding:5px;">${r.desc || '—'}</td>
                <td style="padding:5px;text-align:center;">${matl}</td>
                <td style="padding:5px;text-align:center;">${size}</td>
                <td style="padding:5px;text-align:center;">${r.unit || '—'}</td>
                <td style="padding:5px;text-align:center;font-weight:600;">${r.qty ?? '—'}</td>
            </tr>`;}).join('')}</tbody>
        </table>`;
    }

    area.innerHTML = `
        <div style="padding:24px 28px;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;">
                <div>
                    <div style="font-size:20px;font-weight:800;color:#0A2540;letter-spacing:0.5px;">PACKING LIST</div>
                    <div style="font-size:11px;color:#888;margin-top:3px;">CCGT Material Control System</div>
                </div>
                <div style="text-align:right;font-size:11px;color:#666;">
                    <div>Date: ${today}</div>
                    <div>Items: ${isSpool
                        ? (_spoolShippingCache||[]).filter(s=>s.pkg_no===pkgNo).length
                        : db.receiving.filter(r=>r.plNo===pkgNo).length}</div>
                </div>
            </div>
            <hr style="border:none;border-top:2px solid #0A2540;margin-bottom:14px;">
            ${infoHtml}
            <hr style="border:none;border-top:1px solid #c8cfe0;margin:10px 0 14px;">
            ${tableHtml}
        </div>`;
};

window.printPlModal = function() {
    window.print();
};

// plModal 닫기 — 배경 클릭
document.addEventListener('click', e => {
    const modal = document.getElementById('plModal');
    if (modal && e.target === modal) modal.style.display = 'none';
});


// --- 2. MatCode Master ---
function renderMatCodeMaster() {
    let tbody = document.querySelector('#matCodeTable tbody');
    if (!tbody) return;
    if (db.matCodeMaster.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:20px;color:#888;">No Master Data available.</td></tr>';
        return;
    }
    const q    = (document.getElementById('masterSearch')?.value || '').toUpperCase();
    const cat  = document.getElementById('masterCatFilter')?.value  || 'All';
    const item = document.getElementById('masterItemFilter')?.value || 'All';
    const size = document.getElementById('masterSizeFilter')?.value || 'All';

    const _mcCatOrd = ['Pipe', 'Fitting', 'Others'];
    const _mcDCode  = mc => { const m = mc.match(/D(\d+)/); return m ? parseInt(m[1]) : 0; };

    const data = db.matCodeMaster.filter(m => {
        if (q && !m.matCode.includes(q) && !m.itemDesc.toUpperCase().includes(q) &&
            !m.matlDesc.toUpperCase().includes(q) && !m.category.toUpperCase().includes(q)) return false;
        if (cat  !== 'All' && m.category !== cat) return false;
        if (item !== 'All' && window.extractItemFromMatCode(m.matCode) !== item) return false;
        if (size !== 'All' && window.extractSizeFromMatCode(m.matCode) !== size) return false;
        return true;
    }).sort((a, b) => {
        const ca = _mcCatOrd.indexOf(a.category), cb = _mcCatOrd.indexOf(b.category);
        if (ca !== cb) return (ca < 0 ? 99 : ca) - (cb < 0 ? 99 : cb);
        if (a.itemDesc !== b.itemDesc) return a.itemDesc.localeCompare(b.itemDesc);
        return _mcDCode(b.matCode) - _mcDCode(a.matCode);
    });

    const mcTotalPages = Math.max(1, Math.ceil(data.length / PAGE_SIZE));
    if (_matCodePage > mcTotalPages) _matCodePage = 1;
    const mcStart = (_matCodePage - 1) * PAGE_SIZE;
    const pageData = data.slice(mcStart, mcStart + PAGE_SIZE);

    const recDescMap = {};
    db.receiving.forEach(r => { if (r.matCode && !recDescMap[r.matCode]) recDescMap[r.matCode] = r.desc; });

    tbody.innerHTML = pageData.map(m => {
        const cb = getCatBadge(m.category);
        const fullDesc = db.bomDesc[m.matCode.trim().toUpperCase()]
            || recDescMap[m.matCode]
            || [m.itemDesc, m.matlDesc, m.size2, m.classDesc, m.etDesc].filter(v => v && v !== '-').join(', ')
            || '-';
        return `<tr>
            <td style="text-align:center;"><strong><span class="status-badge ok">${m.matCode}</span></strong></td>
            <td style="text-align:center;"><span class="status-badge ${cb}">${m.category}</span></td>
            <td style="text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${fullDesc}">${fullDesc}</td>
            <td style="text-align:center;">${m.itemDesc}</td>
            <td style="text-align:center;">${m.matlDesc}</td>
            <td style="text-align:center;">${m.size1}</td>
            <td style="text-align:center;">${m.size2}</td>
            <td style="text-align:center;">${m.classDesc}</td>
            <td style="text-align:center;">${m.etDesc}</td>
        </tr>`;
    }).join('');

    const info = document.getElementById('masterInfo');
    if (info) info.textContent = `${data.length} / ${db.matCodeMaster.length} items`;
    renderPagination('matCodePagination', _matCodePage, mcTotalPages, '_matCodeGoPage');
}
let _matCodePage = 1;
window._matCodeGoPage = function(p) { _matCodePage = p; renderMatCodeMaster(); };

// --- 3. BOM & Receiving Paginations ---
let currentBomPage = 1;
let currentVendorPage = 1;
let _bomActiveTab = 'piping'; // 'piping' | 'fitting' | 'others'
let currentPlPage = 1;
let currentSrecPage = 1;

// Category/Item/Size 필터 공통 헬퍼
function getBomItemsForCat(cat) {
    if (cat === 'Speciality') return db.specialityItems.slice();
    const src = (cat === 'All' || cat === 'ALL') ? db.bom : db.bom.filter(b => b.category === cat);
    const set = new Set(src.map(b => window.extractItemFromMatCode(b.matCode)).filter(v => v && v !== '-'));
    if (cat === 'All' || cat === 'ALL' || cat === 'Valve') {
        // Valve는 mat_code가 없어(Tag로만 매칭) MatCode 접두사 기반 자동 추출이 안 됨 — 고정 목록 사용
        set.add('GATE VALVE'); set.add('GLOBE VALVE'); set.add('CHECK VALVE');
        set.add('BUTTERFLY VALVE'); set.add('BALL VALVE');
        set.add('BYPASS VALVE'); set.add('CONTROL VALVE'); set.add('SAFETY VALVE');
    }
    return [...set].sort();
}
function getBomSizesForCatItem(cat, item) {
    if (cat === 'Speciality') return [];
    let src = (cat === 'All' || cat === 'ALL') ? db.bom : db.bom.filter(b => b.category === cat);
    if (item !== 'All' && item !== 'ALL') src = src.filter(b => window.extractItemFromMatCode(b.matCode) === item);
    return [...new Set(src.map(b => window.extractSizeFromMatCode(b.matCode)).filter(v => v && v !== '-'))].sort((a, b) => parseFloat(a) - parseFloat(b));
}
function getMasterItemsForCat(cat) {
    const src = cat === 'All' ? db.matCodeMaster : db.matCodeMaster.filter(m => (m.category || '') === cat);
    return [...new Set(src.map(m => window.extractItemFromMatCode(m.matCode)).filter(v => v && v !== '-'))].sort();
}
function getMasterSizesForCatItem(cat, item) {
    let src = cat === 'All' ? db.matCodeMaster : db.matCodeMaster.filter(m => (m.category || '') === cat);
    if (item !== 'All') src = src.filter(m => window.extractItemFromMatCode(m.matCode) === item);
    return [...new Set(src.map(m => window.extractSizeFromMatCode(m.matCode)).filter(v => v && v !== '-'))].sort((a, b) => parseFloat(a) - parseFloat(b));
}
function setupCatItemSize(catEl, itemEl, sizeEl, getItems, getSizes, allVal) {
    const fillItem = (cat) => {
        if (!itemEl) return;
        const items = getItems(cat);
        itemEl.innerHTML = `<option value="${allVal}">All Items</option>` + items.map(i => `<option value="${i.replace(/"/g, '&quot;')}">${i}</option>`).join('');
    };
    const fillSize = (cat, item) => {
        if (!sizeEl) return;
        const sizes = getSizes(cat, item);
        sizeEl.innerHTML = `<option value="${allVal}">All Sizes</option>` + sizes.map(s => `<option value="${s.replace(/"/g, '&quot;')}">${s}</option>`).join('');
    };
    fillItem(allVal);
    fillSize(allVal, allVal);
    if (catEl) catEl.addEventListener('change', () => {
        fillItem(catEl.value);
        fillSize(catEl.value, allVal);
    });
    if (itemEl) itemEl.addEventListener('change', () => {
        fillSize(catEl ? catEl.value : allVal, itemEl.value);
    });
}

function initFilterOptions() {
    // BOM Filters
    const bomSys = document.getElementById('bomSystemFilter');
    const bomItemF = document.getElementById('bomItemFilter');
    const bomSizeF = document.getElementById('bomSizeFilter');

    if(bomSys) {
        const systems = [...new Set(db.bom.map(b => b.system).filter(Boolean))].sort();

        bomSys.innerHTML = '<option value="All">All Systems</option>' + systems.map(s => `<option value="${s}">${s}</option>`).join('');

        // 탭 기반 Item → Size 연동 (Category는 _bomActiveTab이 결정)
        if (bomItemF) {
            bomItemF.addEventListener('change', () => {
                const TAB_CAT = { piping: 'Pipe', fitting: 'Fitting', others: 'Others' };
                const cat = TAB_CAT[_bomActiveTab] || 'Pipe';
                const sizes = getBomSizesForCatItem(cat, bomItemF.value);
                if (bomSizeF) bomSizeF.innerHTML = '<option value="All">All Sizes</option>'
                    + sizes.map(s => `<option value="${s.replace(/"/g, '&quot;')}">${s}</option>`).join('');
            });
        }
        refreshBomItemFilter();
    }

    // Support Receiving 필터 — pkg / package_no / system / support_tag 동적 로드
    (async () => {
        const srecSys = document.getElementById('srecSystemFilter');
        if (!srecSys) return;

        const stripType = tag => tag ? tag.replace(/\([^)]+\)$/, '') : tag;
        const el = id => document.getElementById(id);

        const rebuildIsoFilter = (rows) => {
            const isos = [...new Set(rows.map(r => r.iso_dwg_no).filter(Boolean))].sort();
            if (el('srecIsoFilter'))
                el('srecIsoFilter').innerHTML = '<option value="All">All ISOs</option>' + isos.map(v => `<option value="${v}">${v}</option>`).join('');
        };

        const rebuildTagFilter = (rows) => {
            const tags = [...new Set(rows.map(r => stripType(r.support_tag)).filter(Boolean))].sort();
            if (el('srecTagFilter'))
                el('srecTagFilter').innerHTML = '<option value="All">All Support No</option>' + tags.map(v => `<option value="${v.replace(/"/g, '&quot;')}">${v}</option>`).join('');
        };

        // System 변경 → ISO 필터 갱신 → Support No 필터 갱신
        srecSys.addEventListener('change', () => {
            const selSys = srecSys.value;
            const bySystem = selSys === 'All'
                ? (window._srecAllRows || [])
                : (window._srecAllRows || []).filter(r => r.system === selSys);
            rebuildIsoFilter(bySystem);
            rebuildTagFilter(bySystem);
        });

        // ISO 변경 → Support No 필터 갱신
        const isoEl = el('srecIsoFilter');
        if (isoEl) {
            isoEl.addEventListener('change', () => {
                const selSys = srecSys.value;
                const selIso = isoEl.value;
                let rows = window._srecAllRows || [];
                if (selSys !== 'All') rows = rows.filter(r => r.system === selSys);
                if (selIso !== 'All') rows = rows.filter(r => r.iso_dwg_no === selIso);
                rebuildTagFilter(rows);
            });
        }

        try {
            // support_receiving은 14,000행 안팎이라 PostgREST 서버 기본 row cap(10,000)에 걸림
            // -> range로 청크 분할 조회(단일 .limit()으로는 cap을 못 넘음, 2026-08-22 support_bom에서 동일 버그 발견)
            let data = [], from = 0;
            const CHUNK = 5000;
            while (true) {
                const { data: chunk, error: chunkErr } = await supabaseClient.from('support_receiving')
                    .select('pkg,package_no,system,iso_dwg_no,support_tag')
                    .not('system', 'is', null)
                    .range(from, from + CHUNK - 1);
                if (chunkErr) throw chunkErr;
                data = data.concat(chunk || []);
                if (!chunk || chunk.length < CHUNK) break;
                from += CHUNK;
            }

            window._srecAllRows = data;

            const pkgs       = [...new Set(data.map(r => r.pkg).filter(Boolean))].sort();
            const packageNos = [...new Set(data.map(r => r.package_no).filter(Boolean))].sort();
            const systems    = [...new Set(data.map(r => r.system).filter(Boolean))].sort();

            if (el('srecPkgFilter'))
                el('srecPkgFilter').innerHTML = '<option value="All">All PKGs</option>' + pkgs.map(v => `<option value="${v}">${v}</option>`).join('') + '<option value="NULL">(Unassigned PKG)</option>';
            if (el('srecPackageNoFilter'))
                el('srecPackageNoFilter').innerHTML = '<option value="All">All Package No</option>' + packageNos.map(v => `<option value="${v}">${v}</option>`).join('');
            srecSys.innerHTML = '<option value="All">All Systems</option>' + systems.map(s => `<option value="${s}">${s}</option>`).join('');
            rebuildIsoFilter(data);
            rebuildTagFilter(data);
        } catch(e) { console.error('Support Receiving filter init failed:', e); }
    })();

    // Shortage/Surplus Mat1/Mat2/Rating 필터 공용 초기화 헬퍼
    const initShortSurplusMatl = (catEl, itemEl, mat1El, mat2El, sizeEl, ratingEl, allVal) => {
        if (!itemEl) return;
        setupCatItemSize(catEl, itemEl, sizeEl, getBomItemsForCat, getBomSizesForCatItem, allVal);
        const refreshMatl = async () => {
            const cat = catEl ? (catEl.value || 'ALL') : 'ALL';

            // Valve/Speciality는 mat_code가 없어 loadMssItemAgg()(MatCode 기준) 대상이 아님 —
            // db.bomTagMap(Tag→mat1/mat2/full_description)에서 직접 집계
            if (cat === 'Valve' || cat === 'Speciality') {
                const vals1 = new Set(), vals2 = new Set(), ratings = new Set();
                db.bom.forEach(b => {
                    if (b.category !== cat || b.matCode) return;
                    const info = db.bomTagMap[b.key] || {};
                    if (info.mat1) vals1.add(info.mat1);
                    if (info.mat2) vals2.add(info.mat2);
                    const rt = getRatingForMatCode(null, null, info.fullDescription);
                    if (rt && rt !== '-') ratings.add(rt);
                });
                if (mat1El) mat1El.innerHTML = `<option value="${allVal}">All Mat 1</option>` + [...vals1].sort().map(v => `<option value="${v}">${v}</option>`).join('');
                if (mat2El) mat2El.innerHTML = `<option value="${allVal}">All Mat 2</option>` + [...vals2].sort().map(v => `<option value="${v}">${v}</option>`).join('');
                if (ratingEl) ratingEl.innerHTML = `<option value="${allVal}">All Ratings</option>` + [...ratings].sort().map(v => `<option value="${v}">${v}</option>`).join('');
                return;
            }

            const agg = (await loadMssItemAgg()).filter(r => cat === 'ALL' || r.category === cat);

            if (mat1El) {
                const vals1 = [...new Set(agg.map(r => r.mat1).filter(Boolean))].sort();
                mat1El.innerHTML = `<option value="${allVal}">All Mat 1</option>` + vals1.map(v => `<option value="${v}">${v}</option>`).join('');
            }
            if (mat2El) {
                const vals2 = [...new Set(agg.map(r => r.mat2).filter(Boolean))].sort();
                mat2El.innerHTML = `<option value="${allVal}">All Mat 2</option>` + vals2.map(v => `<option value="${v}">${v}</option>`).join('');
            }
            if (ratingEl) {
                const masterMap = _buildMasterMap();
                const ratings = [...new Set(
                    db.bom.filter(b => cat === 'ALL' || b.category === cat)
                          .map(b => getRatingForMatCode(b.matCode, masterMap)).filter(v => v && v !== '-')
                )].sort();
                ratingEl.innerHTML = `<option value="${allVal}">All Ratings</option>` + ratings.map(r => `<option value="${r}">${r}</option>`).join('');
            }
        };
        refreshMatl();
        if (catEl) catEl.addEventListener('change', refreshMatl);
    };

    // Shortage Filters
    if (document.getElementById('shortItemFilter') && db.bom.length > 0) {
        initShortSurplusMatl(
            document.getElementById('shortCatFilter'),
            document.getElementById('shortItemFilter'),
            document.getElementById('shortMat1Filter'),
            document.getElementById('shortMat2Filter'),
            document.getElementById('shortSizeFilter'),
            document.getElementById('shortRatingFilter'), 'ALL'
        );
    }

    // Surplus Filters
    if (document.getElementById('surplusItemFilter') && db.bom.length > 0) {
        initShortSurplusMatl(
            document.getElementById('surplusCatFilter'),
            document.getElementById('surplusItemFilter'),
            document.getElementById('surplusMat1Filter'),
            document.getElementById('surplusMat2Filter'),
            document.getElementById('surplusSizeFilter'),
            document.getElementById('surplusRatingFilter'), 'ALL'
        );
    }

    // MatCode Master Filters (BOM/Receiving과 동일하게 MatCode 파싱 함수 사용)
    const mCat  = document.getElementById('masterCatFilter');
    const mItem = document.getElementById('masterItemFilter');
    const mSize = document.getElementById('masterSizeFilter');
    if (mCat && db.matCodeMaster.length > 0) {
        const CAT_ORDER = ['Pipe', 'Fitting', 'Others'];
        const cats  = [...new Set(db.matCodeMaster.map(m => m.category).filter(Boolean))]
            .sort((a, b) => { const ia = CAT_ORDER.indexOf(a), ib = CAT_ORDER.indexOf(b); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib); });
        mCat.innerHTML  = '<option value="All">All Categories</option>' + cats.map(c => `<option value="${c}">${c}</option>`).join('');

        setupCatItemSize(mCat, mItem, mSize, getMasterItemsForCat, getMasterSizesForCatItem, 'All');
    }

    // Receiving 단일 패스 분류 (5회 반복 filter → 1회 forEach)
    const recByCat = { Pipe: [], Fitting: [], Others: [], Valve: [], Speciality: [] };
    db.receiving.forEach(r => {
        if (isSpareBodyRow(r)) return;
        if (isReceivingActive(r.plNo) && recByCat[r.category]) recByCat[r.category].push(r);
    });

    const setDocPkg = (docEl, pkgEl, rows) => {
        const docs = [...new Set(rows.map(r => r.docNo))].sort();
        const pkgs = [...new Set(rows.map(r => r.plNo))].sort();
        docEl.innerHTML = '<option value="All">All DOCs</option>' + docs.map(d => `<option value="${d}">${d}</option>`).join('');
        pkgEl.innerHTML = '<option value="All">All PKGs</option>' + pkgs.map(p => `<option value="${p}">${p}</option>`).join('');
    };

    // PL Filters (Pipe) — catEl이 없는 고정 카테고리 탭이라 getItems/getSizes를 해당 카테고리로 고정해서 넘김
    // (그냥 getBomItemsForCat을 넘기면 내부적으로 cat='All'로 호출돼 전체 카테고리 Item이 섞여 나오는 버그가 있었음)
    const plDoc = document.getElementById('plDocFilter'), plPkg = document.getElementById('plPkgFilter');
    if (plDoc && plPkg) {
        setDocPkg(plDoc, plPkg, recByCat.Pipe);
        setupCatItemSize(null, document.getElementById('plItemFilter'), document.getElementById('plSizeFilter'),
            () => getBomItemsForCat('Pipe'), (cat, item) => getBomSizesForCatItem('Pipe', item), 'All');
    }

    // Fitting Filters
    const fitDoc = document.getElementById('fitDocFilter'), fitPkg = document.getElementById('fitPkgFilter');
    if (fitDoc && fitPkg) {
        setDocPkg(fitDoc, fitPkg, recByCat.Fitting);
        setupCatItemSize(null, document.getElementById('fitItemFilter'), document.getElementById('fitSizeFilter'),
            () => getBomItemsForCat('Fitting'), (cat, item) => getBomSizesForCatItem('Fitting', item), 'All');
    }

    // Others Filters
    const othDoc = document.getElementById('othDocFilter'), othPkg = document.getElementById('othPkgFilter');
    if (othDoc && othPkg) {
        setDocPkg(othDoc, othPkg, recByCat.Others);
        setupCatItemSize(null, document.getElementById('othItemFilter'), document.getElementById('othSizeFilter'),
            () => getBomItemsForCat('Others'), (cat, item) => getBomSizesForCatItem('Others', item), 'All');
    }

    // Valve Filters
    const valDoc = document.getElementById('valDocFilter'), valPkg = document.getElementById('valPkgFilter');
    if (valDoc && valPkg) setDocPkg(valDoc, valPkg, recByCat.Valve);
    const _tagSize = r => {
        const ti = db.bomTagMap[(r.tag || '').toUpperCase()];
        const effM = r.matCode || (ti ? ti.matCode : '');
        const ms = window.extractSizeFromMatCode(effM);
        return (ms && ms !== '-') ? ms : window.extractSizeFromLineNo(ti?.lineNo);
    };
    const _tagItem = r => {
        const ti = db.bomTagMap[(r.tag || '').toUpperCase()];
        const effM = r.matCode || (ti ? ti.matCode : '');
        const bd   = ti ? ti.fullDescription : '';
        const mi   = window.extractItemFromMatCode(effM);
        const raw  = (mi && mi !== '-') ? mi : window.extractItemFromDesc(bd || r.desc);
        return (r.plNo || '').toUpperCase().includes('BYPS') ? 'BYPASS VALVE' : raw;
    };

    // Item/Size는 Valve 자체 필드(valveType/size)에서 직접 뽑음 — MatCode 없이도 안정적으로 동작
    const valItemEl = document.getElementById('valItemFilter');
    if (valItemEl) {
        const items = [...new Set(recByCat.Valve.map(r => window.extractItemFromDesc(r.valveType)).filter(v => v && v !== '-'))].sort();
        valItemEl.innerHTML = '<option value="All">All Items</option>'
            + items.map(i => `<option value="${i.replace(/"/g,'&quot;')}">${i}</option>`).join('');
    }
    const valSizeEl = document.getElementById('valSizeFilter');
    if (valSizeEl) {
        const sizes = [...new Set(recByCat.Valve.map(r => r.size).filter(v => v && v !== '-'))]
            .sort((a, b) => parseFloat(a) - parseFloat(b));
        valSizeEl.innerHTML = '<option value="All">All Sizes</option>'
            + sizes.map(s => `<option value="${s.replace(/"/g,'&quot;')}">${s}</option>`).join('');
    }
    const valOpTypeEl = document.getElementById('valOpTypeFilter');
    if (valOpTypeEl) {
        const opTypes = [...new Set(recByCat.Valve.map(r => r.opType).filter(v => v && v !== '-'))].sort();
        valOpTypeEl.innerHTML = '<option value="All">All Op. Types</option>'
            + opTypes.map(o => `<option value="${o.replace(/"/g,'&quot;')}">${o}</option>`).join('');
    }
    const valMat1El = document.getElementById('valMat1Filter');
    if (valMat1El) {
        const mat1s = [...new Set(recByCat.Valve.map(r => r.mat1).filter(v => v && v !== '-'))].sort();
        valMat1El.innerHTML = '<option value="All">All Mat 1</option>'
            + mat1s.map(m => `<option value="${m.replace(/"/g,'&quot;')}">${m}</option>`).join('');
    }
    const valMat2El = document.getElementById('valMat2Filter');
    if (valMat2El) {
        const mat2s = [...new Set(recByCat.Valve.map(r => r.mat2).filter(v => v && v !== '-'))].sort();
        valMat2El.innerHTML = '<option value="All">All Mat 2</option>'
            + mat2s.map(m => `<option value="${m.replace(/"/g,'&quot;')}">${m}</option>`).join('');
    }

    // Speciality Filters
    const splDoc = document.getElementById('splDocFilter'), splPkg = document.getElementById('splPkgFilter');
    if (splDoc && splPkg) setDocPkg(splDoc, splPkg, recByCat.Speciality);
    const splItemEl = document.getElementById('splItemFilter');
    if (splItemEl) {
        const items = [...new Set(recByCat.Speciality.map(_tagItem).filter(v => v && v !== '-'))].sort();
        splItemEl.innerHTML = '<option value="All">All Items</option>'
            + items.map(i => `<option value="${i.replace(/"/g,'&quot;')}">${i}</option>`).join('');
    }
    const splSizeEl = document.getElementById('splSizeFilter');
    if (splSizeEl) {
        const sizes = [...new Set(recByCat.Speciality.map(_tagSize).filter(v => v && v !== '-'))]
            .sort((a, b) => parseFloat(a) - parseFloat(b));
        splSizeEl.innerHTML = '<option value="All">All Sizes</option>'
            + sizes.map(s => `<option value="${s.replace(/"/g,'&quot;')}">${s}</option>`).join('');
    }

    // Spare Filters — Valve/Speciality의 SPARE 합성 태그 예비 본체만 별도 집계
    const spareRows = db.receiving.filter(r => isReceivingActive(r.plNo) && isSpareBodyRow(r));
    const sprDoc = document.getElementById('sprDocFilter'), sprPkg = document.getElementById('sprPkgFilter');
    if (sprDoc && sprPkg) setDocPkg(sprDoc, sprPkg, spareRows);
    const sprItemEl = document.getElementById('sprItemFilter');
    if (sprItemEl) {
        const items = [...new Set(spareRows.map(r => window.extractItemFromDesc(r.valveType)).filter(v => v && v !== '-'))].sort();
        sprItemEl.innerHTML = '<option value="All">All Items</option>'
            + items.map(i => `<option value="${i.replace(/"/g,'&quot;')}">${i}</option>`).join('');
    }
    const sprSizeEl = document.getElementById('sprSizeFilter');
    if (sprSizeEl) {
        const sizes = [...new Set(spareRows.map(r => r.size).filter(v => v && v !== '-'))]
            .sort((a, b) => parseFloat(a) - parseFloat(b));
        sprSizeEl.innerHTML = '<option value="All">All Sizes</option>'
            + sizes.map(s => `<option value="${s.replace(/"/g,'&quot;')}">${s}</option>`).join('');
    }
    const sprOpTypeEl = document.getElementById('sprOpTypeFilter');
    if (sprOpTypeEl) {
        const opTypes = [...new Set(spareRows.map(r => r.opType).filter(v => v && v !== '-'))].sort();
        sprOpTypeEl.innerHTML = '<option value="All">All Op. Types</option>'
            + opTypes.map(o => `<option value="${o.replace(/"/g,'&quot;')}">${o}</option>`).join('');
    }
    const sprMat1El = document.getElementById('sprMat1Filter');
    if (sprMat1El) {
        const mat1s = [...new Set(spareRows.map(r => r.mat1).filter(v => v && v !== '-'))].sort();
        sprMat1El.innerHTML = '<option value="All">All Mat 1</option>'
            + mat1s.map(m => `<option value="${m.replace(/"/g,'&quot;')}">${m}</option>`).join('');
    }
    const sprMat2El = document.getElementById('sprMat2Filter');
    if (sprMat2El) {
        const mat2s = [...new Set(spareRows.map(r => r.mat2).filter(v => v && v !== '-'))].sort();
        sprMat2El.innerHTML = '<option value="All">All Mat 2</option>'
            + mat2s.map(m => `<option value="${m.replace(/"/g,'&quot;')}">${m}</option>`).join('');
    }

}


function _bomTabCategory() {
    const TAB_CAT = { piping: 'Pipe', fitting: 'Fitting', valve: 'Valve', speciality: 'Speciality', others: 'Others' };
    return TAB_CAT[_bomActiveTab] || 'Pipe';
}

// BOM 탭(Piping/Fitting/Valve/Speciality/Others) 공용 필터 — 화면 렌더러와 Export 버튼이
// 동일하게 사용해 "화면엔 필터 걸었는데 Export는 전체가 나오는" 불일치를 원천 차단
function _applyBomTabFilters(q) {
    const search  = (document.getElementById('bomIsoSearch')?.value || '').trim();
    const sys     = document.getElementById('bomSystemFilter')?.value || 'All';
    const cat     = _bomTabCategory();
    const item    = document.getElementById('bomItemFilter')?.value || 'All';
    const mat1    = document.getElementById('bomMat1Filter')?.value || 'All';
    const mat2    = document.getElementById('bomMat2Filter')?.value || 'All';
    const size    = document.getElementById('bomSizeFilter')?.value || 'All';
    const rating  = document.getElementById('bomRatingFilter')?.value || 'All';

    if (sys  !== 'All') q = q.eq('system', sys);
    if (search) q = q.or(`iso_dwg_no.ilike.%${search}%,mat_code.ilike.%${search}%,category.ilike.%${search}%,full_description.ilike.%${search}%,tag.ilike.%${search}%`);
    if (cat  !== 'All') q = q.eq('category', cat);
    if (mat1 !== 'All') q = q.eq('mat1', mat1);
    if (mat2 !== 'All') q = q.eq('mat2', mat2);
    if (item !== 'All') {
        if (item === 'CONTROL VALVE') {
            q = q.or('tag.ilike.%-TCV-%,tag.ilike.%-LCV-%,tag.ilike.%-FCV-%,tag.ilike.%-PCV-%,tag.ilike.%-FV-%');
        } else if (item === 'SAFETY VALVE') {
            q = q.or('tag.ilike.%-PSV%,tag.ilike.%-PRV%,mat_code.ilike.PSV-*,mat_code.ilike.PRV-*');
        } else {
            const prefixes = ITEM_PREFIX_MAP[item];
            // Valve/Speciality는 mat_code가 없어(Tag로만 매칭) prefix 검색이 항상 무효 — Description으로 대체
            if (cat !== 'Valve' && cat !== 'Speciality' && prefixes && prefixes.length > 0) {
                q = q.or(prefixes.map(p => `mat_code.ilike.${p}-*`).join(','));
            } else {
                q = q.ilike('full_description', `%${item}%`);
            }
        }
    }
    if (size !== 'All') {
        if (cat === 'Others') {
            // GSKT/STB는 D-code가 없고 MatCode에 사이즈(볼트는 Size+길이)가 그대로 박혀있음
            const m = size.match(/^([\d\/\-]+)"(?:x(\d+)mm)?$/);
            if (m) q = q.ilike('mat_code', m[2] ? `%-${m[1]}"x${m[2]}%` : `%-${m[1]}"%`);
        } else {
            const toD = v => 'D' + Math.round(parseFloat(v) * 10).toString().padStart(3, '0');
            const dualMatch = size.match(/([\d.]+)"×([\d.]+)"/);
            if (dualMatch) {
                q = q.ilike('mat_code', `%${toD(dualMatch[1])}${toD(dualMatch[2])}%`);
            } else {
                const single = size.match(/([\d.]+)"/);
                if (single) q = q.ilike('mat_code', `%-${toD(single[1])}-%`);
            }
        }
    }
    if (rating !== 'All') {
        // Valve/Speciality는 mat_code가 없어 Rating이 mat_code 세그먼트가 아닌 Description(CL150, 300# 등)에만 존재
        if (cat === 'Valve' || cat === 'Speciality') {
            q = q.ilike('full_description', `%${rating}%`);
        } else {
            const codes = [...(getRatingMatCodesForCat(cat)[rating] || [])];
            q = q.in('mat_code', codes.length ? codes : ['__NONE__']);
        }
    }
    return q;
}

async function renderBomTable() {
    let tbody = document.querySelector('#bomTable tbody');
    if(!tbody) return;
    tbody.innerHTML = '<tr><td colspan="12" style="text-align:center;padding:20px;color:#888;">Loading...</td></tr>';

    const applyFilters = _applyBomTabFilters;

    // 데이터 쿼리 + COUNT 쿼리를 병렬 실행
    const dataQ  = applyFilters(
        supabaseClient.from('bom_detail')
            .select('mat_code, category, system, iso_dwg_no, line_no, tag, full_description, uom, qty, mat1, mat2')
            .range((currentBomPage - 1) * PAGE_SIZE, currentBomPage * PAGE_SIZE - 1)
            .order('system', { ascending: true, nullsFirst: false })
            .order('iso_dwg_no', { ascending: true, nullsFirst: false })
    );
    const countQ = applyFilters(
        supabaseClient.from('bom_detail')
            .select('*', { count: 'exact', head: true })
    );

    const [dataRes, countRes] = await Promise.all([dataQ, countQ]);
    if (dataRes.error) {
        tbody.innerHTML = `<tr><td colspan="12" style="color:red;text-align:center;">Error: ${dataRes.error.message}</td></tr>`;
        return;
    }

    const allFetched = dataRes.data || [];
    const hasMore = allFetched.length > PAGE_SIZE;
    const data = allFetched.slice(0, PAGE_SIZE);
    const count = countRes.count;

    // HEAD count 쿼리가 null이면 hasMore 기반 추정값 사용
    const totalCount = (count != null)
        ? count
        : ((currentBomPage - 1) * PAGE_SIZE + data.length + (hasMore ? PAGE_SIZE : 0));

    const masterMap = _buildMasterMap();
    tbody.innerHTML = data.map(b => {
        const isAuto = (b.mat_code || '').includes('NEW-MAT');
        const badgeClass = isAuto ? 'warn' : 'ok';
        const desc = (b.full_description || '-').replace(/_/g, '-');
        // GSKT/STB는 D-code가 없고 Line No(배관 사이즈)도 실제 자재 사이즈와 다르므로
        // MatCode에 박힌 사이즈(볼트는 Size+길이)를 직접 사용 — 그래야 품목을 정확히 구분 가능
        const matUpper = (b.mat_code || '').toUpperCase();
        let size = (matUpper.startsWith('GSKT') || matUpper.startsWith('STB'))
            ? window.extractSizeLengthFromMatCode(b.mat_code)
            : window.extractSizeFromMatCode(b.mat_code);
        // Valve는 Line No가 밸브 자체 규격이 아니라 설치된 호스트 배관 사이즈일 수 있어
        // (예: 6" 라인의 1" 드레인 밸브) Line No보다 Description의 DN 표기를 우선 사용
        if (size === '-' && b.category === 'Valve') {
            size = window.extractDnSizeFromDesc(b.full_description) || '-';
        }
        if (size === '-' && b.line_no) {
            size = window.extractSizeFromLineNo(b.line_no);
        }
        if (size === '-' && b.full_description) {
            size = window.extractDnSizeFromDesc(b.full_description) || window.extractSizeFromDesc(b.full_description);
        }
        const item = window.extractItemFromDesc(desc);
        // Steam Trap: description에 사이즈 정보 없을 때 기본값 1" (확인된 사실)
        if (size === '-' && /STEAM TRAP/i.test(item)) size = '1"';
        const mat1Val = b.mat1 || '-';
        const mat2Val = b.mat2 || '-';
        const rating = getRatingForMatCode(b.mat_code, masterMap, b.full_description);
        // Valve/Speciality는 MatCode 없이 Tag로만 매칭 — 첫 컬럼에 Tag를 대신 표시
        const codeDisplay = b.mat_code || b.tag || '-';
        return `<tr>
            <td style="text-align:center;white-space:nowrap;"><span class="status-badge ${badgeClass}">${codeDisplay}</span></td>
            <td style="text-align:center;white-space:nowrap;">${b.system || '-'}</td>
            <td style="text-align:center;white-space:nowrap;">${b.iso_dwg_no || '-'}</td>
            <td style="text-align:center;white-space:nowrap;">${b.line_no || '-'}</td>
            <td style="text-align:center;font-weight:600;white-space:nowrap;">${item}</td>
            <td style="text-align:center;white-space:nowrap;">${mat1Val}</td>
            <td style="text-align:center;white-space:nowrap;">${mat2Val}</td>
            <td style="text-align:center;font-weight:600;">${size}</td>
            <td style="text-align:center;white-space:nowrap;">${rating}</td>
            <td title="${desc}">${desc.length > 55 ? desc.substring(0, 52) + '...' : desc}</td>
            <td style="text-align:center;white-space:nowrap;">${b.uom || 'EA'}</td>
            <td style="text-align:center;white-space:nowrap;">${parseFloat(b.qty || 0).toFixed(2)}</td>
        </tr>`;
    }).join('');

    const bomTotalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
    renderPagination('bomPagination', currentBomPage, bomTotalPages, '_bomGoPage');
}
window._bomGoPage = function(p) { currentBomPage = p; renderBomTable(); };

async function refreshBomItemFilter() {
    const TAB_CAT = { piping: 'Pipe', fitting: 'Fitting', valve: 'Valve', speciality: 'Speciality', others: 'Others' };
    const cat = TAB_CAT[_bomActiveTab] || 'Pipe';

    const itemEl = document.getElementById('bomItemFilter');
    if (itemEl) {
        const items = getBomItemsForCat(cat);
        itemEl.innerHTML = '<option value="All">All Items</option>'
            + items.map(i => `<option value="${i.replace(/"/g, '&quot;')}">${i}</option>`).join('');
    }

    const mat1El = document.getElementById('bomMat1Filter');
    const mat2El = document.getElementById('bomMat2Filter');
    if (mat1El) mat1El.innerHTML = '<option value="All">All Mat 1</option>';
    if (mat2El) mat2El.innerHTML = '<option value="All">All Mat 2</option>';
    const sizeEl = document.getElementById('bomSizeFilter');
    if (sizeEl) sizeEl.innerHTML = '<option value="All">All Sizes</option>';

    const ratingEl = document.getElementById('bomRatingFilter');
    if (ratingEl && cat === 'Speciality') {
        // Speciality는 Rating 표기가 제각각(300#, SCH.40 등)이라 실제 데이터에서 동적 추출(아래 쿼리에서 채움)
        ratingEl.innerHTML = '<option value="All">All Ratings</option>';
    } else if (ratingEl) {
        // Valve는 mat_code가 없어 getRatingMatCodesForCat(mat_code 파싱 기반)이 무효 — 고정 목록 사용
        const ratings = cat === 'Valve'
            ? ['CL150', 'CL300', 'CL600', 'CL1500']
            : Object.keys(getRatingMatCodesForCat(cat)).sort();
        ratingEl.innerHTML = '<option value="All">All Ratings</option>'
            + ratings.map(r => `<option value="${r.replace(/"/g, '&quot;')}">${r}</option>`).join('');
    }

    if (mat1El || mat2El || sizeEl || (ratingEl && cat === 'Speciality')) {
        // Pipe/Fitting은 20,000+행이라 PostgREST 서버 기본 row cap(10,000)에 걸림 -> range로 청크 분할 조회
        let data = [], from = 0;
        const CHUNK = 5000;
        try {
            while (true) {
                const { data: chunk, error } = await supabaseClient.from('bom_detail')
                    .select('mat1, mat2, mat_code, full_description')
                    .eq('category', cat)
                    .not('mat1', 'is', null)
                    .range(from, from + CHUNK - 1);
                if (error) throw error;
                data = data.concat(chunk || []);
                if (!chunk || chunk.length < CHUNK) break;
                from += CHUNK;
            }
        } catch (err) {
            console.error('refreshBomItemFilter mat1/mat2/size 로드 실패:', err);
            return;
        }
        const vals1 = [...new Set(data.map(r => r.mat1).filter(Boolean))].sort();
        const vals2 = [...new Set(data.map(r => r.mat2).filter(Boolean))].sort();
        if (mat1El) mat1El.innerHTML = '<option value="All">All Mat 1</option>'
            + vals1.map(v => `<option value="${v.replace(/"/g, '&quot;')}">${v}</option>`).join('');
        if (mat2El) mat2El.innerHTML = '<option value="All">All Mat 2</option>'
            + vals2.map(v => `<option value="${v.replace(/"/g, '&quot;')}">${v}</option>`).join('');
        if (sizeEl && cat === 'Others') {
            // GSKT/STB는 MatCode에 박힌 사이즈(볼트는 Size+길이) 기준으로 필터 옵션 구성
            const sizes = [...new Set(data.map(r => window.extractSizeLengthFromMatCode(r.mat_code)).filter(v => v && v !== '-'))]
                .sort((a, b) => parseSizeSortKey(a) - parseSizeSortKey(b));
            sizeEl.innerHTML = '<option value="All">All Sizes</option>'
                + sizes.map(s => `<option value="${s.replace(/"/g, '&quot;')}">${s}</option>`).join('');
        }
        if (ratingEl && cat === 'Speciality') {
            // full_description = "{ITEM}, {MAT2}, {SIZE}, {RATING}, {END TYPE}" — 4번째 콤마 세그먼트가 Rating
            const ratings = [...new Set(data.map(r => (r.full_description || '').split(',')[3]?.trim()).filter(v => v && v !== '-'))].sort();
            ratingEl.innerHTML = '<option value="All">All Ratings</option>'
                + ratings.map(r => `<option value="${r.replace(/"/g, '&quot;')}">${r}</option>`).join('');
        }
    }
}

// BOM 탭(Piping/Fitting/Valve/Others/Vendor/MatCode Master) 중 현재 활성 탭에 맞는 패널만 보이고 해당 렌더 함수 호출
function renderActiveBomTab() {
    const mainPanel   = document.getElementById('bomMainPanel');
    const mcPanel     = document.getElementById('bomMatCodeMasterPanel');
    const vendorPanel = document.getElementById('bomVendorPanel');
    const spoolPanel  = document.getElementById('bomSpoolPanel');
    const supportPanel = document.getElementById('bomSupportPanel');
    const isMain = _bomActiveTab === 'piping' || _bomActiveTab === 'fitting' || _bomActiveTab === 'valve' || _bomActiveTab === 'speciality' || _bomActiveTab === 'others';
    if (mainPanel)   mainPanel.style.display   = isMain ? '' : 'none';
    if (mcPanel)     mcPanel.style.display     = _bomActiveTab === 'matcode' ? '' : 'none';
    if (vendorPanel) vendorPanel.style.display = _bomActiveTab === 'vendor' ? '' : 'none';
    if (spoolPanel)  spoolPanel.style.display  = _bomActiveTab === 'spool' ? '' : 'none';
    if (supportPanel) supportPanel.style.display = _bomActiveTab === 'support' ? '' : 'none';

    // Valve/Speciality는 MatCode 대신 Tag로 매칭 — 첫 컬럼 헤더 표기 전환
    const col1Header = document.getElementById('bomCol1Header');
    if (col1Header) col1Header.textContent = (_bomActiveTab === 'valve' || _bomActiveTab === 'speciality') ? 'Tag' : 'Mat Code';

    if (_bomActiveTab === 'matcode') { renderMatCodeMaster(); return; }
    if (_bomActiveTab === 'vendor') { initVendorFilters(); renderVendorTable(); return; }
    if (_bomActiveTab === 'spool')  { initBomSpoolFilters(); renderBomSpoolTable(); return; }
    if (_bomActiveTab === 'support') { initBomSupportFilters(); renderBomSupportTable(); return; }
    currentBomPage = 1;
    refreshBomItemFilter();
    renderBomTable();
}

let _bomTabsInited = false;
function initBomTabs() {
    if (_bomTabsInited) return;
    _bomTabsInited = true;
    document.querySelectorAll('.bom-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            _bomActiveTab = btn.dataset.tab;
            document.querySelectorAll('.bom-tab-btn').forEach(b => {
                b.style.borderBottomColor = b === btn ? '#0A2540' : 'transparent';
                b.style.color = b === btn ? '#0A2540' : '#888';
            });
            renderActiveBomTab();
        });
    });
}

// --- Vendor Supply (타사공급, Not-MTO — 참고용, 입고/재고 계산 제외) ---
const VENDOR_ITEM_PREFIX_MAP = { 'GASKET': ['GSKT'], 'STUD BOLT': ['STB'] };

// 사이즈 문자열(예: "3/4"x120mm", "1-1/4"", "8"")을 정렬용 숫자로 환산
function parseSizeSortKey(sizeStr) {
    const lenMatch = (sizeStr || '').match(/x(\d+)mm$/i);
    const length = lenMatch ? parseInt(lenMatch[1], 10) : 0;
    const base = (sizeStr || '').replace(/x\d+mm$/i, '').replace(/"/g, '').trim();
    let diameter;
    const mixed = base.match(/^(\d+)-(\d+)\/(\d+)$/);
    const frac = base.match(/^(\d+)\/(\d+)$/);
    if (mixed) diameter = parseInt(mixed[1], 10) + parseInt(mixed[2], 10) / parseInt(mixed[3], 10);
    else if (frac) diameter = parseInt(frac[1], 10) / parseInt(frac[2], 10);
    else diameter = parseFloat(base) || 0;
    // 지름 우선 정렬, 같은 지름이면 길이(mm) 순으로 2차 정렬
    return diameter * 100000 + length;
}

let _vendorFiltersInited = false;
let _vendorRatingMap = {}; // rating → Set(mat_code), initVendorFilters()에서 채움
async function initVendorFilters() {
    if (_vendorFiltersInited) return;

    const { data, error } = await supabaseClient.from('vendor').select('system, mat_code, mat1').limit(10000);
    if (error) console.error('initVendorFilters vendor 조회 실패:', error);
    if (data) {
        _vendorFiltersInited = true;
        const systems = [...new Set(data.map(r => r.system).filter(Boolean))].sort();
        const mat1s = [...new Set(data.map(r => r.mat1).filter(Boolean))].sort();
        const items = [...new Set(data.map(r => window.extractItemFromMatCode(r.mat_code)).filter(v => v && v !== '-'))].sort();
        const sizes = [...new Set(data.map(r => window.extractSizeLengthFromMatCode(r.mat_code)).filter(v => v && v !== '-'))]
            .sort((a, b) => parseSizeSortKey(a) - parseSizeSortKey(b));

        const masterMap = _buildMasterMap();
        _vendorRatingMap = {};
        data.forEach(r => {
            const rating = getRatingForMatCode(r.mat_code, masterMap);
            if (rating === '-') return;
            if (!_vendorRatingMap[rating]) _vendorRatingMap[rating] = new Set();
            _vendorRatingMap[rating].add(r.mat_code);
        });
        const ratings = Object.keys(_vendorRatingMap).sort();

        const sysEl = document.getElementById('vendorSystemFilter');
        if (sysEl) sysEl.innerHTML = '<option value="All">All Systems</option>' + systems.map(s => `<option value="${s}">${s}</option>`).join('');
        const itemEl = document.getElementById('vendorItemFilter');
        if (itemEl) itemEl.innerHTML = '<option value="All">All Items</option>' + items.map(i => `<option value="${i}">${i}</option>`).join('');
        const mat1El = document.getElementById('vendorMat1Filter');
        if (mat1El) mat1El.innerHTML = '<option value="All">All Mat 1</option>' + mat1s.map(m => `<option value="${m.replace(/"/g, '&quot;')}">${m}</option>`).join('');
        const sizeEl = document.getElementById('vendorSizeFilter');
        if (sizeEl) sizeEl.innerHTML = '<option value="All">All Sizes</option>' + sizes.map(s => `<option value="${s.replace(/"/g, '&quot;')}">${s}</option>`).join('');
        const ratingEl = document.getElementById('vendorRatingFilter');
        if (ratingEl) ratingEl.innerHTML = '<option value="All">All Ratings</option>' + ratings.map(r => `<option value="${r.replace(/"/g, '&quot;')}">${r}</option>`).join('');

        document.getElementById('btnFilterVendor')?.addEventListener('click', () => { currentVendorPage = 1; renderVendorTable(); });
        document.getElementById('btnClearVendorFilters')?.addEventListener('click', () => {
            const isoEl = document.getElementById('vendorIsoSearch'); if (isoEl) isoEl.value = '';
            ['vendorSystemFilter', 'vendorItemFilter', 'vendorMat1Filter', 'vendorSizeFilter', 'vendorRatingFilter'].forEach(id => {
                const el = document.getElementById(id); if (el) el.value = 'All';
            });
            currentVendorPage = 1;
            renderVendorTable();
        });

        const btnExportVendor = document.getElementById('btnExportVendor');
        if (btnExportVendor) {
            btnExportVendor.addEventListener('click', async () => {
                btnExportVendor.disabled = true;
                btnExportVendor.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Exporting...';
                try {
                    const sys = document.getElementById('vendorSystemFilter')?.value || 'All';
                    let query = _applyVendorFilters(
                        supabaseClient.from('vendor')
                            .select('system, iso_dwg_no, line_no, mat_code, full_description, uom, qty')
                            .order('iso_dwg_no').limit(100000)
                    );
                    const { data, error } = await query;
                    if (error) throw error;

                    const masterMap = _buildMasterMap();
                    const rows = (data || []).map(b => {
                        const rating = getRatingForMatCode(b.mat_code, masterMap);
                        return {
                            'System Area': b.system || '-',
                            'ISO Drawing': b.iso_dwg_no || '-',
                            'Line No':     b.line_no || '-',
                            'Mat Code':    b.mat_code || '-',
                            'Rating':      rating,
                            'Description': b.full_description || '-',
                            'Unit':        b.uom || 'EA',
                            'Design Qty':  parseFloat(b.qty || 0)
                        };
                    });
                    const ws = XLSX.utils.json_to_sheet(rows);
                    ws['!cols'] = [12, 30, 24, 24, 10, 50, 8, 12].map(w => ({ wch: w }));
                    const wb = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(wb, ws, 'Vendor');
                    const today = new Date().toISOString().split('T')[0];
                    XLSX.writeFile(wb, `Vendor_Export_${today}${sys !== 'All' ? '_' + sys : ''}.xlsx`);
                } catch (e) {
                    alert('Export failed: ' + e.message);
                } finally {
                    btnExportVendor.disabled = false;
                    btnExportVendor.innerHTML = '<i class="fas fa-file-excel" style="color:#1d6f42;"></i> Export';
                }
            });
        }
    }
}

// Vendor 탭 공용 필터 — 화면 렌더러와 Export 버튼이 동일하게 사용
function _applyVendorFilters(q) {
    const search = (document.getElementById('vendorIsoSearch')?.value || '').trim();
    const sys    = document.getElementById('vendorSystemFilter')?.value || 'All';
    const item   = document.getElementById('vendorItemFilter')?.value || 'All';
    const mat1   = document.getElementById('vendorMat1Filter')?.value || 'All';
    const size   = document.getElementById('vendorSizeFilter')?.value || 'All';
    const rating = document.getElementById('vendorRatingFilter')?.value || 'All';

    if (sys !== 'All') q = q.eq('system', sys);
    if (search) q = q.or(`iso_dwg_no.ilike.%${search}%,mat_code.ilike.%${search}%,full_description.ilike.%${search}%`);
    if (mat1 !== 'All') q = q.eq('mat1', mat1);
    if (item !== 'All') {
        const prefixes = VENDOR_ITEM_PREFIX_MAP[item];
        if (prefixes && prefixes.length) q = q.or(prefixes.map(p => `mat_code.ilike.${p}-*`).join(','));
    }
    if (size !== 'All') {
        // size 표시값(예: '3/4"x120mm', '8"')을 MatCode에 박힌 그대로의 부분 문자열로 역변환
        const m = size.match(/^([\d\/\-]+)"(?:x(\d+)mm)?$/);
        if (m) q = q.ilike('mat_code', m[2] ? `%-${m[1]}"x${m[2]}%` : `%-${m[1]}"%`);
    }
    if (rating !== 'All') {
        const codes = [...(_vendorRatingMap[rating] || [])];
        q = q.in('mat_code', codes.length ? codes : ['__NONE__']);
    }
    return q;
}

async function renderVendorTable() {
    let tbody = document.querySelector('#vendorTable tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="12" style="text-align:center;padding:20px;color:#888;">Loading...</td></tr>';

    const applyFilters = _applyVendorFilters;

    const dataQ = applyFilters(
        supabaseClient.from('vendor')
            .select('mat_code, system, iso_dwg_no, line_no, full_description, uom, qty, mat1, mat2')
            .range((currentVendorPage - 1) * PAGE_SIZE, currentVendorPage * PAGE_SIZE - 1)
            .order('system', { ascending: true, nullsFirst: false })
            .order('iso_dwg_no', { ascending: true, nullsFirst: false })
    );
    const countQ = applyFilters(supabaseClient.from('vendor').select('*', { count: 'exact', head: true }));

    const [dataRes, countRes] = await Promise.all([dataQ, countQ]);
    if (dataRes.error) {
        tbody.innerHTML = `<tr><td colspan="12" style="color:red;text-align:center;">Error: ${dataRes.error.message}</td></tr>`;
        return;
    }

    const data = dataRes.data || [];
    const count = countRes.count || 0;

    const masterMap = _buildMasterMap();
    tbody.innerHTML = data.map(b => {
        const desc = b.full_description || '-';
        const rowSize = window.extractSizeLengthFromMatCode(b.mat_code);
        const rowItem = window.extractItemFromMatCode(b.mat_code);
        const rating = getRatingForMatCode(b.mat_code, masterMap);
        return `<tr>
            <td style="text-align:center;white-space:nowrap;"><span class="status-badge ok">${b.mat_code || '-'}</span></td>
            <td style="text-align:center;white-space:nowrap;">${b.system || '-'}</td>
            <td style="text-align:center;white-space:nowrap;">${b.iso_dwg_no || '-'}</td>
            <td style="text-align:center;white-space:nowrap;">${b.line_no || '-'}</td>
            <td style="text-align:center;font-weight:600;white-space:nowrap;">${rowItem !== '-' ? rowItem : '-'}</td>
            <td style="text-align:center;white-space:nowrap;">${b.mat1 || '-'}</td>
            <td style="text-align:center;white-space:nowrap;">${b.mat2 || '-'}</td>
            <td style="text-align:center;font-weight:600;white-space:nowrap;">${rowSize}</td>
            <td style="text-align:center;white-space:nowrap;">${rating}</td>
            <td title="${desc}">${desc}</td>
            <td style="text-align:center;white-space:nowrap;">${b.uom || 'EA'}</td>
            <td style="text-align:center;white-space:nowrap;">${parseFloat(b.qty || 0).toFixed(2)}</td>
        </tr>`;
    }).join('') || '<tr><td colspan="12" style="text-align:center;color:#888;">No vendor items found.</td></tr>';

    const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
    renderPagination('vendorPagination', currentVendorPage, totalPages, '_vendorGoPage');
}
window._vendorGoPage = function(p) { currentVendorPage = p; renderVendorTable(); };

// --- BOM Tab: Spool (spool_bom 테이블 직접 조회 — bom 테이블과는 완전히 분리된 별도 체계, 2026-07-06 등록) ---
let currentBomSpoolPage = 1;
let _bomSpoolFiltersInited = false;

async function initBomSpoolFilters() {
    if (_bomSpoolFiltersInited) return;

    const { data, error } = await supabaseClient.from('spool_bom').select('system').limit(10000);
    if (error) console.error('initBomSpoolFilters spool_bom 조회 실패:', error);
    if (data) {
        _bomSpoolFiltersInited = true;
        const systems = [...new Set(data.map(r => r.system).filter(Boolean))].sort();
        const sysEl = document.getElementById('bomSpoolSystemFilter');
        if (sysEl) sysEl.innerHTML = '<option value="All">All Systems</option>' + systems.map(s => `<option value="${s}">${s}</option>`).join('');

        document.getElementById('btnFilterBomSpool')?.addEventListener('click', () => { currentBomSpoolPage = 1; renderBomSpoolTable(); });
        document.getElementById('btnClearBomSpoolFilters')?.addEventListener('click', () => {
            const searchEl = document.getElementById('bomSpoolSearch'); if (searchEl) searchEl.value = '';
            const sysEl = document.getElementById('bomSpoolSystemFilter'); if (sysEl) sysEl.value = 'All';
            currentBomSpoolPage = 1;
            renderBomSpoolTable();
        });

        const btnExportBomSpool = document.getElementById('btnExportBomSpool');
        if (btnExportBomSpool) {
            btnExportBomSpool.addEventListener('click', async () => {
                btnExportBomSpool.disabled = true;
                btnExportBomSpool.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Exporting...';
                try {
                    const { rows } = await _fetchBomSpoolRows({ forExport: true });
                    const excelRows = rows.map(b => ({
                        'Tag No':      b.tag_no || '-',
                        'System':      b.system || '-',
                        'ISO Drawing': b.iso_dwg_no || '-',
                        'Line No':     b.line_no || '-',
                        'Description': b.description || '-',
                        'Size':        b.size || '-',
                        'Mat 1':       b.mat1 || '-',
                        'Mat 2':       b.mat2 || '-',
                        'Rating':      b.rating || '-',
                        'Unit':        b.uom || 'EA',
                        'Design Qty':  parseFloat(b.qty || 0)
                    }));
                    const ws = XLSX.utils.json_to_sheet(excelRows);
                    ws['!cols'] = [22, 8, 24, 24, 26, 8, 14, 14, 10, 8, 12].map(w => ({ wch: w }));
                    const wb = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(wb, ws, 'Spool BOM');
                    const today = new Date().toISOString().split('T')[0];
                    XLSX.writeFile(wb, `Spool_BOM_Export_${today}.xlsx`);
                } catch (e) {
                    alert('Export failed: ' + e.message);
                } finally {
                    btnExportBomSpool.disabled = false;
                    btnExportBomSpool.innerHTML = '<i class="fas fa-file-excel" style="color:#1d6f42;"></i> Export';
                }
            });
        }
    }
}

// Search/System 필터를 공용으로 적용해 spool_bom 쿼리 빌드 (테이블 렌더링/Export 공용)
async function _fetchBomSpoolRows({ page = 1, forExport = false } = {}) {
    const search = (document.getElementById('bomSpoolSearch')?.value || '').trim();
    const sys    = document.getElementById('bomSpoolSystemFilter')?.value || 'All';

    let query = supabaseClient.from('spool_bom')
        .select('tag_no, system, iso_dwg_no, line_no, description, size, mat1, mat2, rating, uom, qty', forExport ? undefined : { count: 'exact' })
        .order('tag_no', { ascending: true, nullsFirst: false });

    if (sys !== 'All') query = query.eq('system', sys);
    if (search) query = query.or(`tag_no.ilike.%${search}%,iso_dwg_no.ilike.%${search}%,description.ilike.%${search}%`);

    if (forExport) {
        query = query.limit(100000);
        const { data, error } = await query;
        if (error) throw error;
        return { rows: data || [], count: (data || []).length };
    }
    query = query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
    const { data, error, count } = await query;
    if (error) throw error;
    return { rows: data || [], count: count || 0 };
}

async function renderBomSpoolTable() {
    const tbody = document.querySelector('#bomSpoolTable tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;padding:20px;color:#888;">Loading...</td></tr>';

    let rows, count;
    try {
        ({ rows, count } = await _fetchBomSpoolRows({ page: currentBomSpoolPage }));
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="11" style="color:red;text-align:center;">Error: ${e.message}</td></tr>`;
        return;
    }

    tbody.innerHTML = rows.map(b => `<tr>
        <td style="text-align:center;font-weight:600;white-space:nowrap;">${b.tag_no || '-'}</td>
        <td style="text-align:center;white-space:nowrap;">${b.system || '-'}</td>
        <td style="text-align:center;white-space:nowrap;">${b.iso_dwg_no || '-'}</td>
        <td style="text-align:center;white-space:nowrap;">${b.line_no || '-'}</td>
        <td style="text-align:center;" title="${b.description || ''}">${b.description || '-'}</td>
        <td style="text-align:center;white-space:nowrap;">${b.size || '-'}</td>
        <td style="text-align:center;white-space:nowrap;">${b.mat1 || '-'}</td>
        <td style="text-align:center;white-space:nowrap;">${b.mat2 || '-'}</td>
        <td style="text-align:center;white-space:nowrap;">${b.rating || '-'}</td>
        <td style="text-align:center;white-space:nowrap;">${b.uom || 'EA'}</td>
        <td style="text-align:center;white-space:nowrap;">${parseFloat(b.qty || 0).toFixed(2)}</td>
    </tr>`).join('') || '<tr><td colspan="11" style="text-align:center;color:#888;">No Spool BOM items found.</td></tr>';

    const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
    renderPagination('bomSpoolPagination', currentBomSpoolPage, totalPages, '_bomSpoolGoPage');
}
window._bomSpoolGoPage = function(p) { currentBomSpoolPage = p; renderBomSpoolTable(); };

// --- BOM Tab: Support (support_bom 테이블 직접 조회 — bom 테이블과는 완전히 분리된 별도 체계, 2026-08-22 등록) ---
// Bulk/무태그 참고행(support_tag NULL/'BULK'/'-')은 Support Receiving 탭의 Bulk Materials 섹션에서 별도 관리하므로 여기선 제외
let currentBomSupportPage = 1;
let _bomSupportFiltersInited = false;

async function initBomSupportFilters() {
    if (_bomSupportFiltersInited) return;

    // support_bom은 14,000+행이라 PostgREST 서버 기본 row cap(10,000)에 걸림 -> range로 청크 분할 조회
    let data = [], error = null, from = 0;
    const CHUNK = 5000;
    while (true) {
        const { data: chunk, error: chunkErr } = await supabaseClient.from('support_bom')
            .select('system, iso_dwg_no, package_no, support_tag').not('support_tag', 'is', null).range(from, from + CHUNK - 1);
        if (chunkErr) { error = chunkErr; break; }
        data = data.concat(chunk || []);
        if (!chunk || chunk.length < CHUNK) break;
        from += CHUNK;
    }
    if (error) { console.error('initBomSupportFilters support_bom 조회 실패:', error); return; }
    if (data) {
        _bomSupportFiltersInited = true;
        window._bomSupportAllRows = data;

        const systems = [...new Set(data.map(r => r.system).filter(Boolean))].sort();
        const sysEl = document.getElementById('bomSupportSystemFilter');
        if (sysEl) sysEl.innerHTML = '<option value="All">All Systems</option>' + systems.map(s => `<option value="${s}">${s}</option>`).join('');
        const isoEl = document.getElementById('bomSupportIsoFilter');
        const tagEl = document.getElementById('bomSupportTagFilter');
        const pkgEl = document.getElementById('bomSupportPackageNoFilter');

        const rebuildBomSupportIsoPkgFilters = (rows) => {
            const isos = [...new Set(rows.map(r => r.iso_dwg_no).filter(Boolean))].sort();
            const pkgs = [...new Set(rows.map(r => r.package_no).filter(Boolean))].sort();
            if (isoEl) isoEl.innerHTML = '<option value="All">All ISOs</option>' + isos.map(v => `<option value="${v}">${v}</option>`).join('');
            if (pkgEl) pkgEl.innerHTML = '<option value="All">All Package No</option>' + pkgs.map(v => `<option value="${v}">${v}</option>`).join('');
        };
        const rebuildBomSupportTagFilter = (rows) => {
            const tags = [...new Set(rows.map(r => r.support_tag).filter(Boolean))].sort();
            if (tagEl) tagEl.innerHTML = '<option value="All">All Support Tags</option>' + tags.map(v => `<option value="${v.replace(/"/g, '&quot;')}">${v}</option>`).join('');
        };
        rebuildBomSupportIsoPkgFilters(data);
        rebuildBomSupportTagFilter(data);

        sysEl?.addEventListener('change', () => {
            const sel = sysEl.value;
            const rows = sel === 'All' ? data : data.filter(r => r.system === sel);
            rebuildBomSupportIsoPkgFilters(rows);
            rebuildBomSupportTagFilter(rows);
        });
        isoEl?.addEventListener('change', () => {
            const sysSel = sysEl.value;
            const isoSel = isoEl.value;
            let rows = sysSel === 'All' ? data : data.filter(r => r.system === sysSel);
            if (isoSel !== 'All') rows = rows.filter(r => r.iso_dwg_no === isoSel);
            rebuildBomSupportTagFilter(rows);
        });

        document.getElementById('btnFilterBomSupport')?.addEventListener('click', () => { currentBomSupportPage = 1; renderBomSupportTable(); });
        document.getElementById('btnClearBomSupportFilters')?.addEventListener('click', () => {
            const searchEl = document.getElementById('bomSupportSearch'); if (searchEl) searchEl.value = '';
            if (sysEl) sysEl.value = 'All';
            rebuildBomSupportIsoPkgFilters(data);
            rebuildBomSupportTagFilter(data);
            if (isoEl) isoEl.value = 'All';
            if (tagEl) tagEl.value = 'All';
            if (pkgEl) pkgEl.value = 'All';
            const typEl = document.getElementById('bomSupportTypeFilter'); if (typEl) typEl.value = 'All';
            currentBomSupportPage = 1;
            renderBomSupportTable();
        });

        const btnExportBomSupport = document.getElementById('btnExportBomSupport');
        if (btnExportBomSupport) {
            btnExportBomSupport.addEventListener('click', async () => {
                btnExportBomSupport.disabled = true;
                btnExportBomSupport.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Exporting...';
                try {
                    const { rows } = await _fetchBomSupportRows({ forExport: true });
                    const excelRows = rows.map(b => ({
                        'System':          b.system || '-',
                        'ISO Drawing':     b.iso_dwg_no || '-',
                        'Support Tag':     b.support_tag || '-',
                        'Type':            b.type || '-',
                        'Item':            b.item || '-',
                        'Matl':            b.matl || '-',
                        'Size / Type':     b.size_or_type || '-',
                        'Qty':             parseFloat(b.qty || 0),
                        'Package No':      b.package_no || '-'
                    }));
                    const ws = XLSX.utils.json_to_sheet(excelRows);
                    ws['!cols'] = [8, 22, 22, 10, 18, 10, 18, 8, 20].map(w => ({ wch: w }));
                    const wb = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(wb, ws, 'Support BOM');
                    const today = new Date().toISOString().split('T')[0];
                    XLSX.writeFile(wb, `Support_BOM_Export_${today}.xlsx`);
                } catch (e) {
                    alert('Export failed: ' + e.message);
                } finally {
                    btnExportBomSupport.disabled = false;
                    btnExportBomSupport.innerHTML = '<i class="fas fa-file-excel" style="color:#1d6f42;"></i> Export';
                }
            });
        }
    }
}

// Search/System 필터를 공용으로 적용해 support_bom 쿼리 빌드 (테이블 렌더링/Export 공용)
async function _fetchBomSupportRows({ page = 1, forExport = false } = {}) {
    const search = (document.getElementById('bomSupportSearch')?.value || '').trim();
    const sys    = document.getElementById('bomSupportSystemFilter')?.value || 'All';
    const iso    = document.getElementById('bomSupportIsoFilter')?.value || 'All';
    const tag    = document.getElementById('bomSupportTagFilter')?.value || 'All';
    const pkgNo  = document.getElementById('bomSupportPackageNoFilter')?.value || 'All';
    const type   = document.getElementById('bomSupportTypeFilter')?.value || 'All';

    let query = supabaseClient.from('support_bom')
        .select('support_tag, system, iso_dwg_no, type, item, matl, size_or_type, qty, package_no', forExport ? undefined : { count: 'exact' })
        .not('support_tag', 'is', null)
        .neq('support_tag', 'BULK')
        .neq('support_tag', '-')
        .order('system', { ascending: true, nullsFirst: false })
        .order('support_tag', { ascending: true, nullsFirst: false });

    if (sys !== 'All') query = query.eq('system', sys);
    if (iso !== 'All') query = query.eq('iso_dwg_no', iso);
    if (tag !== 'All') query = query.eq('support_tag', tag);
    if (pkgNo !== 'All') query = query.eq('package_no', pkgNo);
    if (type === 'SPECIAL') query = query.eq('type', 'SPECIAL');
    else if (type !== 'All') query = query.ilike('type', `(${type}-%`);
    if (search) query = query.or(`support_tag.ilike.%${search}%,iso_dwg_no.ilike.%${search}%,item.ilike.%${search}%`);

    if (forExport) {
        query = query.limit(100000);
        const { data, error } = await query;
        if (error) throw error;
        return { rows: data || [], count: (data || []).length };
    }
    query = query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
    const { data, error, count } = await query;
    if (error) throw error;
    return { rows: data || [], count: count || 0 };
}

async function renderBomSupportTable() {
    const tbody = document.querySelector('#bomSupportTable tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:20px;color:#888;">Loading...</td></tr>';

    let rows, count;
    try {
        ({ rows, count } = await _fetchBomSupportRows({ page: currentBomSupportPage }));
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="9" style="color:red;text-align:center;">Error: ${e.message}</td></tr>`;
        return;
    }

    tbody.innerHTML = rows.map(b => `<tr>
        <td style="text-align:center;white-space:nowrap;">${b.system || '-'}</td>
        <td style="text-align:center;white-space:nowrap;" title="${b.iso_dwg_no || ''}">${b.iso_dwg_no || '-'}</td>
        <td style="text-align:center;font-weight:600;white-space:nowrap;">${b.support_tag || '-'}</td>
        <td style="text-align:center;white-space:nowrap;">${b.type || '-'}</td>
        <td style="text-align:center;" title="${b.item || ''}">${b.item || '-'}</td>
        <td style="text-align:center;white-space:nowrap;">${b.matl || '-'}</td>
        <td style="text-align:center;white-space:nowrap;" title="${b.size_or_type || ''}">${b.size_or_type || '-'}</td>
        <td style="text-align:center;white-space:nowrap;">${parseFloat(b.qty || 0).toFixed(0)}</td>
        <td style="text-align:center;white-space:nowrap;">${b.package_no || '-'}</td>
    </tr>`).join('') || '<tr><td colspan="9" style="text-align:center;color:#888;">No Support BOM items found.</td></tr>';

    const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
    renderPagination('bomSupportPagination', currentBomSupportPage, totalPages, '_bomSupportGoPage');
}
window._bomSupportGoPage = function(p) { currentBomSupportPage = p; renderBomSupportTable(); };

// 필터링된 전체 행 + 조회용 맵을 반환 (렌더/Export 공용, 필터 로직 단일 소스)
async function _computeRecvCoreData(cfg) {
    const splitMat = !!cfg.mat1Id; // BOM처럼 Mat 1/Mat 2로 분리 표시할지 (Bulk 탭만 true)

    const search  = (document.getElementById(cfg.searchId)?.value || '').trim().toUpperCase();
    const doc     = document.getElementById(cfg.docId)?.value    || 'All';
    const pkg     = document.getElementById(cfg.pkgId)?.value    || 'All';
    const cat     = document.getElementById(cfg.catId)?.value || 'All';
    const itemF   = document.getElementById(cfg.itemId)?.value   || 'All';
    const sizeF   = document.getElementById(cfg.sizeId)?.value   || 'All';
    const statusF = document.getElementById(cfg.statusId)?.value || 'All';
    const mat1F   = splitMat ? (document.getElementById(cfg.mat1Id)?.value || 'All') : 'All';
    const mat2F   = splitMat ? (document.getElementById(cfg.mat2Id)?.value || 'All') : 'All';
    const ratingF = splitMat ? (document.getElementById(cfg.ratingId)?.value || 'All') : 'All';

    const masterMap = _buildMasterMap();
    let mat12Map = {};
    if (splitMat) {
        const agg = await loadMssItemAgg();
        agg.forEach(r => { mat12Map[r.matCode] = { mat1: r.mat1, mat2: r.mat2 }; });
        refreshMat12RatingFilterOptions(cfg, agg, masterMap);
    }

    const data = db.receiving.filter(r => {
        if (isSpareBodyRow(r)) return false; // Spare 예비 본체는 별도 Spare 탭에서 관리
        const matchSearch  = !search || (r.matCode||'').toUpperCase().includes(search) || r.plNo.toUpperCase().includes(search) || (r.category||'').toUpperCase().includes(search) || r.desc.toUpperCase().includes(search) || (r.tag||'').toUpperCase().includes(search);
        const matchDoc     = doc  === 'All' || r.docNo === doc;
        const matchPkg     = pkg  === 'All' || r.plNo  === pkg;
        const matchForcedCat = !Array.isArray(cfg.forcedCats) || cfg.forcedCats.includes(r.category);
        const matchCat     = matchForcedCat && (cat === 'All' || r.category === cat);
        const _tagInfo     = db.bomTagMap[(r.tag || '').toUpperCase()];
        const effMat       = r.matCode || (_tagInfo ? _tagInfo.matCode : '');
        const _bomDesc     = _tagInfo ? _tagInfo.fullDescription : '';
        const _mcItem      = window.extractItemFromMatCode(effMat);
        const _rawItem     = (_mcItem && _mcItem !== '-') ? _mcItem : window.extractItemFromDesc(_bomDesc || r.desc);
        const itemFromMat  = (r.plNo || '').toUpperCase().includes('BYPS') ? 'BYPASS VALVE' : _rawItem;
        const matchItemF   = itemF === 'All' || itemFromMat === itemF || (itemFromMat === '-' && window.extractItemFromDesc(r.desc) === itemF);
        const _msz = window.extractSizeFromMatCode(effMat);
        const matchSizeF = sizeF === 'All' || (_msz && _msz !== '-' ? _msz === sizeF
            : window.extractSizeFromLineNo(db.bomTagMap[(r.tag||'').toUpperCase()]?.lineNo) === sizeF);
        const pkgSt        = (_plUpdatesCache[r.plNo] || {}).status || '';
        const pkgIssueDateF = (_plUpdatesCache[r.plNo] || {}).issue_date || '';
        const matchStatusF = statusF === 'All' || (statusF === 'Issued' ? !!pkgIssueDateF : pkgSt === statusF);
        const m12          = splitMat ? (mat12Map[effMat] || getStbMat1Mat2Fallback(effMat, masterMap) || {}) : {};
        const matchMat1    = mat1F   === 'All' || (m12.mat1 || '-') === mat1F;
        const matchMat2    = mat2F   === 'All' || (m12.mat2 || '-') === mat2F;
        const matchRating  = ratingF === 'All' || getRatingForMatCode(effMat, masterMap) === ratingF;
        return matchSearch && matchDoc && matchPkg && matchCat && matchItemF && matchSizeF && matchStatusF && matchMat1 && matchMat2 && matchRating;
    }).sort((a, b) => {
        if (cfg.catOrder) {
            const oa = cfg.catOrder[a.category] ?? 99, ob = cfg.catOrder[b.category] ?? 99;
            if (oa !== ob) return oa - ob;
        }
        return a.docNo.localeCompare(b.docNo) || a.plNo.localeCompare(b.plNo);
    });

    return { data, masterMap, mat12Map, splitMat };
}

// 행 1개에 대한 표시용 파생값 계산 (렌더/Export 공용, 필드 계산 단일 소스)
function _buildRecvRowFields(r, { masterMap, mat12Map, splitMat }) {
    const tagInfo    = db.bomTagMap[(r.tag || '').toUpperCase()];
    const effMat     = r.matCode || (tagInfo ? tagInfo.matCode : '');
    const bomFullDesc = tagInfo ? tagInfo.fullDescription : '';
    let displayCat   = (r.category && r.category !== 'BULK') ? r.category : window.getCategory(r.desc, effMat) || 'Others';
    let catForBadge  = displayCat;
    if (!['Pipe', 'Fitting', 'Support', 'Valve', 'Speciality', 'Others'].includes(catForBadge)) catForBadge = 'Valve';
    // GSKT/STB는 D-code가 없고 사이즈(볼트는 Size+길이)가 MatCode에 직접 박혀있음 (BOM 탭과 동일 처리)
    const _matUpperR = (effMat || '').toUpperCase();
    const _sizeFromMat = (_matUpperR.startsWith('GSKT') || _matUpperR.startsWith('STB'))
        ? window.extractSizeLengthFromMatCode(effMat)
        : window.extractSizeFromMatCode(effMat);
    const size = (_sizeFromMat && _sizeFromMat !== '-')
        ? _sizeFromMat
        : ((bomFullDesc || r.desc).match(/(\d+(?:\.\d+)?"\s*[Xx×]\s*\d+(?:\.\d+)?"|DN\s*\d+)/i) || [])[0] || '-';
    const _mcItemR  = window.extractItemFromMatCode(effMat);
    // Pipe는 MatCode 접두어(PIS/PIW)가 SMLS/WELDED 구분 없이 'PIPE'로 뭉뚱그려지는데,
    // Receiving desc는 BOM처럼 콤마로 구분돼 있지 않아 Description 파싱으로도 구분이 안 됨 —
    // BOM 탭과 동일하게 보이도록 MatCode 접두어로 직접 SMLS/WELDED를 구분
    const _matPrefixR = (effMat || '').split('-')[0].toUpperCase();
    const _rawItemR = _matPrefixR === 'PIS' ? 'PIPE SMLS'
        : _matPrefixR === 'PIW' ? 'PIPE WELDED'
        : (_mcItemR && _mcItemR !== '-') ? _mcItemR : window.extractItemFromDesc(bomFullDesc || r.desc);
    const item      = (r.plNo || '').toUpperCase().includes('BYPS') ? 'BYPASS VALVE'
        : window.getValveOpAccessoryItem(r.plNo, bomFullDesc || r.desc) || _rawItemR;
    const etPart    = (effMat || '').split('-').pop().toUpperCase();
    const flangeType = (item === 'FLANGE' && (etPart === 'FF' || etPart === 'RF')) ? 'WN' + etPart : '-';

    const mData  = masterMap[effMat] || {};
    const mcParts = (effMat || '').split('-');
    const matl   = mData.matlDesc || mcParts[1] || '-';
    const rating = getRatingForMatCode(effMat, masterMap);
    const m12    = splitMat ? (mat12Map[effMat] || getStbMat1Mat2Fallback(effMat, masterMap) || {}) : {};
    const mat1Val = m12.mat1 || '-';
    const mat2Val = m12.mat2 || '-';

    const pkgStatus    = (_plUpdatesCache[r.plNo] || {}).status || '';
    const pkgIssueDate = (_plUpdatesCache[r.plNo] || {}).issue_date || '';

    return { tagInfo, effMat, displayCat, catForBadge, item, flangeType, matl, mat1Val, mat2Val, size, rating, pkgStatus, pkgIssueDate };
}

async function _renderRecvCore(cfg) {
    let tbody = document.querySelector(`#${cfg.tableId} tbody`);
    if (!tbody) return;
    tbody.innerHTML = '';

    const hideTag     = !!cfg.hideTag;
    const hideMatCode = !!cfg.hideMatCode;
    const hideType    = !!cfg.hideType;

    const { data, masterMap, mat12Map, splitMat } = await _computeRecvCoreData(cfg);

    const page = cfg.getPage();
    const rows = data.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(r => {
        const f = _buildRecvRowFields(r, { masterMap, mat12Map, splitMat });
        const catBadge = getCatBadge(f.catForBadge);
        const isOnSite   = f.pkgStatus === 'On-Site' || !!f.pkgIssueDate;
        const statusColor = f.pkgIssueDate ? '#2e7d32' : f.pkgStatus === 'On-Site' ? '#2e7d32' : f.pkgStatus === 'Shipping' ? '#1565c0' : f.pkgStatus === 'Preparing' ? '#888' : '#bbb';
        const statusText  = f.pkgIssueDate || f.pkgStatus || '—';

        return `<tr${isOnSite ? '' : ' style="color:#999;"'}>
            <td style="text-align:center;white-space:nowrap;">${r.docNo}</td>
            <td style="text-align:center;white-space:nowrap;">${r.plNo}</td>
            ${(cfg.catFirst && !cfg.hideCat) ? `<td style="text-align:center;white-space:nowrap;"><span class="status-badge ${catBadge}">${f.displayCat}</span></td>` : ''}
            ${hideMatCode ? '' : `<td style="text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${f.effMat || ''}"><span class="status-badge ${r.matCode ? 'ok' : (f.tagInfo ? 'warn' : '')}">${f.effMat || (f.tagInfo ? '(BOM)' : '-')}</span></td>`}
            ${(!cfg.catFirst && !cfg.hideCat) ? `<td style="text-align:center;white-space:nowrap;"><span class="status-badge ${catBadge}">${f.displayCat}</span></td>` : ''}
            ${hideTag ? '' : `<td style="text-align:center;">${r.tag || '-'}</td>`}
            <td style="text-align:center;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${f.item}">${f.item}</td>
            ${hideType ? '' : `<td style="text-align:center;font-weight:600;white-space:nowrap;color:${f.flangeType!=='-'?'#1565c0':'#aaa'};">${f.flangeType}</td>`}
            ${splitMat
                ? `<td style="text-align:center;">${f.mat1Val}</td><td style="text-align:center;">${f.mat2Val}</td>`
                : `<td style="text-align:center;">${f.matl}</td>`}
            <td style="text-align:center;font-weight:600;white-space:nowrap;">${f.size}</td>
            <td style="text-align:center;">${f.rating}</td>
            <td style="white-space:nowrap;text-align:center;">${r.unit || 'EA'}</td>
            <td style="white-space:nowrap;text-align:center;">${Math.round(r.qty).toLocaleString()}</td>
            <td style="text-align:center;white-space:nowrap;font-weight:600;color:${statusColor};">${statusText}</td>
        </tr>`;
    });
    tbody.innerHTML = rows.join('');
    renderPagination(cfg.paginationId, page, Math.max(1, Math.ceil(data.length / PAGE_SIZE)), cfg.goPageFn);
}

// 화면 렌더링과 동일한 필터/컬럼 계산을 그대로 재사용해 Export 행을 만든다 (페이지네이션 없이 전체)
async function _exportRecvCoreRows(cfg) {
    const hideTag     = !!cfg.hideTag;
    const hideMatCode = !!cfg.hideMatCode;
    const hideType    = !!cfg.hideType;

    const { data, masterMap, mat12Map, splitMat } = await _computeRecvCoreData(cfg);

    return data.map(r => {
        const f = _buildRecvRowFields(r, { masterMap, mat12Map, splitMat });
        const row = { 'PKG': r.docNo || '-', 'PKG NO': r.plNo || '-' };
        if (cfg.catFirst && !cfg.hideCat) row['Category'] = f.displayCat || '-';
        if (!hideMatCode) row['MatCode'] = f.effMat || (f.tagInfo ? '(BOM)' : '-');
        if (!cfg.catFirst && !cfg.hideCat) row['Category'] = f.displayCat || '-';
        if (!hideTag) row['Tag'] = r.tag || '-';
        row['Item'] = f.item;
        if (!hideType) row['Type'] = f.flangeType;
        if (splitMat) { row['Mat 1'] = f.mat1Val; row['Mat 2'] = f.mat2Val; }
        else { row['Mat'] = f.matl; }
        row['Size']   = f.size;
        row['Rating'] = f.rating;
        row['Unit']   = r.unit || 'EA';
        row['Qty']    = r.qty || 0;
        row['Status'] = f.pkgIssueDate || f.pkgStatus || '-';
        return row;
    });
}

// Export 공용 엑셀 작성 (컬럼 구성이 탭마다 달라서 헤더 기준으로 폭을 동적 계산)
function _writeRecvExcel(rows, sheetName, filename) {
    const ws = XLSX.utils.json_to_sheet(rows);
    const headers = rows.length ? Object.keys(rows[0]) : [];
    ws['!cols'] = headers.map(h => ({ wch: Math.max(h.length + 4, 10) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, filename);
}

// Mat 1/Mat 2/Rating 필터 옵션을 카테고리 범위 내에서 1회만 채움(선택값 유지를 위해 재채움 안 함)
function refreshMat12RatingFilterOptions(cfg, agg, masterMap) {
    const mat1El   = document.getElementById(cfg.mat1Id);
    const mat2El   = document.getElementById(cfg.mat2Id);
    const ratingEl = document.getElementById(cfg.ratingId);
    if (!mat1El && !mat2El && !ratingEl) return;
    const catRows = Array.isArray(cfg.forcedCats) ? agg.filter(r => cfg.forcedCats.includes(r.category)) : agg;

    if (mat1El && mat1El.dataset.filled !== '1') {
        const vals = [...new Set(catRows.map(r => r.mat1).filter(Boolean))].sort();
        mat1El.innerHTML = '<option value="All">All Mat 1</option>' + vals.map(v => `<option value="${v.replace(/"/g, '&quot;')}">${v}</option>`).join('');
        mat1El.dataset.filled = '1';
    }
    if (mat2El && mat2El.dataset.filled !== '1') {
        const vals = [...new Set(catRows.map(r => r.mat2).filter(Boolean))].sort();
        mat2El.innerHTML = '<option value="All">All Mat 2</option>' + vals.map(v => `<option value="${v.replace(/"/g, '&quot;')}">${v}</option>`).join('');
        mat2El.dataset.filled = '1';
    }
    if (ratingEl && ratingEl.dataset.filled !== '1') {
        const vals = [...new Set(catRows.map(r => getRatingForMatCode(r.matCode, masterMap)).filter(v => v && v !== '-'))].sort();
        ratingEl.innerHTML = '<option value="All">All Ratings</option>' + vals.map(v => `<option value="${v.replace(/"/g, '&quot;')}">${v}</option>`).join('');
        ratingEl.dataset.filled = '1';
    }
}

// 현재 활성 receiving 섹션/탭 상태
let _recActiveSec = 'bulk'; // 'bulk' | 'tag'
let _recActiveBulkTab = 'piping'; // 'piping' | 'others'
let _recActiveTagTab  = 'spool';  // 'spool' | 'valve' | 'speciality' | 'support' | 'spare'
let currentOthPage = 1;
let currentValPage = 1;
let currentSplPage = 1;
let currentSprPage = 1;

function renderBulkPipingTable() {
    _renderRecvCore({
        tableId: 'plTable', searchId: 'plItemSearch',
        docId: 'plDocFilter', pkgId: 'plPkgFilter', statusId: 'plStatusFilter',
        itemId: 'plItemFilter', sizeId: 'plSizeFilter',
        mat1Id: 'plMat1Filter', mat2Id: 'plMat2Filter', ratingId: 'plRatingFilter',
        forcedCats: ['Pipe'],
        catFirst: true,
        hideCat: true,
        hideTag: true,
        hideType: true,
        getPage: () => currentPlPage,
        paginationId: 'plPagination', goPageFn: '_plGoPage'
    });
}

let currentFitPage = 1;
function renderBulkFittingTable() {
    _renderRecvCore({
        tableId: 'fitTable', searchId: 'fitItemSearch',
        docId: 'fitDocFilter', pkgId: 'fitPkgFilter', statusId: 'fitStatusFilter',
        itemId: 'fitItemFilter', sizeId: 'fitSizeFilter',
        mat1Id: 'fitMat1Filter', mat2Id: 'fitMat2Filter', ratingId: 'fitRatingFilter',
        forcedCats: ['Fitting'],
        catFirst: true,
        hideCat: true,
        hideTag: true,
        getPage: () => currentFitPage,
        paginationId: 'fitPagination', goPageFn: '_fitGoPage'
    });
}

function renderBulkOthersTable() {
    _renderRecvCore({
        tableId: 'othTable', searchId: 'othItemSearch',
        docId: 'othDocFilter', pkgId: 'othPkgFilter', statusId: 'othStatusFilter',
        itemId: 'othItemFilter', sizeId: 'othSizeFilter',
        mat1Id: 'othMat1Filter', mat2Id: 'othMat2Filter', ratingId: 'othRatingFilter',
        forcedCats: ['Others'],
        catFirst: true,
        hideCat: true,
        hideTag: true,
        getPage: () => currentOthPage,
        paginationId: 'othPagination', goPageFn: '_othGoPage'
    });
}

// Valve Receiving — MatCode가 없는 카테고리라 공용 _renderRecvCore(MatCode 기준) 대신
// Tag/Operation Type/Valve Type/Mat1/Mat2/Size/Rating 자체 필드를 직접 사용하는 전용 렌더러.
// Valve/Spare Receiving 공용 필터+정렬 — 화면 렌더러(_renderValveSpareCore)와 Export(_buildValveSpareExportRows)가
// 동일한 조건을 재사용해 "화면엔 필터 걸었는데 Export는 전체가 나오는" 불일치를 원천 차단
function _filterValveSpareRows(cfg) {
    const p = cfg.idPrefix;
    const search   = (document.getElementById(`${p}ItemSearch`)?.value || '').trim().toUpperCase();
    const doc      = document.getElementById(`${p}DocFilter`)?.value    || 'All';
    const pkg      = document.getElementById(`${p}PkgFilter`)?.value    || 'All';
    const opTypeF  = document.getElementById(`${p}OpTypeFilter`)?.value || 'All';
    const itemF    = document.getElementById(`${p}ItemFilter`)?.value   || 'All';
    const mat1F    = document.getElementById(`${p}Mat1Filter`)?.value   || 'All';
    const mat2F    = document.getElementById(`${p}Mat2Filter`)?.value   || 'All';
    const sizeF    = document.getElementById(`${p}SizeFilter`)?.value   || 'All';
    const statusF  = document.getElementById(`${p}StatusFilter`)?.value || 'All';

    return db.receiving.filter(r => {
        if (!cfg.rowFilter(r)) return false;
        const item = window.extractItemFromDesc(r.valveType);
        const matchSearch = !search
            || (cfg.includeTagInSearch && (r.tag || '').toUpperCase().includes(search))
            || (r.valveType || '').toUpperCase().includes(search)
            || (r.desc || '').toUpperCase().includes(search);
        const matchDoc    = doc === 'All' || r.docNo === doc;
        const matchPkg    = pkg === 'All' || r.plNo  === pkg;
        const matchOpType = opTypeF === 'All' || r.opType === opTypeF;
        const matchItemF  = itemF === 'All' || item === itemF;
        const matchMat1F  = mat1F === 'All' || r.mat1 === mat1F;
        const matchMat2F  = mat2F === 'All' || r.mat2 === mat2F;
        const matchSizeF  = sizeF === 'All' || r.size === sizeF;
        const pkgSt       = (_plUpdatesCache[r.plNo] || {}).status || '';
        const pkgIssueDateF = (_plUpdatesCache[r.plNo] || {}).issue_date || '';
        const matchStatusF = statusF === 'All' || (statusF === 'Issued' ? !!pkgIssueDateF : pkgSt === statusF);
        return matchSearch && matchDoc && matchPkg && matchOpType && matchItemF && matchMat1F && matchMat2F && matchSizeF && matchStatusF;
    }).sort((a, b) => a.docNo.localeCompare(b.docNo) || a.plNo.localeCompare(b.plNo));
}

// Valve/Spare Receiving 테이블 공용 렌더러 — 컬럼 레이아웃이 동일하고 행 predicate·TAG 컬럼
// 표시만 다름(id는 idPrefix로 일괄 유도, val*/spr* 네이밍이 서로 대응됨)
function _renderValveSpareCore(cfg) {
    const tbody = document.querySelector(`#${cfg.tableId} tbody`);
    if (!tbody) return;

    const data = _filterValveSpareRows(cfg);
    const page = cfg.getPage();
    const rows = data.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(r => {
        const item = window.extractItemFromDesc(r.valveType);
        const pkgStatus    = (_plUpdatesCache[r.plNo] || {}).status || '';
        const pkgIssueDate = (_plUpdatesCache[r.plNo] || {}).issue_date || '';
        const isOnSite   = pkgStatus === 'On-Site' || !!pkgIssueDate;
        const statusColor = pkgIssueDate ? '#2e7d32' : pkgStatus === 'On-Site' ? '#2e7d32' : pkgStatus === 'Shipping' ? '#1565c0' : pkgStatus === 'Preparing' ? '#888' : '#bbb';
        const statusText  = pkgIssueDate || pkgStatus || '—';
        return `<tr${isOnSite ? '' : ' style="color:#999;"'}>
            <td style="text-align:center;white-space:nowrap;">${r.docNo}</td>
            <td style="text-align:center;white-space:nowrap;">${r.plNo}</td>
            <td style="text-align:center;">${cfg.tagCell(r)}</td>
            <td style="text-align:center;white-space:nowrap;">${r.opType}</td>
            <td style="text-align:center;font-weight:600;white-space:nowrap;">${item}</td>
            <td style="text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${r.desc || ''}">${r.desc || '-'}</td>
            <td style="text-align:center;">${r.mat1}</td>
            <td style="text-align:center;">${r.mat2}</td>
            <td style="text-align:center;font-weight:600;">${r.size}</td>
            <td style="text-align:center;">${r.rating}</td>
            <td style="white-space:nowrap;text-align:center;">${r.unit || 'EA'}</td>
            <td style="white-space:nowrap;text-align:center;">${Math.round(r.qty).toLocaleString()}</td>
            <td style="text-align:center;white-space:nowrap;font-weight:600;color:${statusColor};">${statusText}</td>
        </tr>`;
    });
    tbody.innerHTML = rows.join('');
    renderPagination(cfg.paginationId, page, Math.max(1, Math.ceil(data.length / PAGE_SIZE)), cfg.goPageFn);
}

// Valve/Spare 화면 렌더러·Export가 공유하는 설정 (필터 id 접두사, 행 predicate, TAG 컬럼 표시)
const VALVE_CFG = {
    tableId: 'valTable', idPrefix: 'val',
    rowFilter: r => r.category === 'Valve' && !isSpareBodyRow(r), // Spare 예비 밸브 본체는 별도 Spare 탭에서 관리
    includeTagInSearch: true,
    tagCell: r => (r.tag && r.tag !== '-' ? r.tag : '-'),
    getPage: () => currentValPage,
    paginationId: 'valPagination', goPageFn: '_valGoPage'
};
const SPARE_CFG = {
    tableId: 'sprTable', idPrefix: 'spr',
    rowFilter: r => isSpareBodyRow(r),
    includeTagInSearch: false,
    tagCell: () => 'Spare',
    getPage: () => currentSprPage,
    paginationId: 'sprPagination', goPageFn: '_sprGoPage'
};

function renderTagValveTable() {
    _renderValveSpareCore(VALVE_CFG);
}

function renderTagSpecialityTable() {
    _renderRecvCore({
        tableId: 'splTable', searchId: 'splItemSearch',
        docId: 'splDocFilter', pkgId: 'splPkgFilter', statusId: 'splStatusFilter',
        itemId: 'splItemFilter', sizeId: 'splSizeFilter',
        forcedCats: ['Speciality'],
        hideMatCode: true,
        hideCat: true,
        getPage: () => currentSplPage,
        paginationId: 'splPagination', goPageFn: '_splGoPage'
    });
}

// Spare Receiving — Valve/Speciality의 SPARE 합성 태그 예비 밸브/기기 본체만 모아서 별도 관리.
// TAG NO 컬럼은 실제 합성 태그 대신 고정 텍스트 "Spare"로 표시한다.
function renderTagSpareTable() {
    _renderValveSpareCore(SPARE_CFG);
}

function renderActiveReceivingTab() {
    if (_recActiveSec === 'bulk') {
        if (_recActiveBulkTab === 'piping')   renderBulkPipingTable();
        else if (_recActiveBulkTab === 'fitting') renderBulkFittingTable();
        else renderBulkOthersTable();
    } else {
        if (_recActiveTagTab === 'spool') initSpoolReceiving();
        else if (_recActiveTagTab === 'valve') renderTagValveTable();
        else if (_recActiveTagTab === 'speciality') renderTagSpecialityTable();
        else if (_recActiveTagTab === 'support') {
            initSupportSubTabs();
            if (_supportSubTab === 'bulk') renderSupportBulkTable();
            else renderSupportReceivingTable();
        }
        else if (_recActiveTagTab === 'spare') renderTagSpareTable();
    }
}

function switchReceivingTab(sec, tab) {
    _recActiveSec = sec;
    if (sec === 'bulk') _recActiveBulkTab = tab;
    else _recActiveTagTab = tab;

    const bulkEl = document.getElementById('recSecBulk');
    const tagEl  = document.getElementById('recSecTag');
    if (bulkEl) bulkEl.style.display = sec === 'bulk' ? '' : 'none';
    if (tagEl)  tagEl.style.display  = sec === 'tag'  ? '' : 'none';

    if (sec === 'bulk') {
        const pip = document.getElementById('recTabPiping');
        const fit = document.getElementById('recTabFitting');
        const oth = document.getElementById('recTabOthers');
        if (pip) pip.style.display = tab === 'piping'  ? '' : 'none';
        if (fit) fit.style.display = tab === 'fitting' ? '' : 'none';
        if (oth) oth.style.display = tab === 'others'  ? '' : 'none';
    } else {
        const sp = document.getElementById('recTagSpool');
        const vl = document.getElementById('recTagValve');
        const sl = document.getElementById('recTagSpeciality');
        const su = document.getElementById('recTagSupport');
        const sr = document.getElementById('recTagSpare');
        if (sp) sp.style.display = tab === 'spool'      ? '' : 'none';
        if (vl) vl.style.display = tab === 'valve'      ? '' : 'none';
        if (sl) sl.style.display = tab === 'speciality' ? '' : 'none';
        if (su) su.style.display = tab === 'support'    ? '' : 'none';
        if (sr) sr.style.display = tab === 'spare'      ? '' : 'none';
    }

    renderActiveReceivingTab();
}

let _recTabsInited = false;
function initReceivingTabs() {
    if (_recTabsInited) return;
    _recTabsInited = true;

    // Section toggle (Bulk / Tag)
    document.querySelectorAll('.rec-sec-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            _recActiveSec = btn.dataset.sec;
            document.querySelectorAll('.rec-sec-btn').forEach(b => {
                b.style.background = b === btn ? '#0A2540' : '#e0e4ef';
                b.style.color = b === btn ? '#fff' : '#0A2540';
            });
            document.getElementById('recSecBulk').style.display = _recActiveSec === 'bulk' ? '' : 'none';
            document.getElementById('recSecTag').style.display  = _recActiveSec === 'tag'  ? '' : 'none';
            renderActiveReceivingTab();
        });
    });

    // Bulk sub-tabs
    document.querySelectorAll('.bulk-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            _recActiveBulkTab = btn.dataset.tab;
            document.querySelectorAll('.bulk-tab-btn').forEach(b => {
                b.style.borderBottomColor = b === btn ? '#0A2540' : 'transparent';
                b.style.color = b === btn ? '#0A2540' : '#888';
            });
            document.getElementById('recTabPiping').style.display = _recActiveBulkTab === 'piping' ? '' : 'none';
            document.getElementById('recTabOthers').style.display = _recActiveBulkTab === 'others' ? '' : 'none';
            renderActiveReceivingTab();
        });
    });

    // Tag sub-tabs
    document.querySelectorAll('.tag-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            _recActiveTagTab = btn.dataset.tab;
            document.querySelectorAll('.tag-tab-btn').forEach(b => {
                b.style.borderBottomColor = b === btn ? '#0A2540' : 'transparent';
                b.style.color = b === btn ? '#0A2540' : '#888';
            });
            document.getElementById('recTagSpool').style.display      = _recActiveTagTab === 'spool'      ? '' : 'none';
            document.getElementById('recTagValve').style.display      = _recActiveTagTab === 'valve'      ? '' : 'none';
            document.getElementById('recTagSpeciality').style.display = _recActiveTagTab === 'speciality' ? '' : 'none';
            document.getElementById('recTagSupport').style.display    = _recActiveTagTab === 'support'    ? '' : 'none';
            document.getElementById('recTagSpare').style.display      = _recActiveTagTab === 'spare'      ? '' : 'none';
            renderActiveReceivingTab();
        });
    });

    // Filter buttons
    document.getElementById('btnFilterPl')?.addEventListener('click',  () => { currentPlPage  = 1; renderBulkPipingTable(); });
    document.getElementById('btnFilterFit')?.addEventListener('click', () => { currentFitPage = 1; renderBulkFittingTable(); });
    document.getElementById('btnFilterOth')?.addEventListener('click', () => { currentOthPage = 1; renderBulkOthersTable(); });
    document.getElementById('btnFilterVal')?.addEventListener('click', () => { currentValPage = 1; renderTagValveTable(); });
    document.getElementById('btnFilterSpl')?.addEventListener('click', () => { currentSplPage = 1; renderTagSpecialityTable(); });
    document.getElementById('btnFilterSpr')?.addEventListener('click', () => { currentSprPage = 1; renderTagSpareTable(); });
}

window._plGoPage  = function(p) { currentPlPage  = p; renderBulkPipingTable(); };
window._fitGoPage = function(p) { currentFitPage = p; renderBulkFittingTable(); };
window._othGoPage = function(p) { currentOthPage = p; renderBulkOthersTable(); };
window._valGoPage = function(p) { currentValPage = p; renderTagValveTable(); };
window._splGoPage = function(p) { currentSplPage = p; renderTagSpecialityTable(); };
window._sprGoPage = function(p) { currentSprPage = p; renderTagSpareTable(); };

// Support Receiving: Tag(태그 있는 항목) / Bulk(무태그 참고자재) 서브탭 — 기존엔 화면 위/아래로 같이 보이던 걸 분리
let _supportSubTab = 'tag';
let _supportSubTabsInited = false;
function initSupportSubTabs() {
    if (_supportSubTabsInited) return;
    _supportSubTabsInited = true;
    document.querySelectorAll('.support-subtab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            _supportSubTab = btn.dataset.subtab;
            document.querySelectorAll('.support-subtab-btn').forEach(b => {
                b.style.borderBottomColor = b === btn ? '#0A2540' : 'transparent';
                b.style.color = b === btn ? '#0A2540' : '#888';
            });
            document.getElementById('srecTagView').style.display  = _supportSubTab === 'tag'  ? '' : 'none';
            document.getElementById('srecBulkView').style.display = _supportSubTab === 'bulk' ? '' : 'none';
            if (_supportSubTab === 'bulk') renderSupportBulkTable();
            else renderSupportReceivingTable();
        });
    });
}

async function renderSupportReceivingTable() {
    const tbody = document.querySelector('#srecTable tbody');
    if (!tbody) return;
    if (!supabaseClient) return;
    tbody.innerHTML = '<tr><td colspan="14" style="text-align:center;padding:20px;color:#888;">Loading...</td></tr>';

    const search    = (document.getElementById('srecSearch')?.value || '').trim();
    const pkg       = document.getElementById('srecPkgFilter')?.value || 'All';
    const packageNo = document.getElementById('srecPackageNoFilter')?.value || 'All';
    const sys       = document.getElementById('srecSystemFilter')?.value || 'All';
    const iso       = document.getElementById('srecIsoFilter')?.value || 'All';
    const tag       = document.getElementById('srecTagFilter')?.value || 'All';
    const type      = document.getElementById('srecTypeFilter')?.value || 'All';

    const applyFilters = (q) => {
        // Support Tag 없는 Bulk 구조재(renderSupportBulkTable에서 별도 패널로 집계)는 이 Tagged
        // 목록에서 제외 — 제외 안 하면 태그 있는 항목 사이에 태그 없는 행이 섞여 표시됨
        q = q.not('support_tag', 'is', null).neq('support_tag', 'BULK').neq('support_tag', '-');
        if (pkg === 'NULL')      q = q.is('pkg', null);
        else if (pkg !== 'All')  q = q.eq('pkg', pkg);
        if (packageNo !== 'All') q = q.eq('package_no', packageNo);
        if (sys !== 'All')       q = q.eq('system', sys);
        if (iso !== 'All')       q = q.eq('iso_dwg_no', iso);
        if (tag !== 'All')       q = q.ilike('support_tag', `${tag}%`);
        if (type === 'SPECIAL')  q = q.eq('type', 'SPECIAL');
        else if (type !== 'All') q = q.ilike('type', `(${type}-%`);
        if (search) q = q.or(
            `iso_dwg_no.ilike.%${search}%,support_tag.ilike.%${search}%,item.ilike.%${search}%,matl.ilike.%${search}%,id_no.ilike.%${search}%`
        );
        return q;
    };

    const from = (currentSrecPage - 1) * PAGE_SIZE;
    const to   = currentSrecPage * PAGE_SIZE - 1;

    const [dataRes, countRes] = await Promise.all([
        applyFilters(supabaseClient.from('support_receiving')
            .select('pkg,package_no,system,iso_dwg_no,support_tag,type,part_no,id_no,item,matl,size_or_type,qty,delivery_date')
            .range(from, to)
            .order('sys_rank').order('pkg_null_rank').order('support_tag').order('part_no')),
        applyFilters(supabaseClient.from('support_receiving')
            .select('*', { count: 'exact', head: true })),
    ]);

    if (dataRes.error) {
        tbody.innerHTML = `<tr><td colspan="14" style="color:red;text-align:center;">Error: ${dataRes.error.message}</td></tr>`;
        return;
    }

    const data = dataRes.data || [];
    const totalCount = countRes.count ?? data.length;

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="14" style="text-align:center;color:#888;padding:20px;">No data found.</td></tr>';
    } else {
        tbody.innerHTML = data.map(r => {
            const tag = r.support_tag
                ? (r.type && r.support_tag.endsWith(r.type) ? r.support_tag.slice(0, -r.type.length) : r.support_tag)
                : '-';
            return `<tr>
            <td style="text-align:center;white-space:nowrap;">${r.pkg || '-'}</td>
            <td style="text-align:center;white-space:nowrap;">${r.package_no || '-'}</td>
            <td style="text-align:center;white-space:nowrap;font-weight:600;">${r.system || '-'}</td>
            <td style="text-align:center;white-space:nowrap;">${r.iso_dwg_no || '-'}</td>
            <td style="text-align:center;white-space:nowrap;">${tag}</td>
            <td style="text-align:center;white-space:nowrap;">${r.type || '-'}</td>
            <td style="text-align:center;white-space:nowrap;">${r.part_no ?? '-'}</td>
            <td style="text-align:center;white-space:nowrap;">${r.id_no || '-'}</td>
            <td style="text-align:center;white-space:nowrap;">${r.item || '-'}</td>
            <td style="text-align:center;white-space:nowrap;">${r.matl || '-'}</td>
            <td style="text-align:center;white-space:nowrap;">${r.size_or_type || '-'}</td>
            <td style="text-align:center;white-space:nowrap;">${r.qty ?? '-'}</td>
            <td style="text-align:center;white-space:nowrap;">${r.delivery_date || '-'}</td>
        </tr>`;
        }).join('');
    }

    const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
    renderPagination('srecPagination', currentSrecPage, totalPages, '_srecGoPage');
}
window._srecGoPage = function(p) { currentSrecPage = p; renderSupportReceivingTable(); };

// Support Tag가 없는 Bulk 구조재(Channel/H-Beam/Angle/Plate 등)를 Item+Matl+Size 단위로 집계해
// BOM 수량(참고용)과 Received 수량을 함께 보여준다. Tag 매칭이 불가능한 항목이라 %는 계산하지 않는다.
async function renderSupportBulkTable() {
    const tbody = document.getElementById('srecBulkTbody');
    if (!tbody) return;
    if (!supabaseClient) return;
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:16px;color:#888;">Loading...</td></tr>';

    const [bomRes, recRes] = await Promise.all([
        supabaseClient.from('support_bom')
            .select('item,matl,size_or_type,qty')
            .or('support_tag.is.null,support_tag.eq.BULK')
            .limit(2000),
        supabaseClient.from('support_receiving')
            .select('item,matl,size_or_type,qty,package_no,system')
            .or('support_tag.is.null,support_tag.eq.BULK,support_tag.eq.-')
            .limit(2000),
    ]);

    if (bomRes.error || recRes.error) {
        tbody.innerHTML = `<tr><td colspan="6" style="color:red;text-align:center;">Error: ${(bomRes.error || recRes.error).message}</td></tr>`;
        return;
    }

    const keyOf = r => `${r.item || '-'}::${r.matl || '-'}::${r.size_or_type || '-'}`;

    const bomAgg = {}; // key -> { qty }
    (bomRes.data || []).forEach(r => {
        const k = keyOf(r);
        if (!bomAgg[k]) bomAgg[k] = { qty: 0 };
        bomAgg[k].qty += parseFloat(r.qty) || 0;
    });

    // pkgMap: pkgNo -> { qty, system } — System은 renderBulkPkgCell에서 참고 정보로만 노출
    const recAgg = {}; // key -> { qty, pkgMap: { pkgNo: {qty, system} } }
    (recRes.data || []).forEach(r => {
        const k = keyOf(r);
        if (!recAgg[k]) recAgg[k] = { qty: 0, pkgMap: {} };
        const q = parseFloat(r.qty) || 0;
        recAgg[k].qty += q;
        if (r.package_no) {
            const entry = recAgg[k].pkgMap[r.package_no] || { qty: 0, system: r.system };
            entry.qty += q;
            recAgg[k].pkgMap[r.package_no] = entry;
        }
    });

    // renderPkgListCell({pkgNo: qty})과 같은 톤이지만, System을 참고용으로 괄호에 덧붙인다
    function renderBulkPkgCell(pkgMap) {
        const entries = Object.entries(pkgMap);
        if (entries.length === 0) return '-';
        return entries.sort((a, b) => a[0].localeCompare(b[0])).map(([pkgNo, info]) => {
            const done = isPkgIssued(pkgNo);
            const qtyStr = info.qty % 1 === 0 ? info.qty : info.qty.toFixed(2);
            const label = done ? `Issued ${(_plUpdatesCache[pkgNo] || {}).issue_date || ''}` : 'Not Issued';
            const sys = info.system ? `, ${info.system}` : '';
            return `<div>${pkgNo} (${qtyStr} EA${sys}) — <span style="color:${done ? '#2e7d32' : '#999'};">${label}</span></div>`;
        }).join('');
    }

    // key가 "item::matl::size" 형태라 문자열 정렬만으로 Item 우선 정렬이 됨
    const allKeys = [...new Set([...Object.keys(bomAgg), ...Object.keys(recAgg)])].sort();

    if (allKeys.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#888;padding:16px;">No bulk materials found.</td></tr>';
        return;
    }

    tbody.innerHTML = allKeys.map(k => {
        const [kItem, kMatl, kSize] = k.split('::');
        const b = bomAgg[k];
        const rec = recAgg[k];
        const bomQty = b ? b.qty : 0;
        const recQty = rec ? rec.qty : 0;
        const pkgCell = rec ? renderBulkPkgCell(rec.pkgMap) : '-';
        return `<tr>
            <td style="text-align:center;">${kItem}</td>
            <td style="text-align:center;">${kMatl}</td>
            <td style="text-align:center;">${kSize}</td>
            <td style="text-align:center;">${bomQty || '-'}</td>
            <td style="text-align:center;">${recQty || '-'}</td>
            <td style="text-align:left;font-size:11px;line-height:1.6;">${pkgCell}</td>
        </tr>`;
    }).join('');
}

// --- 5. Material Issue (ISO/MR Table) ---
let _isoBoreMapPromise = null; // Material Finding 탭 최초 진입 시에만 1회 지연 로딩(무거운 bom 전체 스캔)
function loadIsoBoreMapOnce() {
    if (!_isoBoreMapPromise) {
        _isoBoreMapPromise = fetchIsoBoreMap().then(({ map, ok }) => {
            db.isoBoreMap = map;
            if (!ok) _isoBoreMapPromise = null; // 재시도 다 실패했으면 캐싱하지 않아야 다음 진입 시 재시도됨
            return map;
        });
    }
    return _isoBoreMapPromise;
}

function renderIssueOptions() {
    const sysSelect = document.getElementById('issueSystemFilter');

    // Sort systems
    const systemsMap = {};
    db.bom.forEach(b => {
        let sys = b.system ? b.system.trim() : null;
        if (sys && sys !== 'Unassigned') systemsMap[sys] = true;
    });

    const systems = Object.keys(systemsMap).sort();
    let sysHtml = '<option value="All">All Systems</option>';
    systems.forEach(s => sysHtml += `<option value="${s.replace(/"/g, '&quot;')}">${s}</option>`);
    sysSelect.innerHTML = sysHtml;

    updateIsoDropdown();
    // Bore 매핑은 비동기로 채워지므로, 로딩 완료 후 System/Bore 연동 드롭다운을 다시 갱신
    loadIsoBoreMapOnce().then(() => updateIsoDropdown());
}

window.updateIsoDropdown = function() {
    const sysSelect = document.getElementById('issueSystemFilter');
    const boreSelect = document.getElementById('issueBoreFilter');
    const isoDatalist = document.getElementById('isoDatalist');
    if (!isoDatalist) return;

    let sys = sysSelect ? sysSelect.value : 'All';
    let bore = boreSelect ? boreSelect.value : 'All';

    const isosMap = {};
    db.bomIsoList.forEach(r => {
        let matchSys = (sys === 'All' || (r.system || '').trim() === sys);
        let matchBore = (bore === 'All' || (db.isoBoreMap[r.iso] && db.isoBoreMap[r.iso].has(bore)));
        if (matchSys && matchBore && r.iso && r.iso !== 'Unassigned') isosMap[r.iso] = true;
    });

    const isos = Object.keys(isosMap).sort();
    let datalistHtml = '<option value="All">';
    isos.forEach(iso => {
        datalistHtml += `<option value="${iso.replace(/"/g, '&quot;')}">`;
    });
    isoDatalist.innerHTML = datalistHtml;

    const isoDropdown = document.getElementById('issueIsoDropdownFilter');
    if (isoDropdown) {
        let dropdownHtml = '<option value="All">All ISOs</option>';
        isos.forEach(iso => {
            const safeIso = iso.replace(/"/g, '&quot;');
            dropdownHtml += `<option value="${safeIso}">${safeIso}</option>`;
        });
        isoDropdown.innerHTML = dropdownHtml;
    }
}


let _supportTagDatalistLoaded = false;
async function loadSupportTagDatalist() {
    if (_supportTagDatalistLoaded) return;
    const tagSel = document.getElementById('mfSupportTagFilter');
    const sysSel = document.getElementById('mfSupportSystemFilter');
    const itemSel = document.getElementById('mfSupportItemFilter');
    if (!tagSel || !supabaseClient) return;
    // support_bom은 15,000+행이라 PostgREST 서버 기본 row cap(10,000)에 걸림 -> range로 청크 분할 조회
    let data = [], from = 0;
    const CHUNK = 5000;
    while (true) {
        const { data: chunk, error } = await supabaseClient.from('support_bom')
            .select('system, support_tag, item').not('support_tag', 'is', null).range(from, from + CHUNK - 1);
        if (error) { console.error('loadSupportTagDatalist failed:', error); return; }
        data = data.concat(chunk || []);
        if (!chunk || chunk.length < CHUNK) break;
        from += CHUNK;
    }
    const tags = [...new Set(data.map(r => r.support_tag).filter(Boolean))].sort();
    tagSel.innerHTML = '<option value="All">All Support Tags</option>' + tags.map(t => `<option value="${t.replace(/"/g, '&quot;')}">${t}</option>`).join('');
    if (sysSel) {
        const systems = [...new Set(data.map(r => r.system).filter(Boolean))].sort();
        sysSel.innerHTML = '<option value="All">All Systems</option>' + systems.map(s => `<option value="${s}">${s}</option>`).join('');
    }
    if (itemSel) {
        const items = [...new Set(data.map(r => r.item).filter(Boolean))].sort();
        itemSel.innerHTML = '<option value="All">All Items</option>' + items.map(i => `<option value="${i.replace(/"/g, '&quot;')}">${i}</option>`).join('');
    }
    _supportTagDatalistLoaded = true;
}

function attachEventListeners() {

    // ── BOM Upload & Update ──────────────────────────────────────────
    let bomUploadRows = [];

    function cleanVal(v) {
        if (v === null || v === undefined) return '';
        const s = String(v).trim();
        return (s === 'nan' || s === '-' || s === 'NaN') ? '' : s;
    }

    const btnUploadBom = document.getElementById('btnUploadBom');
    const bomFileInput = document.getElementById('bomFileInput');
    if (btnUploadBom) btnUploadBom.addEventListener('click', () => bomFileInput.click());

    if (bomFileInput) {
        bomFileInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function(ev) {
                try {
                    const wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' });
                    const ws = wb.Sheets[wb.SheetNames[0]];
                    const raw = XLSX.utils.sheet_to_json(ws, { defval: '' });

                    // Flexible header mapping
                    const COL = {
                        system:   ['System Area','system','System','SYSTEM'],
                        iso:      ['ISO Drawing','iso_dwg_no','ISO','iso'],
                        category: ['Category','category','CATEGORY'],
                        matCode:  ['Mat Code','mat_code','MatCode','MATCODE'],
                        desc:     ['Description','full_description','DESCRIPTION','desc'],
                        uom:      ['Unit','uom','UOM','unit'],
                        qty:      ['Design Qty','qty','QTY','Qty','quantity'],
                    };
                    function getVal(row, keys) {
                        for (const k of keys) if (k in row) return row[k];
                        return '';
                    }

                    bomUploadRows = raw.map(r => ({
                        system:           cleanVal(getVal(r, COL.system)),
                        iso_dwg_no:       cleanVal(getVal(r, COL.iso)) || null,
                        category:         cleanVal(getVal(r, COL.category)),
                        mat_code:         cleanVal(getVal(r, COL.matCode)),
                        full_description: cleanVal(getVal(r, COL.desc)),
                        uom:              cleanVal(getVal(r, COL.uom)) || 'EA',
                        qty:              parseFloat(getVal(r, COL.qty)) || 0,
                    })).filter(r => r.mat_code);

                    // Preview
                    const tbody = document.getElementById('bomUploadPreviewTbody');
                    tbody.innerHTML = '';
                    bomUploadRows.slice(0, 50).forEach(r => {
                        tbody.innerHTML += `<tr>
                            <td>${r.system || '<span style="color:#e53935">—</span>'}</td>
                            <td>${r.iso_dwg_no || '<span style="color:#e53935">—</span>'}</td>
                            <td>${r.category}</td>
                            <td><span class="status-badge ok">${r.mat_code}</span></td>
                            <td title="${r.full_description}">${r.full_description.length > 45 ? r.full_description.substring(0,42)+'...' : r.full_description}</td>
                            <td>${r.uom}</td>
                            <td>${r.qty}</td>
                        </tr>`;
                    });

                    const nanCount  = bomUploadRows.filter(r => !r.system).length;
                    const noIsoCount = bomUploadRows.filter(r => !r.iso_dwg_no).length;
                    const isoSet = new Set(bomUploadRows.map(r => r.iso_dwg_no).filter(Boolean));

                    document.getElementById('bomUploadSummary').innerHTML = `
                        <div style="display:flex; gap:20px; flex-wrap:wrap; margin-bottom:8px;">
                            <div style="background:#e3f2fd; border-radius:8px; padding:10px 18px; text-align:center;">
                                <div style="font-size:22px; font-weight:800; color:#0d47a1;">${bomUploadRows.length.toLocaleString()}</div>
                                <div style="font-size:11px; color:#555;">Total Rows</div>
                            </div>
                            <div style="background:#e8f5e9; border-radius:8px; padding:10px 18px; text-align:center;">
                                <div style="font-size:22px; font-weight:800; color:#2e7d32;">${isoSet.size.toLocaleString()}</div>
                                <div style="font-size:11px; color:#555;">Unique ISOs</div>
                            </div>
                            ${nanCount ? `<div style="background:#fff3e0; border-radius:8px; padding:10px 18px; text-align:center;">
                                <div style="font-size:22px; font-weight:800; color:#e65100;">${nanCount}</div>
                                <div style="font-size:11px; color:#555;">System Empty</div>
                            </div>` : ''}
                            ${noIsoCount ? `<div style="background:#fff3e0; border-radius:8px; padding:10px 18px; text-align:center;">
                                <div style="font-size:22px; font-weight:800; color:#e65100;">${noIsoCount}</div>
                                <div style="font-size:11px; color:#555;">ISO Empty</div>
                            </div>` : ''}
                        </div>
                        <div style="font-size:12px; color:#888;">※ Showing first 50 rows preview. All ${bomUploadRows.length} rows will be updated.</div>
                        <div style="font-size:12px; color:#c62828; font-weight:600; margin-top:6px;">
                            ⚠ Existing BOM rows for ISOs in this file will be deleted and replaced.
                        </div>`;

                    document.getElementById('bomUploadModal').style.display = 'flex';
                } catch(err) {
                    alert('Excel parse error: ' + err.message);
                }
            };
            reader.readAsArrayBuffer(file);
            bomFileInput.value = '';
        });
    }

    document.getElementById('btnCloseBomUpload')?.addEventListener('click',  () => { document.getElementById('bomUploadModal').style.display = 'none'; });
    document.getElementById('btnCancelBomUpload')?.addEventListener('click', () => { document.getElementById('bomUploadModal').style.display = 'none'; });

    document.getElementById('btnConfirmBomUpload')?.addEventListener('click', async () => {
        if (!bomUploadRows.length) return;
        const btn = document.getElementById('btnConfirmBomUpload');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating...';

        try {
            // Get unique ISOs from upload (delete those ISOs first)
            const isoSet = [...new Set(bomUploadRows.map(r => r.iso_dwg_no).filter(Boolean))];

            // Delete existing rows for these ISOs in chunks
            const DEL_CHUNK = 50;
            for (let i = 0; i < isoSet.length; i += DEL_CHUNK) {
                const chunk = isoSet.slice(i, i + DEL_CHUNK);
                const { error } = await supabaseClient.from('bom').delete().in('iso_dwg_no', chunk);
                if (error) throw error;
            }
            // Also delete rows with null/no iso (if any in upload)
            const hasNullIso = bomUploadRows.some(r => !r.iso_dwg_no);
            if (hasNullIso) {
                const { error } = await supabaseClient.from('bom').delete().is('iso_dwg_no', null);
                if (error) throw error;
            }

            // Insert in batches of 300
            const BATCH = 300;
            for (let i = 0; i < bomUploadRows.length; i += BATCH) {
                const { error } = await supabaseClient.from('bom').insert(bomUploadRows.slice(i, i + BATCH));
                if (error) throw error;
            }

            document.getElementById('bomUploadModal').style.display = 'none';
            alert(`✅ BOM updated successfully!\n${bomUploadRows.length} rows inserted across ${isoSet.length} ISOs.`);
            currentBomPage = 1;
            renderBomTable();
        } catch(err) {
            alert('❌ Upload failed: ' + err.message);
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-check"></i> Confirm & Update BOM';
            bomUploadRows = [];
        }
    });
    // ── End BOM Upload ───────────────────────────────────────────────

    // BOM Filter Button
    const btnFilterBom = document.getElementById('btnFilterBom');
    if(btnFilterBom) {
        btnFilterBom.addEventListener('click', () => {
            currentBomPage = 1;
            renderBomTable();
        });
    }

    // BOM Clear Filters Button
    const btnClearBomFilters = document.getElementById('btnClearBomFilters');
    if (btnClearBomFilters) {
        btnClearBomFilters.addEventListener('click', () => {
            const bomIsoSearch = document.getElementById('bomIsoSearch');
            if (bomIsoSearch) bomIsoSearch.value = '';
            const bomSystemFilter = document.getElementById('bomSystemFilter');
            if (bomSystemFilter) bomSystemFilter.value = 'All';
            const bomItemFilter = document.getElementById('bomItemFilter');
            if (bomItemFilter) bomItemFilter.value = 'All';
            const bomMat1Filter = document.getElementById('bomMat1Filter');
            if (bomMat1Filter) bomMat1Filter.value = 'All';
            const bomMat2Filter = document.getElementById('bomMat2Filter');
            if (bomMat2Filter) bomMat2Filter.value = 'All';
            const bomSizeFilter = document.getElementById('bomSizeFilter');
            if (bomSizeFilter) bomSizeFilter.value = 'All';
            const bomRatingFilter = document.getElementById('bomRatingFilter');
            if (bomRatingFilter) bomRatingFilter.value = 'All';
            currentBomPage = 1;
            renderBomTable();
        });
    }

    // MatCode Master Filter Button
    const btnFilterMaster = document.getElementById('btnFilterMaster');
    if(btnFilterMaster) {
        btnFilterMaster.addEventListener('click', () => {
            _matCodePage = 1;
            renderMatCodeMaster();
        });
    }

    const btnExportMaster = document.getElementById('btnExportMaster');
    if (btnExportMaster) {
        btnExportMaster.addEventListener('click', () => {
            const q    = (document.getElementById('masterSearch')?.value || '').toUpperCase();
            const cat  = document.getElementById('masterCatFilter')?.value  || 'All';
            const item = document.getElementById('masterItemFilter')?.value || 'All';
            const size = document.getElementById('masterSizeFilter')?.value || 'All';
            const recDescMap = {};
            db.receiving.forEach(r => { if (r.matCode && !recDescMap[r.matCode]) recDescMap[r.matCode] = r.desc; });

            const data = db.matCodeMaster.filter(m => {
                if (q && !m.matCode.includes(q) && !m.itemDesc.toUpperCase().includes(q) &&
                    !m.matlDesc.toUpperCase().includes(q) && !m.category.toUpperCase().includes(q)) return false;
                if (cat  !== 'All' && m.category !== cat) return false;
                if (item !== 'All' && window.extractItemFromMatCode(m.matCode) !== item) return false;
                if (size !== 'All' && window.extractSizeFromMatCode(m.matCode) !== size) return false;
                return true;
            });

            const rows = data.map(m => ({
                'MatCode':          m.matCode,
                'Category':         m.category,
                'Full Description': db.bomDesc[m.matCode.trim().toUpperCase()] || recDescMap[m.matCode]
                    || [m.itemDesc, m.matlDesc, m.size2, m.classDesc, m.etDesc].filter(v => v && v !== '-').join(', ') || '-',
                'Item':      m.itemDesc,
                'Material':  m.matlDesc,
                'Size (Inch)': m.size1,
                'Size (DN)': m.size2,
                'Class':     m.classDesc,
                'End Type':  m.etDesc,
            }));
            const ws = XLSX.utils.json_to_sheet(rows);
            ws['!cols'] = [20, 12, 40, 18, 14, 10, 10, 10, 10].map(w => ({ wch: w }));
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'MatCode Master');
            const today = new Date().toISOString().split('T')[0];
            XLSX.writeFile(wb, `MatCode_Master_Export_${today}.xlsx`);
        });
    }

    document.getElementById('btnExportShortage')?.addEventListener('click', () => {
        renderShortageTable();
        _exportDiffList(_shortageList, 'Shortage', 'Shortage');
    });
    document.getElementById('btnExportSurplus')?.addEventListener('click', () => {
        renderSurplusTable();
        _exportDiffList(_surplusList, 'Surplus', 'Surplus');
    });

    // BOM Export Excel Button
    const btnExportBom = document.getElementById('btnExportBom');
    if (btnExportBom) {
        btnExportBom.addEventListener('click', async () => {
            btnExportBom.disabled = true;
            btnExportBom.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Exporting...';
            try {
                const cat = _bomTabCategory();
                const sys = document.getElementById('bomSystemFilter')?.value || 'All';

                // PostgREST 서버 row cap(10,000)에 걸리는 카테고리(Pipe/Fitting)가 있어
                // range로 청크 분할 조회(단일 쿼리로는 10,000행 이상 못 받아옴)
                const buildQuery = () => _applyBomTabFilters(
                    supabaseClient.from('bom_detail')
                        .select('system, iso_dwg_no, line_no, category, mat_code, tag, full_description, uom, qty')
                        .order('iso_dwg_no')
                );
                let data = [], from = 0;
                const CHUNK = 5000;
                while (true) {
                    const { data: chunk, error } = await buildQuery().range(from, from + CHUNK - 1);
                    if (error) throw error;
                    data = data.concat(chunk || []);
                    if (!chunk || chunk.length < CHUNK) break;
                    from += CHUNK;
                }

                const masterMap = _buildMasterMap();
                const rows = (data || []).map(b => {
                    const rating = getRatingForMatCode(b.mat_code, masterMap, b.full_description);
                    return {
                        'System Area': b.system || '-',
                        'ISO Drawing': b.iso_dwg_no || '-',
                        'Line No':     b.line_no || '-',
                        'Category':    b.category || '-',
                        'Mat Code / Tag': b.mat_code || b.tag || '-',
                        'Item':        window.extractItemFromDesc(b.full_description),
                        'Rating':      rating,
                        'Description': b.full_description || '-',
                        'Unit':        b.uom || 'EA',
                        'Design Qty':  parseFloat(b.qty || 0)
                    };
                });

                const ws = XLSX.utils.json_to_sheet(rows);
                ws['!cols'] = [18,30,20,14,24,16,10,50,8,12].map(w => ({ wch: w }));
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, 'BOM');

                const today = new Date().toISOString().split('T')[0];
                const fileName = `BOM_${cat}_Export_${today}${sys !== 'All' ? '_' + sys : ''}.xlsx`;
                XLSX.writeFile(wb, fileName);
            } catch(e) {
                alert('Export failed: ' + e.message);
            } finally {
                btnExportBom.disabled = false;
                btnExportBom.innerHTML = '<i class="fas fa-file-excel" style="color:#1d6f42;"></i> Export Excel';
            }
        });
    }

    // Support Receiving Filter Button
    const btnFilterSrec = document.getElementById('btnFilterSrec');
    if (btnFilterSrec) {
        btnFilterSrec.addEventListener('click', () => {
            currentSrecPage = 1;
            renderSupportReceivingTable();
        });
    }

    // Support Receiving Clear Button
    const btnClearSrec = document.getElementById('btnClearSrec');
    if (btnClearSrec) {
        btnClearSrec.addEventListener('click', () => {
            const s = document.getElementById('srecSearch'); if (s) s.value = '';
            const pkg = document.getElementById('srecPkgFilter'); if (pkg) pkg.value = 'All';
            const pno = document.getElementById('srecPackageNoFilter'); if (pno) pno.value = 'All';
            const sys = document.getElementById('srecSystemFilter');
            if (sys) { sys.value = 'All'; sys.dispatchEvent(new Event('change')); }
            const isoF = document.getElementById('srecIsoFilter'); if (isoF) isoF.value = 'All';
            const typ = document.getElementById('srecTypeFilter'); if (typ) typ.value = 'All';
            currentSrecPage = 1;
            renderSupportReceivingTable();
        });
    }

    // Support Receiving Export Button
    const btnExportSrec = document.getElementById('btnExportSrec');
    if (btnExportSrec) {
        btnExportSrec.addEventListener('click', async () => {
            btnExportSrec.disabled = true;
            btnExportSrec.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Exporting...';
            try {
                const search    = (document.getElementById('srecSearch')?.value || '').trim();
                const pkg       = document.getElementById('srecPkgFilter')?.value || 'All';
                const packageNo = document.getElementById('srecPackageNoFilter')?.value || 'All';
                const sys       = document.getElementById('srecSystemFilter')?.value || 'All';
                const iso       = document.getElementById('srecIsoFilter')?.value || 'All';
                const tag       = document.getElementById('srecTagFilter')?.value || 'All';
                const type      = document.getElementById('srecTypeFilter')?.value || 'All';
                const buildQuery = () => {
                    let q = supabaseClient.from('support_receiving')
                        .select('pkg,package_no,system,iso_dwg_no,support_tag,type,part_no,id_no,item,matl,size_or_type,qty,delivery_date')
                        .not('support_tag', 'is', null).neq('support_tag', 'BULK').neq('support_tag', '-')
                        .order('sys_rank').order('pkg_null_rank').order('support_tag').order('part_no');
                    if (pkg === 'NULL')      q = q.is('pkg', null);
                    else if (pkg !== 'All')  q = q.eq('pkg', pkg);
                    if (packageNo !== 'All') q = q.eq('package_no', packageNo);
                    if (sys !== 'All')       q = q.eq('system', sys);
                    if (iso !== 'All')       q = q.eq('iso_dwg_no', iso);
                    if (tag !== 'All')       q = q.ilike('support_tag', `${tag}%`);
                    if (type === 'SPECIAL') q = q.eq('type', 'SPECIAL');
                    else if (type !== 'All') q = q.ilike('type', `(${type}-%`);
                    if (search) q = q.or(`iso_dwg_no.ilike.%${search}%,support_tag.ilike.%${search}%,item.ilike.%${search}%,matl.ilike.%${search}%,id_no.ilike.%${search}%`);
                    return q;
                };
                // support_receiving은 태그행만 13,000+행이라 PostgREST 서버 row cap(10,000)에 걸림
                // -> range로 청크 분할 조회(전체 미필터 상태로 Export 시 잘림 방지)
                let data = [], from = 0;
                const CHUNK = 5000;
                while (true) {
                    const { data: chunk, error } = await buildQuery().range(from, from + CHUNK - 1);
                    if (error) throw error;
                    data = data.concat(chunk || []);
                    if (!chunk || chunk.length < CHUNK) break;
                    from += CHUNK;
                }
                const rows = (data || []).map(r => ({
                    'PKG':           r.pkg           || '-',
                    'PACKAGE NO':    r.package_no    || '-',
                    'SYSTEM':        r.system        || '-',
                    'ISO DWG NO':    r.iso_dwg_no    || '-',
                    'SUPPORT TAG NO': r.support_tag  || '-',
                    'TYPE':          r.type          || '-',
                    'PART NO':       r.part_no       || '-',
                    'ID NO':         r.id_no         || '-',
                    'ITEM':          r.item          || '-',
                    'MATL':          r.matl          || '-',
                    'SIZE OR TYPE':  r.size_or_type  || '-',
                    "Q'TY":          r.qty           || 0,
                    'DELIVERY DATE': r.delivery_date || '-',
                }));
                const ws = XLSX.utils.json_to_sheet(rows);
                ws['!cols'] = [12, 22, 10, 20, 22, 10, 10, 10, 16, 12, 16, 12, 8, 14].map(w => ({ wch: w }));
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, 'Support Receiving');
                const today = new Date().toISOString().split('T')[0];
                XLSX.writeFile(wb, `Support_Receiving_Export_${today}.xlsx`);
            } catch(err) {
                alert('Export failed: ' + err.message);
            } finally {
                btnExportSrec.disabled = false;
                btnExportSrec.innerHTML = '<i class="fas fa-file-excel" style="color:#1d6f42;"></i> Export';
            }
        });
    }

    // Receiving Export Excel (Pipe/Fitting/Others/Speciality 공통) — 화면 렌더러(_renderRecvCore)와
    // 동일한 필터/컬럼 계산(_exportRecvCoreRows)을 그대로 재사용해 화면-엑셀 불일치를 원천 차단
    document.getElementById('btnExportPl')?.addEventListener('click', async () => {
        const rows = await _exportRecvCoreRows({
            searchId: 'plItemSearch', docId: 'plDocFilter', pkgId: 'plPkgFilter', statusId: 'plStatusFilter',
            itemId: 'plItemFilter', sizeId: 'plSizeFilter',
            mat1Id: 'plMat1Filter', mat2Id: 'plMat2Filter', ratingId: 'plRatingFilter',
            forcedCats: ['Pipe'], catFirst: true, hideCat: true, hideTag: true, hideType: true,
        });
        _writeRecvExcel(rows, 'Receiving', `Receiving_Export_${new Date().toISOString().split('T')[0]}.xlsx`);
    });
    document.getElementById('btnExportFit')?.addEventListener('click', async () => {
        const rows = await _exportRecvCoreRows({
            searchId: 'fitItemSearch', docId: 'fitDocFilter', pkgId: 'fitPkgFilter', statusId: 'fitStatusFilter',
            itemId: 'fitItemFilter', sizeId: 'fitSizeFilter',
            mat1Id: 'fitMat1Filter', mat2Id: 'fitMat2Filter', ratingId: 'fitRatingFilter',
            forcedCats: ['Fitting'], catFirst: true, hideCat: true, hideTag: true,
        });
        _writeRecvExcel(rows, 'Receiving', `Fitting_Receiving_Export_${new Date().toISOString().split('T')[0]}.xlsx`);
    });
    document.getElementById('btnExportOth')?.addEventListener('click', async () => {
        const rows = await _exportRecvCoreRows({
            searchId: 'othItemSearch', docId: 'othDocFilter', pkgId: 'othPkgFilter', statusId: 'othStatusFilter',
            itemId: 'othItemFilter', sizeId: 'othSizeFilter',
            mat1Id: 'othMat1Filter', mat2Id: 'othMat2Filter', ratingId: 'othRatingFilter',
            forcedCats: ['Others'], catFirst: true, hideCat: true, hideTag: true,
        });
        _writeRecvExcel(rows, 'Receiving', `Others_Receiving_Export_${new Date().toISOString().split('T')[0]}.xlsx`);
    });

    // Valve/Spare Export 공용 — 화면 렌더러와 동일한 _filterValveSpareRows로 필터 상태를 그대로 반영
    // (MatCode가 없는 카테고리라 Operation Type/Valve Type/Mat1/Mat2 등 자체 필드를 직접 사용)
    function _buildValveSpareExportRows(cfg) {
        return _filterValveSpareRows(cfg).map(r => {
            const pkgStatus    = (_plUpdatesCache[r.plNo] || {}).status || '-';
            const pkgIssueDate = (_plUpdatesCache[r.plNo] || {}).issue_date || '';
            return {
                'PKG':     r.docNo || '-',
                'PKG NO':  r.plNo  || '-',
                'TAG NO':  cfg.tagCell(r),
                'Operation Type': r.opType || '-',
                'Item':    window.extractItemFromDesc(r.valveType),
                'Description': r.desc || '-',
                'Mat 1':   r.mat1 || '-',
                'Mat 2':   r.mat2 || '-',
                'Size':    r.size || '-',
                'Rating':  r.rating || '-',
                'Unit':    r.unit || 'EA',
                'Qty':     r.qty || 0,
                'Status':  pkgIssueDate || pkgStatus,
            };
        });
    }

    function _exportTagRecvRows(rows, sheetName, filenamePrefix) {
        const ws = XLSX.utils.json_to_sheet(rows);
        ws['!cols'] = [10, 18, 12, 22, 14, 30, 10, 10, 8, 8, 10, 14].map(w => ({ wch: w }));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
        const today = new Date().toISOString().split('T')[0];
        XLSX.writeFile(wb, `${filenamePrefix}_Export_${today}.xlsx`);
    }

    const btnExportVal = document.getElementById('btnExportVal');
    if (btnExportVal) {
        btnExportVal.addEventListener('click', () => {
            _exportTagRecvRows(_buildValveSpareExportRows(VALVE_CFG), 'Valve', 'Valve_Receiving');
        });
    }

    const btnExportSpr = document.getElementById('btnExportSpr');
    if (btnExportSpr) {
        btnExportSpr.addEventListener('click', () => {
            _exportTagRecvRows(_buildValveSpareExportRows(SPARE_CFG), 'Spare', 'Spare_Receiving');
        });
    }

    const btnExportSpl = document.getElementById('btnExportSpl');
    if (btnExportSpl) {
        btnExportSpl.addEventListener('click', async () => {
            const rows = await _exportRecvCoreRows({
                searchId: 'splItemSearch', docId: 'splDocFilter', pkgId: 'splPkgFilter', statusId: 'splStatusFilter',
                itemId: 'splItemFilter', sizeId: 'splSizeFilter',
                forcedCats: ['Speciality'], hideMatCode: true, hideCat: true,
            });
            _writeRecvExcel(rows, 'Speciality', `Speciality_Receiving_Export_${new Date().toISOString().split('T')[0]}.xlsx`);
        });
    }

    const sysSelect = document.getElementById('issueSystemFilter');
    if (sysSelect) {
        sysSelect.addEventListener('change', updateIsoDropdown);
    }
    const boreSelect = document.getElementById('issueBoreFilter');
    if (boreSelect) {
        boreSelect.addEventListener('change', updateIsoDropdown);
    }
    const isoDropdownFilter = document.getElementById('issueIsoDropdownFilter');
    if (isoDropdownFilter) {
        // System/Bore로 좁혀진 목록에서 ISO를 정확히 선택 → 검색창에 반영하고 바로 조회
        isoDropdownFilter.addEventListener('change', function() {
            const isoSearch = document.getElementById('issueIsoSearch');
            if (isoSearch) isoSearch.value = this.value === 'All' ? '' : this.value;
            document.getElementById('btnFilterIssue')?.click();
        });
    }

    const isoSearchInput = document.getElementById('issueIsoSearch');
    if (isoSearchInput) {
        isoSearchInput.addEventListener('focus', function() {
            this.value = ''; // Auto-clear to show all suggestions
        });

        // Auto-search: triggers Search BOM when ISO is selected from datalist or Enter is pressed
        let isoAutoSearchTimer = null;
        isoSearchInput.addEventListener('input', function() {
            clearTimeout(isoAutoSearchTimer);
            const val = this.value.trim();
            // Immediately search if value exactly matches a datalist option
            const datalist = document.getElementById('isoDatalist');
            const options = datalist ? Array.from(datalist.options).map(o => o.value) : [];
            if (options.includes(val)) {
                document.getElementById('btnFilterIssue')?.click();
            }
        });
        isoSearchInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                document.getElementById('btnFilterIssue')?.click();
            }
        });
    }

    const btnFilterIssue = document.getElementById('btnFilterIssue');
    if (btnFilterIssue) {
        // Item/Size 드롭박스 동적 갱신
        setupCatItemSize(
            document.getElementById('issueCategoryFilter'),
            document.getElementById('issueItemFilter'),
            document.getElementById('issueSizeFilter'),
            getBomItemsForCat, getBomSizesForCatItem, 'All'
        );

        document.getElementById('btnPrintIso')?.addEventListener('click', () => window.print());

        btnFilterIssue.addEventListener('click', async () => {
            let sys = document.getElementById('issueSystemFilter')?.value || 'All';
            let iso = (document.getElementById('issueIsoSearch')?.value || '').trim();
            let boreFilter = document.getElementById('issueBoreFilter')?.value || 'All';
            let categoryFilter = document.getElementById('issueCategoryFilter')?.value || 'All';
            let itemFilter = document.getElementById('issueItemFilter')?.value || 'All';
            let sizeFilter = document.getElementById('issueSizeFilter')?.value || 'All';

            // 인쇄 시 필터 패널이 안 보이므로, 표별 인쇄 전용 타이틀에 ISO Drawing No/출력일자만 남겨둠
            const printedAt = new Date().toLocaleString();
            const printMeta = `<div class="print-header-meta">ISO Drawing No: <strong>${iso || 'All'}</strong> &nbsp;|&nbsp; Printed: <strong>${printedAt}</strong></div>`;
            const printHeaderPiping = document.getElementById('printHeaderPiping');
            if (printHeaderPiping) printHeaderPiping.innerHTML = `<h2>Piping Material List</h2>${printMeta}`;

            let tbody = document.querySelector('#issueTable tbody');
            tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;padding:16px;color:#888;">Loading...</td></tr>';

            // When ISO is specified: load all materials (no limit)
            // Without ISO: limit to 200 items
            let query = supabaseClient.from('bom')
                .select('mat_code, iso_dwg_no, full_description, uom, qty, system, line_no, tag, category')
                .order('iso_dwg_no');

            if (sys !== 'All') query = query.eq('system', sys);
            if (iso && iso !== 'All') {
                query = query.eq('iso_dwg_no', iso);
            } else {
                query = query.limit(200);
            }

            const { data: bomRows, error } = await query;
            if (error) {
                tbody.innerHTML = `<tr><td colspan="11" style="color:red;text-align:center;">Error: ${error.message}</td></tr>`;
                return;
            }

            if (!bomRows || bomRows.length === 0) {
                tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;">No BOM materials found for the selected ISO Drawing.</td></tr>';
                return;
            }

            // PKG 단위 원자료(matCode → {pkgNo: qty}) — Received/Issued/Stock/Packing List 컬럼 공통 소스
            const pkgBreakdown = buildPkgBreakdown(r => isReceivingActive(r.plNo));

            // Valve/Speciality는 MatCode가 없어(mat_code=NULL) 위 pkgBreakdown에 잡히지 않으므로
            // 이 ISO 안의 Tag 목록으로 Receiving을 직접 매칭해 별도로 PKG 맵을 구성 (Tag당 QTY=1 구조)
            const tagPkgMap = {}; // tag(upper) -> { pkgNo: qty }
            const isoTagSet = new Set(
                bomRows.filter(b => !b.mat_code && b.tag && (b.category === 'Valve' || b.category === 'Speciality'))
                    .map(b => b.tag.toUpperCase())
            );
            if (isoTagSet.size > 0) {
                db.receiving.forEach(r => {
                    if ((r.category !== 'Valve' && r.category !== 'Speciality') || !r.tag || r.tag === '-') return;
                    if (!isReceivingActive(r.plNo)) return;
                    const key = r.tag.toUpperCase();
                    if (!isoTagSet.has(key)) return;
                    if (!tagPkgMap[key]) tagPkgMap[key] = {};
                    tagPkgMap[key][r.plNo] = (tagPkgMap[key][r.plNo] || 0) + (r.qty || 0);
                });
            }

            // FIFO 배분은 ISO Drawing 한 장을 특정했을 때만 의미가 있고 계산 비용도 저렴함(해당 ISO의
            // 소수 MatCode만 조회). ISO 미지정(전체 브라우징) 상태에서는 최대 200건에 걸친 모든 MatCode를
            // 대상으로 전체 수요를 조회해야 해서 매우 비싸므로, 이 경우는 FIFO 없이 전체 재고 기준으로만 표시
            const useFifo = !!(iso && iso !== 'All');

            // FIFO 배분: 같은 MatCode를 쓰는 다른 ISO들이 시공 순서(System 우선순위)대로 먼저 PKG를 선점한다고
            // 가정하고, 이 라인이 실제로 받게 될 PKG 구간(우선순위 오프셋)을 계산하기 위해 전체 수요를 조회
            const fifoMatCodes = useFifo
                ? [...new Set(bomRows.map(b => (b.mat_code || '').trim().toUpperCase()).filter(m => m && m !== 'NONE'))]
                : [];
            const demandByMat = {}; // matCode → { "system::iso": { system, iso, qty } }
            if (fifoMatCodes.length) {
                const { data: demandRows } = await supabaseClient.from('bom')
                    .select('mat_code, iso_dwg_no, qty, system')
                    .in('mat_code', fifoMatCodes);
                (demandRows || []).forEach(d => {
                    const m = (d.mat_code || '').trim().toUpperCase();
                    if (!demandByMat[m]) demandByMat[m] = {};
                    const key = `${d.system || ''}::${d.iso_dwg_no}`;
                    if (!demandByMat[m][key]) demandByMat[m][key] = { system: d.system || '', iso: d.iso_dwg_no, qty: 0 };
                    demandByMat[m][key].qty += (parseFloat(d.qty) || 0);
                });
            }
            // 시공 우선순위: CCW → RW → SW → FG → HW → AS → FO 순으로 먼저 배분, 그 외 System은 전부 그 다음(동순위)
            const SYSTEM_PRIORITY = ['CCW', 'RW', 'SW', 'FG', 'HW', 'AS', 'FO'];
            const systemRank = (sys) => {
                const idx = SYSTEM_PRIORITY.indexOf((sys || '').trim().toUpperCase());
                return idx === -1 ? SYSTEM_PRIORITY.length : idx;
            };
            // 같은 System 순위 내에서는 ISO Drawing 이름 오름차순으로 비교
            const isBeforeTarget = (system, isoName, targetSystem, targetIso) => {
                const r1 = systemRank(system), r2 = systemRank(targetSystem);
                if (r1 !== r2) return r1 < r2;
                return isoName < targetIso;
            };
            const priorDemandFor = (mat, targetIso, targetSystem) => {
                const demandMap = demandByMat[mat];
                if (!demandMap) return 0;
                let prior = 0;
                Object.values(demandMap).forEach(entry => {
                    if (entry.iso && isBeforeTarget(entry.system, entry.iso, targetSystem, targetIso)) prior += entry.qty;
                });
                return prior;
            };
            const matRunningConsumed = {}; // 같은 ISO 내 동일 MatCode 라인이 여러 개일 때 순차 소진 추적

            // Category color map
            const catColors = {
                'Pipe': '#1565c0', 'Fitting': '#2e7d32', 'Valve': '#e65100',
                'Speciality': '#6a1b9a', 'Others': '#546e7a'
            };

            // 카테고리 정렬: Pipe → Fitting → Valve → Speciality → Others
            const CAT_ORDER = { 'Pipe': 1, 'Fitting': 2, 'Valve': 3, 'Speciality': 4, 'Others': 5 };
            bomRows.sort((a, b) => {
                const ca = CAT_ORDER[window.getCategory(a.full_description, a.mat_code)] || 9;
                const cb = CAT_ORDER[window.getCategory(b.full_description, b.mat_code)] || 9;
                return ca - cb;
            });

            let htmlString = '';

            // MatCode가 없는 Valve/Speciality Tag 행 렌더링 — FIFO(matCode 기반) 대신 Tag 1:1 매칭 사용
            const renderTagBasedIsoRow = (b) => {
                const category = b.category;
                if (categoryFilter !== 'All' && category !== categoryFilter) return;

                const item = window.extractItemFromDesc(b.full_description || '');
                if (itemFilter !== 'All' && item !== itemFilter) return;

                const size = category === 'Valve'
                    ? (window.extractDnSizeFromDesc(b.full_description) || '-')
                    : (window.parseSpecialityDesc(b.full_description).size || '-');
                if (sizeFilter !== 'All' && size !== sizeFilter) return;

                if (boreFilter !== 'All' && window.getBoreFromLineNo(b.line_no) !== boreFilter) return;

                const qty = parseFloat(b.qty) || 0;
                const pkgMap = tagPkgMap[b.tag.toUpperCase()] || {};
                let receivedQty = 0, issuedQty = 0;
                Object.entries(pkgMap).forEach(([pkgNo, q]) => {
                    receivedQty += q;
                    if (isPkgIssued(pkgNo)) issuedQty += q;
                });
                const stockQty = Math.max(0, receivedQty - issuedQty);
                const safeDesc = (b.full_description || '-').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
                const catColor = catColors[category] || '#546e7a';
                const isFullyCovered = receivedQty >= qty - 0.001;
                const stockStyle = isFullyCovered ? 'background:#f1f8e9;' : (receivedQty > 0 ? 'background:#fff8e1;' : '');

                htmlString += `<tr style="${stockStyle}">
                    <td style="text-align:center;white-space:nowrap;">${b.system || '-'}</td>
                    <td style="text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${b.iso_dwg_no||''}">${b.iso_dwg_no || '-'}</td>
                    <td style="text-align:center;"><span style="font-size:11px;font-weight:600;color:${catColor};background:${catColor}18;padding:2px 7px;border-radius:10px;white-space:nowrap;">${category}</span></td>
                    <td style="text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${b.tag}"><strong>${b.tag}</strong> <span style="font-size:9px;color:#888;">(Tag)</span></td>
                    <td style="text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${safeDesc}">${safeDesc.length > 40 ? safeDesc.substring(0,40)+'...' : safeDesc}</td>
                    <td style="text-align:center;">${b.uom || 'EA'}</td>
                    <td style="text-align:center;">${qty.toFixed(2)}</td>
                    <td style="text-align:center;">${receivedQty.toFixed(2)}</td>
                    <td style="text-align:center;color:${issuedQty > 0 ? '#e65100' : '#999'};">${issuedQty.toFixed(2)}</td>
                    <td style="text-align:center;"><strong style="color:${isFullyCovered ? '#2e7d32' : (stockQty > 0 ? '#e65100' : '#c62828')};">${stockQty.toFixed(2)}</strong></td>
                    <td style="text-align:left;font-size:11px;line-height:1.6;">${renderPkgListCell(pkgMap)}</td>
                </tr>`;
            };

            bomRows.forEach(b => {
                let mat = (b.mat_code || '').trim().toUpperCase();
                if (!mat || mat === 'NONE') {
                    // MatCode가 없는 Valve/Speciality는 Tag 기준으로 별도 렌더링 (FIFO 대신 Tag 1:1 매칭)
                    if (b.tag && (b.category === 'Valve' || b.category === 'Speciality')) {
                        renderTagBasedIsoRow(b);
                    }
                    return;
                }

                let category = window.getCategory(b.full_description, mat);
                let qty = parseFloat(b.qty) || 0;

                // FIFO 슬라이스 계산 — 필터 적용 여부와 무관하게 항상 선점 순서를 진행시켜야 함
                // (All 모드에서는 한 번의 조회에 여러 ISO가 섞이므로, 같은 ISO 내 누적만 반영하도록 mat+iso로 키 분리)
                let fifoPkgMap;
                if (useFifo) {
                    const consumeKey = `${mat}::${b.iso_dwg_no}`;
                    const priorQty = priorDemandFor(mat, b.iso_dwg_no, b.system) + (matRunningConsumed[consumeKey] || 0);
                    fifoPkgMap = computeFifoPkgSlice(pkgBreakdown[mat] || {}, priorQty, qty);
                    matRunningConsumed[consumeKey] = (matRunningConsumed[consumeKey] || 0) + qty;
                } else {
                    // ISO 미지정 브라우징 모드: FIFO 없이 MatCode 전체 재고를 그대로 보여줌(참고용)
                    fifoPkgMap = pkgBreakdown[mat] || {};
                }

                // Apply category filter
                if (categoryFilter !== 'All' && category !== categoryFilter) return;

                // Apply item filter
                if (itemFilter !== 'All') {
                    const itemFromMat = window.extractItemFromMatCode(mat);
                    const item = (itemFromMat && itemFromMat !== '-') ? itemFromMat : window.extractItemFromDesc(b.full_description || '');
                    if (item !== itemFilter) return;
                }

                // Apply size filter
                if (sizeFilter !== 'All') {
                    const size = window.extractSizeFromMatCode(mat);
                    if (size !== sizeFilter) return;
                }

                // Apply bore filter (Line No 앞자리 사이즈 기준: 2" 이하 Small, 그 외 Large)
                if (boreFilter !== 'All' && window.getBoreFromLineNo(b.line_no) !== boreFilter) return;

                // RECEIVED/ISSUED/STOCK QTY: 전체 MatCode 합계가 아니라 이 라인에 FIFO로 배분된 양 기준
                // (배분된 PKG 중 이미 Issued된 몫 = Issued Qty, 아직 안 쓴 몫 = Stock Qty, 합계 = Received Qty)
                const totalRecAllProject = Object.values(pkgBreakdown[mat] || {}).reduce((a, b2) => a + b2, 0);
                let receivedQty = 0, issuedQty = 0;
                Object.entries(fifoPkgMap).forEach(([pkgNo, q]) => {
                    receivedQty += q;
                    if (isPkgIssued(pkgNo)) issuedQty += q;
                });
                const stockQty = Math.max(0, receivedQty - issuedQty);
                let safeDesc = (b.full_description || '-').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
                let catColor = catColors[category] || '#546e7a';

                // Row highlight based on FIFO 배분량(Received) 대비 BOM 수요 (부동소수점 오차 보정용 미세 허용치)
                const isFullyCovered = receivedQty >= qty - 0.001;
                let stockStyle = isFullyCovered ? 'background:#f1f8e9;' : (receivedQty > 0 ? 'background:#fff8e1;' : '');

                htmlString += `<tr style="${stockStyle}">
                    <td style="text-align:center;white-space:nowrap;">${b.system || '-'}</td>
                    <td style="text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${b.iso_dwg_no||''}">${b.iso_dwg_no || '-'}</td>
                    <td style="text-align:center;"><span style="font-size:11px;font-weight:600;color:${catColor};background:${catColor}18;padding:2px 7px;border-radius:10px;white-space:nowrap;">${category}</span></td>
                    <td style="text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${mat}"><strong>${mat}</strong></td>
                    <td style="text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${safeDesc}">${safeDesc.length > 40 ? safeDesc.substring(0,40)+'...' : safeDesc}</td>
                    <td style="text-align:center;">${b.uom || 'EA'}</td>
                    <td style="text-align:center;">${qty.toFixed(2)}</td>
                    <td style="text-align:center;" title="Total received across project: ${totalRecAllProject.toFixed(2)}">${receivedQty.toFixed(2)}</td>
                    <td style="text-align:center;color:${issuedQty > 0 ? '#e65100' : '#999'};">${issuedQty.toFixed(2)}</td>
                    <td style="text-align:center;"><strong style="color:${isFullyCovered ? '#2e7d32' : (stockQty > 0 ? '#e65100' : '#c62828')};">${stockQty.toFixed(2)}</strong></td>
                    <td style="text-align:left;font-size:11px;line-height:1.6;">${renderPkgListCell(fifoPkgMap)}</td>
                </tr>`;
            });

            tbody.innerHTML = htmlString || `<tr><td colspan="11" style="text-align:center;color:#888;">No BOM materials found for the selected ISO Drawing.</td></tr>`;

            if (!iso || iso === 'All') {
                tbody.innerHTML += `<tr><td colspan="11" style="text-align:center;color:var(--color-warning);font-size:11px;padding:8px;">
                    <i class="fas fa-info-circle"></i> Specify an ISO Drawing to view all materials for that drawing.</td></tr>`;
            }
        });
    }

    // Support Material 탭 공용: support_bom + support_receiving을 조합해 BOM/Received/Stock/PKG 렌더링
    // system/iso/tag/type/item — 넘어온 값들을 전부 AND로 조합(값이 'All'/빈문자열이면 그 조건은 생략)
    async function fetchAndRenderSupportRows({ system, iso, tag, typeFilter, item, tbodyEl, emptyMsg }) {
        tbodyEl.innerHTML = '<tr><td colspan="13" style="text-align:center;color:#aaa;padding:12px;">Loading...</td></tr>';

        let query = supabaseClient.from('support_bom')
            .select('system, iso_dwg_no, support_tag, type, item, matl, size_or_type, qty, part_no');

        if (system && system !== 'All') query = query.eq('system', system);
        if (iso) {
            // ISO Drawing은 "베이스도면번호-시트번호" 구조라 Support가 세트 내 다른 시트에만 등록된 경우가 흔함
            // (예: CCP-W-B028-PI-140-AS-002-2 검색해도 -002-5에 있는 Support까지 같은 세트로 간주해 조회)
            const m = iso.match(/^(.*)-(\d+)$/);
            query = m ? query.ilike('iso_dwg_no', `${m[1]}-%`) : query.eq('iso_dwg_no', iso);
        }
        if (tag && tag !== 'All') query = query.eq('support_tag', tag);
        if (typeFilter === 'SPECIAL') query = query.eq('type', 'SPECIAL');
        else if (typeFilter && typeFilter !== 'All') query = query.ilike('type', `(${typeFilter}-%`);
        if (item && item !== 'All') query = query.eq('item', item);

        const { data: suppRows, error } = await query.order('support_tag').order('part_no');

        if (error || !suppRows || suppRows.length === 0) {
            tbodyEl.innerHTML = `<tr><td colspan="13" style="text-align:center;color:#aaa;padding:12px;">${emptyMsg}</td></tr>`;
            return;
        }

        const tags = [...new Set(suppRows.map(s => s.support_tag).filter(Boolean))];
        // System/Type만 넓게 걸면 tags가 수천 개까지 늘어나 .in() URL이 너무 길어져 fetch 자체가 실패함 -> 배치 분할 조회
        const TAG_BATCH = 150;
        let recRows = [];
        for (let i = 0; i < tags.length; i += TAG_BATCH) {
            const { data: chunk, error: recErr } = await supabaseClient.from('support_receiving')
                .select('support_tag, part_no, package_no, qty')
                .in('support_tag', tags.slice(i, i + TAG_BATCH));
            if (recErr) { console.error('fetchAndRenderSupportRows support_receiving 조회 실패:', recErr); continue; }
            recRows = recRows.concat(chunk || []);
        }

        // key = support_tag::part_no → { package_no: qty }
        const pkgByRow = {};
        (recRows || []).forEach(r => {
            const key = `${r.support_tag}::${r.part_no}`;
            if (!pkgByRow[key]) pkgByRow[key] = {};
            pkgByRow[key][r.package_no] = (pkgByRow[key][r.package_no] || 0) + (r.qty || 0);
        });

        const safe = v => (v || '-').toString().replace(/"/g, '&quot;');
        tbodyEl.innerHTML = suppRows.map(s => {
            const key = `${s.support_tag}::${s.part_no}`;
            const pkgMap = pkgByRow[key] || {};
            const received = Object.values(pkgMap).reduce((a, b) => a + b, 0);
            const issued = Object.entries(pkgMap)
                .filter(([pkg]) => isPkgIssued(pkg))
                .reduce((a, [, qty]) => a + qty, 0);
            const stock = Math.max(0, received - issued);
            const bomQty = s.qty ?? 0;
            return `<tr>
                <td style="text-align:center;white-space:nowrap;">${s.system || '-'}</td>
                <td style="text-align:center;white-space:normal;word-break:break-all;" title="${safe(s.iso_dwg_no)}">${s.iso_dwg_no || '-'}</td>
                <td style="text-align:center;white-space:normal;word-break:break-all;font-weight:600;" title="${safe(s.support_tag)}">${s.support_tag || '-'}</td>
                <td style="text-align:center;white-space:nowrap;">${s.type || '-'}</td>
                <td style="text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${safe(s.item)}">${s.item || '-'}</td>
                <td style="text-align:center;">${s.matl || '-'}</td>
                <td style="text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${safe(s.size_or_type)}">${s.size_or_type || '-'}</td>
                <td style="text-align:center;">EA</td>
                <td style="text-align:center;">${bomQty}</td>
                <td style="text-align:center;">${received}</td>
                <td style="text-align:center;color:${issued > 0 ? '#e65100' : '#999'};">${issued}</td>
                <td style="text-align:center;"><strong style="color:${stock >= bomQty ? '#2e7d32' : (stock > 0 ? '#e65100' : '#c62828')};">${stock}</strong></td>
                <td style="text-align:left;font-size:11px;line-height:1.6;">${renderPkgListCell(pkgMap)}</td>
            </tr>`;
        }).join('');
    }

    // Material Finding 모드 전환 (ISO Drawing / Support Tag List)
    document.querySelectorAll('.mf-mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.mf-mode-btn').forEach(b => {
                b.classList.remove('active');
                b.style.borderBottomColor = 'transparent';
                b.style.color = '#888';
            });
            btn.classList.add('active');
            btn.style.borderBottomColor = '#0A2540';
            btn.style.color = '#0A2540';
            const mode = btn.dataset.mode;
            document.getElementById('mfModeIso').style.display     = mode === 'iso'     ? '' : 'none';
            document.getElementById('mfModeSupport').style.display = mode === 'support' ? '' : 'none';
            if (mode === 'support') loadSupportTagDatalist();
        });
    });

    // System/ISO Drawing/Support Tag/Type/Item — 선택된 필터를 전부 AND로 조합해 검색
    const btnFilterSupportTag = document.getElementById('btnFilterSupportTag');
    if (btnFilterSupportTag) {
        btnFilterSupportTag.addEventListener('click', async () => {
            const system = document.getElementById('mfSupportSystemFilter')?.value || 'All';
            const iso = (document.getElementById('mfSupportIsoSearch')?.value || '').trim();
            const tag = document.getElementById('mfSupportTagFilter')?.value || 'All';
            const typeFilter = document.getElementById('mfSupportTypeFilter')?.value || 'All';
            const item = document.getElementById('mfSupportItemFilter')?.value || 'All';
            const tbody = document.getElementById('mfSupportTagTbody');
            if (!tbody) return;
            if (system === 'All' && !iso && tag === 'All' && typeFilter === 'All' && item === 'All') {
                tbody.innerHTML = '<tr><td colspan="13" style="text-align:center;color:#888;">Select at least one filter (System / ISO Drawing / Support Tag / Type / Item).</td></tr>';
                return;
            }
            await fetchAndRenderSupportRows({
                system, iso, tag, typeFilter, item, tbodyEl: tbody,
                emptyMsg: 'No support materials found for the selected filters.'
            });
        });
    }

    const btnAddBomItem = document.getElementById('btnAddBomItem');
    if(btnAddBomItem) {
        btnAddBomItem.addEventListener('click', () => {
            document.getElementById('bomFormPanel').style.display = 'block';
        });
    }
    
    const bomCancelBtn = document.getElementById('bomCancelBtn');
    if(bomCancelBtn) {
        bomCancelBtn.addEventListener('click', () => {
            document.getElementById('bomFormPanel').style.display = 'none';
        });
    }


}

// ── Shipping / Custom Clearance ────────────────────────────────────────
let _shippingData          = null;
let _spoolShippingCache    = null;
let _supportShippingCache  = null;
let _shippingFilteredRows = [];
let _shippingPage        = 1;
let _plUpdatesCache   = {};
let _plChanges        = {};
let _shippingKpiFilter = 'all'; // KPI 카드 클릭 필터: all|shipping|onsite|cleared|pending|issued

// KPI 카드 클릭 핸들러
window.setShippingKpiFilter = function(type) {
    _shippingKpiFilter = type;
    _shippingPage = 1;
    // active 스타일 전환
    document.querySelectorAll('.shipping-kpi-card').forEach(el => {
        el.classList.remove('active-kpi');
        el.style.borderColor = 'transparent';
    });
    const active = document.getElementById('skpi_' + type);
    if (active) { active.classList.add('active-kpi'); active.style.borderColor = ''; }
    // 드롭다운 필터 초기화 (KPI 필터와 충돌 방지)
    const sf = document.getElementById('shippingStatusFilter');
    const cf = document.getElementById('shippingCustomFilter');
    if (sf) sf.value = '';
    if (cf) cf.value = '';
    renderShippingTable(getShippingFiltered());
};

// status가 Preparing/Shipping이면 아직 현장 미도착 → Receiving 집계 제외.
// pl_updates에 상태가 아예 없는 PKG(추적 누락)는 실제로는 대부분 On-Site라 입고완료로 간주(2026-07-06, 사용자 확인).
function isReceivingActive(plNo) {
    const status = (_plUpdatesCache[plNo] || {}).status || '';
    return status !== 'Preparing' && status !== 'Shipping';
}

// PKG의 Issue Date가 설정되어 있으면 "불출 완료"로 판정
function isPkgIssued(plNo) {
    return !!(_plUpdatesCache[plNo] || {}).issue_date;
}

// matCode 단위 Issued 수량 맵 — PKG Issue Date 기준 (구 db.issued 테이블 대체)
function getIssuedQtyMap(filterFn) {
    const map = {};
    db.receiving.forEach(r => {
        if (!r.matCode) return;
        if (!filterFn(r)) return;
        if (!isPkgIssued(r.plNo)) return;
        map[r.matCode] = (map[r.matCode] || 0) + (r.qty || 0);
    });
    return map;
}

// matCode → { pkgNo: qty } — Packing List 컬럼 렌더링용 원자료
function buildPkgBreakdown(filterFn) {
    const map = {};
    db.receiving.filter(filterFn).forEach(r => {
        if (!r.matCode || r.plNo === '-') return;
        if (!map[r.matCode]) map[r.matCode] = {};
        map[r.matCode][r.plNo] = (map[r.matCode][r.plNo] || 0) + (r.qty || 0);
    });
    return map;
}

// FIFO 배분: pkgMap에서 [priorQty, priorQty+qty) 구간에 해당하는 PKG만 추출
// On-Site Date 오름차순(먼저 도착한 PKG 우선), 날짜 없는 PKG는 뒤로. Issued 여부와 무관하게 도착 순서
// 그대로 큐를 구성해야 앞 순위 라인이 이미 불출받은 몫이 큐에서 자연스럽게 소진된 것으로 반영됨
// (Issued/Not Issued 구분은 이후 호출부에서 결과 pkgMap을 다시 나눠서 사용)
function computeFifoPkgSlice(pkgMap, priorQty, qty) {
    if (!pkgMap || qty <= 0) return {};
    const entries = Object.entries(pkgMap)
        .map(([pkgNo, q]) => ({ pkgNo, qty: q, onSite: (_plUpdatesCache[pkgNo] || {}).on_site || '' }))
        .sort((a, b) => {
            if (a.onSite && b.onSite) return a.onSite.localeCompare(b.onSite);
            if (a.onSite) return -1;
            if (b.onSite) return 1;
            return a.pkgNo.localeCompare(b.pkgNo);
        });

    const start = priorQty, end = priorQty + qty;
    const result = {};
    let cursor = 0;
    for (const e of entries) {
        const segStart = cursor, segEnd = cursor + e.qty;
        const overlap = Math.min(segEnd, end) - Math.max(segStart, start);
        if (overlap > 0) result[e.pkgNo] = (result[e.pkgNo] || 0) + overlap;
        cursor = segEnd;
        if (cursor >= end) break;
    }
    return result;
}

// { pkgNo: qty } → "Packing List (PKG No)" 컬럼 HTML (불출 여부 표시 포함)
function renderPkgListCell(pkgMap) {
    if (!pkgMap || Object.keys(pkgMap).length === 0) return '-';
    return Object.entries(pkgMap).sort((a, b) => a[0].localeCompare(b[0])).map(([pkgNo, qty]) => {
        const done = isPkgIssued(pkgNo);
        const qtyStr = qty % 1 === 0 ? qty : qty.toFixed(2);
        const label = done ? `Issued ${(_plUpdatesCache[pkgNo] || {}).issue_date || ''}` : 'Not Issued';
        return `<div>${pkgNo} (${qtyStr} EA) — <span style="color:${done ? '#2e7d32' : '#999'};">${label}</span></div>`;
    }).join('');
}

let _packingToPkgNos  = {};  // packing → [pkg_no, ...]  (전체 필터 기준)
let _pkgNoToPacking   = {};  // pkg_no  → packing
// Packing 단위로 공통 관리되는 필드
const PACKING_LEVEL_FIELDS = ['status', 'on_site', 'custom_clear'];

const PL_EDIT_HEADERS = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
};

async function loadPlUpdates() {
    try {
        const r = await fetch(`${SUPABASE_URL}/rest/v1/pl_updates?select=*`, {
            headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
        });
        const rows = await r.json();
        if (Array.isArray(rows)) rows.forEach(row => { _plUpdatesCache[row.pkg_no] = row; });
    } catch(e) { /* pl_updates 테이블 미존재 시 무시 */ }
}

async function initShipping() {
    // 캐시 있으면 네트워크 요청 없이 즉시 렌더링
    if (_shippingData) {
        renderShippingKpi();
        renderShippingTable(getShippingFiltered());
        return;
    }

    document.getElementById('shippingTbody').innerHTML =
        '<tr><td colspan="12" style="text-align:center;color:#888;padding:30px;"><i class="fas fa-spinner fa-spin"></i> Loading...</td></tr>';
    try {
        // pl_updates는 아직 로드 안 됐을 때만 조회
        if (Object.keys(_plUpdatesCache).length === 0) {
            await loadPlUpdates();
        }

        // spool_receiving: 캐시 있으면 재사용, 없을 때만 조회. 실패 시 캐싱하지 않아야 다음 호출에서
        // 재시도됨(에러를 무시하고 null||[] 로 캐싱하면 빈 배열이 truthy라 영구 고착됨)
        if (!_spoolShippingCache && supabaseClient) {
            const { data: spoolRows, error: spoolErr } = await supabaseClient
                .from('spool_receiving')
                .select('pkg_seq,pkg_no,description,qty,unit,purpose,system')
                .order('pkg_seq', { ascending: true })
                .order('id', { ascending: true })
                .limit(5000);
            if (spoolErr) console.error('spool_receiving(Shipping) 조회 실패:', spoolErr);
            else _spoolShippingCache = spoolRows || [];
        }

        // support_packing_list: 캐시 있으면 재사용, 없을 때만 조회 (위와 동일한 이유로 실패 시 미캐싱)
        if (!_supportShippingCache && supabaseClient) {
            const { data: suppRows, error: suppErr } = await supabaseClient
                .from('support_packing_list')
                .select('pkg,package_no,description,qty,unit,block_info')
                .order('pkg', { ascending: true })
                .order('package_no', { ascending: true })
                .limit(500);
            if (suppErr) console.error('support_packing_list(Shipping) 조회 실패:', suppErr);
            else _supportShippingCache = suppRows || [];
        }

        const spoolShipping = [];
        if (_spoolShippingCache) {
            const spoolSeen = new Set();
            _spoolShippingCache.forEach(r => {
                if (spoolSeen.has(r.pkg_no)) return;
                spoolSeen.add(r.pkg_no);
                const packing = (r.pkg_no || '').match(/^(PGU-DE-\d+)/)?.[1] || r.pkg_no || '';
                spoolShipping.push({
                    packing,
                    pkg_no:       r.pkg_no,
                    category:     'Spool',
                    description:  r.description || 'Piping Spool',
                    item:         'SPOOL',
                    qty:          r.qty || 1,
                    unit:         r.unit || 'EA',
                    purpose:      r.purpose || 'Permanent',
                    status:       '',
                    on_site:      '',
                    custom_clear: '',
                    issue_date:   '',
                    remark:       '',
                });
            });
        }

        // PKG NO당 1행만 표시 (밸브+악세사리 중복 방지) — 첫 번째 항목 기준
        const pkgSeen = new Set();
        _shippingData = db.receiving
            .filter(r => {
                if (pkgSeen.has(r.plNo)) return false;
                pkgSeen.add(r.plNo);
                return true;
            })
            .map(r => {
                // Material Finding/Receiving 테이블과 동일한 Item 산출 방식 (TAG → BOM 매칭 우선)
                const tagInfo    = db.bomTagMap[(r.tag || '').toUpperCase()];
                const effMat     = r.matCode || (tagInfo ? tagInfo.matCode : '');
                const bomFullDesc = tagInfo ? tagInfo.fullDescription : '';
                const _mcItemR  = window.extractItemFromMatCode(effMat);
                const _rawItemR = (_mcItemR && _mcItemR !== '-') ? _mcItemR : window.extractItemFromDesc(bomFullDesc || r.desc);
                const item      = (r.plNo || '').toUpperCase().includes('BYPS') ? 'BYPASS VALVE'
                    : window.getValveOpAccessoryItem(r.plNo, bomFullDesc || r.desc) || _rawItemR;
                return {
                packing:      r.docNo,
                pkg_no:       r.plNo,
                category:     r.category || '-',
                description:  r.desc,
                item:         item,
                qty:          r.qty,
                unit:         r.unit,
                purpose:      r.purpose || '',
                status:       '',
                on_site:      '',
                custom_clear: '',
                issue_date:   '',
                remark:       '',
                };
            });

        // spool_receiving 병합 (중복 PKG NO 제외)
        spoolShipping.forEach(s => {
            if (!pkgSeen.has(s.pkg_no)) {
                pkgSeen.add(s.pkg_no);
                _shippingData.push(s);
            }
        });

        // support_packing_list 병합 (중복 PKG NO 제외)
        if (_supportShippingCache) {
            _supportShippingCache.forEach(s => {
                if (!pkgSeen.has(s.package_no)) {
                    pkgSeen.add(s.package_no);
                    _shippingData.push({
                        packing:      s.pkg || (s.package_no || '').match(/^(PGU-DE-\d+)/)?.[1] || '',
                        pkg_no:       s.package_no,
                        category:     'Support',
                        description:  s.description || 'Support',
                        item:         'SUPPORT',
                        qty:          s.qty || 1,
                        unit:         s.unit || 'EA',
                        purpose:      'Permanent',
                        status:       '',
                        on_site:      '',
                        custom_clear: '',
                        issue_date:   '',
                        remark:       s.block_info || '',
                    });
                }
            });
        }

        _shippingData.sort((a, b) => a.packing.localeCompare(b.packing) || a.pkg_no.localeCompare(b.pkg_no));

        buildShippingGroupFilter(_shippingData);
        renderShippingKpi();
        renderShippingTable(getShippingFiltered());
    } catch(e) {
        document.getElementById('shippingTbody').innerHTML =
            '<tr><td colspan="12" style="text-align:center;color:#e53935;padding:30px;">Failed to load data.</td></tr>';
    }
}

function buildShippingGroupFilter(data) {
    const groups = [...new Set(data.map(r => r.packing))].sort();
    const sel = document.getElementById('shippingGroupFilter');
    if (!sel) return;
    sel.innerHTML = '<option value="">All</option>';
    groups.forEach(g => {
        const opt = document.createElement('option');
        opt.value = g; opt.textContent = g;
        sel.appendChild(opt);
    });

    const pkgs = [...new Set(data.map(r => r.pkg_no))].sort();
    const pkgSel = document.getElementById('shippingPkgFilter');
    if (pkgSel) {
        pkgSel.innerHTML = '<option value="">All</option>';
        pkgs.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p; opt.textContent = p;
            pkgSel.appendChild(opt);
        });
    }

    const categories = [...new Set(data.map(r => r.category).filter(v => v && v !== '-'))].sort();
    const catSel = document.getElementById('shippingCategoryFilter');
    if (catSel) {
        catSel.innerHTML = '<option value="">All</option>';
        categories.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c; opt.textContent = c;
            catSel.appendChild(opt);
        });
    }

    // 수동 지정된 Item(pl_updates.item)이 있으면 그 값 기준으로 필터 옵션 구성
    const items = [...new Set(data.map(r => mergeRow(r).item).filter(v => v && v !== '-'))].sort();
    const itemSel = document.getElementById('shippingItemFilter');
    if (itemSel) {
        itemSel.innerHTML = '<option value="">All</option>';
        items.forEach(i => {
            const opt = document.createElement('option');
            opt.value = i; opt.textContent = i;
            itemSel.appendChild(opt);
        });
    }
}

function getShippingFiltered() {
    const group  = document.getElementById('shippingGroupFilter')?.value || '';
    const pkgF   = document.getElementById('shippingPkgFilter')?.value  || '';
    const catF   = document.getElementById('shippingCategoryFilter')?.value || '';
    const itemF  = document.getElementById('shippingItemFilter')?.value || '';
    const search = (document.getElementById('shippingSearch')?.value || '').trim().toLowerCase();
    const statusF = document.getElementById('shippingStatusFilter')?.value || '';
    const customF = document.getElementById('shippingCustomFilter')?.value || '';
    const issuedF = document.getElementById('shippingIssuedFilter')?.value || '';
    return (_shippingData || [])
        .filter(r => {
            if (group && r.packing !== group) return false;
            if (pkgF  && r.pkg_no  !== pkgF)  return false;
            if (catF  && (r.category || '-') !== catF) return false;
            if (itemF && mergeRow(r).item !== itemF) return false;
            if (search && !r.pkg_no.toLowerCase().includes(search)
                       && !r.description.toLowerCase().includes(search)) return false;
            const needMerge = statusF || customF || issuedF || (_shippingKpiFilter && _shippingKpiFilter !== 'all');
            if (!needMerge) return true;
            const m = mergeRow(r);
            const st = m.status || '';
            const cc = (m.custom_clear || '').trim();
            if (statusF && (statusF === '__none__' ? st !== '' : st !== statusF)) return false;
            if (customF && (customF === '__none__' ? cc !== '' : cc !== customF)) return false;
            // Issued 여부는 On-Site 상태인 항목에만 의미가 있음 -> Preparing/Shipping은 두 옵션 모두에서 제외
            if (issuedF === 'yes' && (st !== 'On-Site' || !m.issue_date)) return false;
            if (issuedF === 'no'  && (st !== 'On-Site' || m.issue_date))  return false;
            if (_shippingKpiFilter && _shippingKpiFilter !== 'all') {
                if (_shippingKpiFilter === 'shipping'  && st !== 'Preparing' && st !== 'Shipping') return false;
                if (_shippingKpiFilter === 'onsite'    && st !== 'On-Site')   return false;
                if (_shippingKpiFilter === 'cleared'   && (st !== 'On-Site' || cc !== 'Cleared')) return false;
                if (_shippingKpiFilter === 'pending'   && (st !== 'On-Site' || cc === 'Cleared')) return false;
                if (_shippingKpiFilter === 'issued'    && !m.issue_date)      return false;
                if (_shippingKpiFilter === 'remaining' && m.issue_date)       return false;
            }
            return true;
        })
        .sort((a, b) => a.packing.localeCompare(b.packing) || a.pkg_no.localeCompare(b.pkg_no));
}

const PL_INPUT_CSS = 'width:100%;box-sizing:border-box;border:1px solid #dde3ee;border-radius:4px;padding:3px 5px;font-size:12px;background:#fff;color:#0A2540;text-align:center;';

function mergeRow(r) {
    const upd = _plUpdatesCache[r.pkg_no] || {};
    const chg = _plChanges[r.pkg_no]      || {};
    return {
        ...r,
        status:        chg.status        ?? upd.status        ?? r.status        ?? '',
        on_site:       chg.on_site       ?? upd.on_site       ?? r.on_site       ?? '',
        custom_clear:  chg.custom_clear  ?? upd.custom_clear  ?? r.custom_clear  ?? '',
        issue_date:    chg.issue_date    ?? upd.issue_date    ?? r.issue_date    ?? '',
        remark:        chg.remark        !== undefined ? chg.remark
                     : upd.remark        !== undefined ? upd.remark
                    : (r.remark || ''),
        // Item: 자동 추출값이 기본값이지만, 사용자가 수동 지정(pl_updates.item)하면 그게 우선
        // (Package No 하나에 여러 자재가 섞여 있는 경우 코드 추출만으로는 한계가 있어 수동 지정 허용)
        item:          chg.item          !== undefined ? chg.item
                     : upd.item          !== undefined && upd.item !== null ? upd.item
                    : (r.item || '-'),
    };
}

// KPI는 전체 _shippingData 기준으로만 계산 (필터 선택과 무관)
function renderShippingKpi() {
    const allMerged  = (_shippingData || []).map(mergeRow);
    const total      = allMerged.length;
    const plCount    = new Set(allMerged.map(r => r.packing)).size;
    const shippingRows  = allMerged.filter(r => r.status === 'Preparing' || r.status === 'Shipping');
    const onsiteRows    = allMerged.filter(r => r.status === 'On-Site');
    const clearedRows   = allMerged.filter(r => r.status === 'On-Site' && r.custom_clear === 'Cleared');
    const issuedRows    = allMerged.filter(r => r.issue_date);
    const pendingRows   = allMerged.filter(r => r.status === 'On-Site' && r.custom_clear !== 'Cleared');
    document.getElementById('sc_pl_count').textContent      = plCount.toLocaleString();
    document.getElementById('sc_total').textContent         = total.toLocaleString();
    document.getElementById('sc_shipping_pl').textContent   = new Set(shippingRows.map(r => r.packing)).size.toLocaleString();
    document.getElementById('sc_shipping').textContent      = shippingRows.length.toLocaleString();
    document.getElementById('sc_onsite_pl').textContent    = new Set(onsiteRows.map(r => r.packing)).size.toLocaleString();
    document.getElementById('sc_onsite').textContent       = onsiteRows.length.toLocaleString();
    document.getElementById('sc_cleared_pl').textContent   = new Set(clearedRows.map(r => r.packing)).size.toLocaleString();
    document.getElementById('sc_cleared').textContent      = clearedRows.length.toLocaleString();
    const issuedPlCount = new Set(issuedRows.map(r => r.packing)).size;
    document.getElementById('sc_issued_pl').textContent    = issuedPlCount.toLocaleString();
    document.getElementById('sc_issued').textContent       = issuedRows.length.toLocaleString();
    document.getElementById('sc_pending_pl').textContent   = new Set(pendingRows.map(r => r.packing)).size.toLocaleString();
    document.getElementById('sc_pending').textContent      = pendingRows.length.toLocaleString();
    document.getElementById('sc_remaining_pl').textContent = (plCount - issuedPlCount).toLocaleString();
    document.getElementById('sc_remaining').textContent    = (total - issuedRows.length).toLocaleString();
    document.getElementById('shippingTotalBadge').textContent = `${total.toLocaleString()} packages`;

    // Packing List No 기준 불출 비율 (issuedPlCount/plCount) — 위에서 표시하는 PL 건수와 동일 기준
    const plPct = plCount > 0 ? Math.round((issuedPlCount / plCount) * 100) : 0;
    document.getElementById('sc_issued_pl_pct').textContent    = plPct;
    document.getElementById('sc_remaining_pl_pct').textContent = 100 - plPct;
}

function renderShippingTable(rows) {
    _shippingFilteredRows = rows || [];
    const totalPages = Math.max(1, Math.ceil(_shippingFilteredRows.length / PAGE_SIZE));
    if (_shippingPage > totalPages) _shippingPage = totalPages;

    // packing ↔ pkg_no 매핑 재구성 (전체 필터 행 기준)
    _packingToPkgNos = {};
    _pkgNoToPacking  = {};
    _shippingFilteredRows.forEach(r => {
        if (!_packingToPkgNos[r.packing]) _packingToPkgNos[r.packing] = [];
        _packingToPkgNos[r.packing].push(r.pkg_no);
        _pkgNoToPacking[r.pkg_no] = r.packing;
    });

    // KPI는 renderShippingKpi()에서 전체 데이터 기준으로 별도 관리
    // 필터된 행 수는 테이블 라벨에만 반영
    const allMerged = _shippingFilteredRows.map(mergeRow);
    document.getElementById('shippingCountLabel').textContent = `(${allMerged.length.toLocaleString()} items)`;

    const start  = (_shippingPage - 1) * PAGE_SIZE;
    const merged = allMerged.slice(start, start + PAGE_SIZE);

    const tbody = document.getElementById('shippingTbody');
    if (!merged.length) {
        tbody.innerHTML = '<tr><td colspan="12" style="text-align:center;color:#888;padding:30px;">No data found.</td></tr>';
        const spEl = document.getElementById('shippingPagination'); if (spEl) spEl.innerHTML = '';
        return;
    }

    const _supportPkgSet = new Set((_supportShippingCache || []).map(s => s.package_no));

    let prevPacking = null;
    let prevPkg = null;
    tbody.innerHTML = merged.map(r => {
        const newGroup  = r.packing !== prevPacking;  // packing 셀 표시 기준
        const newPkg    = r.pkg_no  !== prevPkg;      // Status/Custom Clear 편집 기준
        prevPacking = r.packing;
        prevPkg     = r.pkg_no;
        const packingCell = newGroup
            ? `<td style="text-align:center;font-weight:700;color:#0A2540;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border-top:2px solid #e0e7ef;" title="${r.packing}">${r.packing}</td>`
            : `<td style="text-align:center;color:#ccc;border-top:none;white-space:nowrap;">↳</td>`;
        const qtyDisplay = r.qty !== '' ? Number(r.qty).toLocaleString() : '—';
        const pkg = r.pkg_no;

        const statusOpts = ['', 'Preparing', 'Shipping', 'On-Site'].map(v =>
            `<option value="${v}"${r.status === v ? ' selected' : ''}>${v || '—'}</option>`
        ).join('');

        const roStyle = 'text-align:center;font-size:12px;color:#888;background:#f8fafc;';

        // PKG NO 첫 행만 editable, 동일 PKG NO 내 중복 행은 값만 표시
        const statusCell = newPkg
            ? `<td style="text-align:center;padding:3px;"><select style="${PL_INPUT_CSS}" data-pkg="${pkg}" data-field="status" data-packing="${r.packing}">${statusOpts}</select></td>`
            : `<td style="${roStyle}">${r.status || '—'}</td>`;
        const onSiteCell = `<td style="text-align:center;padding:3px;"><input type="text" class="pl-datepicker" style="${PL_INPUT_CSS}cursor:pointer;text-align:right;" data-pkg="${pkg}" data-field="on_site" data-packing="${r.packing}" value="${r.on_site}" placeholder=""></td>`;
        const clearOpts = ['', 'Pending', 'Cleared'].map(v =>
            `<option value="${v}"${r.custom_clear === v ? ' selected' : ''}>${v || '—'}</option>`
        ).join('');
        const customClearCell = newPkg
            ? `<td style="text-align:center;padding:3px;"><select style="${PL_INPUT_CSS}" data-pkg="${pkg}" data-field="custom_clear" data-packing="${r.packing}">${clearOpts}</select></td>`
            : `<td style="${roStyle}">${r.custom_clear || '—'}</td>`;
        const isSupport = _supportPkgSet.has(r.pkg_no);
        const pkgNoCell = isSupport
            ? `<td style="text-align:center;font-weight:700;font-size:11px;color:#1565c0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${r.pkg_no}">${r.pkg_no}</td>`
            : `<td style="text-align:center;font-weight:700;font-size:11px;color:#1565c0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;" title="${r.pkg_no}" onclick="openPackingListModal('${r.pkg_no}','${r.packing}')">${r.pkg_no}</td>`;

        return `<tr${newGroup ? ' style="background:#f8fafc;"' : ''}>
            ${packingCell}
            ${pkgNoCell}
            <td style="text-align:center;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${r.category || '-'}">${r.category || '-'}</td>
            <td style="text-align:center;font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${r.item || '-'}">${r.item || '-'}</td>
            <td style="text-align:center;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${r.description}">${r.description}</td>
            <td style="text-align:center;font-weight:600;">${qtyDisplay}</td>
            <td style="text-align:center;color:#555;">${r.unit || '—'}</td>
            ${statusCell}
            ${onSiteCell}
            ${customClearCell}
            <td style="text-align:center;padding:3px;">
                <input type="text" class="pl-datepicker" style="${PL_INPUT_CSS}cursor:pointer;text-align:right;" data-pkg="${pkg}" data-field="issue_date" value="${r.issue_date}" placeholder="">
            </td>
            <td style="padding:3px;">
                <textarea style="${PL_INPUT_CSS}resize:vertical;min-height:32px;max-height:80px;" data-pkg="${pkg}" data-field="remark" rows="1">${r.remark || ''}</textarea>
            </td>
        </tr>`;
    }).join('');

    document.querySelectorAll('#shippingTbody .pl-datepicker').forEach(el => {
        if (el._flatpickr) el._flatpickr.destroy();
        flatpickr(el, {
            dateFormat: 'Y-m-d',
            altInput: true,
            altFormat: 'y-m-d',
            allowInput: false,
            disableMobile: true,
            locale: { firstDayOfWeek: 1 },
            onReady: (_dates, _str, fp) => {
                if (fp.altInput) {
                    fp.altInput.style.textAlign = 'center';
                    fp.altInput.placeholder = '';
                }
            },
            onChange: (_dates, dateStr, instance) => {
                instance.element.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });
    });
    renderPagination('shippingPagination', _shippingPage, Math.max(1, Math.ceil(_shippingFilteredRows.length / PAGE_SIZE)), 'goShippingPage');
}

function goShippingPage(p) {
    const totalPages = Math.max(1, Math.ceil(_shippingFilteredRows.length / PAGE_SIZE));
    if (p < 1 || p > totalPages) return;
    _shippingPage = p;
    renderShippingTable(_shippingFilteredRows);
}

function exportShippingExcel() {
    const data = _shippingFilteredRows.map(mergeRow).map(r => ({
        'Packing':      r.packing,
        'Package No.':  r.pkg_no,
        'Category':     r.category || '-',
        'Item':         r.item || '-',
        'Description':  r.description,
        "Q'ty":         r.qty,
        'Unit':         r.unit || '',
        'Status':       r.status || '',
        'On-Site Date': r.on_site || '',
        'Custom Clear': r.custom_clear || '',
        'Issue Date':   r.issue_date || '',
        'Remark':       r.remark || ''
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Package List');
    XLSX.writeFile(wb, `PackageList_${new Date().toISOString().slice(0,10)}.xlsx`);
}

async function savePlUpdates() {
    const btn = document.getElementById('btnSavePL');
    const statusEl = document.getElementById('plSaveStatus');
    const dirty = Object.entries(_plChanges);
    if (!dirty.length) { statusEl.textContent = 'No changes.'; setTimeout(() => statusEl.textContent='', 2000); return; }

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    statusEl.textContent = '';

    try {
        const DATE_FIELDS = ['on_site', 'issue_date'];
        // pl_updates 전체 컬럼을 항상 같은 key 세트로 채운다 — 한 번도 저장된 적 없는
        // pkg_no(캐시에 없음)와 이미 저장된 pkg_no를 같은 배치로 upsert하면 객체마다
        // key 개수가 달라져 PostgREST가 "All object keys must match"(PGRST102)로 거부함.
        const PL_COLUMNS = ['status', 'on_site', 'custom_clear', 'issue_date', 'remark', 'item'];
        const upserts = dirty.map(([pkg_no, fields]) => {
            const cached = _plUpdatesCache[pkg_no] || {};
            const base = { pkg_no };
            PL_COLUMNS.forEach(f => { base[f] = fields[f] !== undefined ? fields[f] : (cached[f] !== undefined ? cached[f] : null); });
            DATE_FIELDS.forEach(f => { if (base[f] === '') base[f] = null; });
            base.updated_at = new Date().toISOString();
            return base;
        });

        const r = await fetch(`${SUPABASE_URL}/rest/v1/pl_updates`, {
            method: 'POST',
            headers: { ...PL_EDIT_HEADERS, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
            body: JSON.stringify(upserts)
        });

        if (r.ok || r.status === 201 || r.status === 204) {
            upserts.forEach(u => { _plUpdatesCache[u.pkg_no] = u; });
            Object.keys(_plChanges).forEach(k => delete _plChanges[k]);
            renderShippingKpi();   // Save 완료 후에만 KPI 갱신
            renderShippingTable(getShippingFiltered());
            // issue_date 변경이 Stock Ledger에 즉시 반영되도록 재렌더링
            if (document.getElementById('material_status')?.classList.contains('active') && _msActiveTab === 'stock') {
                renderActiveStockTab();
            }
            // Status 변경이 Receiving 집계에 반영되도록 Dashboard 재계산
            updateDashboard();
            statusEl.style.color = '#2e7d32';
            statusEl.textContent = `${upserts.length} record(s) saved.`;
        } else {
            const msg = await r.text();
            statusEl.style.color = '#e53935';
            statusEl.textContent = `Save failed: ${msg.slice(0,80)}`;
        }
    } catch(e) {
        statusEl.style.color = '#e53935';
        statusEl.textContent = `Error: ${e.message}`;
    }
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-save"></i> Save';
    setTimeout(() => { statusEl.textContent = ''; statusEl.style.color = '#888'; }, 4000);
}

document.addEventListener('DOMContentLoaded', () => {
    const btnFilter = document.getElementById('btnShippingFilter');
    const btnReset  = document.getElementById('btnShippingReset');
    const btnSave   = document.getElementById('btnSavePL');
    const btnExport = document.getElementById('btnExportPL');
    const btnPrint  = document.getElementById('btnPrintPL');
    const searchBox = document.getElementById('shippingSearch');
    // 드롭다운/검색 필터 사용 시 KPI 카드 필터 초기화
    function resetKpiFilter() {
        _shippingKpiFilter = 'all';
        document.querySelectorAll('.shipping-kpi-card').forEach(el => {
            el.classList.remove('active-kpi');
            el.style.borderColor = 'transparent';
        });
        const allCard = document.getElementById('skpi_all');
        if (allCard) { allCard.classList.add('active-kpi'); allCard.style.borderColor = ''; }
    }
    if (btnFilter) btnFilter.addEventListener('click', () => { resetKpiFilter(); _shippingPage = 1; renderShippingTable(getShippingFiltered()); });
    if (btnReset)  btnReset.addEventListener('click', () => {
        document.getElementById('shippingGroupFilter').value = '';
        document.getElementById('shippingSearch').value = '';
        const pf = document.getElementById('shippingPkgFilter');
        const catf = document.getElementById('shippingCategoryFilter');
        const itf = document.getElementById('shippingItemFilter');
        const sf = document.getElementById('shippingStatusFilter');
        const cf = document.getElementById('shippingCustomFilter');
        const isf = document.getElementById('shippingIssuedFilter');
        if (pf) pf.value = '';
        if (catf) catf.value = '';
        if (itf) itf.value = '';
        if (sf) sf.value = '';
        if (cf) cf.value = '';
        if (isf) isf.value = '';
        resetKpiFilter();
        _shippingPage = 1;
        if (_shippingData) renderShippingTable(getShippingFiltered());
    });
    if (searchBox) searchBox.addEventListener('keyup', e => {
        if (e.key === 'Enter') { _shippingPage = 1; renderShippingTable(getShippingFiltered()); }
    });
    if (btnSave)   btnSave.addEventListener('click', savePlUpdates);
    if (btnExport) btnExport.addEventListener('click', exportShippingExcel);
    if (btnPrint)  btnPrint.addEventListener('click', () => window.print());

    // 편집 셀 change 이벤트 위임
    const tbody = document.getElementById('shippingTbody');
    if (tbody) {
        tbody.addEventListener('change', e => {
            const el = e.target;
            const pkg = el.dataset.pkg;
            const field = el.dataset.field;
            if (!pkg || !field) return;

            if (PACKING_LEVEL_FIELDS.includes(field)) {
                // Packing 레벨: 동일 packing의 모든 pkg_no에 전파
                const packing = _pkgNoToPacking[pkg] || el.dataset.packing;
                const siblings = _packingToPkgNos[packing] || [pkg];
                siblings.forEach(sibPkg => {
                    if (!_plChanges[sibPkg]) _plChanges[sibPkg] = {};
                    _plChanges[sibPkg][field] = el.value;
                    if (sibPkg !== pkg) {
                        const roCell = tbody.querySelector(`[data-pkg-ro="${sibPkg}"][data-field-ro="${field}"]`);
                        if (roCell) roCell.textContent = el.value || '—';
                        // editable sibling 셀 즉시 업데이트 (pkg_no당 1행이므로 모두 editable)
                        const editEl = tbody.querySelector(`[data-pkg="${sibPkg}"][data-field="${field}"]`);
                        if (editEl) editEl.value = el.value;
                    }
                });
            } else {
                if (!_plChanges[pkg]) _plChanges[pkg] = {};
                _plChanges[pkg][field] = el.value;
            }
            document.getElementById('plSaveStatus').style.color = '#e65100';
            document.getElementById('plSaveStatus').textContent = 'Unsaved changes.';
            renderShippingKpi();
        });
        tbody.addEventListener('input', e => {
            const el = e.target;
            if (el.tagName !== 'TEXTAREA') return;
            const pkg = el.dataset.pkg;
            const field = el.dataset.field;
            if (!pkg || !field) return;
            if (!_plChanges[pkg]) _plChanges[pkg] = {};
            _plChanges[pkg][field] = el.value;
            document.getElementById('plSaveStatus').style.color = '#e65100';
            document.getElementById('plSaveStatus').textContent = 'Unsaved changes.';
        });
    }
});

// ============================================================
// Spool Receiving
// ============================================================

// Overall Progress = Total Spool Received(EA) ÷ Total Spool BOM(Tags) — 다른 카테고리의
// BOM vs Received 방식과 동일하게 통일(기존 Tag 매칭 개수 기준에서 변경, 2026-07-06).
// 주의: 현재 spool_bom에 일부 Spool이 누락돼 있어(수정 예정) BOM 대비 비중이 실제보다 높게 나올 수 있음.
function updateSpoolKpis() {
    const recCount = (_srData || []).length;
    const pkgCount = new Set((_srData || []).map(r => r.pkg_no)).size;
    document.querySelectorAll('.spool-kpi-received').forEach(el => el.innerHTML = `${recCount} <span class="unit">EA</span>`);
    document.querySelectorAll('.spool-kpi-rec-sub').forEach(el => el.textContent = `${pkgCount} PKG`);

    const bomTags = _spoolBomTags || new Set();
    const pct = bomTags.size > 0 ? (recCount / bomTags.size * 100) : 0;

    document.querySelectorAll('.spool-kpi-bom').forEach(el => el.innerHTML = `${bomTags.size} <span class="unit">Tags</span>`);
    document.querySelectorAll('.spool-kpi-bom-sub').forEach(el => el.textContent = `${bomTags.size} Tags`);
    document.querySelectorAll('.spool-kpi-progress').forEach(el => el.innerHTML = `${pct.toFixed(1)} <span class="unit">%</span>`);
    document.querySelectorAll('.spool-kpi-prog-sub').forEach(el => el.textContent = `${recCount} / ${bomTags.size} received`);

    const diff = recCount - bomTags.size;
    const diffLabel = diff > 0 ? 'Surplus' : diff < 0 ? 'Shortage' : 'Complete';
    const diffColor = diff > 0 ? '#e65100' : diff < 0 ? '#42a5f5' : '#66bb6a';
    document.querySelectorAll('.spool-kpi-diff').forEach(el => {
        el.innerHTML = `${Math.abs(diff)} <span class="unit">EA</span>`;
        el.style.color = diffColor;
    });
    document.querySelectorAll('.spool-kpi-diff-sub').forEach(el => el.textContent = diff === 0 ? 'BOM = Received' : diffLabel);
}

// --- Spool Receiving ---
let _srData = null;
let _srPage = 1;
let _spoolBomTags = null;

async function initSpoolReceiving() {
    if (_srData) { _initSrFilters(); renderSpoolReceiving(); return; }
    if (!supabaseClient) return;
    const [recRes, bomRes] = await Promise.all([
        supabaseClient
            .from('spool_receiving')
            .select('*')
            .order('pkg_seq', { ascending: true })
            .order('id',      { ascending: true })
            .limit(10000),
        supabaseClient
            .from('spool_bom')
            .select('tag_no')
            .limit(2000)
    ]);
    if (recRes.error) {
        const tb = document.getElementById('srTbody');
        if (tb) tb.innerHTML = `<tr><td colspan="10" style="text-align:center;color:#c00;padding:40px;">Error: ${recRes.error.message}</td></tr>`;
        return;
    }
    if (bomRes.error) {
        console.error('spool_bom fetch error:', bomRes.error);
    }
    _srData = recRes.data || [];
    _spoolBomTags = new Set((bomRes.data || []).map(r => (r.tag_no || '').trim()).filter(Boolean));
    _initSrFilters();
    renderSpoolReceiving();
}

function _initSrFilters() {
    const sel = document.getElementById('srPkgFilter');
    if (!sel) return;
    const pkgs = [...new Set((_srData || []).map(r => r.pkg_no).filter(Boolean))].sort();
    sel.innerHTML = '<option value="">All</option>' + pkgs.map(p => `<option value="${p}">${p}</option>`).join('');
}

function _getSrFiltered() {
    const pkg = document.getElementById('srPkgFilter')?.value  || '';
    const sys = document.getElementById('srSystemFilter')?.value || '';
    const q   = (document.getElementById('srSearch')?.value || '').trim().toLowerCase();
    return (_srData || []).filter(r => {
        if (pkg && r.pkg_no  !== pkg) return false;
        if (sys && r.system  !== sys) return false;
        if (q && ![r.pkg_no, r.tag_no, r.description, r.iso_dwg_no].join(' ').toLowerCase().includes(q)) return false;
        return true;
    });
}

function renderSpoolReceiving() {
    const filtered   = _getSrFiltered();
    const total      = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (_srPage > totalPages) _srPage = 1;

    updateSpoolKpis();

    const start = (_srPage - 1) * PAGE_SIZE;
    const page  = filtered.slice(start, start + PAGE_SIZE);
    const tbody = document.getElementById('srTbody');
    if (!tbody) return;

    const sysBadge = s => s === 'HP'
        ? `<span style="background:#e3f2fd;color:#1565c0;padding:1px 7px;border-radius:10px;font-size:11px;font-weight:600;">HP</span>`
        : s === 'LP'
        ? `<span style="background:#e8f5e9;color:#2e7d32;padding:1px 7px;border-radius:10px;font-size:11px;font-weight:600;">LP</span>`
        : '';

    tbody.innerHTML = page.length === 0
        ? `<tr><td colspan="9" style="text-align:center;color:#999;padding:40px;">No data</td></tr>`
        : page.map(r => {
            const pkgShort = (r.pkg_no || '').match(/^(PGU-DE-\d+)/)?.[1] || r.pkg_no || '';
            return `<tr>
            <td style="font-size:12px;font-weight:600;white-space:nowrap;">${pkgShort}</td>
            <td style="font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${r.pkg_no || ''}">${r.pkg_no || ''}</td>
            <td>${sysBadge(r.system)}</td>
            <td style="font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${r.description || ''}">${r.description || ''}</td>
            <td style="font-weight:600;color:#0A2540;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${r.tag_no || ''}">${r.tag_no || ''}</td>
            <td>${r.item || 'Spool'}</td>
            <td>${r.size || ''}</td>
            <td style="color:#888;">${r.unit || 'EA'}</td>
            <td>${r.qty ?? 1}</td>
        </tr>`;
        }).join('');

    const info = document.getElementById('srCountInfo');
    if (info) info.textContent = `${total} items`;
    renderPagination('srPagination', _srPage, totalPages, '_srGoPage');
}
window._srGoPage = function(p) { _srPage = p; renderSpoolReceiving(); };

// Spool Receiving 이벤트 등록 (DOMContentLoaded 1회)
document.addEventListener('DOMContentLoaded', () => {
    // Spool Receiving 필터
    const btnSrSearch = document.getElementById('btnSrSearch');
    const btnSrReset  = document.getElementById('btnSrReset');
    const srSearchEl  = document.getElementById('srSearch');
    if (btnSrSearch) btnSrSearch.addEventListener('click', () => { _srPage = 1; renderSpoolReceiving(); });
    if (btnSrReset)  btnSrReset.addEventListener('click', () => {
        ['srPkgFilter','srSystemFilter'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
        if (srSearchEl) srSearchEl.value = '';
        _srPage = 1; renderSpoolReceiving();
    });
    if (srSearchEl) srSearchEl.addEventListener('keydown', e => { if (e.key === 'Enter') { _srPage = 1; renderSpoolReceiving(); }});

    const btnExportSr = document.getElementById('btnExportSr');
    if (btnExportSr) {
        btnExportSr.addEventListener('click', () => {
            const rows = _getSrFiltered().map(r => ({
                'PKG NO':      r.pkg_no      || '-',
                'System':      r.system      || '-',
                'Description': r.description || '-',
                'Tag No':      r.tag_no      || '-',
                'Item':        r.item        || 'Spool',
                'Size':        r.size        || '-',
                'Unit':        r.unit        || 'EA',
                'Qty':         r.qty ?? 1,
            }));
            const ws = XLSX.utils.json_to_sheet(rows);
            ws['!cols'] = [22, 8, 40, 20, 14, 14, 8, 8].map(w => ({ wch: w }));
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Spool Receiving');
            const today = new Date().toISOString().split('T')[0];
            XLSX.writeFile(wb, `Spool_Receiving_Export_${today}.xlsx`);
        });
    }
});
