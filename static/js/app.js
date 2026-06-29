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
    bomDesc: {},       // bom_desc view: matCode → full_description (BOM 설계 원문)
    bomTagMap: {},     // bom_detail: tag → {matCode, fullDescription, lineNo} (NULL matCode 입고 레코드 매칭용)
    specialityItems: [], // Speciality category distinct items (mat_code NULL → desc 기반)
    receiving: [],
    mrTable: [],
    issued: []
};

// Session MR number - reused until MR Table is cleared after slip generation
let sessionMrNo = null;

// Cached ISO stage data for client-side re-filtering (donut chart clicks)
let cachedIsoData = [];
let _knownSystems = new Set(); // db.bom 로드 후 갱신, 전역 검색 시스템 매칭용

// Material Shortage 탭 자동 갱신 타이머
let shortageRefreshTimer = null;
const SHORTAGE_REFRESH_INTERVAL_MS = 60 * 1000; // 60초
let _stockFiltersInitialized = false;

async function syncShortageData() {
    if (!supabaseClient) return;
    try {
        const [bomRaw, recvRaw] = await Promise.all([
            supabaseClient.from('bom_agg').select('*').then(r => r.data || []),
            fetchAllRows('receiving')
        ]);
        if (bomRaw.length > 0) {
            db.bom = bomRaw.map(b => ({
                matCode: (b.mat_code || '').trim().toUpperCase(),
                category: b.category || '-',
                system: b.system, tag: b.tag || '-',
                uom: b.uom || 'EA',
                qty: parseFloat(b.total_qty || b.qty) || 0
            })).filter(b => b.qty > 0 && b.matCode);
            _knownSystems = new Set(db.bom.map(b => b.system).filter(Boolean).map(s => s.toUpperCase()));
        }
        if (recvRaw.length > 0) {
            db.receiving = recvRaw.map(r => ({
                id:       r.id,
                matCode:  (r.mat_code || '').trim().toUpperCase(),
                category: r.category || '-',
                docNo:    r.doc_no || '-',
                plNo:     r.pkg_no || '-',
                desc:     r.full_description || '-',
                unit:     r.unit || 'EA',
                qty:      parseFloat(r.qty) || 0,
                tag:      r.tag || '-',
                purpose:  r.purpose || '',
            })).filter(r => r.qty > 0);
            invalidateRecvPurposeMap();
        }
        renderShortageTable();
    } catch (e) {
        console.error('syncShortageData error:', e);
    }
}

// 전체 테이블 공통 페이지 크기
const PAGE_SIZE = 25;

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
    if (d.includes('ELBOW') || d.includes('TEE') || d.includes('REDUCER') || d.includes('CAP') || d.includes('OLET') || d.includes('FLANGE') || d.includes('NIPPLE') || d.includes('COUPLING') || d.includes('UNION') || d.includes('BLIND') || d.includes('FLN') || d.includes('EL9') || d.includes('EL4') || m.startsWith('ELB-') || m.startsWith('TEE-') || m.startsWith('RED-') || m.startsWith('CAP-') || m.startsWith('FLN-') || m.startsWith('PIN-')) return 'Fitting';

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
        'WOL':'WELDOLET', 'SOL':'SOCKOLET', 'TOL':'THREADOLET',
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

async function fetchAllRows(tableName) {
    let allData = [];
    let from = 0;
    let step = 5000;
    let hasMore = true;

    while (hasMore) {
        let q = supabaseClient.from(tableName).select('*');
        if (TABLES_WITH_ID.has(tableName)) q = q.order('id', { ascending: true });
        const { data, error } = await q.range(from, from + step - 1);
        
        if (error) {
            console.error(`❌ Error fetching ${tableName}:`, error);
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

async function syncFromSupabase() {
    if (!supabaseClient) return;
    
    showLoading(true);
    try {
        const [matMasterRaw, bomRaw, bomIsoRaw, recvRaw, issuedRaw, bomDescRaw, specialityRaw, bomTagRaw] = await Promise.all([
            fetchAllRows('matcode_master'),
            supabaseClient.from('bom_agg').select('*').limit(10000).then(r => r.data || []),
            supabaseClient.from('bom_iso_list').select('*').limit(10000).then(r => r.data || []),
            fetchAllRows('receiving'),
            fetchAllRows('issued'),
            supabaseClient.from('bom_desc').select('mat_code,full_description').limit(10000).then(r => r.data || []),
            supabaseClient.from('bom_detail').select('full_description').eq('category', 'Speciality').not('full_description', 'is', null).limit(1000).then(r => r.data || []),
            supabaseClient.from('bom_detail').select('tag,mat_code,full_description,line_no').not('tag', 'is', null).limit(10000).then(r => r.data || [])
        ]);

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
            db.bom = bomRaw.map(b => ({
                matCode: (b.mat_code || '').trim().toUpperCase(),
                category: b.category || '-',
                system: b.system, tag: b.tag || '-',
                uom: b.uom || 'EA',
                qty: parseFloat(b.total_qty || b.qty) || 0
            })).filter(b => b.qty > 0 && b.matCode);
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
                    lineNo: b.line_no || ''
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
            db.receiving = recvRaw.map(r => ({
                id:       r.id,
                matCode:  (r.mat_code || '').trim().toUpperCase(),
                category: r.category || '-',
                docNo:    r.doc_no || '-',
                plNo:     r.pkg_no || '-',
                desc:     r.full_description || '-',
                unit:     r.unit || 'EA',
                qty:      parseFloat(r.qty) || 0,
                tag:      r.tag || '-',
                purpose:  r.purpose || '',
            })).filter(r => r.qty > 0);
            invalidateRecvPurposeMap();
        }

        if (issuedRaw.length > 0) {
            db.issued = issuedRaw.map(i => ({
                matCode: (i.mat_code || '').trim().toUpperCase(),
                qty: parseFloat(i.qty) || 0,
                iso: i.iso || '-',
                mrNo: i.mr_no || '-',
                issueDate: i.issue_date ? i.issue_date.split('T')[0] : '-'
            }));
        }

        await loadPlUpdates();
        _knownSystems = new Set(db.bom.map(b => b.system).filter(Boolean).map(s => s.toUpperCase()));
        // Shipping 캐시 무효화 — 전역 동기화 후 다음 탭 진입 시 재빌드
        _shippingData         = null;
        _spoolShippingCache   = null;
        _supportShippingCache = null;
        renderAllViews();
        initFilterOptions();

        // Refresh active table if user is looking at one
        const activeView = document.querySelector('.view-section.active');
        if (activeView) {
            const id = activeView.id;
            // Use setTimeout to ensure UI is ready for rendering large tables
            setTimeout(() => {
                if(id === 'piping_bom') { initBomTabs(); renderBomTable(); }
                if(id === 'receiving') { initReceivingTabs(); renderActiveReceivingTab(); }
                if(id === 'matcode_master') renderMatCodeMaster();
            }, 200);
        }

    } finally {
        showLoading(false);
    }
}

// ==========================================
// Initialization & Navigation
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initFilterOptions();
    
    // Initial display will be empty until Supabase syncs
    updateDashboard();

    if (supabaseClient) {
        syncFromSupabase();
    } else {
        console.warn("Supabase not configured.");
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

        const section = document.getElementById(targetId);
        if (section) section.classList.add('active');

        if(targetId === 'dashboard') updateDashboard();
        if(targetId === 'issue') renderIssueOptions();
        if(targetId === 'piping_bom') { initBomTabs(); renderBomTable(); }
        if(targetId === 'receiving') { initReceivingTabs(); renderActiveReceivingTab(); }
        if(targetId === 'matcode_master') renderMatCodeMaster();
        if(targetId === 'stock_ledger') { initStockFilters(); initStockTabs(); }
        if(targetId === 'shipping') initShipping();

        // Material Shortage 탭: 진입 시 즉시 싱크 + 폴링 시작, 이탈 시 정리
        if (targetId === 'material_shortage') {
            syncShortageData();
            if (!shortageRefreshTimer) {
                shortageRefreshTimer = setInterval(syncShortageData, SHORTAGE_REFRESH_INTERVAL_MS);
            }
        } else {
            if (shortageRefreshTimer) {
                clearInterval(shortageRefreshTimer);
                shortageRefreshTimer = null;
            }
        }

        if (targetId === 'surplus_material') {
            renderSurplusTable();
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

// ISO stage classification (module-level for reuse)
function getIsoStage(sp, fd) {
    if (fd >= 100) return { label: 'ERECTION READY', cls: 'ok',   color: '#2e7d32' };
    if (sp >= 100) return { label: 'SPOOL READY',    cls: 'info',  color: '#1565c0' };
    if (sp >= 50)  return { label: 'SPOOL IN PROG',  cls: 'warn',  color: '#f57f17' };
    return             { label: 'CRITICAL',        cls: 'err',   color: '#c62828' };
}

// Render ISO priority table — reusable for dropdown filter & donut chart click
let isoCurrentPage = 1;
let isoSortedData = [];

function renderIsoPage(page) {
    const tbody = document.getElementById('priorityIsoTbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    const start = (page - 1) * PAGE_SIZE;
    const pageData = isoSortedData.slice(start, start + PAGE_SIZE);
    if (pageData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#888;padding:20px;">No ISOs found.</td></tr>`;
    } else {
        tbody.innerHTML = pageData.map(iso => {
            const sp = parseFloat(iso.spool_score || 0);
            const fd = parseFloat(iso.field_score || 0);
            const stage = getIsoStage(sp, fd);
            const spBar = `<div style="display:flex;align-items:center;gap:5px;"><div style="width:55px;background:#eee;height:7px;border-radius:4px;overflow:hidden;"><div style="width:${Math.min(sp,100)}%;background:#1565c0;height:100%;"></div></div><span style="font-size:11px;font-weight:600;color:#1565c0;">${sp}%</span></div>`;
            const fdBar = `<div style="display:flex;align-items:center;gap:5px;"><div style="width:55px;background:#eee;height:7px;border-radius:4px;overflow:hidden;"><div style="width:${Math.min(fd,100)}%;background:#2e7d32;height:100%;"></div></div><span style="font-size:11px;font-weight:600;color:#2e7d32;">${fd}%</span></div>`;
            return `<tr style="cursor:pointer;" onclick="window.showIsoDetail('${iso.iso_dwg_no}')" title="${iso.iso_dwg_no}">
                <td><strong style="color:#0A2540;text-decoration:underline dotted;">${iso.iso_dwg_no}</strong></td>
                <td>${spBar}</td>
                <td>${fdBar}</td>
                <td style="font-weight:600;color:#0d47a1;">${parseFloat(iso.total_bom_qty||0).toLocaleString()}</td>
                <td style="font-weight:600;color:#2e7d32;">${parseFloat(iso.total_rec_qty||0).toLocaleString()}</td>
                <td><span class="status-badge ${stage.cls}" style="white-space:nowrap;">${stage.label}</span></td>
                <td><button style="background:#0A2540;color:white;border:none;padding:5px 12px;border-radius:4px;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;" onclick="event.stopPropagation();window.showIsoDetail('${iso.iso_dwg_no}')"><i class="fas fa-file-signature"></i> Issue MR</button></td>
            </tr>`;
        }).join('');
    }
    const totalPages = Math.max(1, Math.ceil(isoSortedData.length / PAGE_SIZE));
    renderPagination('isoPaginator', page, totalPages, 'isoGoPage');
}

window.isoGoPage = function(page) {
    isoCurrentPage = page;
    renderIsoPage(page);
    document.getElementById('priorityIsoTbody')?.closest('.panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

function renderIsoTable(data, dashStage) {
    const stageOrder = { 'SPOOL READY': 0, 'SPOOL IN PROG': 1, 'ERECTION READY': 2, 'CRITICAL': 3 };
    const filteredData = dashStage === 'All'
        ? data
        : data.filter(iso => getIsoStage(parseFloat(iso.spool_score||0), parseFloat(iso.field_score||0)).label === dashStage);
    isoSortedData = [...filteredData].sort((a, b) => {
        const sa = getIsoStage(parseFloat(a.spool_score||0), parseFloat(a.field_score||0));
        const sb = getIsoStage(parseFloat(b.spool_score||0), parseFloat(b.field_score||0));
        const od = (stageOrder[sa.label]??9) - (stageOrder[sb.label]??9);
        return od !== 0 ? od : parseFloat(b.spool_score||0) - parseFloat(a.spool_score||0);
    });
    isoCurrentPage = 1;
    renderIsoPage(1);
}

function renderBulkProgressBars(categories) {
    const container = document.getElementById('bulkProgressChart');
    if (!container) return;

    container.innerHTML = categories.map(({ label, unit, bom, rec }) => {
        const pct      = bom > 0 ? (rec / bom) * 100 : 0;
        const surplus  = rec > bom ? rec - bom : 0;
        const shortage = rec < bom ? bom - rec : 0;
        const fillPct  = Math.min(pct, 100);
        const barColor = pct >= 90 ? '#2e7d32' : pct >= 70 ? '#e65100' : '#c62828';
        const pctColor = pct >= 90 ? '#2e7d32' : pct >= 70 ? '#e65100' : '#c62828';

        const diffHtml = surplus > 0
            ? `<span style="color:#e65100;font-weight:700;">Surplus +${Math.round(surplus).toLocaleString()} ${unit}</span>`
            : shortage > 0
            ? `<span style="color:#c62828;font-weight:700;">Shortage -${Math.round(shortage).toLocaleString()} ${unit}</span>`
            : `<span style="color:#2e7d32;font-weight:700;">✓ Complete</span>`;

        return `
        <div style="margin-bottom:18px;">
            <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:5px;">
                <span style="font-size:13px;font-weight:700;color:#0A2540;">
                    ${label} <span style="font-size:11px;font-weight:400;color:#888;">(${unit})</span>
                </span>
                <span style="font-size:14px;font-weight:800;color:${pctColor};">${pct.toFixed(1)}%</span>
            </div>
            <div style="position:relative;height:24px;background:#e8edf5;border-radius:5px;overflow:hidden;">
                <div style="position:absolute;left:0;top:0;height:100%;width:${fillPct.toFixed(1)}%;background:${barColor};border-radius:5px;"></div>
                ${surplus > 0 ? `<div style="position:absolute;right:0;top:0;height:100%;width:6px;background:#e65100;"></div>` : ''}
            </div>
            <div style="display:flex;justify-content:space-between;margin-top:4px;font-size:11px;color:#555;">
                <span>BOM <b style="color:#0A2540;">${Math.round(bom).toLocaleString()} ${unit}</b></span>
                <span>Received <b style="color:#1565c0;">${Math.round(rec).toLocaleString()} ${unit}</b></span>
                ${diffHtml}
            </div>
        </div>`;
    }).join('');
}

function updateDashboard() {
    if (!supabaseClient) return;

    // Populate dashSystemFilter from db.bomIsoList or db.bom
    const dashSysSelect = document.getElementById('dashSystemFilter');
    const dashIsoSelect = document.getElementById('dashIsoSelect');

    function populateDashIsoDropdown(system) {
        if (!dashIsoSelect) return;
        const isoList = (db.bomIsoList.length ? db.bomIsoList : db.bom)
            .filter(r => system === 'All' || r.system === system)
            .map(r => r.iso).filter(Boolean);
        const uniq = [...new Set(isoList)].sort();
        dashIsoSelect.innerHTML = '<option value="All">All ISOs</option>' +
            uniq.map(i => `<option value="${i}">${i}</option>`).join('');
    }

    if (dashSysSelect && dashSysSelect.options.length <= 1) {
        const systems = [...new Set(
            (db.bomIsoList.length ? db.bomIsoList : db.bom)
                .map(r => r.system).filter(s => s && s.trim() && s.trim() !== 'Unassigned')
        )].sort();
        dashSysSelect.innerHTML = '<option value="All">All Systems</option>' +
            systems.map(s => `<option value="${s}">${s}</option>`).join('');
        populateDashIsoDropdown('All');

        dashSysSelect.addEventListener('change', () => {
            populateDashIsoDropdown(dashSysSelect.value);
        });
    }

    const dashIso = dashIsoSelect?.value || 'All';
    const dashSys = dashSysSelect?.value || 'All';
    const dashStage = document.getElementById('dashStageFilter')?.value || 'All';
    const dashIsoSearchVal = (document.getElementById('dashIsoSearch')?.value || '').trim().toUpperCase();

    // Fetch KPI summary and ISO stage data in parallel
    Promise.all([
        supabaseClient.from('v_project_summary').select('*').limit(1),
        (() => {
            let q = supabaseClient.from('v_iso_stage_status').select('*').limit(10000);
            if (dashSys !== 'All') q = q.eq('system', dashSys);
            if (dashIso !== 'All') q = q.eq('iso_dwg_no', dashIso);
            if (dashIsoSearchVal) q = q.ilike('iso_dwg_no', `%${dashIsoSearchVal}%`);
            return q;
        })()
    ]).then(([summaryRes, listRes]) => {
        // Always run these regardless of v_iso_stage_status result
        if (typeof updateExpediteAlerts === 'function') updateExpediteAlerts();
        if (typeof updateCategoryCharts === 'function') updateCategoryCharts();

        // --- 2. Stage-based ISO chart & table ---
        if (listRes.error) {
            console.error('v_iso_stage_status error:', listRes.error);
            const tbody = document.getElementById('priorityIsoTbody');
            if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#c62828;padding:20px;">
                <i class="fas fa-exclamation-triangle"></i> ISO stage data load failed.
            </td></tr>`;
            return;
        }
        const data = listRes.data;
        if (!data || data.length === 0) {
            const tbody = document.getElementById('priorityIsoTbody');
            if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#888;padding:20px;">No ISO data found.</td></tr>';
            return;
        }

        // Cache for donut chart click re-filtering
        cachedIsoData = data;

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

        // Donut chart — 4 stage segments with click-to-filter
        const stageValues = ['ERECTION READY', 'SPOOL READY', 'SPOOL IN PROG', 'CRITICAL'];
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
                    plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } },
                    onClick: (_event, elements) => {
                        if (elements.length === 0) return;
                        const stage = stageValues[elements[0].index];
                        const sel = document.getElementById('dashStageFilter');
                        if (sel) sel.value = stage;
                        renderIsoTable(cachedIsoData, stage);
                    }
                }
            });
        }

        // Render table with current stage filter
        renderIsoTable(data, dashStage);

    }).catch(err => console.error("Dashboard Sync Fail:", err));
}

function updateExpediteAlerts() {
    const expediteListEl = document.getElementById('expediteList');
    if (!expediteListEl) return;
    
    expediteListEl.innerHTML = '';
    const bomSummary = {};
    db.bom.forEach(b => {
        if(!bomSummary[b.matCode]) bomSummary[b.matCode] = { qty: 0, category: b.category };
        bomSummary[b.matCode].qty += b.qty;
    });

    const recSummary = {};
    db.receiving.filter(r => isReceivingActive(r.plNo) && isKpiReceiving(r)).forEach(r => {
        const tagInfo = db.bomTagMap[(r.tag || '').toUpperCase()];
        const effMat = r.matCode || (tagInfo ? tagInfo.matCode : '');
        if (!effMat) return;
        if(!recSummary[effMat]) recSummary[effMat] = 0;
        recSummary[effMat] += r.qty;
    });

    let hasAlert = false;
    let alertCount = 0;
    Object.keys(bomSummary).forEach(matCode => {
        if(alertCount > 20) return; 
        let req = bomSummary[matCode].qty;
        let rec = recSummary[matCode] || 0;
        let pct = (req > 0) ? (rec / req) * 100 : 100;

        if (pct <= 20) {
            hasAlert = true;
            alertCount++;
            let li = document.createElement('li');
            li.className = 'warning-item';
            li.innerHTML = `
                <div class="wi-icon"><i class="fas fa-exclamation-circle text-danger"></i></div>
                <div class="wi-content">
                    <div class="wi-title">[${matCode}] ${bomSummary[matCode].category || '-'}</div>
                    <div class="wi-desc">Req: ${req.toFixed(1)} | Rec: ${rec.toFixed(1)} (${pct.toFixed(1)}%)</div>
                </div>
            `;
            expediteListEl.appendChild(li);
        }
    });

    if(!hasAlert) {
        expediteListEl.innerHTML = `<div class="empty-state-small" style="padding:10px; color:#666;">All items are > 20% received.</div>`;
    }
}

function updateCategoryCharts() {
    if (!supabaseClient) return;

    // Fetch category summary + Valve/Speciality tag-based receiving + Spool counts + Support
    Promise.all([
        supabaseClient.from('v_category_readiness').select('*'),
        supabaseClient.from('receiving').select('category, qty, tag, full_description').not('tag', 'is', null).in('category', ['Valve', 'Speciality']).limit(10000),
        supabaseClient.from('spool_receiving').select('id', { count: 'exact', head: true }),
        supabaseClient.from('support_receiving').select('qty, package_no').limit(50000),
        supabaseClient.from('pl_updates').select('pkg_no, status').limit(10000)
    ]).then(([catRes, tagRecRes, spoolRecRes, suppRecRes, plUpdRes]) => {
        const data = catRes.data;
        if (catRes.error || !data) {
            console.error("❌ Chart Sync Error:", catRes.error);
            return;
        }

        const spoolBomCount = 0;
        const spoolRecCount = spoolRecRes.count || 0;

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
        // 부속품/스페어파트 정규식 (단일 pass로 모든 키워드 검사)
        const ACCESSORY_RE = /STUD BOLT|SUTD BOLT|NUT |GASKET|FLANGE|BODY |PACKING SET|PACKING GUIDE|STEM PACKING|SPARE PARTS|SPECIAL TOOLS|BLIND FLANGE|BONNET GASKET|TRIM PARTS|SCREW|WASHER|SLEEVE|SPACER|O-RING|PLUG M|SPRING |SEAT COVER|COVER HOLDER|SLOTTED NUT|LOCK WASHER|STUD :|PIPE |B16\.5|GASKET KIT|PRESSURE SEAL|STEM GUIDE|BALANCE SEAL|PISTON RING|WAVE SPRING|DUMMY BONNET|DUMMY CAGE|DUMMY SEAT|FLUSHING|HYDRO TEST|EYE BOLT|BLOW OUT|BLOW THROUGH|TEST PRESSURE|HINGE PIN|SEAL RING| RING FOR|PIN RING/;

        if (tagRecRes.data) {
            tagRecRes.data.forEach(r => {
                const cat = r.category;
                const qty = parseFloat(r.qty || 0);
                const tag = (r.tag || '').trim();
                const desc = (r.full_description || '').toUpperCase();

                if (!/^B[0-2]-/i.test(tag)) return;
                if (ACCESSORY_RE.test(desc)) return;

                activeRecByCategory[cat] = (activeRecByCategory[cat] || 0) + qty;
            });
        }

        const recDataArr = catLabels.map(l => activeRecByCategory[l] || 0);

        // Category KPI cards — % progress per category
        function setCatKpi(pctId, subId, bom, rec, unit) {
            const pct = bom > 0 ? (rec / bom * 100) : 0;
            const color = pct >= 90 ? '#2e7d32' : pct >= 70 ? '#e65100' : '#c62828';
            const elPct = document.getElementById(pctId);
            if (elPct) { elPct.textContent = pct.toFixed(1) + '%'; elPct.style.color = color; }
            const elSub = document.getElementById(subId);
            if (elSub) elSub.textContent = `${Math.round(rec).toLocaleString()} / ${Math.round(bom).toLocaleString()} ${unit}`;
        }
        setCatKpi('kpi-pipe-pct', 'kpi-pipe-sub', bomDataArr[0], recDataArr[0], 'M');
        setCatKpi('kpi-fit-pct',  'kpi-fit-sub',  bomDataArr[1], recDataArr[1], 'EA');
        setCatKpi('kpi-oth-pct',  'kpi-oth-sub',  bomDataArr[5], recDataArr[5], 'EA');

        // Support: BOM = support_receiving 전체 qty 합계
        //          Received = On-Site PKG에 속한 qty 합계
        const onSitePkgs = new Set(
            (plUpdRes.data || []).filter(r => r.status === 'On-Site').map(r => r.pkg_no)
        );
        let supportBom = 0, supportRec = 0;
        (suppRecRes.data || []).forEach(r => {
            const qty = parseFloat(r.qty || 0);
            supportBom += qty;
            if (onSitePkgs.has(r.package_no)) supportRec += qty;
        });
        setCatKpi('kpi-sup-pct', 'kpi-sup-sub', supportBom, supportRec, 'EA');

        // Bulk Material Progress Bars (Pipe / Fitting / Others / Support)
        renderBulkProgressBars([
            { label: 'Pipe',    unit: 'M',  bom: bomDataArr[0], rec: recDataArr[0] },
            { label: 'Fitting', unit: 'EA', bom: bomDataArr[1], rec: recDataArr[1] },
            { label: 'Others',  unit: 'EA', bom: bomDataArr[5], rec: recDataArr[5] },
            { label: 'Support', unit: 'EA', bom: supportBom,    rec: supportRec    },
        ]);

    });
}

// --- 6. Stock Ledger ---
function initStockFilters() {
    const stockCatEl  = document.getElementById('stockCatFilter');
    const stockItemEl = document.getElementById('stockItemFilter');
    const stockMatlEl = document.getElementById('stockMatlFilter');
    const stockSizeEl = document.getElementById('stockSizeFilter');

    // 선택값 보존 (탭 재진입 시 초기화 방지)
    const savedDoc  = document.getElementById('stockDocFilter')?.value  || 'All';
    const savedPkg  = document.getElementById('stockPkgFilter')?.value  || 'All';
    const savedCat  = stockCatEl?.value  || 'All';
    const savedItem = stockItemEl?.value || 'All';
    const savedMatl = stockMatlEl?.value || 'All';
    const savedSize = stockSizeEl?.value || 'All';

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

    // 카테고리 → 아이템 → Material → 사이즈 순서로 재빌드 후 저장값 복원
    if (stockCatEl && [...stockCatEl.options].some(o => o.value === savedCat)) stockCatEl.value = savedCat;
    refreshStockItemOptions(stockCatEl?.value || 'All');
    refreshStockMatlOptions(stockCatEl?.value || 'All');
    const docEl = document.getElementById('stockDocFilter');
    const pkgEl = document.getElementById('stockPkgFilter');
    if (docEl && [...docEl.options].some(o => o.value === savedDoc)) docEl.value = savedDoc;
    if (pkgEl && [...pkgEl.options].some(o => o.value === savedPkg)) pkgEl.value = savedPkg;
    if (stockItemEl && [...stockItemEl.options].some(o => o.value === savedItem)) stockItemEl.value = savedItem;
    if (stockMatlEl && [...stockMatlEl.options].some(o => o.value === savedMatl)) stockMatlEl.value = savedMatl;
    refreshStockSizeOptions(stockCatEl?.value || 'All', stockItemEl?.value || 'All');
    if (stockSizeEl && [...stockSizeEl.options].some(o => o.value === savedSize)) stockSizeEl.value = savedSize;

    // 이벤트 리스너 1회만 등록 (탭 재진입 시 중복 방지)
    if (!_stockFiltersInitialized) {
        _stockFiltersInitialized = true;
        if (stockCatEl) {
            stockCatEl.addEventListener('change', () => {
                refreshStockItemOptions(stockCatEl.value);
                refreshStockMatlOptions(stockCatEl.value);
                refreshStockSizeOptions(stockCatEl.value, 'All');
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
        renderActiveStockTab();
    });

    const btnExportStock = document.getElementById('btnExportStock');
    if (btnExportStock) {
        btnExportStock.addEventListener('click', () => {
            const masterMap = {};
            db.matCodeMaster.forEach(m => { masterMap[m.matCode] = m; });
            const { recMap, docMap, pkgMap } = buildRecvMaps(r => isReceivingActive(r.plNo) && isKpiReceiving(r));
            const recDescMap = {};
            db.receiving.forEach(r => { if (r.matCode && !recDescMap[r.matCode]) recDescMap[r.matCode] = r.desc; });
            const issMap = {};
            db.issued.forEach(i => {
                if (!i.matCode) return;
                issMap[i.matCode] = (issMap[i.matCode] || 0) + i.qty;
            });
            const codes = [...new Set(Object.keys(recMap))].sort();
            const rows = codes.map(key => {
                const { matCode, sizeOverride } = window.parseStockKey(key);
                const m   = masterMap[matCode] || {};
                const rec = recMap[key] || 0;
                const iss = issMap[matCode] || 0;
                const fullDesc = db.bomDesc[matCode] || recDescMap[matCode] || '-';
                const size = sizeOverride || window.getEffectiveSize(matCode, fullDesc, m.size1);
                return {
                    'PKG':             docMap[key] ? [...docMap[key]].sort().join(', ') : '-',
                    'PKG NO':          pkgMap[key] ? [...pkgMap[key]].sort().join(', ') : '-',
                    'MatCode':         matCode,
                    'Category':        m.category || '-',
                    'Full Description': fullDesc,
                    'Item':            m.itemDesc || '-',
                    'Size':            size,
                    'Unit':            'EA',
                    'Total Received':  rec,
                    'Total Issued':    iss,
                    'Stock (Balance)': Math.max(0, rec - iss),
                    'Status':          Math.max(0, rec - iss) > 0 ? 'In Stock' : 'Out of Stock',
                };
            });
            const ws = XLSX.utils.json_to_sheet(rows);
            ws['!cols'] = [18, 28, 26, 12, 40, 14, 8, 6, 14, 12, 14, 12].map(w => ({ wch: w }));
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Stock');
            const today = new Date().toISOString().split('T')[0];
            XLSX.writeFile(wb, `Stock_Export_${today}.xlsx`);
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

function renderStockTable(forcedCats, hideMatCode) {
    let tbody = document.querySelector('#stockTable tbody');
    if(!tbody) return;
    tbody.innerHTML = '';

    // Filter values
    const search   = (document.getElementById('stockSearch')    ?.value || '').toLowerCase();
    const fDoc     = document.getElementById('stockDocFilter')  ?.value || 'All';
    const fPkg     = document.getElementById('stockPkgFilter')  ?.value || 'All';
    const fCat     = document.getElementById('stockCatFilter')  ?.value || 'All';
    const fItem    = document.getElementById('stockItemFilter')  ?.value || 'All';
    const fMatl    = document.getElementById('stockMatlFilter')  ?.value || 'All';
    const fSize    = document.getElementById('stockSizeFilter')  ?.value || 'All';

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

    // Aggregate Issued per MatCode — db.issued 실제 출고 기록 기준 (matCode 단위)
    const issMap = {};
    db.issued.forEach(i => {
        if (!i.matCode) return;
        const mData = masterMap[i.matCode] || {};
        const cat = mData.category && mData.category !== '-'
            ? mData.category
            : window.getCategory(mData.itemDesc, i.matCode);
        if (Array.isArray(forcedCats) && !forcedCats.includes(cat)) return;
        issMap[i.matCode] = (issMap[i.matCode] || 0) + i.qty;
    });

    // activeCodes: recMap 기준 (issued만 있는 항목은 재고 0 → 표시 불필요)
    const activeCodes = [...new Set(Object.keys(recMap))].sort();

    // pre-build receiving desc fallback map (O(n) 1회)
    const recDescMap = {};
    db.receiving.forEach(r => { if (r.matCode && !recDescMap[r.matCode]) recDescMap[r.matCode] = r.desc; });

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
        if (!Array.isArray(forcedCats) && fCat !== 'All' && cat !== fCat) return false;
        if (fItem !== 'All' && item !== fItem)  return false;
        if (fMatl !== 'All' && matl !== fMatl)  return false;
        if (fSize !== 'All' && size !== fSize)  return false;
        if (search && !matCode.toLowerCase().includes(search) &&
            !(mData.itemDesc || '').toLowerCase().includes(search)) return false;
        return true;
    });

    const label = document.getElementById('stockCountLabel');
    if (label) label.textContent = `(${filtered.length.toLocaleString()} items)`;

    const stTotalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    if (_stockPage > stTotalPages) _stockPage = 1;
    const stStart = (_stockPage - 1) * PAGE_SIZE;
    const display = filtered.slice(stStart, stStart + PAGE_SIZE);

    const stockRows = display.map(key => {
        const { matCode, sizeOverride } = window.parseStockKey(key);
        let rec   = recMap[key] || 0;
        let iss   = issMap[matCode] || 0;  // matCode 기준 (복합키 제거)
        let stock = Math.max(0, rec - iss);

        const mData = masterMap[matCode] || { category: '-', itemDesc: '-', size1: '-' };
        let cat = mData.category && mData.category !== '-' ? mData.category : window.getCategory(mData.itemDesc, matCode);
        if (cat === 'Valve') {
            const tagItem = db.bom.find(b => b.matCode === matCode && b.category !== 'BULK' && b.category !== 'Valve')
                         || db.receiving.find(r => r.matCode === matCode && r.category !== 'BULK' && r.category !== 'Valve');
            if (tagItem) cat = tagItem.category;
        }
        const item    = mData.itemDesc || '-';
        const matl    = (matCode.split('-')[1]) || '-';
        const fullDesc = db.bomDesc[matCode] || recDescMap[matCode] || '-';
        const size    = sizeOverride || window.getEffectiveSize(matCode, fullDesc, mData.size1);
        const unitStr = bomLookup[matCode]?.unit || 'EA';
        const badge   = stock > 0 ? '<span class="status-badge ok">In Stock</span>' : '<span class="status-badge err">Out of Stock</span>';
        const docs    = docMap[key] ? [...docMap[key]].sort().join('<br>') : '-';
        const pkgs    = pkgMap[key] ? [...pkgMap[key]].sort().join('<br>') : '-';

        return `<tr>
            <td>${docs}</td>
            <td>${pkgs}</td>
            <td style="${hideMatCode ? 'padding:0;width:0;overflow:hidden;' : 'font-weight:600;color:var(--color-primary);'}">${hideMatCode ? '' : matCode}</td>
            <td><strong>${cat}</strong></td>
            <td>${item}</td>
            <td>${matl}</td>
            <td>${size}</td>
            <td>${unitStr}</td>
            <td style="text-align:center;">${rec.toFixed(2)}</td>
            <td style="text-align:center;">${iss.toFixed(2)}</td>
            <td style="font-weight:700;text-align:center;">${stock.toFixed(2)}</td>
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
    const W = visible
        ? [90,  150, 140,  70,  95, 70, 55, 50, 75, 70, 75, 75]
        : [ 90, 165,   0,  75, 110, 80, 65, 55, 80, 75, 80, 85];
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
    _setStockMatCodeCol(true);
    if (_stActiveBulkTab === 'piping') {
        if (title) title.innerHTML = '<i class="fas fa-warehouse"></i> Stock — Pipe & Fitting';
        renderStockTable(['Pipe', 'Fitting'], false);
    } else {
        if (title) title.innerHTML = '<i class="fas fa-warehouse"></i> Stock — Others';
        renderStockTable(['Others'], false);
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

// --- Material Shortage / Surplus 공용 ---
const CAT_ORDER = { 'Pipe': 0, 'Fitting': 1, 'Valve': 2, 'Spool': 3, 'Support': 4, 'Others': 5, 'Speciality': 6 };

function _buildBomMap() {
    const m = {};
    db.bom.forEach(b => {
        if (!b.matCode) return;
        if (!m[b.matCode]) m[b.matCode] = { qty: 0, uom: b.uom };
        m[b.matCode].qty += b.qty;
    });
    return m;
}

function _buildRecMap() {
    const m = {};
    db.receiving
        .filter(r => (r.purpose === 'Permanent' || r.purpose === '') && isReceivingActive(r.plNo))
        .forEach(r => {
            const tagInfo = db.bomTagMap[(r.tag || '').toUpperCase()];
            const effMat = r.matCode || (tagInfo ? tagInfo.matCode : '');
            if (!effMat) return;
            if (!m[effMat]) m[effMat] = { qty: 0, desc: r.desc, unit: r.unit };
            m[effMat].qty += r.qty;
        });
    return m;
}

function _buildMasterMap() {
    const m = {};
    db.matCodeMaster.forEach(md => { m[md.matCode] = md; });
    return m;
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

function _enrichRow(matCode, bomMap, recMap, masterMap) {
    const mData = masterMap[matCode] || {};
    const desc = db.bomDesc[matCode] || (recMap[matCode]?.desc !== '-' ? recMap[matCode]?.desc : null) || mData.itemDesc || '-';
    const _itemMc = window.extractItemFromMatCode(matCode);
    const item = (_itemMc && _itemMc !== '-') ? _itemMc : window.extractItemFromDesc(desc);
    const _sc = window.extractSizeFromMatCode(matCode);
    const size = (_sc && _sc !== '-') ? _sc : (mData.size1 || '-');
    const cat  = mData.category || window.getCategory(mData.itemDesc || '', matCode);
    const matl = (matCode.split('-')[1]) || '-';
    const unit = recMap[matCode]?.unit || bomMap[matCode]?.uom || 'EA';
    const bomQty = bomMap[matCode]?.qty ?? 0;
    const recQty = recMap[matCode]?.qty ?? 0;
    return { matCode, cat, desc, item, matl, size, unit, bomQty, recQty };
}

const _TABLE_ROW_TPL = ({ matCode, cat, item, matl, size, unit, bomQty, recQty, diffQty, diffColor }) => `<tr>
    <td style="text-align:center;"><strong>${cat}</strong></td>
    <td style="text-align:center;font-weight:600;color:var(--color-primary);white-space:nowrap;">${matCode}</td>
    <td style="text-align:center;">${item}</td>
    <td style="text-align:center;">${matl}</td>
    <td style="text-align:center;">${size}</td>
    <td style="text-align:center;">${unit}</td>
    <td style="text-align:center;">${Math.round(bomQty).toLocaleString()}</td>
    <td style="text-align:center;">${Math.round(recQty).toLocaleString()}</td>
    <td style="text-align:center;font-weight:700;color:${diffColor};">${Math.round(diffQty).toLocaleString()}</td>
</tr>`;

// --- Material Shortage ---
let _shortagePage = 1;
let _shortageList = [];

function renderShortageTable() {
    const tbody = document.querySelector('#shortageTable tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const bomMap = _buildBomMap();
    const recMap = _buildRecMap();
    const masterMap = _buildMasterMap();

    const catFilter  = (document.getElementById('shortCatFilter')  || {}).value || 'ALL';
    const itemFilter = (document.getElementById('shortItemFilter') || {}).value || 'ALL';
    const matlFilter = (document.getElementById('shortMatlFilter') || {}).value || 'ALL';
    const sizeFilter = (document.getElementById('shortSizeFilter') || {}).value || 'ALL';
    const searchQ    = ((document.getElementById('shortSearch')    || {}).value || '').toUpperCase();

    const list = [];
    Object.keys(bomMap).forEach(matCode => {
        const row = _enrichRow(matCode, bomMap, recMap, masterMap);
        const diffQty = row.bomQty - row.recQty;
        if (diffQty <= 0.01) return;
        if (!['Pipe', 'Fitting', 'Others'].includes(row.cat)) return;
        if (catFilter  !== 'ALL' && row.cat  !== catFilter)  return;
        if (itemFilter !== 'ALL' && row.item !== itemFilter) return;
        if (matlFilter !== 'ALL' && row.matl !== matlFilter) return;
        if (sizeFilter !== 'ALL' && row.size !== sizeFilter) return;
        if (searchQ && ![row.matCode, row.item, row.matl, row.size].some(v => (v||'').toUpperCase().includes(searchQ))) return;
        list.push({ ...row, diffQty });
    });
    _sortByCatItemSize(list);

    _shortageList = list;
    _shortagePage = Math.min(_shortagePage, Math.max(1, Math.ceil(list.length / PAGE_SIZE)));
    const countEl = document.getElementById('shortageCount');
    if (countEl) countEl.textContent = list.length > 0 ? `${list.length} items` : '';

    if (list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#666;padding:20px;">No shortage items found.</td></tr>';
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

function renderSurplusTable() {
    const tbody = document.querySelector('#surplusTable tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const bomMap = _buildBomMap();
    const recMap = _buildRecMap();
    const masterMap = _buildMasterMap();

    const catFilter  = (document.getElementById('surplusCatFilter')  || {}).value || 'ALL';
    const itemFilter = (document.getElementById('surplusItemFilter') || {}).value || 'ALL';
    const matlFilter = (document.getElementById('surplusMatlFilter') || {}).value || 'ALL';
    const sizeFilter = (document.getElementById('surplusSizeFilter') || {}).value || 'ALL';
    const searchQ    = ((document.getElementById('surplusSearch')    || {}).value || '').toUpperCase();

    const allMatCodes = new Set([...Object.keys(bomMap), ...Object.keys(recMap)]);
    const list = [];
    allMatCodes.forEach(matCode => {
        const row = _enrichRow(matCode, bomMap, recMap, masterMap);
        const diffQty = row.recQty - row.bomQty;
        if (diffQty <= 0.01) return;
        if (!['Pipe', 'Fitting', 'Others'].includes(row.cat)) return;
        if (catFilter  !== 'ALL' && row.cat  !== catFilter)  return;
        if (itemFilter !== 'ALL' && row.item !== itemFilter) return;
        if (matlFilter !== 'ALL' && row.matl !== matlFilter) return;
        if (sizeFilter !== 'ALL' && row.size !== sizeFilter) return;
        if (searchQ && ![row.matCode, row.item, row.matl, row.size].some(v => (v||'').toUpperCase().includes(searchQ))) return;
        list.push({ ...row, diffQty });
    });
    _sortByCatItemSize(list);

    _surplusList = list;
    _surplusPage = Math.min(_surplusPage, Math.max(1, Math.ceil(list.length / PAGE_SIZE)));
    const countEl = document.getElementById('surplusCount');
    if (countEl) countEl.textContent = list.length > 0 ? `${list.length} items` : '';

    if (list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#666;padding:20px;">No surplus items found.</td></tr>';
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

    const data = db.matCodeMaster.filter(m => {
        if (q && !m.matCode.includes(q) && !m.itemDesc.toUpperCase().includes(q) &&
            !m.matlDesc.toUpperCase().includes(q) && !m.category.toUpperCase().includes(q)) return false;
        if (cat  !== 'All' && m.category !== cat) return false;
        if (item !== 'All' && window.extractItemFromMatCode(m.matCode) !== item) return false;
        if (size !== 'All' && window.extractSizeFromMatCode(m.matCode) !== size) return false;
        return true;
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
let _bomActiveTab = 'piping'; // 'piping' | 'fitting' | 'others'
let currentPlPage = 1;
let currentSrecPage = 1;

// Category/Item/Size 필터 공통 헬퍼
function getBomItemsForCat(cat) {
    if (cat === 'Speciality') return db.specialityItems.slice();
    const src = (cat === 'All' || cat === 'ALL') ? db.bom : db.bom.filter(b => b.category === cat);
    const set = new Set(src.map(b => window.extractItemFromMatCode(b.matCode)).filter(v => v && v !== '-'));
    if (cat === 'All' || cat === 'ALL' || cat === 'Valve') {
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
    const bomIsoData = document.getElementById('bomIsoDatalist');
    const bomItemF = document.getElementById('bomItemFilter');
    const bomSizeF = document.getElementById('bomSizeFilter');

    if(bomSys && bomIsoData) {
        const systems = [...new Set(db.bom.map(b => b.system).filter(Boolean))].sort();
        const isos = [...new Set(db.bomIsoList.map(r => r.iso))].sort();

        bomSys.innerHTML = '<option value="All">All Systems</option>' + systems.map(s => `<option value="${s}">${s}</option>`).join('');
        bomIsoData.innerHTML = isos.map(i => `<option value="${i}">`).join('');

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

        // change 리스너는 fetch 성공 여부와 무관하게 항상 등록
        srecSys.addEventListener('change', () => {
            const selSys = srecSys.value;
            const rows = selSys === 'All'
                ? (window._srecAllRows || [])
                : (window._srecAllRows || []).filter(r => r.system === selSys);
            const filteredTags = [...new Set(rows.map(r => stripType(r.support_tag)).filter(Boolean))].sort();
            if (el('srecTagFilter'))
                el('srecTagFilter').innerHTML = '<option value="All">All Support No</option>' + filteredTags.map(v => `<option value="${v}">${v}</option>`).join('');
        });

        try {
            const { data, error } = await supabaseClient.from('support_receiving')
                .select('pkg,package_no,system,support_tag')
                .not('system', 'is', null)
                .limit(10000);
            if (error) throw error;
            if (!data) return;

            window._srecAllRows = data;

            const pkgs       = [...new Set(data.map(r => r.pkg).filter(Boolean))].sort();
            const packageNos = [...new Set(data.map(r => r.package_no).filter(Boolean))].sort();
            const systems    = [...new Set(data.map(r => r.system).filter(Boolean))].sort();
            const tags       = [...new Set(data.map(r => stripType(r.support_tag)).filter(Boolean))].sort();

            if (el('srecPkgFilter'))
                el('srecPkgFilter').innerHTML = '<option value="All">All PKGs</option>' + pkgs.map(v => `<option value="${v}">${v}</option>`).join('');
            if (el('srecPackageNoFilter'))
                el('srecPackageNoFilter').innerHTML = '<option value="All">All Package No</option>' + packageNos.map(v => `<option value="${v}">${v}</option>`).join('');
            if (el('srecTagFilter'))
                el('srecTagFilter').innerHTML = '<option value="All">All Support No</option>' + tags.map(v => `<option value="${v}">${v}</option>`).join('');
            srecSys.innerHTML = '<option value="All">All Systems</option>' + systems.map(s => `<option value="${s}">${s}</option>`).join('');
        } catch(e) { console.error('Support Receiving filter init failed:', e); }
    })();

    // Shortage/Surplus Material 필터 공용 초기화 헬퍼
    const initShortSurplusMatl = (catEl, itemEl, matlEl, sizeEl, allVal) => {
        if (!itemEl) return;
        setupCatItemSize(catEl, itemEl, sizeEl, getBomItemsForCat, getBomSizesForCatItem, allVal);
        const refreshMatl = () => {
            const TAB_CAT = { ALL: 'ALL', Pipe: 'Pipe', Fitting: 'Fitting', Others: 'Others' };
            const cat = catEl ? (TAB_CAT[catEl.value] || 'ALL') : 'ALL';
            const matls = [...new Set(
                db.bom.filter(b => cat === 'ALL' || b.category === cat)
                      .map(b => (b.matCode || '').split('-')[1]).filter(Boolean)
            )].sort();
            if (matlEl) matlEl.innerHTML = `<option value="${allVal}">All Materials</option>` + matls.map(m => `<option value="${m}">${m}</option>`).join('');
        };
        refreshMatl();
        if (catEl) catEl.addEventListener('change', refreshMatl);
    };

    // Shortage Filters
    if (document.getElementById('shortItemFilter') && db.bom.length > 0) {
        initShortSurplusMatl(
            document.getElementById('shortCatFilter'),
            document.getElementById('shortItemFilter'),
            document.getElementById('shortMatlFilter'),
            document.getElementById('shortSizeFilter'), 'ALL'
        );
    }

    // Surplus Filters
    if (document.getElementById('surplusItemFilter') && db.bom.length > 0) {
        initShortSurplusMatl(
            document.getElementById('surplusCatFilter'),
            document.getElementById('surplusItemFilter'),
            document.getElementById('surplusMatlFilter'),
            document.getElementById('surplusSizeFilter'), 'ALL'
        );
    }

    // MatCode Master Filters (BOM/Receiving과 동일하게 MatCode 파싱 함수 사용)
    const mCat  = document.getElementById('masterCatFilter');
    const mItem = document.getElementById('masterItemFilter');
    const mSize = document.getElementById('masterSizeFilter');
    if (mCat && db.matCodeMaster.length > 0) {
        const cats  = [...new Set(db.matCodeMaster.map(m => m.category).filter(Boolean))].sort();
        mCat.innerHTML  = '<option value="All">All Categories</option>' + cats.map(c => `<option value="${c}">${c}</option>`).join('');

        setupCatItemSize(mCat, mItem, mSize, getMasterItemsForCat, getMasterSizesForCatItem, 'All');
    }

    // Receiving 단일 패스 분류 (5회 반복 filter → 1회 forEach)
    const recByCat = { Pipe: [], Fitting: [], Others: [], Valve: [], Speciality: [] };
    db.receiving.forEach(r => {
        if (isReceivingActive(r.plNo) && recByCat[r.category]) recByCat[r.category].push(r);
    });

    const setDocPkg = (docEl, pkgEl, rows) => {
        const docs = [...new Set(rows.map(r => r.docNo))].sort();
        const pkgs = [...new Set(rows.map(r => r.plNo))].sort();
        docEl.innerHTML = '<option value="All">All DOCs</option>' + docs.map(d => `<option value="${d}">${d}</option>`).join('');
        pkgEl.innerHTML = '<option value="All">All PKGs</option>' + pkgs.map(p => `<option value="${p}">${p}</option>`).join('');
    };

    // PL Filters (Pipe)
    const plDoc = document.getElementById('plDocFilter'), plPkg = document.getElementById('plPkgFilter');
    if (plDoc && plPkg) {
        setDocPkg(plDoc, plPkg, recByCat.Pipe);
        setupCatItemSize(null, document.getElementById('plItemFilter'), document.getElementById('plSizeFilter'), getBomItemsForCat, getBomSizesForCatItem, 'All');
    }

    // Fitting Filters
    const fitDoc = document.getElementById('fitDocFilter'), fitPkg = document.getElementById('fitPkgFilter');
    if (fitDoc && fitPkg) {
        setDocPkg(fitDoc, fitPkg, recByCat.Fitting);
        setupCatItemSize(null, document.getElementById('fitItemFilter'), document.getElementById('fitSizeFilter'), getBomItemsForCat, getBomSizesForCatItem, 'All');
    }

    // Others Filters
    const othDoc = document.getElementById('othDocFilter'), othPkg = document.getElementById('othPkgFilter');
    if (othDoc && othPkg) {
        setDocPkg(othDoc, othPkg, recByCat.Others);
        setupCatItemSize(null, document.getElementById('othItemFilter'), document.getElementById('othSizeFilter'), getBomItemsForCat, getBomSizesForCatItem, 'All');
    }

    // Valve Filters
    const valDoc = document.getElementById('valDocFilter'), valPkg = document.getElementById('valPkgFilter');
    if (valDoc && valPkg) setDocPkg(valDoc, valPkg, recByCat.Valve);

    // Speciality Filters
    const splDoc = document.getElementById('splDocFilter'), splPkg = document.getElementById('splPkgFilter');
    if (splDoc && splPkg) setDocPkg(splDoc, splPkg, recByCat.Speciality);

}


async function renderBomTable() {
    let tbody = document.querySelector('#bomTable tbody');
    if(!tbody) return;
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:20px;color:#888;">Loading...</td></tr>';

    const search  = (document.getElementById('bomIsoSearch')?.value || '').trim();
    const sys     = document.getElementById('bomSystemFilter')?.value || 'All';
    const TAB_CAT = { piping: 'Pipe', fitting: 'Fitting', others: 'Others' };
    const cat     = TAB_CAT[_bomActiveTab] || 'Pipe';
    const item    = document.getElementById('bomItemFilter')?.value || 'All';
    const mat     = document.getElementById('bomMatFilter')?.value || 'All';
    const size    = document.getElementById('bomSizeFilter')?.value || 'All';

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

    // 필터를 두 쿼리(data + count)에 동일하게 적용하는 헬퍼
    const applyFilters = (q) => {
        if (sys  !== 'All') q = q.eq('system', sys);
        if (search) q = q.or(`iso_dwg_no.ilike.%${search}%,mat_code.ilike.%${search}%,category.ilike.%${search}%,full_description.ilike.%${search}%`);
        if (cat  !== 'All') q = q.eq('category', cat);
        if (mat  !== 'All') q = q.ilike('mat_code', `%-${mat}-%`);
        if (item !== 'All') {
            if (item === 'CONTROL VALVE') {
                q = q.or('tag.ilike.%-TCV-%,tag.ilike.%-LCV-%,tag.ilike.%-FCV-%,tag.ilike.%-PCV-%,tag.ilike.%-FV-%');
            } else if (item === 'SAFETY VALVE') {
                q = q.or('tag.ilike.%-PSV%,tag.ilike.%-PRV%,mat_code.ilike.PSV-*,mat_code.ilike.PRV-*');
            } else {
                const prefixes = ITEM_PREFIX_MAP[item];
                if (prefixes && prefixes.length > 0) {
                    q = q.or(prefixes.map(p => `mat_code.ilike.${p}-*`).join(','));
                } else {
                    q = q.ilike('full_description', `%${item}%`);
                }
            }
        }
        if (size !== 'All') {
            const toD = v => 'D' + Math.round(parseFloat(v) * 10).toString().padStart(3, '0');
            const dualMatch = size.match(/([\d.]+)"×([\d.]+)"/);
            if (dualMatch) {
                q = q.ilike('mat_code', `%${toD(dualMatch[1])}${toD(dualMatch[2])}%`);
            } else {
                const single = size.match(/([\d.]+)"/);
                if (single) q = q.ilike('mat_code', `%-${toD(single[1])}-%`);
            }
        }
        return q;
    };

    // 데이터 쿼리 + COUNT 쿼리를 병렬 실행
    const dataQ  = applyFilters(
        supabaseClient.from('bom_detail')
            .select('mat_code, category, system, iso_dwg_no, line_no, tag, full_description, uom, qty')
            .range((currentBomPage - 1) * PAGE_SIZE, currentBomPage * PAGE_SIZE)
            .order('system', { ascending: true, nullsFirst: false })
            .order('iso_dwg_no', { ascending: true, nullsFirst: false })
    );
    const countQ = applyFilters(
        supabaseClient.from('bom_detail')
            .select('*', { count: 'exact', head: true })
    );

    const [dataRes, countRes] = await Promise.all([dataQ, countQ]);
    if (dataRes.error) {
        tbody.innerHTML = `<tr><td colspan="10" style="color:red;text-align:center;">Error: ${dataRes.error.message}</td></tr>`;
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

    tbody.innerHTML = data.map(b => {
        const isAuto = (b.mat_code || '').includes('NEW-MAT');
        const badgeClass = isAuto ? 'warn' : 'ok';
        const desc = (b.full_description || '-').replace(/_/g, '-');
        let size = window.extractSizeFromMatCode(b.mat_code);
        if (size === '-' && b.line_no) {
            size = window.extractSizeFromLineNo(b.line_no);
        }
        if (size === '-' && b.full_description) {
            const dnM = b.full_description.match(/\bDN\s*(\d+)\b/i);
            if (dnM) size = 'DN ' + dnM[1];
            else size = window.extractSizeFromDesc(b.full_description);
        }
        const item = window.extractItemFromDesc(desc);
        // Steam Trap: description에 사이즈 정보 없을 때 기본값 1" (확인된 사실)
        if (size === '-' && /STEAM TRAP/i.test(item)) size = '1"';
        const matParts = (b.mat_code || '').split('-');
        const matSpec  = matParts[1] || '-';
        return `<tr>
            <td style="text-align:center;white-space:nowrap;"><span class="status-badge ${badgeClass}">${b.mat_code || '-'}</span></td>
            <td style="text-align:center;white-space:nowrap;">${b.system || '-'}</td>
            <td style="text-align:center;white-space:nowrap;">${b.iso_dwg_no || '-'}</td>
            <td style="text-align:center;white-space:nowrap;">${b.line_no || '-'}</td>
            <td style="text-align:center;font-weight:600;white-space:nowrap;">${item}</td>
            <td style="text-align:center;white-space:nowrap;">${matSpec}</td>
            <td style="text-align:center;font-weight:600;white-space:nowrap;">${size}</td>
            <td title="${desc}">${desc.length > 55 ? desc.substring(0, 52) + '...' : desc}</td>
            <td style="text-align:center;white-space:nowrap;">${b.uom || 'EA'}</td>
            <td style="text-align:center;white-space:nowrap;">${parseFloat(b.qty || 0).toFixed(2)}</td>
        </tr>`;
    }).join('');

    const bomTotalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
    renderPagination('bomPagination', currentBomPage, bomTotalPages, '_bomGoPage');
}
window._bomGoPage = function(p) { currentBomPage = p; renderBomTable(); };

function refreshBomItemFilter() {
    const TAB_CAT = { piping: 'Pipe', fitting: 'Fitting', others: 'Others' };
    const cat = TAB_CAT[_bomActiveTab] || 'Pipe';

    const itemEl = document.getElementById('bomItemFilter');
    if (itemEl) {
        const items = getBomItemsForCat(cat);
        itemEl.innerHTML = '<option value="All">All Items</option>'
            + items.map(i => `<option value="${i.replace(/"/g, '&quot;')}">${i}</option>`).join('');
    }

    const matEl = document.getElementById('bomMatFilter');
    if (matEl) {
        const src = (cat === 'All') ? db.bom : db.bom.filter(b => b.category === cat);
        const mats = [...new Set(
            src.map(b => (b.matCode || '').split('-')[1]).filter(v => v && v !== '-')
        )].sort();
        matEl.innerHTML = '<option value="All">All Materials</option>'
            + mats.map(m => `<option value="${m}">${m}</option>`).join('');
    }

    const sizeEl = document.getElementById('bomSizeFilter');
    if (sizeEl) sizeEl.innerHTML = '<option value="All">All Sizes</option>';
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
            currentBomPage = 1;
            refreshBomItemFilter();
            renderBomTable();
        });
    });
}

function _renderRecvCore(cfg) {
    let tbody = document.querySelector(`#${cfg.tableId} tbody`);
    if (!tbody) return;
    tbody.innerHTML = '';

    const hideTag     = !!cfg.hideTag;
    const hideMatCode = !!cfg.hideMatCode;

    const search  = (document.getElementById(cfg.searchId)?.value || '').trim().toUpperCase();
    const doc     = document.getElementById(cfg.docId)?.value    || 'All';
    const pkg     = document.getElementById(cfg.pkgId)?.value    || 'All';
    const cat     = document.getElementById(cfg.catId)?.value || 'All';
    const itemF   = document.getElementById(cfg.itemId)?.value   || 'All';
    const sizeF   = document.getElementById(cfg.sizeId)?.value   || 'All';
    const statusF = document.getElementById(cfg.statusId)?.value || 'All';

    const masterMap = _buildMasterMap();

    const data = db.receiving.filter(r => {
        const matchSearch  = !search || (r.matCode||'').toUpperCase().includes(search) || r.plNo.toUpperCase().includes(search) || (r.category||'').toUpperCase().includes(search) || r.desc.toUpperCase().includes(search);
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
        const matchSizeF   = sizeF === 'All' || window.extractSizeFromMatCode(effMat) === sizeF;
        const pkgSt        = (_plUpdatesCache[r.plNo] || {}).status || '';
        const matchStatusF = statusF === 'All' || pkgSt === statusF;
        return matchSearch && matchDoc && matchPkg && matchCat && matchItemF && matchSizeF && matchStatusF;
    }).sort((a, b) => {
        if (cfg.catOrder) {
            const oa = cfg.catOrder[a.category] ?? 99, ob = cfg.catOrder[b.category] ?? 99;
            if (oa !== ob) return oa - ob;
        }
        return a.docNo.localeCompare(b.docNo) || a.plNo.localeCompare(b.plNo);
    });

    const page = cfg.getPage();
    const rows = data.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(r => {
        const tagInfo    = db.bomTagMap[(r.tag || '').toUpperCase()];
        const effMat     = r.matCode || (tagInfo ? tagInfo.matCode : '');
        const bomFullDesc = tagInfo ? tagInfo.fullDescription : '';
        let displayCat   = (r.category && r.category !== 'BULK') ? r.category : window.getCategory(r.desc, effMat) || 'Others';
        let catForBadge  = displayCat;
        if (!['Pipe', 'Fitting', 'Support', 'Valve', 'Speciality', 'Others'].includes(catForBadge)) catForBadge = 'Valve';
        const catBadge   = getCatBadge(catForBadge);
        const descDisplay = (r.desc || '').replace(/_/g, '-');
        const _sizeFromMat = window.extractSizeFromMatCode(effMat);
        const size = (_sizeFromMat && _sizeFromMat !== '-')
            ? _sizeFromMat
            : ((bomFullDesc || r.desc).match(/(\d+(?:\.\d+)?"\s*[Xx×]\s*\d+(?:\.\d+)?"|DN\s*\d+)/i) || [])[0] || '-';
        const _mcItemR  = window.extractItemFromMatCode(effMat);
        const _rawItemR = (_mcItemR && _mcItemR !== '-') ? _mcItemR : window.extractItemFromDesc(bomFullDesc || r.desc);
        const item      = (r.plNo || '').toUpperCase().includes('BYPS') ? 'BYPASS VALVE' : _rawItemR;
        const etPart    = (effMat || '').split('-').pop().toUpperCase();
        const flangeType = (item === 'FLANGE' && (etPart === 'FF' || etPart === 'RF')) ? 'WN' + etPart : '-';

        const mData  = masterMap[effMat] || {};
        const mcParts = (effMat || '').split('-');
        const matl   = mData.matlDesc || mcParts[1] || '-';
        const rating = mData.classDesc || mcParts[3] || '-';

        const pkgStatus  = (_plUpdatesCache[r.plNo] || {}).status || '';
        const isOnSite   = pkgStatus === 'On-Site';
        const statusColor = pkgStatus === 'On-Site' ? '#2e7d32' : pkgStatus === 'Shipping' ? '#1565c0' : pkgStatus === 'Preparing' ? '#888' : '#bbb';

        const purposeOpts = PURPOSE_OPTS.map(v =>
            `<option value="${v}"${r.purpose === v ? ' selected' : ''}>${v || '—'}</option>`
        ).join('');
        const purposeSel = `<select class="pl-purpose-sel" data-recv-id="${r.id}"
            style="width:100%;border:1px solid #dde3ee;border-radius:4px;padding:3px 6px;font-size:13px;background:#fff;color:#0A2540;text-align:center;">
            ${purposeOpts}</select>`;
        return `<tr${isOnSite ? '' : ' style="color:#999;"'}>
            <td style="white-space:nowrap;">${r.docNo}</td>
            <td style="white-space:nowrap;">${r.plNo}</td>
            ${cfg.catFirst ? `<td style="white-space:nowrap;"><span class="status-badge ${catBadge}">${displayCat}</span></td>` : ''}
            ${hideMatCode ? '' : `<td style="white-space:nowrap;"><span class="status-badge ${r.matCode ? 'ok' : (tagInfo ? 'warn' : '')}">${effMat || (tagInfo ? '(BOM)' : '-')}</span></td>`}
            ${cfg.catFirst ? '' : `<td style="white-space:nowrap;"><span class="status-badge ${catBadge}">${displayCat}</span></td>`}
            ${hideTag ? '' : `<td style="text-align:center;">${r.tag || '-'}</td>`}
            <td style="font-weight:600;">${item}</td>
            <td style="text-align:center;font-weight:600;white-space:nowrap;color:${flangeType!=='-'?'#1565c0':'#aaa'};">${flangeType}</td>
            <td style="text-align:center;font-size:11px;">${matl}</td>
            <td style="font-weight:600;white-space:nowrap;">${size}</td>
            <td style="text-align:center;font-size:11px;">${rating}</td>
            <td style="white-space:nowrap;text-align:center;">${r.unit || 'EA'}</td>
            <td style="white-space:nowrap;text-align:center;">${Math.round(r.qty).toLocaleString()}</td>
            <td style="text-align:center;white-space:nowrap;font-size:11px;font-weight:600;color:${statusColor};">${pkgStatus || '—'}</td>
            <td style="padding:3px;">${purposeSel}</td>
        </tr>`;
    });
    tbody.innerHTML = rows.join('');
    renderPagination(cfg.paginationId, page, Math.max(1, Math.ceil(data.length / PAGE_SIZE)), cfg.goPageFn);
}

// 현재 활성 receiving 섹션/탭 상태
let _recActiveSec = 'bulk'; // 'bulk' | 'tag'
let _recActiveBulkTab = 'piping'; // 'piping' | 'others'
let _recActiveTagTab  = 'spool';  // 'spool' | 'valve' | 'speciality' | 'support'
let currentOthPage = 1;
let currentValPage = 1;
let currentSplPage = 1;

function renderReceivingTable() { renderBulkPipingTable(); }

function renderBulkPipingTable() {
    _renderRecvCore({
        tableId: 'plTable', searchId: 'plItemSearch',
        docId: 'plDocFilter', pkgId: 'plPkgFilter', statusId: 'plStatusFilter',
        itemId: 'plItemFilter', sizeId: 'plSizeFilter',
        forcedCats: ['Pipe'],
        catFirst: true,
        hideTag: true,
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
        forcedCats: ['Fitting'],
        catFirst: true,
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
        forcedCats: ['Others'],
        catFirst: true,
        hideTag: true,
        getPage: () => currentOthPage,
        paginationId: 'othPagination', goPageFn: '_othGoPage'
    });
}

function renderTagValveTable() {
    _renderRecvCore({
        tableId: 'valTable', searchId: 'valItemSearch',
        docId: 'valDocFilter', pkgId: 'valPkgFilter', statusId: 'valStatusFilter',
        forcedCats: ['Valve'],
        hideMatCode: true,
        getPage: () => currentValPage,
        paginationId: 'valPagination', goPageFn: '_valGoPage'
    });
}

function renderTagSpecialityTable() {
    _renderRecvCore({
        tableId: 'splTable', searchId: 'splItemSearch',
        docId: 'splDocFilter', pkgId: 'splPkgFilter', statusId: 'splStatusFilter',
        forcedCats: ['Speciality'],
        hideMatCode: true,
        getPage: () => currentSplPage,
        paginationId: 'splPagination', goPageFn: '_splGoPage'
    });
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
        else if (_recActiveTagTab === 'support') renderSupportReceivingTable();
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
        if (sp) sp.style.display = tab === 'spool'      ? '' : 'none';
        if (vl) vl.style.display = tab === 'valve'      ? '' : 'none';
        if (sl) sl.style.display = tab === 'speciality' ? '' : 'none';
        if (su) su.style.display = tab === 'support'    ? '' : 'none';
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
            renderActiveReceivingTab();
        });
    });

    // Filter buttons
    document.getElementById('btnFilterPl')?.addEventListener('click',  () => { currentPlPage  = 1; renderBulkPipingTable(); });
    document.getElementById('btnFilterFit')?.addEventListener('click', () => { currentFitPage = 1; renderBulkFittingTable(); });
    document.getElementById('btnFilterOth')?.addEventListener('click', () => { currentOthPage = 1; renderBulkOthersTable(); });
    document.getElementById('btnFilterVal')?.addEventListener('click', () => { currentValPage = 1; renderTagValveTable(); });
    document.getElementById('btnFilterSpl')?.addEventListener('click', () => { currentSplPage = 1; renderTagSpecialityTable(); });
}

window._plGoPage  = function(p) { currentPlPage  = p; renderBulkPipingTable(); };
window._fitGoPage = function(p) { currentFitPage = p; renderBulkFittingTable(); };
window._othGoPage = function(p) { currentOthPage = p; renderBulkOthersTable(); };
window._valGoPage = function(p) { currentValPage = p; renderTagValveTable(); };
window._splGoPage = function(p) { currentSplPage = p; renderTagSpecialityTable(); };

async function renderSupportReceivingTable() {
    const tbody = document.querySelector('#srecTable tbody');
    if (!tbody) return;
    if (!supabaseClient) return;
    tbody.innerHTML = '<tr><td colspan="13" style="text-align:center;padding:20px;color:#888;">Loading...</td></tr>';

    const search    = (document.getElementById('srecSearch')?.value || '').trim();
    const pkg       = document.getElementById('srecPkgFilter')?.value || 'All';
    const packageNo = document.getElementById('srecPackageNoFilter')?.value || 'All';
    const sys       = document.getElementById('srecSystemFilter')?.value || 'All';
    const tag       = document.getElementById('srecTagFilter')?.value || 'All';
    const type      = document.getElementById('srecTypeFilter')?.value || 'All';

    const applyFilters = (q) => {
        if (pkg !== 'All')       q = q.eq('pkg', pkg);
        if (packageNo !== 'All') q = q.eq('package_no', packageNo);
        if (sys !== 'All')       q = q.eq('system', sys);
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
            .select('pkg,package_no,system,iso_dwg_no,support_tag,type,part_no,id_no,item,matl,size_or_type,length_mm,qty')
            .range(from, to)
            .order('system').order('support_tag').order('part_no')),
        applyFilters(supabaseClient.from('support_receiving')
            .select('*', { count: 'exact', head: true })),
    ]);

    if (dataRes.error) {
        tbody.innerHTML = `<tr><td colspan="13" style="color:red;text-align:center;">Error: ${dataRes.error.message}</td></tr>`;
        return;
    }

    const data = dataRes.data || [];
    const totalCount = countRes.count ?? data.length;

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="13" style="text-align:center;color:#888;padding:20px;">No data found.</td></tr>';
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
            <td style="text-align:center;white-space:nowrap;">${r.length_mm || '-'}</td>
            <td style="text-align:center;white-space:nowrap;">${r.qty ?? '-'}</td>
        </tr>`;
        }).join('');
    }

    const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
    renderPagination('srecPagination', currentSrecPage, totalPages, '_srecGoPage');
}
window._srecGoPage = function(p) { currentSrecPage = p; renderSupportReceivingTable(); };

// --- 5. Material Issue (ISO/MR Table) ---
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
}

window.updateIsoDropdown = function() {
    const sysSelect = document.getElementById('issueSystemFilter');
    const isoDatalist = document.getElementById('isoDatalist');
    if (!isoDatalist) return;

    let sys = sysSelect ? sysSelect.value : 'All';

    const isosMap = {};
    db.bomIsoList.forEach(r => {
        let matchSys = (sys === 'All' || (r.system || '').trim() === sys);
        if (matchSys && r.iso && r.iso !== 'Unassigned') isosMap[r.iso] = true;
    });

    const isos = Object.keys(isosMap).sort();
    let datalistHtml = '<option value="All">';
    isos.forEach(iso => {
        datalistHtml += `<option value="${iso.replace(/"/g, '&quot;')}">`;
    });
    isoDatalist.innerHTML = datalistHtml;
}

// ==========================================
// PL Upload & Auto-Matching Feature
// ==========================================
let plReviewData = [];

function extractDocNo(pkgNo) {
    return String(pkgNo).split('-').slice(0, 3).join('-');
}

function matchMatCodeFromDesc(desc) {
    const d = desc.toUpperCase();

    // Item type patterns (order: most specific first)
    const itemPatterns = [
        ['STUD BOLT', 'BOLT'],
        ['NIPPLE'],
        ['PIPE'],
        ['FLANGE', 'FLN'],
        ['ELBOW', 'ELB'],
        ['TEE'],
        ['REDUCER'],
        ['CAP'],
        ['COUPLING'],
        ['UNION'],
        ['WELDOLET'],
        ['SOCKOLET'],
        ['THREADOLET'],
        ['OLET'],
        ['GASKET'],
        ['NUT'],
        ['VALVE', 'VLV'],
        ['STRAINER'],
        ['BLIND'],
        ['SIGHT GLASS'],
    ];

    let foundItemKey = null;
    for (const patterns of itemPatterns) {
        if (patterns.some(p => d.includes(p))) {
            foundItemKey = patterns[0];
            break;
        }
    }

    // Extract primary DN size
    const dnMatch = d.match(/DN\s*(\d+)/);
    const dnValue = dnMatch ? dnMatch[1].padStart(3, '0') : null;

    // Filter master by item type
    let candidates = db.matCodeMaster.filter(m => {
        if (!foundItemKey) return false;
        return m.itemDesc.toUpperCase().includes(foundItemKey);
    });

    // Narrow by DN size
    if (dnValue && candidates.length > 0) {
        const sizeFiltered = candidates.filter(m => {
            const s2 = (m.size2 || '').replace(/\s/g, '').toUpperCase();
            return s2.includes('DN' + dnValue) || s2.includes('DN' + parseInt(dnValue));
        });
        if (sizeFiltered.length > 0) candidates = sizeFiltered;
    }

    if (candidates.length === 0) {
        return { status: 'new', matCode: null, category: null, candidates: [] };
    } else if (candidates.length === 1) {
        return { status: 'matched', matCode: candidates[0].matCode, category: candidates[0].category, candidates };
    } else {
        return { status: 'suggest', matCode: null, category: null, candidates };
    }
}

async function parsePLFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                const wb = XLSX.read(data, { type: 'array' });
                const ws = wb.Sheets[wb.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

                let headerIdx = 0;
                for (let i = 0; i < Math.min(rows.length, 10); i++) {
                    const row = rows[i] || [];
                    if (row.some(c => String(c || '').toUpperCase().includes('PKG'))) {
                        headerIdx = i;
                        break;
                    }
                }

                const headers = (rows[headerIdx] || []).map(h => String(h || '').trim().toUpperCase());
                const pkgIdx = headers.findIndex(h => h.includes('PKG'));
                const descIdx = headers.findIndex(h => h.includes('DESC') || h.includes('DESCRIPTION'));
                const unitIdx = headers.findIndex(h => h.includes('UNIT'));
                const qtyIdx = headers.findIndex(h => h.includes('QTY') || h.includes('QUANTITY'));

                if (pkgIdx === -1) {
                    alert('PKG_NO column not found. Please check the file format.');
                    resolve(); return;
                }

                const dataRows = rows.slice(headerIdx + 1).filter(r => r && r[pkgIdx]);

                plReviewData = dataRows.map(row => {
                    const pkgNo = String(row[pkgIdx] || '').trim();
                    const desc = String(row[descIdx] !== undefined ? row[descIdx] : '').trim();
                    const unit = String(row[unitIdx] !== undefined ? row[unitIdx] : 'EA').trim() || 'EA';
                    const qty = parseFloat(row[qtyIdx]) || 0;
                    const docNo = extractDocNo(pkgNo);
                    const matchResult = matchMatCodeFromDesc(desc);
                    return { pkgNo, docNo, desc, unit, qty, ...matchResult };
                }).filter(r => r.qty > 0 && r.pkgNo);

                renderPLReview();
                resolve();
            } catch (err) {
                console.error('PL parse error:', err);
                alert('File parsing error: ' + err.message);
                reject(err);
            }
        };
        reader.readAsArrayBuffer(file);
    });
}

function renderPLReview() {
    const panel = document.getElementById('plReviewPanel');
    if (!panel) return;
    panel.style.display = 'block';
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    updatePLReviewSummary();

    const tbody = document.getElementById('plReviewTbody');
    tbody.innerHTML = plReviewData.map((row, idx) => {
        let statusBadge, matcodeCell;
        if (row.status === 'matched') {
            statusBadge = '<span class="status-badge ok">Matched</span>';
            matcodeCell = `<span class="status-badge ok" style="font-size:11px;">${row.matCode}</span>`;
        } else if (row.status === 'suggest') {
            statusBadge = '<span class="status-badge warn">Select</span>';
            const opts = row.candidates.map(c =>
                `<option value="${c.matCode}|${c.category}">${c.matCode} (${c.size2 || c.size1})</option>`
            ).join('');
            matcodeCell = `<select class="form-control" style="font-size:11px; padding:2px 6px; height:28px;" onchange="assignPLMatCode(${idx}, this.value)"><option value="">-- Select --</option>${opts}</select>`;
        } else {
            statusBadge = '<span class="status-badge err">New Code</span>';
            matcodeCell = `<button class="btn-small btn-outline" onclick="openNewMatCodeModal(${idx})" style="font-size:11px; padding:3px 8px;"><i class="fas fa-plus"></i> Create Code</button>`;
        }
        const catCell = row.category ? `<span class="status-badge ${getCatBadge(row.category)}">${row.category}</span>` : '<span style="color:#999;">-</span>';
        const shortDesc = row.desc.length > 55 ? row.desc.substring(0, 52) + '...' : row.desc;
        return `<tr id="plrow_${idx}">
            <td style="font-size:12px;">${row.docNo}</td>
            <td style="font-size:12px;">${row.pkgNo}</td>
            <td title="${row.desc}" style="font-size:12px;">${shortDesc}</td>
            <td style="font-size:12px;">${row.unit}</td>
            <td style="font-size:12px; font-weight:600;">${row.qty}</td>
            <td>${statusBadge}</td>
            <td id="plrow_matcode_${idx}">${matcodeCell}</td>
            <td id="plrow_cat_${idx}">${catCell}</td>
        </tr>`;
    }).join('');
}

window.assignPLMatCode = function(idx, value) {
    if (!value) return;
    const [matCode, category] = value.split('|');
    plReviewData[idx].matCode = matCode;
    plReviewData[idx].category = category;
    plReviewData[idx].status = 'matched';
    const catBadge = getCatBadge(category);
    document.getElementById('plrow_matcode_' + idx).innerHTML = `<span class="status-badge ok" style="font-size:11px;">${matCode}</span>`;
    document.getElementById('plrow_cat_' + idx).innerHTML = `<span class="status-badge ${catBadge}">${category}</span>`;
    updatePLReviewSummary();
};

window.openNewMatCodeModal = function(idx) {
    window._pendingPLRowIdx = idx;
    const row = plReviewData[idx];
    document.getElementById('newMatPLDesc').textContent = row.desc;
    document.getElementById('newMatSearch').value = '';
    document.getElementById('newMatSearchResults').style.display = 'none';
    document.getElementById('newMatCodeInput').value = '';
    document.getElementById('newMatCategory').value = '';
    document.getElementById('newMatSaveToMaster').checked = false;
    document.getElementById('newMatCodeModal').style.display = 'flex';
};

window.searchExistingMatCode = function(query) {
    const resultsBox = document.getElementById('newMatSearchResults');
    const tbody = document.getElementById('newMatSearchTbody');
    if (!query || query.length < 2) {
        resultsBox.style.display = 'none';
        return;
    }
    const q = query.toUpperCase();
    const matches = db.matCodeMaster.filter(m =>
        m.matCode.includes(q) ||
        m.itemDesc.toUpperCase().includes(q) ||
        m.matlDesc.toUpperCase().includes(q)
    ).slice(0, 20);

    if (matches.length === 0) {
        resultsBox.style.display = 'none';
        return;
    }

    tbody.innerHTML = matches.map(m => `
        <tr style="cursor:pointer;" onclick="selectExistingForPL('${m.matCode}', '${m.category}')">
            <td style="font-size:11px;"><span class="status-badge ok">${m.matCode}</span></td>
            <td style="font-size:11px;">${m.itemDesc}</td>
            <td style="font-size:11px;">${m.size1} / ${m.size2}</td>
            <td style="font-size:11px;">${m.category}</td>
        </tr>
    `).join('');
    resultsBox.style.display = 'block';
};

window.selectExistingForPL = function(matCode, category) {
    const idx = window._pendingPLRowIdx;
    plReviewData[idx].matCode = matCode;
    plReviewData[idx].category = category;
    plReviewData[idx].status = 'matched';

    const catBadge = getCatBadge(category);
    document.getElementById('plrow_matcode_' + idx).innerHTML = `<span class="status-badge ok" style="font-size:11px;">${matCode}</span>`;
    document.getElementById('plrow_cat_' + idx).innerHTML = `<span class="status-badge ${catBadge}">${category}</span>`;

    document.getElementById('newMatCodeModal').style.display = 'none';
    updatePLReviewSummary();
};

function updatePLReviewSummary() {
    const matched = plReviewData.filter(r => r.status === 'matched').length;
    const suggest = plReviewData.filter(r => r.status === 'suggest').length;
    const newCode = plReviewData.filter(r => r.status === 'new').length;
    const total = plReviewData.length;

    const el = document.getElementById('plReviewSummary');
    if (el) el.innerHTML = `
        Total <strong>${total}</strong> &nbsp;|&nbsp;
        ✅ Matched: <strong>${matched}</strong> &nbsp;
        ⚠️ Select: <strong>${suggest}</strong> &nbsp;
        ❌ New: <strong>${newCode}</strong>
    `;

    const btn = document.getElementById('btnSavePLReview');
    if (btn) {
        const allDone = plReviewData.length > 0 && (suggest + newCode) === 0;
        btn.disabled = !allDone;
        btn.style.opacity = allDone ? '1' : '0.5';
    }
}

async function savePLReview() {
    const unresolved = plReviewData.filter(r => r.status !== 'matched');
    if (unresolved.length > 0) {
        alert(`${unresolved.length} MatCode(s) are still unassigned. Please assign all before saving.`);
        return;
    }

    if (!confirm(`Save ${plReviewData.length} item(s) to Receiving?`)) return;

    const toInsert = plReviewData.map(r => ({
        mat_code: r.matCode,
        category: r.category,
        doc_no: r.docNo,
        pkg_no: r.pkgNo,
        full_description: r.desc,
        unit: r.unit,
        qty: r.qty
    }));

    showLoading(true);
    try {
        for (let i = 0; i < toInsert.length; i += 100) {
            const batch = toInsert.slice(i, i + 100);
            const { error } = await supabaseClient.from('receiving').insert(batch);
            if (error) throw error;
        }
        alert(`✅ ${toInsert.length} item(s) saved to Receiving successfully!`);
        document.getElementById('plReviewPanel').style.display = 'none';
        plReviewData = [];
        await syncFromSupabase();
    } catch (err) {
        alert('Save error: ' + err.message);
        console.error(err);
    } finally {
        showLoading(false);
    }
}

// The action of clicking Search ISO BOM
function attachEventListeners() {
    // Global Search
    const globalSearchInput = document.getElementById('globalSearchInput');
    if (globalSearchInput) {
        globalSearchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const term = e.target.value.trim().toUpperCase();
                if (!term) return;
                
                // Switch view and set search term
                if (term.includes('PGU-DE') || term.includes('PL-')) {
                    showSection('receiving');
                    const plInput = document.getElementById('plItemSearch');
                    if (plInput) plInput.value = term;
                    renderReceivingTable();
                } else if (_knownSystems.has(term)) {
                    // System 정확 매칭 검색: ST, HP, LS, CH 등
                    showSection('piping_bom');
                    const sysEl = document.getElementById('bomSystemFilter');
                    if (sysEl) {
                        const match = [...sysEl.options].find(o => o.value.toUpperCase() === term);
                        if (match) sysEl.value = match.value;
                    }
                    const bomInput = document.getElementById('bomIsoSearch');
                    if (bomInput) bomInput.value = '';
                    renderBomTable();
                } else if (/^B\d/i.test(term) || term.includes('B0-') || term.includes('B1-') || term.includes('B2-') || term.includes('VLV')) {
                    // ISO Drawing like 검색: B126, B0-ST, B227-HP 등
                    showSection('piping_bom');
                    const bomInput = document.getElementById('bomIsoSearch');
                    if (bomInput) bomInput.value = term;
                    renderBomTable();
                } else {
                    showSection('stock_ledger');
                }
            }
        });
    }

    // MatCode Modal Close Button
    const btnCloseNewMatCode = document.getElementById('btnCloseNewMatCode');
    if (btnCloseNewMatCode) {
        btnCloseNewMatCode.addEventListener('click', () => {
            document.getElementById('newMatCodeModal').style.display = 'none';
        });
    }

    // Sync Button
    const btnSync = document.getElementById('btnSyncData');
    if (btnSync) btnSync.addEventListener('click', syncFromSupabase);

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
                await supabaseClient.from('bom').delete().is('iso_dwg_no', null);
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
            const bomMatFilter = document.getElementById('bomMatFilter');
            if (bomMatFilter) bomMatFilter.value = 'All';
            const bomSizeFilter = document.getElementById('bomSizeFilter');
            if (bomSizeFilter) bomSizeFilter.value = 'All';
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

    // BOM Export Excel Button
    const btnExportBom = document.getElementById('btnExportBom');
    if (btnExportBom) {
        btnExportBom.addEventListener('click', async () => {
            btnExportBom.disabled = true;
            btnExportBom.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Exporting...';
            try {
                const search = (document.getElementById('bomIsoSearch')?.value || '').trim();
                const sys = document.getElementById('bomSystemFilter')?.value || 'All';
                const cat = document.getElementById('bomCategoryFilter')?.value || 'All';

                let query = supabaseClient.from('bom_detail')
                    .select('system, iso_dwg_no, category, mat_code, full_description, uom, qty')
                    .order('iso_dwg_no')
                    .limit(100000);
                if (sys !== 'All') query = query.eq('system', sys);
                if (search) query = query.or(`iso_dwg_no.ilike.%${search}%,mat_code.ilike.%${search}%,category.ilike.%${search}%,full_description.ilike.%${search}%`);
                if (cat !== 'All') query = query.ilike('category', `%${cat}%`);

                const { data, error } = await query;
                if (error) throw error;

                const rows = (data || []).map(b => ({
                    'System Area': b.system || '-',
                    'ISO Drawing': b.iso_dwg_no || '-',
                    'Category':    b.category || '-',
                    'Mat Code':    b.mat_code || '-',
                    'Description': b.full_description || '-',
                    'Unit':        b.uom || 'EA',
                    'Design Qty':  parseFloat(b.qty || 0)
                }));

                const ws = XLSX.utils.json_to_sheet(rows);
                ws['!cols'] = [18,30,14,24,50,8,12].map(w => ({ wch: w }));
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, 'BOM');

                const today = new Date().toISOString().split('T')[0];
                const fileName = `BOM_Export_${today}${sys !== 'All' ? '_' + sys : ''}${cat !== 'All' ? '_' + cat : ''}.xlsx`;
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
                const tag       = document.getElementById('srecTagFilter')?.value || 'All';
                const type      = document.getElementById('srecTypeFilter')?.value || 'All';
                let query = supabaseClient.from('support_receiving')
                    .select('pkg,package_no,system,iso_dwg_no,support_tag,type,part_no,id_no,item,matl,size_or_type,length_mm,qty')
                    .order('system').order('support_tag').order('part_no')
                    .limit(10000);
                if (pkg !== 'All')       query = query.eq('pkg', pkg);
                if (packageNo !== 'All') query = query.eq('package_no', packageNo);
                if (sys !== 'All')       query = query.eq('system', sys);
                if (tag !== 'All')       query = query.ilike('support_tag', `${tag}%`);
                if (type === 'SPECIAL') query = query.eq('type', 'SPECIAL');
                else if (type !== 'All') query = query.ilike('type', `(${type}-%`);
                if (search) query = query.or(`iso_dwg_no.ilike.%${search}%,support_tag.ilike.%${search}%,item.ilike.%${search}%,matl.ilike.%${search}%,id_no.ilike.%${search}%`);
                const { data, error } = await query;
                if (error) throw error;
                exportToExcel(data, 'support_receiving_export.xlsx');
            } catch(err) {
                alert('Export failed: ' + err.message);
            } finally {
                btnExportSrec.disabled = false;
                btnExportSrec.innerHTML = '<i class="fas fa-file-excel" style="color:#1d6f42;"></i> Export';
            }
        });
    }

    // Purpose 드롭박스 자동저장 (이벤트 위임)
    const plTbody = document.querySelector('#plTable tbody');
    if (plTbody) {
        plTbody.addEventListener('change', async e => {
            const sel = e.target.closest('.pl-purpose-sel');
            if (!sel) return;
            const recvId  = sel.dataset.recvId;
            const purpose = sel.value;
            if (!recvId || !supabaseClient) return;
            sel.disabled = true;
            const { error } = await supabaseClient.from('receiving')
                .update({ purpose })
                .eq('id', recvId);
            sel.disabled = false;
            if (error) {
                alert('저장 실패: ' + error.message);
            } else {
                const rec = db.receiving.find(r => String(r.id) === String(recvId));
                if (rec) rec.purpose = purpose;
            }
        });
    }

    // Receiving Export Excel
    const btnExportPl = document.getElementById('btnExportPl');
    if (btnExportPl) {
        btnExportPl.addEventListener('click', () => {
            const item  = (document.getElementById('plItemSearch')?.value || '').trim().toUpperCase();
            const doc   = document.getElementById('plDocFilter')?.value || 'All';
            const pkg   = document.getElementById('plPkgFilter')?.value || 'All';
            const itemF = document.getElementById('plItemFilter')?.value || 'All';
            const sizeF = document.getElementById('plSizeFilter')?.value || 'All';

            let data = db.receiving.filter(r => isReceivingActive(r.plNo) && r.category === 'Pipe');
            if (doc   !== 'All') data = data.filter(r => r.docNo === doc);
            if (pkg   !== 'All') data = data.filter(r => r.plNo  === pkg);
            if (itemF !== 'All') data = data.filter(r => window.extractItemFromMatCode(r.matCode) === itemF);
            if (sizeF !== 'All') data = data.filter(r => window.extractSizeFromMatCode(r.matCode) === sizeF);
            if (item)            data = data.filter(r => r.desc.toUpperCase().includes(item));

            const rows = data.map(r => ({
                'DOC NO':           r.docNo    || '-',
                'PKG NO':           r.plNo     || '-',
                'Mat Code':         r.matCode  || '-',
                'Category':         r.category || '-',
                'Full Description': r.desc     || '-',
                'Unit':             r.unit     || 'EA',
                'Qty':              r.qty      || 0,
            }));

            const ws = XLSX.utils.json_to_sheet(rows);
            ws['!cols'] = [16, 26, 24, 14, 55, 8, 10].map(w => ({ wch: w }));
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Receiving');
            const today = new Date().toISOString().split('T')[0];
            XLSX.writeFile(wb, `Receiving_Export_${today}.xlsx`);
        });
    }

    const btnExportFit = document.getElementById('btnExportFit');
    if (btnExportFit) {
        btnExportFit.addEventListener('click', () => {
            const item  = (document.getElementById('fitItemSearch')?.value || '').trim().toUpperCase();
            const doc   = document.getElementById('fitDocFilter')?.value || 'All';
            const pkg   = document.getElementById('fitPkgFilter')?.value || 'All';
            const itemF = document.getElementById('fitItemFilter')?.value || 'All';
            const sizeF = document.getElementById('fitSizeFilter')?.value || 'All';

            let data = db.receiving.filter(r => isReceivingActive(r.plNo) && r.category === 'Fitting');
            if (doc   !== 'All') data = data.filter(r => r.docNo === doc);
            if (pkg   !== 'All') data = data.filter(r => r.plNo  === pkg);
            if (itemF !== 'All') data = data.filter(r => window.extractItemFromMatCode(r.matCode) === itemF);
            if (sizeF !== 'All') data = data.filter(r => window.extractSizeFromMatCode(r.matCode) === sizeF);
            if (item)            data = data.filter(r => r.desc.toUpperCase().includes(item));

            const rows = data.map(r => ({
                'DOC NO':           r.docNo    || '-',
                'PKG NO':           r.plNo     || '-',
                'Mat Code':         r.matCode  || '-',
                'Category':         r.category || '-',
                'Full Description': r.desc     || '-',
                'Unit':             r.unit     || 'EA',
                'Qty':              r.qty      || 0,
            }));
            const ws = XLSX.utils.json_to_sheet(rows);
            ws['!cols'] = [16, 26, 24, 14, 55, 8, 10].map(w => ({ wch: w }));
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Receiving');
            const today = new Date().toISOString().split('T')[0];
            XLSX.writeFile(wb, `Fitting_Receiving_Export_${today}.xlsx`);
        });
    }

    const sysSelect = document.getElementById('issueSystemFilter');
    if (sysSelect) {
        sysSelect.addEventListener('change', updateIsoDropdown);
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

        btnFilterIssue.addEventListener('click', async () => {
            let sys = document.getElementById('issueSystemFilter')?.value || 'All';
            let iso = (document.getElementById('issueIsoSearch')?.value || '').trim();
            let categoryFilter = document.getElementById('issueCategoryFilter')?.value || 'All';
            let itemFilter = document.getElementById('issueItemFilter')?.value || 'All';
            let sizeFilter = document.getElementById('issueSizeFilter')?.value || 'All';

            let tbody = document.querySelector('#issueTable tbody');
            tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:16px;color:#888;">Loading...</td></tr>';

            // When ISO is specified: load all materials (no limit)
            // Without ISO: limit to 200 items
            let query = supabaseClient.from('bom')
                .select('mat_code, iso_dwg_no, full_description, uom, qty, system')
                .order('iso_dwg_no');

            if (sys !== 'All') query = query.eq('system', sys);
            if (iso && iso !== 'All') {
                query = query.eq('iso_dwg_no', iso);
            } else {
                query = query.limit(200);
            }

            const { data: bomRows, error } = await query;
            if (error) {
                tbody.innerHTML = `<tr><td colspan="9" style="color:red;text-align:center;">Error: ${error.message}</td></tr>`;
                return;
            }

            if (!bomRows || bomRows.length === 0) {
                tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;">No BOM materials found for the selected ISO Drawing.</td></tr>';
                return;
            }

            // Pre-build receiving/issued maps for quick lookup (On-Site 도착 패키지만)
            const recMap = {};
            db.receiving.filter(r => isReceivingActive(r.plNo)).forEach(r => { if(r.matCode) recMap[r.matCode] = (recMap[r.matCode] || 0) + r.qty; });
            const issMap = {};
            db.issued.forEach(i => { if(i.matCode) issMap[i.matCode] = (issMap[i.matCode] || 0) + i.qty; });

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
            let displayCount = 0;
            bomRows.forEach(b => {
                let mat = (b.mat_code || '').trim().toUpperCase();
                if (!mat || mat === 'NONE') return;

                let category = window.getCategory(b.full_description, mat);

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

                let totalRec = recMap[mat] || 0;
                let totalIss = issMap[mat] || 0;
                let stockQty = Math.max(0, totalRec - totalIss);
                let qty = parseFloat(b.qty) || 0;
                let defaultReq = Math.min(qty, stockQty);
                let safeDesc = (b.full_description || '-').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
                let catColor = catColors[category] || '#546e7a';

                // Row highlight based on stock availability
                let stockStyle = stockQty >= qty ? 'background:#f1f8e9;' : (stockQty > 0 ? 'background:#fff8e1;' : '');

                htmlString += `<tr style="${stockStyle}">
                    <td style="text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${b.iso_dwg_no||''}">${b.iso_dwg_no || '-'}</td>
                    <td style="text-align:center;"><span style="font-size:11px;font-weight:600;color:${catColor};background:${catColor}18;padding:2px 7px;border-radius:10px;white-space:nowrap;">${category}</span></td>
                    <td style="text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${mat}"><strong>${mat}</strong></td>
                    <td style="text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${safeDesc}">${safeDesc.length > 40 ? safeDesc.substring(0,40)+'...' : safeDesc}</td>
                    <td style="text-align:center;">${b.uom || 'EA'}</td>
                    <td style="text-align:center;">${qty.toFixed(2)}</td>
                    <td style="text-align:center;">${totalRec.toFixed(2)}</td>
                    <td style="text-align:center;"><strong style="color:${stockQty >= qty ? '#2e7d32' : (stockQty > 0 ? '#e65100' : '#c62828')};">${stockQty.toFixed(2)}</strong></td>
                    <td style="text-align:center;">
                        <input type="number" class="form-control" style="width:80px;" min="0" max="${stockQty}" value="${Math.max(0, defaultReq)}"
                        data-matcode="${mat}" data-iso="${b.iso_dwg_no||'-'}" data-size="${window.extractSizeFromMatCode(mat).replace(/"/g, '&quot;')}" data-unit="${b.uom||'EA'}" data-desc="${safeDesc}" data-category="${category}">
                    </td>
                </tr>`;
                displayCount++;
            });

            tbody.innerHTML = htmlString || `<tr><td colspan="9" style="text-align:center;color:#888;">No BOM materials found for the selected ISO Drawing.</td></tr>`;

            if (!iso || iso === 'All') {
                tbody.innerHTML += `<tr><td colspan="9" style="text-align:center;color:var(--color-warning);font-size:11px;padding:8px;">
                    <i class="fas fa-info-circle"></i> Specify an ISO Drawing to view all materials for that drawing.</td></tr>`;
            }

            // Step 2: Support Material List 렌더링
            const suppTbody = document.getElementById('suppMatTbody');
            const suppCount = document.getElementById('suppMatCount');
            if (suppTbody) {
                if (iso && iso !== 'All') {
                    suppTbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#aaa;padding:12px;">Loading...</td></tr>';
                    const { data: suppRows } = await supabaseClient.from('support_bom')
                        .select('iso_dwg_no, support_tag, item, matl, size_or_type, qty')
                        .eq('iso_dwg_no', iso)
                        .order('support_tag').order('part_no');

                    if (suppRows && suppRows.length > 0) {
                        if (suppCount) suppCount.textContent = `${suppRows.length} items`;
                        suppTbody.innerHTML = suppRows.map(s => {
                            const bomQty = s.qty ?? 0;
                            const safeTag  = (s.support_tag || '-').replace(/"/g, '&quot;');
                            const safeItem = (s.item || '-').replace(/"/g, '&quot;');
                            const safeSize = (s.size_or_type || '-').replace(/"/g, '&quot;');
                            const safeIso  = (s.iso_dwg_no || '-').replace(/"/g, '&quot;');
                            return `<tr>
                            <td style="text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${safeIso}">${s.iso_dwg_no || '-'}</td>
                            <td style="text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;" title="${safeTag}">${s.support_tag || '-'}</td>
                            <td style="text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${safeItem}">${s.item || '-'}</td>
                            <td style="text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${s.matl || '-'}</td>
                            <td style="text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${safeSize}">${s.size_or_type || '-'}</td>
                            <td style="text-align:center;">EA</td>
                            <td style="text-align:center;">${bomQty}</td>
                            <td style="text-align:center;color:#aaa;">-</td>
                            <td style="text-align:center;color:#aaa;">-</td>
                            <td style="text-align:center;">
                                <input type="number" class="form-control supp-req-qty" style="width:80px;" min="0" value="${bomQty}"
                                    data-iso="${safeIso}" data-tag="${safeTag}" data-item="${safeItem}" data-size="${safeSize}">
                            </td>
                        </tr>`;
                        }).join('');
                    } else {
                        if (suppCount) suppCount.textContent = '';
                        suppTbody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:#aaa;padding:12px;">No support materials for this ISO.</td></tr>';
                    }
                } else {
                    if (suppCount) suppCount.textContent = '';
                    suppTbody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:#888;">Select an ISO Drawing and click Search BOM.</td></tr>';
                }
            }
        });
    }

    // "Add To MR" logic
    const btnAddToMr = document.getElementById('btnAddToMr');
    if (btnAddToMr) {
        btnAddToMr.addEventListener('click', () => {
            const inputs = document.querySelectorAll('#issueTable input[type="number"]');
            let addedCount = 0;
            // Session MR number: generate only on the first Add To MR click
            if (!sessionMrNo) {
                sessionMrNo = "MR-" + new Date().getFullYear() + "-" + (Math.floor(Math.random() * 9000) + 1000);
            }
            let currentMr = sessionMrNo;

            inputs.forEach(inp => {
                let reqQty = parseFloat(inp.value) || 0;
                let maxLimit = parseFloat(inp.getAttribute('max')) || 0; 
                
                if (reqQty > maxLimit) {
                    alert(`Requested quantity cannot exceed receiving limit! Fixing MatCode: ${inp.getAttribute('data-matcode')}`);
                    reqQty = maxLimit;
                    inp.value = maxLimit;
                }

                if(reqQty > 0) {
                    let matCode = inp.getAttribute('data-matcode');
                    let iso = inp.getAttribute('data-iso');
                    let size = inp.getAttribute('data-size');
                    let unit = inp.getAttribute('data-unit');
                    let desc = inp.getAttribute('data-desc');
                    
                    db.mrTable.push({ 
                        mrNo: currentMr, 
                        iso: iso, 
                        matCode: matCode, 
                        desc: desc, 
                        size: size, 
                        unit: unit, 
                        reqQty: reqQty 
                    });
                    addedCount++;
                }
            });

            if(addedCount > 0) {
                alert(`Successfully saved ${addedCount} items to MR Table (MR Table No: ${currentMr}).`);
                renderMrTable(); // newly defined to update the MR section
            } else {
                alert("No valid quantities were selected to add to MR.");
            }
        });
    }

    // Step 2: Support Material "Add To MR" 버튼
    const btnSuppAddToMr = document.getElementById('btnSuppAddToMr');
    if (btnSuppAddToMr) {
        btnSuppAddToMr.addEventListener('click', () => {
            const inputs = document.querySelectorAll('#suppMatTbody .supp-req-qty');
            let addedCount = 0;
            if (!sessionMrNo) {
                sessionMrNo = "MR-" + new Date().getFullYear() + "-" + (Math.floor(Math.random() * 9000) + 1000);
            }
            inputs.forEach(inp => {
                const reqQty = parseFloat(inp.value) || 0;
                if (reqQty <= 0) return;
                db.mrTable.push({
                    mrNo:    sessionMrNo,
                    iso:     inp.getAttribute('data-iso'),
                    matCode: '[SUP] ' + inp.getAttribute('data-tag'),
                    desc:    inp.getAttribute('data-item'),
                    size:    inp.getAttribute('data-size'),
                    unit:    'EA',
                    reqQty:  reqQty,
                    isSupport: true,
                });
                addedCount++;
            });
            if (addedCount > 0) {
                alert(`Successfully saved ${addedCount} support item(s) to MR Table (${sessionMrNo}).`);
                renderMrTable();
            } else {
                alert("No valid quantities selected.");
            }
        });
    }

    // "Generate Issue Slip" logic (Shows Print Preview Modal)
    const btnGenerateIssueSlip = document.getElementById('btnGenerateIssueSlip');
    if (btnGenerateIssueSlip) {
        btnGenerateIssueSlip.addEventListener('click', () => {
             if (db.mrTable.length === 0) {
                 alert("MR Table is empty! Please Search ISO BOM and [Add to MR] first.");
                 return;
             }
             
             // Populate Print Modal
             let firstMr = db.mrTable[0].mrNo;
             document.getElementById('printMrNo').innerText = firstMr;
             document.getElementById('printDate').innerText = new Date().toISOString().split('T')[0];
             
             const printTbody = document.getElementById('printTbody');
             const printRows = [];

             // Build matCode → [{plNo, qty}] sorted by PKG NO ascending (On-Site만)
             const pkgRecords = {};
             db.receiving.filter(r => isReceivingActive(r.plNo)).forEach(r => {
                 if (!r.matCode || r.plNo === '-') return;
                 if (!pkgRecords[r.matCode]) pkgRecords[r.matCode] = {};
                 pkgRecords[r.matCode][r.plNo] = (pkgRecords[r.matCode][r.plNo] || 0) + (r.qty || 0);
             });
             // Convert to arrays sorted by PKG NO ascending
             const pkgSorted = {};
             Object.keys(pkgRecords).forEach(mat => {
                 pkgSorted[mat] = Object.entries(pkgRecords[mat])
                     .sort((a, b) => a[0].localeCompare(b[0]))
                     .map(([plNo, qty]) => ({ plNo, qty }));
             });

             db.mrTable.forEach(mrItem => {
                 const records = pkgSorted[mrItem.matCode] || [];
                 let remaining = mrItem.reqQty;
                 const allocated = [];

                 for (const rec of records) {
                     if (remaining <= 0) break;
                     const take = Math.min(remaining, rec.qty);
                     // Show PKG NO only if single package covers the request; show qty if multiple needed
                     allocated.push({ plNo: rec.plNo, take });
                     remaining -= take;
                 }

                 let pkgDisplay;
                 if (allocated.length === 0) {
                     pkgDisplay = '-';
                 } else if (allocated.length === 1) {
                     pkgDisplay = allocated[0].plNo;
                 } else {
                     pkgDisplay = allocated.map(a => `${a.plNo}<br><span style="font-size:10px;color:#555;">(${a.take % 1 === 0 ? a.take : a.take.toFixed(2)})</span>`).join('<br>');
                 }

                 printRows.push(`<tr>
                     <td style="border:1px solid #000; padding:8px;">${mrItem.iso}</td>
                     <td style="border:1px solid #000; padding:8px; font-weight:600; color:#0d47a1; line-height:1.6;">${pkgDisplay}</td>
                     <td style="border:1px solid #000; padding:8px;">${mrItem.matCode}</td>
                     <td style="border:1px solid #000; padding:8px;">${mrItem.desc}</td>
                     <td style="border:1px solid #000; padding:8px;">${mrItem.size}</td>
                     <td style="border:1px solid #000; padding:8px;">${mrItem.unit}</td>
                     <td style="border:1px solid #000; padding:8px; font-weight:bold;">${mrItem.reqQty.toFixed(2)}</td>
                 </tr>`);
             });
             printTbody.innerHTML = printRows.join('');

             document.getElementById('printModal').style.display = 'flex';
        });
    }

    // Modal buttons
    const btnClosePrintModal = document.getElementById('btnClosePrintModal');
    const btnCancelPrint = document.getElementById('btnCancelPrint');
    const btnConfirmPrint = document.getElementById('btnConfirmPrint');

    if(btnClosePrintModal) btnClosePrintModal.addEventListener('click', () => { document.getElementById('printModal').style.display = 'none'; });
    if(btnCancelPrint) btnCancelPrint.addEventListener('click', () => { document.getElementById('printModal').style.display = 'none'; });
    
    if(btnConfirmPrint) {
        btnConfirmPrint.addEventListener('click', () => {
             // 1. Invoke browser print
             window.print();

             // 2. Confirm Issue: translate MR contents into Issued tracker and persist to Supabase
             const issuedToInsert = db.mrTable.map(mrItem => ({
                 iso: mrItem.iso,
                 mat_code: mrItem.matCode,
                 qty: mrItem.reqQty,
                 mr_no: mrItem.mrNo,
                 issue_date: new Date().toISOString()
             }));

             if (supabaseClient) {
                supabaseClient.from('issued').insert(issuedToInsert).then(({ error }) => {
                    if (error) console.error("❌ Supabase Persist Error:", error);
                    else {
                        issuedToInsert.forEach(item => {
                            db.issued.push({
                                matCode: item.mat_code,
                                qty: item.qty,
                                iso: item.iso
                            });
                        });
                        updateDashboard();
                    }
                });
             } else {
                 // Fallback to local only if no client
                 db.mrTable.forEach(mrItem => {
                     db.issued.push({
                         id: Date.now() + Math.random(),
                         iso: mrItem.iso,
                         matCode: mrItem.matCode,
                         qty: mrItem.reqQty,
                         date: new Date().toISOString()
                     });
                 });
             }

             // 3. Cleanup & Success feedback
             alert("Material Issue Slip Printed and Stock updated successfully!");
             document.getElementById('printModal').style.display = 'none';
             db.mrTable = [];
             sessionMrNo = null; // Reset session MR number after slip is issued
             renderMrTable();
             
             const filterBtn = document.getElementById('btnFilterIssue');
             if(filterBtn) filterBtn.click();
             updateDashboard();
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

    const btnResetData = document.getElementById('btnResetData');
    if(btnResetData) {
        btnResetData.addEventListener('click', () => location.reload());
    }

    // --- PL Upload ---
    const btnUploadPL = document.getElementById('btnUploadPL');
    if(btnUploadPL) {
        btnUploadPL.addEventListener('click', () => document.getElementById('plFileInput').click());
    }

    const plFileInput = document.getElementById('plFileInput');
    if(plFileInput) {
        plFileInput.addEventListener('change', async function(e) {
            const file = e.target.files[0];
            if(!file) return;
            this.value = ''; // allow re-select same file
            showLoading(true);
            try { await parsePLFile(file); }
            finally { showLoading(false); }
        });
    }

    const btnSavePLReview = document.getElementById('btnSavePLReview');
    if(btnSavePLReview) btnSavePLReview.addEventListener('click', savePLReview);

    const btnCancelPLReview = document.getElementById('btnCancelPLReview');
    if(btnCancelPLReview) btnCancelPLReview.addEventListener('click', () => {
        document.getElementById('plReviewPanel').style.display = 'none';
        plReviewData = [];
    });

    // --- New MatCode Modal ---
    const btnConfirmNewMatCode = document.getElementById('btnConfirmNewMatCode');
    if(btnConfirmNewMatCode) {
        btnConfirmNewMatCode.addEventListener('click', async () => {
            const matCode = document.getElementById('newMatCodeInput').value.trim().toUpperCase();
            const category = document.getElementById('newMatCategory').value;
            const saveToMaster = document.getElementById('newMatSaveToMaster').checked;

            if(!matCode || !category) {
                alert('Please enter both MatCode and Category.');
                return;
            }

            const idx = window._pendingPLRowIdx;
            if(idx === undefined || idx === null) return;

            plReviewData[idx].matCode = matCode;
            plReviewData[idx].category = category;
            plReviewData[idx].status = 'matched';

            if(saveToMaster && supabaseClient) {
                const { error } = await supabaseClient.from('matcode_master').insert({
                    mat_code: matCode, category,
                    item_desc: '-', matl_desc: '-', size1: '-', size2: '-', class_desc: '-', et_desc: '-'
                });
                if(!error) {
                    db.matCodeMaster.push({ matCode, category, itemDesc: '-', matlDesc: '-', size1: '-', size2: '-', classDesc: '-', etDesc: '-' });
                }
            }

            const catBadge = getCatBadge(category);
            document.getElementById('plrow_matcode_'+idx).innerHTML = `<span class="status-badge ok" style="font-size:11px;">${matCode}</span>`;
            document.getElementById('plrow_cat_'+idx).innerHTML = `<span class="status-badge ${catBadge}">${category}</span>`;

            document.getElementById('newMatCodeModal').style.display = 'none';
            updatePLReviewSummary();
        });
    }

    const btnDashFilter = document.getElementById('btnDashFilter');
    if (btnDashFilter) {
        btnDashFilter.addEventListener('click', () => {
            if (typeof window.updateDashboard === 'function') window.updateDashboard();
        });
    }

    const dashIsoSearchInput = document.getElementById('dashIsoSearch');
    if (dashIsoSearchInput) {
        dashIsoSearchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') btnDashFilter?.click();
        });
    }

    // MR History search button
    const btnFilterMrHist = document.getElementById('btnFilterMrHist');
    if (btnFilterMrHist) {
        btnFilterMrHist.addEventListener('click', renderMrHistory);
    }
}

// Function to render the MR Table
function renderMrTable() {
    let tbody = document.querySelector('#mrTableOutput tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    // Show MR number and item count in the panel header
    const mrHeader = document.querySelector('#mrTableOutput').closest('.panel')?.querySelector('h3');
    if (mrHeader) {
        if (sessionMrNo && db.mrTable.length > 0) {
            mrHeader.innerHTML = `<i class="fas fa-clipboard-list"></i> Pending MR Table &nbsp;<span style="font-size:12px;font-weight:400;background:rgba(255,255,255,0.2);padding:2px 10px;border-radius:10px;letter-spacing:0.5px;">${sessionMrNo}</span> &nbsp;<span style="font-size:12px;font-weight:400;opacity:0.8;">${db.mrTable.length} item(s)</span>`;
        } else {
            mrHeader.innerHTML = `<i class="fas fa-clipboard-list"></i> Pending MR Table (For Issue Slip)`;
        }
    }

    if (db.mrTable.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color: #888;">MR Table is empty.</td></tr>';
        return;
    }

    // Build pkgRecords: matCode → sorted [{plNo, qty}] (On-Site만)
    const pkgRecords = {};
    db.receiving.filter(r => isReceivingActive(r.plNo)).forEach(r => {
        if (!r.matCode || r.plNo === '-') return;
        if (!pkgRecords[r.matCode]) pkgRecords[r.matCode] = {};
        pkgRecords[r.matCode][r.plNo] = (pkgRecords[r.matCode][r.plNo] || 0) + (r.qty || 0);
    });
    const pkgSorted = {};
    Object.keys(pkgRecords).forEach(mat => {
        pkgSorted[mat] = Object.entries(pkgRecords[mat])
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([plNo, qty]) => ({ plNo, qty }));
    });

    tbody.innerHTML = db.mrTable.map(m => {
        // Support 항목은 PKG NO 할당 없이 표시
        let pkgDisplay;
        if (m.isSupport) {
            pkgDisplay = '<span style="font-size:11px;color:#3949ab;background:#e8eaf6;padding:2px 7px;border-radius:10px;">Support</span>';
        } else {
            const records = pkgSorted[m.matCode] || [];
            let remaining = m.reqQty;
            const allocated = [];
            for (const rec of records) {
                if (remaining <= 0) break;
                allocated.push({ plNo: rec.plNo, take: Math.min(remaining, rec.qty) });
                remaining -= allocated[allocated.length - 1].take;
            }
            if (allocated.length === 0) {
                pkgDisplay = '<span style="color:#999;">-</span>';
            } else if (allocated.length === 1) {
                pkgDisplay = `<span style="font-weight:600;color:#0d47a1;">${allocated[0].plNo}</span>`;
            } else {
                pkgDisplay = allocated.map(a =>
                    `<span style="font-weight:600;color:#0d47a1;">${a.plNo}</span><span style="font-size:10px;color:#555;"> (${a.take % 1 === 0 ? a.take : a.take.toFixed(2)})</span>`
                ).join('<br>');
            }
        }
        const rowStyle = m.isSupport ? 'background:#f5f5ff;' : '';
        return `<tr style="${rowStyle}">
            <td><strong>${m.mrNo}</strong></td>
            <td>${m.iso}</td>
            <td style="line-height:1.8;">${pkgDisplay}</td>
            <td><span class="status-badge ok">${m.matCode}</span></td>
            <td title="${m.desc}">${m.desc.substring(0,20)}...</td>
            <td>${m.size}</td><td>${m.unit}</td>
            <td><strong>${(m.reqQty || 0).toFixed(2)}</strong></td>
        </tr>`;
    }).join('');
}

// ==========================================
// MR History & ISO Progress
// ==========================================

let _mrHistPage = 1;
let _mrProgPage = 1;
let _mrHistCache = null; // { mrList, isoRows }

function _renderMrHistPages() {
    if (!_mrHistCache) return;
    const { mrList, isoRows, getIsoStatus } = _mrHistCache;

    const histTbody = document.getElementById('mrHistTbody');
    const progTbody = document.getElementById('isoMrProgressTbody');

    if (histTbody) {
        if (mrList.length === 0) {
            histTbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#888;padding:20px;">No MR records found.</td></tr>';
            const hp = document.getElementById('mrHistPagination'); if (hp) hp.innerHTML = '';
        } else {
            const hTotal = Math.max(1, Math.ceil(mrList.length / PAGE_SIZE));
            if (_mrHistPage > hTotal) _mrHistPage = 1;
            const hStart = (_mrHistPage - 1) * PAGE_SIZE;
            histTbody.innerHTML = mrList.slice(hStart, hStart + PAGE_SIZE).map(mr => {
                const status = getIsoStatus(mr.iso);
                const sCls   = status === 'CLOSED' ? 'ok' : (status === 'PARTIAL' ? 'warn' : '');
                const suppBtn = status === 'PARTIAL'
                    ? `<button class="btn btn-primary btn-small" onclick="window.loadSupplementMR(${JSON.stringify(mr.iso)},${JSON.stringify(mr.mrNo)})"><i class="fas fa-plus-circle"></i> Supplement Issue</button>`
                    : '<span style="color:#aaa;font-size:11px;">Closed</span>';
                return `<tr>
                    <td><strong style="color:var(--color-primary);">${mr.mrNo}</strong></td>
                    <td style="font-size:12px;">${mr.iso}</td>
                    <td>${mr.date}</td>
                    <td style="text-align:center;">${mr.items.length}</td>
                    <td style="text-align:right;">${mr.totalQty.toFixed(2)}</td>
                    <td><span class="status-badge ${sCls}">${status}</span></td>
                    <td>${suppBtn}</td>
                </tr>`;
            }).join('');
            renderPagination('mrHistPagination', _mrHistPage, hTotal, '_mrHistGoPage');
        }
    }

    if (progTbody) {
        if (isoRows.length === 0) {
            progTbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#888;">No data.</td></tr>';
            const pp = document.getElementById('mrProgPagination'); if (pp) pp.innerHTML = '';
        } else {
            const pTotal = Math.max(1, Math.ceil(isoRows.length / PAGE_SIZE));
            if (_mrProgPage > pTotal) _mrProgPage = 1;
            const pStart = (_mrProgPage - 1) * PAGE_SIZE;
            progTbody.innerHTML = isoRows.slice(pStart, pStart + PAGE_SIZE).map(r => {
                const sCls = r.status === 'CLOSED' ? 'ok' : 'warn';
                const pct  = r.progress.toFixed(1);
                const barColor = r.progress >= 100 ? '#2e7d32' : (r.progress >= 50 ? '#f57f17' : '#c62828');
                const suppBtn = r.status === 'PARTIAL'
                    ? `<button class="btn btn-primary btn-small" onclick="window.loadSupplementMR(${JSON.stringify(r.iso)},${JSON.stringify(r.latestMrNo)})"><i class="fas fa-plus-circle"></i> Supplement Issue</button>`
                    : '<span style="color:#aaa;font-size:11px;">-</span>';
                return `<tr>
                    <td style="font-size:12px;">${r.iso}</td>
                    <td style="text-align:center;">${r.bomItems}</td>
                    <td style="font-weight:600;color:#0d47a1;text-align:right;">${r.totalBom.toFixed(2)}</td>
                    <td style="font-weight:600;color:#2e7d32;text-align:right;">${r.totalIssued.toFixed(2)}</td>
                    <td style="font-weight:600;color:${r.remaining > 0 ? '#c62828' : '#888'};text-align:right;">${r.remaining.toFixed(2)}</td>
                    <td><div style="display:flex;align-items:center;gap:8px;"><div style="flex:1;background:#eee;height:8px;border-radius:4px;overflow:hidden;min-width:80px;"><div style="width:${pct}%;background:${barColor};height:100%;border-radius:4px;"></div></div><span style="font-size:11px;font-weight:600;min-width:38px;">${pct}%</span></div></td>
                    <td><span class="status-badge ${sCls}">${r.status}</span></td>
                    <td>${suppBtn}</td>
                </tr>`;
            }).join('');
            renderPagination('mrProgPagination', _mrProgPage, pTotal, '_mrProgGoPage');
        }
    }
}
window._mrHistGoPage = function(p) { _mrHistPage = p; _renderMrHistPages(); };
window._mrProgGoPage = function(p) { _mrProgPage = p; _renderMrHistPages(); };

async function renderMrHistory() {
    if (!supabaseClient) return;

    const dateFrom = document.getElementById('mrHistDateFrom')?.value || '';
    const dateTo   = document.getElementById('mrHistDateTo')?.value || '';
    const isoSearch = (document.getElementById('mrHistIsoSearch')?.value || '').trim().toUpperCase();
    const statusFilter = document.getElementById('mrHistStatus')?.value || 'All';

    _mrHistCache = null;
    _mrHistPage = 1;
    _mrProgPage = 1;

    const histTbody = document.getElementById('mrHistTbody');
    const progTbody = document.getElementById('isoMrProgressTbody');
    if (histTbody) histTbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#888;padding:20px;">Loading...</td></tr>';
    if (progTbody) progTbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#888;padding:20px;">Loading...</td></tr>';

    // 1. Group db.issued by mrNo
    const mrMap = {};
    db.issued.forEach(i => {
        const key = i.mrNo || '-';
        if (key === '-') return;
        if (!mrMap[key]) mrMap[key] = { mrNo: key, iso: i.iso || '-', date: i.issueDate || '-', items: [], totalQty: 0 };
        mrMap[key].items.push(i);
        mrMap[key].totalQty += (i.qty || 0);
    });

    let mrList = Object.values(mrMap).sort((a, b) => b.date.localeCompare(a.date));

    // 2. Apply filters
    if (dateFrom) mrList = mrList.filter(m => m.date >= dateFrom);
    if (dateTo)   mrList = mrList.filter(m => m.date <= dateTo);
    if (isoSearch) mrList = mrList.filter(m => m.iso.toUpperCase().includes(isoSearch));

    // 3. Fetch BOM data for all unique ISOs that appear in issued records
    const uniqueISOs = [...new Set(mrList.map(m => m.iso).filter(i => i !== '-'))];

    const bomByIso = {};        // iso → { matCode → bomQty }
    const issuedByIsoMat = {}; // `iso::matCode` → total issued qty (across ALL dates)

    if (uniqueISOs.length > 0) {
        // chunk large IN queries to avoid URL length limits
        const chunkSize = 50;
        for (let c = 0; c < uniqueISOs.length; c += chunkSize) {
            const chunk = uniqueISOs.slice(c, c + chunkSize);
            const { data: bomRows } = await supabaseClient
                .from('bom')
                .select('iso_dwg_no, mat_code, qty')
                .in('iso_dwg_no', chunk);
            if (bomRows) {
                bomRows.forEach(b => {
                    if (!bomByIso[b.iso_dwg_no]) bomByIso[b.iso_dwg_no] = {};
                    bomByIso[b.iso_dwg_no][b.mat_code] = (bomByIso[b.iso_dwg_no][b.mat_code] || 0) + (parseFloat(b.qty) || 0);
                });
            }
        }
    }

    // Build issued totals per iso+matCode (all time, not just filtered range)
    db.issued.forEach(i => {
        const key = `${i.iso}::${i.matCode}`;
        issuedByIsoMat[key] = (issuedByIsoMat[key] || 0) + (i.qty || 0);
    });

    // 4. Determine PARTIAL / CLOSED status per ISO
    function getIsoStatus(iso) {
        const bom = bomByIso[iso];
        if (!bom || Object.keys(bom).length === 0) return 'UNKNOWN';
        for (const [mc, bomQty] of Object.entries(bom)) {
            const issued = issuedByIsoMat[`${iso}::${mc}`] || 0;
            if (issued < bomQty - 0.001) return 'PARTIAL';
        }
        return 'CLOSED';
    }

    // Apply status filter
    if (statusFilter !== 'All') mrList = mrList.filter(m => getIsoStatus(m.iso) === statusFilter);

    // 6. Build ISO-level progress rows
    const isoRows = [];
    uniqueISOs.forEach(iso => {
        const bom = bomByIso[iso] || {};
        const mcs = Object.keys(bom);
        let totalBom = 0, totalIssued = 0;
        mcs.forEach(mc => {
            totalBom    += (bom[mc] || 0);
            totalIssued += (issuedByIsoMat[`${iso}::${mc}`] || 0);
        });
        const remaining = Math.max(0, totalBom - totalIssued);
        const progress  = totalBom > 0 ? Math.min(100, totalIssued / totalBom * 100) : 0;
        const status    = progress >= 99.9 ? 'CLOSED' : 'PARTIAL';
        const isoMrs = Object.values(mrMap).filter(m => m.iso === iso).sort((a, b) => b.date.localeCompare(a.date));
        const latestMrNo = isoMrs.length > 0 ? isoMrs[0].mrNo : '-';
        isoRows.push({ iso, bomItems: mcs.length, totalBom, totalIssued, remaining, progress, status, latestMrNo });
    });
    isoRows.sort((a, b) => a.progress - b.progress);

    _mrHistCache = { mrList, isoRows, getIsoStatus };
    _renderMrHistPages();
}

/**
 * Supplement Issue: Auto-load remaining items for the ISO into Material Requisition tab
 */
window.loadSupplementMR = function(iso, baseMrNo) {
    // Determine supplement suffix (S2, S3, ...)
    const base = baseMrNo.split('-S')[0];
    const existingSuffixes = db.issued
        .map(i => i.mrNo)
        .filter(n => n && n.startsWith(base + '-S'))
        .map(n => { const p = n.split('-S'); return p.length > 1 ? (parseInt(p[p.length - 1]) || 1) : 1; });
    const nextSuffix = existingSuffixes.length > 0 ? Math.max(...existingSuffixes) + 1 : 2;
    sessionMrNo = `${base}-S${nextSuffix}`;

    if (typeof showSection === 'function') showSection('issue');
    setTimeout(() => {
        const searchInput = document.getElementById('issueIsoSearch');
        if (searchInput) searchInput.value = iso;
        const catFilter = document.getElementById('issueCategoryFilter');
        if (catFilter) catFilter.value = 'All';
        document.getElementById('btnFilterIssue')?.click();

        // Update MR table header to show supplement number
        const mrHeader = document.querySelector('#mrTableOutput')?.closest('.panel')?.querySelector('h3');
        if (mrHeader) {
            mrHeader.innerHTML = `<i class="fas fa-clipboard-list"></i> Supplement MR &nbsp;<span style="font-size:12px;font-weight:400;background:rgba(255,152,0,0.25);padding:2px 10px;border-radius:10px;letter-spacing:0.5px;color:#e65100;">${sessionMrNo}</span>`;
        }
    }, 200);
};

/**
 * Navigate from Dashboard to Material Requisition for a specific ISO drawing
 */
window.showIsoDetail = function(isoDwgNo) {
    if (!isoDwgNo) return;
    if (typeof showSection === 'function') showSection('issue');
    // Wait for section switch and renderIssueOptions() to complete before searching
    setTimeout(() => {
        const searchInput = document.getElementById('issueIsoSearch');
        if (searchInput) searchInput.value = isoDwgNo;
        // Reset category filter then search all
        const catFilter = document.getElementById('issueCategoryFilter');
        if (catFilter) catFilter.value = 'All';
        document.getElementById('btnFilterIssue')?.click();
    }, 150);
};

// ── Receiving Detail Popup ────────────────────────────────────────
window.showReceivingDetail = function(matCode) {
    const modal = document.getElementById('receivingDetailModal');
    if (!modal) return;

    // All receiving records for this matCode
    const recRecords = db.receiving.filter(r => r.matCode === matCode);
    const totalRec   = recRecords.reduce((s, r) => s + r.qty, 0);

    // BOM total qty for this matCode
    const bomRecords = db.bom.filter(b => b.matCode === matCode);
    const totalBom   = bomRecords.reduce((s, b) => s + (b.qty || 0), 0);

    // Issued total qty
    const totalIssued = db.issued
        .filter(i => i.matCode === matCode)
        .reduce((s, i) => s + (i.qty || 0), 0);

    const stock = totalRec - totalIssued;
    const sample = recRecords[0] || {};
    const unit   = sample.unit || 'EA';
    const size   = window.extractSizeFromMatCode(matCode);

    // Summary cards
    const cardStyle = (bg, color) =>
        `background:${bg}; border-radius:8px; padding:12px 20px; text-align:center; min-width:110px;`;
    document.getElementById('rdSummary').innerHTML = `
        <div style="${cardStyle('#e3f2fd','#0d47a1')}">
            <div style="font-size:22px;font-weight:800;color:#0d47a1;">${totalBom.toLocaleString()}</div>
            <div style="font-size:11px;color:#555;">BOM Qty</div>
        </div>
        <div style="${cardStyle('#e8f5e9','#2e7d32')}">
            <div style="font-size:22px;font-weight:800;color:#2e7d32;">${totalRec.toLocaleString()}</div>
            <div style="font-size:11px;color:#555;">Total Received</div>
        </div>
        <div style="${cardStyle('#fff3e0','#e65100')}">
            <div style="font-size:22px;font-weight:800;color:#e65100;">${totalIssued.toLocaleString()}</div>
            <div style="font-size:11px;color:#555;">Total Issued</div>
        </div>
        <div style="${cardStyle(stock >= 0 ? '#f3e5f5' : '#ffebee', stock >= 0 ? '#6a1b9a' : '#c62828')}">
            <div style="font-size:22px;font-weight:800;color:${stock >= 0 ? '#6a1b9a' : '#c62828'};">${stock.toLocaleString()}</div>
            <div style="font-size:11px;color:#555;">Stock</div>
        </div>`;

    // Info row
    document.getElementById('rdInfo').innerHTML = `
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
            <div><span style="color:#888;font-size:11px;">MAT CODE</span><br><strong>${matCode}</strong></div>
            <div><span style="color:#888;font-size:11px;">DESCRIPTION</span><br><strong>${sample.desc || '-'}</strong></div>
            <div><span style="color:#888;font-size:11px;">CATEGORY</span><br><strong>${sample.category || '-'}</strong></div>
            <div><span style="color:#888;font-size:11px;">SIZE / UNIT</span><br><strong>${size} / ${unit}</strong></div>
        </div>`;

    // Records table
    const tbody = document.getElementById('rdRecordsTbody');
    tbody.innerHTML = '';
    if (recRecords.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#888;">No receiving records.</td></tr>';
    } else {
        const recRows = recRecords.map(r => `<tr>
                <td>${r.docNo}</td>
                <td style="font-weight:600;color:#0d47a1;">${r.plNo}</td>
                <td style="font-weight:700;text-align:right;">${r.qty.toLocaleString()}</td>
                <td>${r.unit || 'EA'}</td>
            </tr>`);
        recRows.push(`<tr style="background:#f0f4f8;font-weight:700;">
            <td colspan="2" style="text-align:right;">Total</td>
            <td style="text-align:right;color:#2e7d32;">${totalRec.toLocaleString()}</td>
            <td>${unit}</td>
        </tr>`);
        tbody.innerHTML = recRows.join('');
    }

    modal.style.display = 'flex';
};


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

// status가 Preparing/Shipping이면 아직 현장 미도착 → Receiving 집계 제외
function isReceivingActive(plNo) {
    const status = (_plUpdatesCache[plNo] || {}).status || '';
    return status !== 'Preparing' && status !== 'Shipping';
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
        '<tr><td colspan="11" style="text-align:center;color:#888;padding:30px;"><i class="fas fa-spinner fa-spin"></i> Loading...</td></tr>';
    try {
        // pl_updates는 아직 로드 안 됐을 때만 조회
        if (Object.keys(_plUpdatesCache).length === 0) {
            await loadPlUpdates();
        }

        // spool_receiving: 캐시 있으면 재사용, 없을 때만 조회
        if (!_spoolShippingCache && supabaseClient) {
            const { data: spoolRows } = await supabaseClient
                .from('spool_receiving')
                .select('pkg_seq,pkg_no,description,qty,unit,purpose,system')
                .order('pkg_seq', { ascending: true })
                .order('id', { ascending: true })
                .limit(5000);
            _spoolShippingCache = spoolRows || [];
        }

        // support_packing_list: 캐시 있으면 재사용, 없을 때만 조회
        if (!_supportShippingCache && supabaseClient) {
            const { data: suppRows } = await supabaseClient
                .from('support_packing_list')
                .select('pkg,package_no,description,qty,unit,block_info')
                .order('pkg', { ascending: true })
                .order('package_no', { ascending: true })
                .limit(500);
            _supportShippingCache = suppRows || [];
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
                    description:  r.description || 'Piping Spool',
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
            .map(r => ({
                packing:      r.docNo,
                pkg_no:       r.plNo,
                description:  r.desc,
                qty:          r.qty,
                unit:         r.unit,
                purpose:      r.purpose || '',
                status:       '',
                on_site:      '',
                custom_clear: '',
                issue_date:   '',
                remark:       '',
            }));

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
                        description:  s.description || 'Support',
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
            '<tr><td colspan="11" style="text-align:center;color:#e53935;padding:30px;">Failed to load data.</td></tr>';
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
}

function getShippingFiltered() {
    const group  = document.getElementById('shippingGroupFilter')?.value || '';
    const pkgF   = document.getElementById('shippingPkgFilter')?.value  || '';
    const search = (document.getElementById('shippingSearch')?.value || '').trim().toLowerCase();
    const statusF = document.getElementById('shippingStatusFilter')?.value || '';
    const customF = document.getElementById('shippingCustomFilter')?.value || '';
    return (_shippingData || [])
        .filter(r => {
            if (group && r.packing !== group) return false;
            if (pkgF  && r.pkg_no  !== pkgF)  return false;
            if (search && !r.pkg_no.toLowerCase().includes(search)
                       && !r.description.toLowerCase().includes(search)) return false;
            const needMerge = statusF || customF || (_shippingKpiFilter && _shippingKpiFilter !== 'all');
            if (!needMerge) return true;
            const m = mergeRow(r);
            const st = m.status || '';
            const cc = (m.custom_clear || '').trim();
            if (statusF && (statusF === '__none__' ? st !== '' : st !== statusF)) return false;
            if (customF && (customF === '__none__' ? cc !== '' : cc !== customF)) return false;
            if (_shippingKpiFilter && _shippingKpiFilter !== 'all') {
                if (_shippingKpiFilter === 'shipping'  && st !== 'Preparing' && st !== 'Shipping') return false;
                if (_shippingKpiFilter === 'onsite'    && st !== 'On-Site')   return false;
                if (_shippingKpiFilter === 'cleared'   && cc !== 'Cleared')   return false;
                if (_shippingKpiFilter === 'pending'   && cc !== 'Pending')   return false;
                if (_shippingKpiFilter === 'issued'    && !m.issue_date)      return false;
                if (_shippingKpiFilter === 'remaining' && m.issue_date)       return false;
            }
            return true;
        })
        .sort((a, b) => a.packing.localeCompare(b.packing) || a.pkg_no.localeCompare(b.pkg_no));
}

const PL_INPUT_CSS = 'width:100%;box-sizing:border-box;border:1px solid #dde3ee;border-radius:4px;padding:3px 5px;font-size:12px;background:#fff;color:#0A2540;text-align:center;';
const PURPOSE_OPTS = ['', 'Permanent', 'Temporary', 'Repair', 'Spare', 'Commissioning', 'Accessory', 'Other'];

// pkg_no → first purpose 조회 맵 (렌더링 전 한 번만 빌드)
let _recvPurposeMap = null;
function _buildRecvPurposeMap() {
    _recvPurposeMap = {};
    db.receiving.forEach(rx => {
        if (!(rx.plNo in _recvPurposeMap)) _recvPurposeMap[rx.plNo] = rx.purpose || '';
    });
}
// db.receiving 교체 시 무효화
function invalidateRecvPurposeMap() { _recvPurposeMap = null; }

function mergeRow(r) {
    const upd = _plUpdatesCache[r.pkg_no] || {};
    const chg = _plChanges[r.pkg_no]      || {};
    if (!_recvPurposeMap) _buildRecvPurposeMap();
    const recvPurpose = _recvPurposeMap[r.pkg_no] ?? r.purpose ?? '';
    return {
        ...r,
        status:        chg.status        ?? upd.status        ?? r.status        ?? '',
        on_site:       chg.on_site       ?? upd.on_site       ?? r.on_site       ?? '',
        custom_clear:  chg.custom_clear  ?? upd.custom_clear  ?? r.custom_clear  ?? '',
        issue_date:    chg.issue_date    ?? upd.issue_date    ?? r.issue_date    ?? '',
        remark:        chg.remark        !== undefined ? chg.remark
                     : upd.remark        !== undefined ? upd.remark
                    : (r.remark || ''),
        purpose:       recvPurpose,
    };
}

// KPI는 전체 _shippingData 기준으로만 계산 (필터 선택과 무관)
function renderShippingKpi() {
    const allMerged  = (_shippingData || []).map(mergeRow);
    const total      = allMerged.length;
    const plCount    = new Set(allMerged.map(r => r.packing)).size;
    const shippingRows  = allMerged.filter(r => r.status === 'Preparing' || r.status === 'Shipping');
    const onsiteRows    = allMerged.filter(r => r.status === 'On-Site');
    const clearedRows   = allMerged.filter(r => r.custom_clear === 'Cleared');
    const issuedRows    = allMerged.filter(r => r.issue_date);
    const pendingRows   = allMerged.filter(r => r.custom_clear === 'Pending');
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
        tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;color:#888;padding:30px;">No data found.</td></tr>';
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
        const purposeOpts = PURPOSE_OPTS.map(v =>
            `<option value="${v}"${r.purpose === v ? ' selected' : ''}>${v || '—'}</option>`
        ).join('');
        const purposeCell = newPkg
            ? `<td style="text-align:center;padding:3px;"><select class="pl-purpose-pkg-sel" style="${PL_INPUT_CSS}color:#1565c0;font-weight:600;" data-pkg="${pkg}">${purposeOpts}</select></td>`
            : `<td style="${roStyle}" data-pkg-ro="${pkg}" data-field-ro="purpose">${r.purpose || '—'}</td>`;

        const isSupport = _supportPkgSet.has(r.pkg_no);
        const pkgNoCell = isSupport
            ? `<td style="text-align:center;font-weight:700;font-size:11px;color:#1565c0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${r.pkg_no}">${r.pkg_no}</td>`
            : `<td style="text-align:center;font-weight:700;font-size:11px;color:#1565c0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;" title="${r.pkg_no}" onclick="openPackingListModal('${r.pkg_no}','${r.packing}')">${r.pkg_no}</td>`;

        return `<tr${newGroup ? ' style="background:#f8fafc;"' : ''}>
            ${packingCell}
            ${pkgNoCell}
            <td style="text-align:center;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${r.description}">${r.description}</td>
            <td style="text-align:center;font-weight:600;">${qtyDisplay}</td>
            <td style="text-align:center;color:#555;">${r.unit || '—'}</td>
            ${statusCell}
            ${onSiteCell}
            ${customClearCell}
            <td style="text-align:center;padding:3px;">
                <input type="text" class="pl-datepicker" style="${PL_INPUT_CSS}cursor:pointer;text-align:right;" data-pkg="${pkg}" data-field="issue_date" value="${r.issue_date}" placeholder="">
            </td>
            ${purposeCell}
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
        const upserts = dirty.map(([pkg_no, fields]) => {
            const base = { pkg_no, ...(_plUpdatesCache[pkg_no] || {}), ...fields };
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
            if (document.getElementById('stock_ledger')?.classList.contains('active')) {
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
        const sf = document.getElementById('shippingStatusFilter');
        const cf = document.getElementById('shippingCustomFilter');
        if (pf) pf.value = '';
        if (sf) sf.value = '';
        if (cf) cf.value = '';
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
        // Purpose 드롭박스: receiving 테이블 pkg_no 일괄 업데이트
        tbody.addEventListener('change', async e => {
            const sel = e.target.closest('.pl-purpose-pkg-sel');
            if (!sel || !supabaseClient) return;
            const pkg     = sel.dataset.pkg;
            const purpose = sel.value;
            if (!pkg) return;
            sel.disabled = true;
            const { error } = await supabaseClient.from('receiving')
                .update({ purpose })
                .eq('pkg_no', pkg);
            sel.disabled = false;
            if (!error) {
                // 메모리 동기화
                db.receiving.forEach(r => { if (r.plNo === pkg) r.purpose = purpose; });
                const sd = _shippingData.find(r => r.pkg_no === pkg);
                if (sd) sd.purpose = purpose;
                // 동일 PKG 연속행 read-only 셀 즉시 갱신
                tbody.querySelectorAll(`[data-pkg-ro="${pkg}"][data-field-ro="purpose"]`)
                    .forEach(cell => { cell.textContent = purpose || '—'; });
            }
        });

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

function updateSpoolKpis() {
    const recCount = (_srData || []).length;
    const pkgCount = new Set((_srData || []).map(r => r.pkg_no)).size;
    document.querySelectorAll('.spool-kpi-received').forEach(el => el.innerHTML = `${recCount} <span class="unit">EA</span>`);
    document.querySelectorAll('.spool-kpi-rec-sub').forEach(el => el.textContent = `${pkgCount} PKG`);
}

// --- Spool Receiving ---
let _srData = null;
let _srPage = 1;

async function initSpoolReceiving() {
    if (_srData) { _initSrFilters(); renderSpoolReceiving(); return; }
    if (!supabaseClient) return;
    const { data, error } = await supabaseClient
        .from('spool_receiving')
        .select('*')
        .order('pkg_seq', { ascending: true })
        .order('id',      { ascending: true })
        .limit(10000);
    if (error) {
        const tb = document.getElementById('srTbody');
        if (tb) tb.innerHTML = `<tr><td colspan="10" style="text-align:center;color:#c00;padding:40px;">Error: ${error.message}</td></tr>`;
        return;
    }
    _srData = data || [];
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
        ? `<tr><td colspan="10" style="text-align:center;color:#999;padding:40px;">No data</td></tr>`
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
            <td style="color:#888;font-size:12px;">${r.purpose || ''}</td>
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
});
