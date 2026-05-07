/* global Chart */
// Supabase Configuration - LIVE CREDENTIALS (FIXED COLLISION)
const SUPABASE_URL = 'https://ognhvfvlboqblueuldlm.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nbmh2ZnZsYm9xYmx1ZXVsZGxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3MzY2NTUsImV4cCI6MjA4ODMxMjY1NX0.paO5jr16M7yTySUAp9LgberoatDds9rTNa_eCU_ET_I';
let supabaseClient = null;
try {
    if (typeof window.supabase !== 'undefined' && SUPABASE_URL) {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
            db: { schema: 'material' }
        });
    }
} catch (e) {
    console.error("Supabase initialization failed:", e);
}


let db = {
    matCodeMaster: [],
    bom: [],        // bom_agg: aggregated by matCode+category+system
    bomIsoList: [], // bom_iso_list: distinct system+iso_dwg_no pairs for dropdowns
    receiving: [],
    mrTable: [],
    issued: []
};

// Session MR number - reused until MR Table is cleared after slip generation
let sessionMrNo = null;

// Cached ISO stage data for client-side re-filtering (donut chart clicks)
let cachedIsoData = [];

// --- Helper Functions (Globally Available) ---
window.getCategory = function(desc, matCode) {
    if (!desc && !matCode) return 'Others';
    let d = ((desc||'') + ' ' + (matCode||'')).toUpperCase();
    let m = (matCode || '').toUpperCase();
    
    // 1. Valve Detection
    if (d.includes('VALVE') || d.includes('VLV') || 
        /^(BAV|GLV|GTV|CHV|BFV|PLV|PSV|PRV|CV-)/.test(m)) return 'Valve';
        
    // 2. Pipe Detection
    if (d.includes('PIPE') || d.includes('TUBE') || m.startsWith('PIS-') || m.startsWith('PIP-')) return 'Pipe';

    // 3. Support Detection
    if (d.includes('SUPPORT') || d.includes('SHOE') || d.includes('GUIDE') || d.includes('U-BOLT') || d.includes('UBOLT')) return 'Support';

    // 4. Speciality Detection
    if (d.includes('TRAP') || d.includes('STRAINER') || d.includes('SIGHT') || d.includes('HOSE') || d.includes('SPECIALTY') || m.startsWith('SP-')) return 'Speciality';

    // 5. Fitting Detection
    if (d.includes('ELBOW') || d.includes('TEE') || d.includes('REDUCER') || d.includes('CAP') || d.includes('OLET') || d.includes('FLANGE') || d.includes('NIPPLE') || d.includes('COUPLING') || d.includes('UNION') || d.includes('GASKET') || d.includes('BLIND') || d.includes('FLN') || d.includes('EL9') || d.includes('EL4') || m.startsWith('ELB-') || m.startsWith('TEE-') || m.startsWith('RED-') || m.startsWith('CAP-') || m.startsWith('FLN-') || m.startsWith('GSKT-')) return 'Fitting';
    
    // 6. Others / Bolting
    if (d.includes('BOLT') || /\bNUT\b/.test(d) || m.startsWith('STB-') || m.startsWith('NUT-')) return 'Others';

    return 'Others';
};

window.extractItemFromDesc = function(desc) {
    if (!desc) return '-';
    // Check compound item names first (order matters — longer first)
    const COMPOUND = [
        'TEE-RED', 'REDUCER-CON', 'REDUCER-ECC',
        'FLANGE-BLIND', 'FLANGE-SLIP', 'FLANGE-WELD', 'FLANGE-LAP',
        'COUPLING-HALF', 'COUPLING-FULL',
        'SWAGE-CON', 'SWAGE-ECC',
        'ELBOW LR', 'ELBOW SR',
        'NIPPLE', 'WELDOLET', 'SOCKOLET', 'THREADOLET',
    ];
    const upper = desc.toUpperCase().trim();
    for (const c of COMPOUND) {
        if (upper.startsWith(c)) return c;
    }
    // Skip leading dimension prefix (e.g., 3", 1/2", DN80, 2"x1")
    const s = desc.replace(/^[\d"'\s\/\-×xX]+/, '').trim();
    if (!s) return '-';
    const m = s.match(/^([A-Za-z][A-Za-z\s]*?)(?:\s*[-\/,]|$)/);
    const raw = m ? m[1].trim().toUpperCase() : s.split(/[\s\-\/,_]/)[0].toUpperCase();
    // Normalize short item names to full names
    const ITEM_MAP = {
        'BALL': 'BALL VALVE', 'GATE': 'GATE VALVE',
        'GLOBE': 'GLOBE VALVE', 'CHECK': 'CHECK VALVE',
        'CHCK': 'CHECK VALVE', 'BUTTERFLY': 'BUTTERFLY VALVE',
        'BTFY': 'BUTTERFLY VALVE',
    };
    return ITEM_MAP[raw] || raw;
};

window.extractItemFromMatCode = function(matCode) {
    const prefix = (matCode || '').split('-')[0].toUpperCase();
    const MAP = {
        'PIS':'PIPE', 'PIW':'PIPE', 'PIN':'NIPPLE',
        'EL9L':'ELBOW', 'EL4L':'ELBOW', 'ELS':'ELBOW',
        'FLN':'FLANGE', 'FLB':'FLANGE', 'FLS':'FLANGE', 'FLO':'FLANGE', 'FLR':'FLANGE',
        'TEE':'TEE', 'TER':'TEE-RED',
        'RDC':'RED-CON', 'RDE':'RED-ECC',
        'CAP':'CAP',
        'CPH':'COUPLING', 'CPU':'COUPLING',
        'SWC':'SWAGE', 'SWE':'SWAGE',
        'WOL':'WELDOLET', 'SOL':'SOCKOLET', 'TOL':'THREADOLET',
        'VLV':'VALVE', 'VBL':'BALL VALVE', 'VGA':'GATE VALVE', 'VGL':'GLOBE VALVE',
        'VCH':'CHECK VALVE', 'CHV':'CHECK VALVE', 'VBF':'BUTTERFLY VALVE',
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

function showLoading(show) {
    const loader = document.getElementById('globalLoader');
    if (loader) loader.style.display = show ? 'flex' : 'none';
}

async function fetchAllRows(tableName) {
    let allData = [];
    let from = 0;
    let step = 1000;
    let hasMore = true;

    while (hasMore) {
        console.log(`📡 Fetching ${tableName}: ${from} rows...`);
        const { data, error } = await supabaseClient
            .from(tableName)
            .select('*')
            .range(from, from + step - 1);
        
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
    console.log(`✅ ${tableName} complete: ${allData.length} records.`);
    return allData;
}

async function syncFromSupabase() {
    if (!supabaseClient) return;
    
    showLoading(true);
    try {
        console.log("🚀 Starting Full Supabase Sync (Batching)...");
        
        // bom_agg: aggregated view (~thousands of rows, 1 API call)
        // bom_iso_list: distinct ISO list (~hundreds of rows, 1 API call)
        // Replaced fetchAllRows('bom') which caused 73,397 rows / 74 API calls
        const [matMasterRaw, bomRaw, bomIsoRaw, recvRaw, issuedRaw] = await Promise.all([
            fetchAllRows('matcode_master'),
            supabaseClient.from('bom_agg').select('*').then(r => r.data || []),
            supabaseClient.from('bom_iso_list').select('*').then(r => r.data || []),
            fetchAllRows('receiving'),
            fetchAllRows('issued')
        ]);

        console.log("📊 Sync Results (Full):", {
            master: matMasterRaw.length,
            bom: bomRaw.length,
            receiving: recvRaw.length
        });

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
        db.bomIsoList = bomIsoRaw.map(r => ({
            system: r.system || '-',
            iso: r.iso || '-'
        })).filter(r => r.iso !== '-');
        
        if (recvRaw.length > 0) {
            db.receiving = recvRaw.map(r => ({
                matCode: (r.mat_code || '').trim().toUpperCase(),
                category: r.category || '-',
                docNo: r.doc_no || '-',
                plNo: r.pkg_no || '-',
                desc: r.full_description || '-',
                unit: r.unit || 'EA',
                qty: parseFloat(r.qty) || 0
            })).filter(r => r.qty > 0 && r.matCode);
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

        renderAllViews();
        updateDashboard();
        initFilterOptions();
        
        // Ensure filtered data is reset after full sync
        filteredBomData = [...db.bom];
        filteredPlData = [...db.receiving];

        // Refresh active table if user is looking at one
        const activeView = document.querySelector('.view-section.active');
        if (activeView) {
            const id = activeView.id;
            // Use setTimeout to ensure UI is ready for rendering large tables
            setTimeout(() => {
                if(id === 'bom_management') renderBomTable();
                if(id === 'receiving') renderReceivingTable();
                if(id === 'matcode_master') renderMatCodeMaster();
            }, 200);
        }

        console.log("Database sync complete. Dashboard and tables updated.");
    } finally {
        showLoading(false);
    }
}

// Legacy local data processing removed. Data now lives exclusively in Supabase.

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

    window.showSection = function(targetId) {
        navItems.forEach(n => n.classList.remove('active'));
        sections.forEach(s => s.classList.remove('active'));
        
        const navItem = Array.from(navItems).find(n => n.getAttribute('data-target') === targetId);
        if (navItem) navItem.classList.add('active');
        
        const section = document.getElementById(targetId);
        if (section) section.classList.add('active');
        
        if(targetId === 'dashboard') updateDashboard();
        if(targetId === 'issue') renderIssueOptions();
        if(targetId === 'bom_management') renderBomTable();
        if(targetId === 'receiving') renderReceivingTable();
        if(targetId === 'matcode_master') renderMatCodeMaster();
        if(targetId === 'stock_ledger') renderStockTable();
        if(targetId === 'mr_history') renderMrHistory();
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
const ISO_PAGE_SIZE = 20;
let isoCurrentPage = 1;
let isoSortedData = [];

function renderIsoPage(page) {
    const tbody = document.getElementById('priorityIsoTbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    const start = (page - 1) * ISO_PAGE_SIZE;
    const pageData = isoSortedData.slice(start, start + ISO_PAGE_SIZE);
    if (pageData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#888;padding:20px;">No ISOs found.</td></tr>`;
    } else {
        pageData.forEach(iso => {
            const sp = parseFloat(iso.spool_score || 0);
            const fd = parseFloat(iso.field_score || 0);
            const stage = getIsoStage(sp, fd);
            const spBar = `<div style="display:flex;align-items:center;gap:5px;">
                <div style="width:55px;background:#eee;height:7px;border-radius:4px;overflow:hidden;">
                    <div style="width:${Math.min(sp,100)}%;background:#1565c0;height:100%;"></div>
                </div><span style="font-size:11px;font-weight:600;color:#1565c0;">${sp}%</span></div>`;
            const fdBar = `<div style="display:flex;align-items:center;gap:5px;">
                <div style="width:55px;background:#eee;height:7px;border-radius:4px;overflow:hidden;">
                    <div style="width:${Math.min(fd,100)}%;background:#2e7d32;height:100%;"></div>
                </div><span style="font-size:11px;font-weight:600;color:#2e7d32;">${fd}%</span></div>`;
            tbody.innerHTML += `<tr style="cursor:pointer;" onclick="window.showIsoDetail('${iso.iso_dwg_no}')" title="${iso.iso_dwg_no}">
                <td><strong style="color:#0A2540;text-decoration:underline dotted;">${iso.iso_dwg_no}</strong></td>
                <td>${spBar}</td>
                <td>${fdBar}</td>
                <td style="font-weight:600;color:#0d47a1;">${parseFloat(iso.total_bom_qty||0).toLocaleString()}</td>
                <td style="font-weight:600;color:#2e7d32;">${parseFloat(iso.total_rec_qty||0).toLocaleString()}</td>
                <td><span class="status-badge ${stage.cls}" style="white-space:nowrap;">${stage.label}</span></td>
                <td><button style="background:#0A2540;color:white;border:none;padding:5px 12px;border-radius:4px;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;" onclick="event.stopPropagation();window.showIsoDetail('${iso.iso_dwg_no}')"><i class="fas fa-file-signature"></i> Issue MR</button></td>
            </tr>`;
        });
    }
    renderIsoPaginator(page);
}

function renderIsoPaginator(page) {
    const paginator = document.getElementById('isoPaginator');
    if (!paginator) return;
    const totalPages = Math.ceil(isoSortedData.length / ISO_PAGE_SIZE);
    if (totalPages <= 1) { paginator.innerHTML = ''; return; }

    const btnStyle = (active) =>
        `style="min-width:32px;height:30px;padding:0 8px;border:1px solid ${active ? '#0A2540' : '#ccc'};background:${active ? '#0A2540' : '#fff'};color:${active ? '#fff' : '#333'};border-radius:4px;cursor:${active ? 'default' : 'pointer'};font-size:12px;font-weight:600;"`;

    let html = '';
    html += `<button ${btnStyle(false)} ${page === 1 ? 'disabled' : ''} onclick="isoGoPage(${page - 1})">&#8249;</button>`;

    const delta = 2;
    let pages = new Set([1, totalPages]);
    for (let i = Math.max(2, page - delta); i <= Math.min(totalPages - 1, page + delta); i++) pages.add(i);
    const sorted = [...pages].sort((a, b) => a - b);

    let prev = 0;
    sorted.forEach(p => {
        if (prev && p - prev > 1) html += `<span style="padding:0 4px;color:#999;">…</span>`;
        const isActive = p === page;
        html += `<button ${btnStyle(isActive)} ${isActive ? 'disabled' : ''} onclick="isoGoPage(${p})">${p}</button>`;
        prev = p;
    });

    html += `<button ${btnStyle(false)} ${page === totalPages ? 'disabled' : ''} onclick="isoGoPage(${page + 1})">&#8250;</button>`;
    html += `<span style="font-size:11px;color:#888;margin-left:6px;">${isoSortedData.length} ISOs / ${totalPages} pages</span>`;
    paginator.innerHTML = html;
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

let myChart = null;
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
            let q = supabaseClient.from('v_iso_stage_status').select('*');
            if (dashSys !== 'All') q = q.eq('system', dashSys);
            if (dashIso !== 'All') q = q.eq('iso_dwg_no', dashIso);
            if (dashIsoSearchVal) q = q.ilike('iso_dwg_no', `%${dashIsoSearchVal}%`);
            return q;
        })()
    ]).then(([summaryRes, listRes]) => {
        // --- 1. Update top KPI cards ---
        if (summaryRes.error) console.error('v_project_summary error:', summaryRes.error);
        const summary = Array.isArray(summaryRes.data) ? summaryRes.data[0] : summaryRes.data;
        if (summary) {
            const totalBom = parseFloat(summary.global_bom_qty || 0);
            const totalRec = parseFloat(summary.global_rec_qty || 0);
            const totalIss = parseFloat(summary.global_issued_qty || 0);
            const prog = totalBom > 0 ? (totalRec / totalBom * 100).toFixed(1) : 0;
            const kpiMap = {
                'kpi-progress': `${prog}%`,
                'kpi-bom': `${totalBom.toLocaleString()} <span class="unit">EA</span>`,
                'kpi-received': `${totalRec.toLocaleString()} <span class="unit">EA</span>`,
                'kpi-issued': `${totalIss.toLocaleString()} <span class="unit">EA</span>`,
                'kpi-stock': `${Math.max(0, totalRec - totalIss).toLocaleString()} <span class="unit">EA</span>`
            };
            for (const [id, val] of Object.entries(kpiMap)) {
                const el = document.getElementById(id);
                if (el) el.innerHTML = val;
            }
        }

        // Always run these regardless of v_iso_stage_status result
        if (typeof updateExpediteAlerts === 'function') updateExpediteAlerts();
        if (typeof updateCategoryCharts === 'function') updateCategoryCharts();

        // --- 2. Stage-based ISO chart & table ---
        if (listRes.error) {
            console.error('v_iso_stage_status error:', listRes.error);
            const tbody = document.getElementById('priorityIsoTbody');
            if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#c62828;padding:20px;">
                <i class="fas fa-exclamation-triangle"></i> View not ready. Run in Supabase SQL Editor:<br>
                <code style="font-size:11px;">GRANT SELECT ON material.v_iso_stage_status TO anon;</code>
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
    db.receiving.forEach(r => {
        if(r.matCode) {
            if(!recSummary[r.matCode]) recSummary[r.matCode] = 0;
            recSummary[r.matCode] += r.qty;
        }
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

    // Fetch category summary from server view
    supabaseClient.from('v_category_readiness').select('*')
    .then(({ data, error }) => {
        if (error) {
            console.error("❌ Chart Sync Error:", error);
            return;
        }
        if (!data) return;

        const catLabels = ['Pipe', 'Fitting', 'Support', 'Valve', 'Speciality', 'Others'];
        const bomDataArr = catLabels.map(l => {
            const match = data.find(d => d.category === l);
            return match ? parseFloat(match.total_bom) : 0;
        });
        const recDataArr = catLabels.map(l => {
            const match = data.find(d => d.category === l);
            return match ? parseFloat(match.total_rec) : 0;
        });

        // Update KPI cards with unit-aware breakdown (Pipe=M, Others=EA)
        const pipeData  = data.find(d => d.category === 'Pipe');
        const pipeBom   = pipeData ? parseFloat(pipeData.total_bom) : 0;
        const pipeRec   = pipeData ? parseFloat(pipeData.total_rec) : 0;
        const otherBom  = bomDataArr.slice(1).reduce((s, v) => s + v, 0);
        const otherRec  = recDataArr.slice(1).reduce((s, v) => s + v, 0);

        // Issued breakdown by category using matCodeMaster lookup
        let pipeIss = 0, otherIss = 0;
        db.issued.forEach(i => {
            const master = db.matCodeMaster.find(m => m.matCode === i.matCode);
            const cat = master ? master.category : window.getCategory('', i.matCode);
            if (cat === 'Pipe') pipeIss += i.qty;
            else otherIss += i.qty;
        });
        const pipeStk = Math.max(0, pipeRec - pipeIss);
        const othStk  = Math.max(0, otherRec - otherIss);

        // Helper: render KPI card (big number = total, subtitle = breakdown)
        function setKpi(valueId, subId, pipeVal, otherVal) {
            const total = pipeVal + otherVal;
            const elVal = document.getElementById(valueId);
            if (elVal) elVal.innerHTML = `${total.toLocaleString()} <span class="unit">M/EA</span>`;
            const elSub = document.getElementById(subId);
            if (elSub) elSub.textContent = `Pipe: ${pipeVal.toLocaleString()} M | Others: ${otherVal.toLocaleString()} EA`;
        }

        setKpi('kpi-bom',      'kpi-bom-sub',      pipeBom,  otherBom);
        setKpi('kpi-received',  'kpi-received-pct', pipeRec,  otherRec);
        setKpi('kpi-issued',    'kpi-issued-pct',   pipeIss,  otherIss);
        setKpi('kpi-stock',     'kpi-stock-sub',    pipeStk,  othStk);

        // 1. Progress Bar Chart
        if (window.myChart) window.myChart.destroy();
        const ctxBar = document.getElementById('progressChart');
        if (ctxBar && typeof Chart !== 'undefined') {
            window.myChart = new Chart(ctxBar, {
                type: 'bar',
                data: {
                    labels: catLabels.map(l => l === 'Pipe' ? 'Pipe (M)' : `${l} (EA)`),
                    datasets: [
                        { label: 'Total BOM Req', data: bomDataArr, backgroundColor: 'rgba(2, 136, 209, 0.7)' },
                        { label: 'Total Received', data: recDataArr, backgroundColor: 'rgba(46, 125, 50, 0.7)' }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: { y: { beginAtZero: true, title: { display: true, text: 'Qty (Pipe=M, Others=EA)', font: { size: 11 } } } }
                }
            });
        }

        // 2. BOM Composition Pie Chart
        if (window.bomPieChart) window.bomPieChart.destroy();
        const ctxPie = document.getElementById('bomPieChart');
        if (ctxPie && typeof Chart !== 'undefined') {
            window.bomPieChart = new Chart(ctxPie, {
                type: 'pie',
                data: {
                    labels: catLabels,
                    datasets: [{
                        data: bomDataArr,
                        backgroundColor: ['#0288d1', '#2e7d32', '#f57f17', '#c62828', '#673ab7', '#607d8b']
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false }
            });
        }
    });
}

// --- 6. Stock Ledger ---
function renderStockTable() {
    let tbody = document.querySelector('#stockTable tbody');
    if(!tbody) return;
    tbody.innerHTML = '';

    // Aggregate Receiving per MatCode
    const recMap = {};
    db.receiving.forEach(r => {
        if(r.matCode) {
            if(!recMap[r.matCode]) recMap[r.matCode] = 0;
            recMap[r.matCode] += r.qty;
        }
    });

    // Aggregate Issued per MatCode
    const issMap = {};
    db.issued.forEach(i => {
        if(i.matCode) {
            if(!issMap[i.matCode]) issMap[i.matCode] = 0;
            issMap[i.matCode] += i.qty;
        }
    });

    // Build unique list of MatCodes that have stock activity (received or issued)
    const activeCodes = [...new Set([...Object.keys(recMap), ...Object.keys(issMap)])].sort();

    // Max 1000 rendering to prevent freeze
    let displayList = activeCodes.slice(0, 1000);

    // Pre-build a map for easy lookup from matCodeMaster
    const masterMap = {};
    db.matCodeMaster.forEach(m => { masterMap[m.matCode] = m; });
    const bomLookup = {};
    db.bom.forEach(b => { bomLookup[b.matCode] = { unit: b.uom, system: b.system, tag: b.tag }; });

    displayList.forEach(matCode => {
        if(matCode.includes('None') && recMap[matCode] === undefined) return;

        let rec = recMap[matCode] || 0;
        let iss = issMap[matCode] || 0;
        let stock = Math.max(0, rec - iss);

        let mData = masterMap[matCode] || { category: '-', itemDesc: '-', size1: '-', size2: '-' };
        let cat = mData.category !== '-' ? mData.category : window.getCategory(mData.itemDesc, matCode);
        
        // If it's a Valve, try to find a Tag No from BOM or Receiving to show instead of just 'Valve'
        if (cat === 'Valve') {
            let tagItem = db.bom.find(b => b.matCode === matCode && b.category !== 'BULK' && b.category !== 'Valve');
            if (!tagItem) tagItem = db.receiving.find(r => r.matCode === matCode && r.category !== 'BULK' && r.category !== 'Valve');
            if (tagItem) cat = tagItem.category;
        }

        let item = mData.itemDesc;
        let size = mData.size1 !== '-' ? mData.size1 : window.extractSizeFromMatCode(matCode);

        let badge = stock > 0 ? '<span class="status-badge ok">In Stock</span>' : '<span class="status-badge err">Out of Stock</span>';
        let unitStr = bomLookup[matCode] ? bomLookup[matCode].unit : 'EA';

        let tr = `<tr>
            <td style="font-weight:600; color:var(--color-primary);">${matCode}</td>
            <td><strong>${cat}</strong></td>
            <td>${item}</td>
            <td>${size}</td>
            <td>${unitStr}</td>
            <td>${rec.toFixed(2)}</td>
            <td>${iss.toFixed(2)}</td>
            <td style="font-weight:700;">${stock.toFixed(2)}</td>
            <td>${badge}</td>
        </tr>`;
        tbody.innerHTML += tr;
    });

    if(activeCodes.length > 1000) {
        tbody.innerHTML += `<tr><td colspan="6" style="text-align:center; color:#666; font-style:italic;">Showing first 1,000 inventory items.</td></tr>`;
    }
}

// --- 2. MatCode Master ---
function renderMatCodeMaster(filter) {
    let tbody = document.querySelector('#matCodeTable tbody');
    if (!tbody) return;
    if (db.matCodeMaster.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:20px;color:#888;">No Master Data available.</td></tr>';
        return;
    }
    const q = (filter || (document.getElementById('masterSearch')?.value) || '').toUpperCase();
    const data = q
        ? db.matCodeMaster.filter(m =>
            m.matCode.includes(q) || m.itemDesc.toUpperCase().includes(q) ||
            m.matlDesc.toUpperCase().includes(q) || m.category.toUpperCase().includes(q))
        : db.matCodeMaster;

    const BADGE = {Pipe:'info', Fitting:'ok', Valve:'warn', Speciality:'warn', Other:'err'};
    // Build full HTML string first → single DOM write (prevents O(n²) freeze)
    tbody.innerHTML = data.map(m => {
        const cb = BADGE[m.category] || 'ok';
        return `<tr>
            <td><strong><span class="status-badge ok">${m.matCode}</span></strong></td>
            <td><span class="status-badge ${cb}">${m.category}</span></td>
            <td>${m.itemDesc}</td><td>${m.matlDesc}</td>
            <td>${m.size1}</td><td>${m.size2}</td>
            <td>${m.classDesc}</td><td>${m.etDesc}</td>
        </tr>`;
    }).join('');

    const info = document.getElementById('masterInfo');
    if (info) info.textContent = `${data.length} / ${db.matCodeMaster.length} items`;
}

// --- 3. BOM & Receiving Paginations ---
const PAGE_SIZE = 50;
let currentBomPage = 0;
let currentPlPage = 0;
let filteredBomData = [];
let filteredPlData = [];

function initFilterOptions() {
    // BOM Filters
    const bomSys = document.getElementById('bomSystemFilter');
    const bomIsoData = document.getElementById('bomIsoDatalist');
    const bomItemF = document.getElementById('bomItemFilter');
    const bomSizeF = document.getElementById('bomSizeFilter');

    if(bomSys && bomIsoData) {
        const systems = [...new Set(db.bom.map(b => b.system).filter(Boolean))].sort();
        const isos = [...new Set(db.bomIsoList.map(r => r.iso))].sort();
        const bomItems = [...new Set(db.bom.map(b => window.extractItemFromMatCode(b.matCode)).filter(v => v && v !== '-'))].sort();
        const bomSizes = [...new Set(db.bom.map(b => window.extractSizeFromMatCode(b.matCode)).filter(v => v && v !== '-'))].sort((a,b) => parseFloat(a) - parseFloat(b));

        bomSys.innerHTML = '<option value="All">All Systems</option>' + systems.map(s => `<option value="${s}">${s}</option>`).join('');
        bomIsoData.innerHTML = isos.map(i => `<option value="${i}">`).join('');
        if(bomItemF) bomItemF.innerHTML = '<option value="All">All Items</option>' + bomItems.map(i => `<option value="${i.replace(/"/g,'&quot;')}">${i}</option>`).join('');
        if(bomSizeF) bomSizeF.innerHTML = '<option value="All">All Sizes</option>' + bomSizes.map(s => `<option value="${s.replace(/"/g,'&quot;')}">${s}</option>`).join('');
    }

    // PL Filters
    const plDoc = document.getElementById('plDocFilter');
    const plPkg = document.getElementById('plPkgFilter');
    const plCat = document.getElementById('plCategoryFilter');
    const plItemF = document.getElementById('plItemFilter');
    const plSizeF = document.getElementById('plSizeFilter');
    if(plDoc && plPkg) {
        const docs = [...new Set(db.receiving.map(r => r.docNo))].sort();
        const pkgs = [...new Set(db.receiving.map(r => r.plNo))].sort();
        const cats = [...new Set(db.receiving.map(r => r.category).filter(Boolean))].sort();
        const items = [...new Set(db.receiving.map(r => window.extractItemFromMatCode(r.matCode)).filter(v => v && v !== '-'))].sort();
        const sizes = [...new Set(db.receiving.map(r => window.extractSizeFromMatCode(r.matCode)).filter(v => v && v !== '-'))].sort();
        plDoc.innerHTML = '<option value="All">All DOCs</option>' + docs.map(d => `<option value="${d}">${d}</option>`).join('');
        plPkg.innerHTML = '<option value="All">All PKGs</option>' + pkgs.map(p => `<option value="${p}">${p}</option>`).join('');
        if(plCat) plCat.innerHTML = '<option value="All">All Categories</option>' + cats.map(c => `<option value="${c}">${c}</option>`).join('');
        if(plItemF) plItemF.innerHTML = '<option value="All">All Items</option>' + items.map(i => `<option value="${i.replace(/"/g,'&quot;')}">${i}</option>`).join('');
        if(plSizeF) plSizeF.innerHTML = '<option value="All">All Sizes</option>' + sizes.map(s => `<option value="${s.replace(/"/g,'&quot;')}">${s}</option>`).join('');
    }
}

function renderTablePagination(total, current, pageSize, infoId, btnPrevId, btnNextId, updateFn) {
    const info = document.getElementById(infoId);
    const btnPrev = document.getElementById(btnPrevId);
    const btnNext = document.getElementById(btnNextId);
    if(!info || !btnPrev || !btnNext) return;

    let totalPages = Math.ceil(total / pageSize);
    if (totalPages === 0) totalPages = 1;

    let start = current * pageSize + 1;
    let end = Math.min((current + 1) * pageSize, total);
    if(total === 0) start = 0;

    info.innerText = `Showing ${start}-${end} of ${total} items (Page ${current + 1} of ${totalPages})`;

    btnPrev.disabled = (current === 0);
    btnNext.disabled = (current >= totalPages - 1);

    // Re-attach listeners just in case
    btnPrev.onclick = () => { if(current > 0) { updateFn(current - 1); } };
    btnNext.onclick = () => { if(current < totalPages - 1) { updateFn(current + 1); } };
}

async function renderBomTable() {
    let tbody = document.querySelector('#bomTable tbody');
    if(!tbody) return;
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:20px;color:#888;">Loading...</td></tr>';

    const iso  = (document.getElementById('bomIsoSearch')?.value || '').trim();
    const sys  = document.getElementById('bomSystemFilter')?.value || 'All';
    const cat  = document.getElementById('bomCategoryFilter')?.value || 'All';
    const item = document.getElementById('bomItemFilter')?.value || 'All';
    const size = document.getElementById('bomSizeFilter')?.value || 'All';

    // bom_detail: aggregated view summing same MatCode within an ISO
    let query = supabaseClient.from('bom_detail')
        .select('mat_code, category, system, iso_dwg_no, full_description, uom, qty', { count: 'exact' })
        .range(currentBomPage * PAGE_SIZE, (currentBomPage + 1) * PAGE_SIZE - 1)
        .order('iso_dwg_no');

    if (sys !== 'All') query = query.eq('system', sys);
    if (iso) query = query.ilike('iso_dwg_no', `%${iso}%`);
    if (cat !== 'All') query = query.ilike('category', `%${cat}%`);
    if (item !== 'All') query = query.ilike('full_description', `%${item}%`);
    if (size !== 'All') {
        const toD = v => 'D' + Math.round(parseFloat(v) * 10).toString().padStart(3, '0');
        const dualMatch = size.match(/([\d.]+)"×([\d.]+)"/);
        if (dualMatch) {
            // "6\"×4\"" → D060D040
            query = query.ilike('mat_code', `%${toD(dualMatch[1])}${toD(dualMatch[2])}%`);
        } else {
            const single = size.match(/([\d.]+)"/);
            if (single) query = query.ilike('mat_code', `%-${toD(single[1])}-%`);
        }
    }

    const { data, count, error } = await query;
    if (error) {
        tbody.innerHTML = `<tr><td colspan="10" style="color:red;text-align:center;">Error: ${error.message}</td></tr>`;
        return;
    }

    tbody.innerHTML = '';
    (data || []).forEach(b => {
        let displayCat = b.category;
        if (displayCat === 'BULK' || !displayCat) {
            displayCat = window.getCategory(b.full_description, b.mat_code);
        }
        
        let isAuto = (b.mat_code || '').includes('NEW-MAT');
        let badgeClass = isAuto ? 'warn' : 'ok';
        let desc = (b.full_description || '-').replace(/_/g, '-');
        const size = window.extractSizeFromMatCode(b.mat_code);
        const item = window.extractItemFromDesc(desc);
        tbody.innerHTML += `<tr>
            <td>${b.system || '-'}</td>
            <td>${b.iso_dwg_no || '-'}</td>
            <td><strong>${displayCat}</strong></td>
            <td><span class="status-badge ${badgeClass}">${b.mat_code}</span></td>
            <td title="${desc}">${desc.length > 50 ? desc.substring(0,47)+'...' : desc}</td>
            <td style="font-weight:600;">${item}</td>
            <td style="font-weight:600;">${size}</td>
            <td>${b.uom || 'EA'}</td>
            <td>${parseFloat(b.qty || 0).toFixed(2)}</td>
            <td><button class="btn-small btn-outline-danger">Del</button></td>
        </tr>`;
    });

    renderTablePagination(
        count || 0,
        currentBomPage,
        PAGE_SIZE,
        'bomPaginationInfo',
        'btnPrevBom',
        'btnNextBom',
        (p) => { currentBomPage = p; renderBomTable(); }
    );
}

function renderReceivingTable() {
    let tbody = document.querySelector('#plTable tbody');
    if(!tbody) return;
    tbody.innerHTML = '';
    
    const search = (document.getElementById('plItemSearch')?.value || '').trim().toUpperCase();
    const doc    = document.getElementById('plDocFilter')?.value  || 'All';
    const pkg    = document.getElementById('plPkgFilter')?.value  || 'All';
    const cat    = document.getElementById('plCategoryFilter')?.value || 'All';
    const itemF  = document.getElementById('plItemFilter')?.value || 'All';
    const sizeF  = document.getElementById('plSizeFilter')?.value || 'All';

    let data = db.receiving.filter(r => {
        const matchSearch = !search || r.matCode.toUpperCase().includes(search) || r.plNo.toUpperCase().includes(search) || (r.category||'').toUpperCase().includes(search) || r.desc.toUpperCase().includes(search);
        const matchDoc  = doc  === 'All' || r.docNo    === doc;
        const matchPkg  = pkg  === 'All' || r.plNo     === pkg;
        const matchCat  = cat  === 'All' || r.category === cat;
        const matchItemF = itemF === 'All' || window.extractItemFromMatCode(r.matCode)    === itemF;
        const matchSizeF = sizeF === 'All' || window.extractSizeFromMatCode(r.matCode)   === sizeF;
        return matchSearch && matchDoc && matchPkg && matchCat && matchItemF && matchSizeF;
    });
    
    let slicedPl = data.slice(currentPlPage * PAGE_SIZE, (currentPlPage + 1) * PAGE_SIZE); 
    
    slicedPl.forEach(r => {
        let displayCat = r.category;
        if (displayCat === 'BULK' || !displayCat) {
            displayCat = window.getCategory(r.desc, r.matCode);
        }
        
        let catForBadge = displayCat;
        if (!['Pipe', 'Fitting', 'Support', 'Valve', 'Speciality', 'Others'].includes(catForBadge)) {
            catForBadge = 'Valve'; // Tag items are valves
        }

        let catBadge = {Pipe:'info', Fitting:'ok', Valve:'warn', Speciality:'warn', Other:'err'}[catForBadge] || 'ok';
        const descDisplay = (r.desc || '').replace(/_/g, '-');
        let shortDesc = descDisplay.length > 60 ? descDisplay.substring(0, 57) + '...' : descDisplay;

        const size = window.extractSizeFromMatCode(r.matCode);
        const item = window.extractItemFromMatCode(r.matCode);
        const safeCode = r.matCode.replace(/'/g, "\\'");
        let tr = `<tr>
            <td>${r.docNo}</td>
            <td>${r.plNo}</td>
            <td><span class="status-badge ok">${r.matCode}</span></td>
            <td><span class="status-badge ${catBadge}">${displayCat}</span></td>
            <td title="${descDisplay}">${shortDesc}</td>
            <td style="font-weight:600;">${item}</td>
            <td style="font-weight:600;">${size}</td>
            <td>${r.unit || 'EA'}</td>
            <td>${r.qty.toFixed(2)}</td>
            <td><button class="btn-small btn-outline" onclick="window.showReceivingDetail('${safeCode}')">Detail</button></td>
        </tr>`;
        tbody.innerHTML += tr;
    });

    renderTablePagination(
        data.length, 
        currentPlPage, 
        PAGE_SIZE, 
        'plPaginationInfo', 
        'btnPrevPl', 
        'btnNextPl', 
        (p) => { currentPlPage = p; renderReceivingTable(); }
    );
}

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

    updateAreaDropdown();
}

window.updateAreaDropdown = function() {
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
    tbody.innerHTML = '';

    plReviewData.forEach((row, idx) => {
        let statusBadge, matcodeCell;
        const catColors = { Pipe: 'info', Fitting: 'ok', Valve: 'warn', Speciality: 'warn', Other: 'err' };

        if (row.status === 'matched') {
            statusBadge = '<span class="status-badge ok">Matched</span>';
            matcodeCell = `<span class="status-badge ok" style="font-size:11px;">${row.matCode}</span>`;
        } else if (row.status === 'suggest') {
            statusBadge = '<span class="status-badge warn">Select</span>';
            const opts = row.candidates.map(c =>
                `<option value="${c.matCode}|${c.category}">${c.matCode} (${c.size2 || c.size1})</option>`
            ).join('');
            matcodeCell = `<select class="form-control" style="font-size:11px; padding:2px 6px; height:28px;"
                onchange="assignPLMatCode(${idx}, this.value)">
                <option value="">-- Select --</option>${opts}
            </select>`;
        } else {
            statusBadge = '<span class="status-badge err">New Code</span>';
            matcodeCell = `<button class="btn-small btn-outline" onclick="openNewMatCodeModal(${idx})" style="font-size:11px; padding:3px 8px;">
                <i class="fas fa-plus"></i> Create Code
            </button>`;
        }

        const catBadge = catColors[row.category] || '';
        const catCell = row.category
            ? `<span class="status-badge ${catBadge}">${row.category}</span>`
            : '<span style="color:#999;">-</span>';

        const shortDesc = row.desc.length > 55 ? row.desc.substring(0, 52) + '...' : row.desc;

        tbody.innerHTML += `<tr id="plrow_${idx}">
            <td style="font-size:12px;">${row.docNo}</td>
            <td style="font-size:12px;">${row.pkgNo}</td>
            <td title="${row.desc}" style="font-size:12px;">${shortDesc}</td>
            <td style="font-size:12px;">${row.unit}</td>
            <td style="font-size:12px; font-weight:600;">${row.qty}</td>
            <td>${statusBadge}</td>
            <td id="plrow_matcode_${idx}">${matcodeCell}</td>
            <td id="plrow_cat_${idx}">${catCell}</td>
        </tr>`;
    });
}

window.assignPLMatCode = function(idx, value) {
    if (!value) return;
    const [matCode, category] = value.split('|');
    plReviewData[idx].matCode = matCode;
    plReviewData[idx].category = category;
    plReviewData[idx].status = 'matched';
    const catBadge = { Pipe: 'info', Fitting: 'ok', Valve: 'warn', Speciality: 'warn', Other: 'err' }[category] || 'ok';
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

    const catBadge = { Pipe: 'info', Fitting: 'ok', Valve: 'warn', Speciality: 'warn', Other: 'err' }[category] || 'ok';
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
                } else if (term.includes('B0-MV') || term.includes('B1-MV') || term.includes('VLV')) {
                    showSection('bom_management');
                    const bomInput = document.getElementById('bomIsoSearch');
                    if (bomInput) bomInput.value = term;
                    renderBomTable();
                } else {
                    showSection('stock_ledger');
                    // MatCode search logic can be added later
                }
            }
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
            currentBomPage = 0;
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
            currentBomPage = 0;
            renderBomTable();
        });
    }

    // BOM Export Excel Button
    const btnExportBom = document.getElementById('btnExportBom');
    if (btnExportBom) {
        btnExportBom.addEventListener('click', async () => {
            btnExportBom.disabled = true;
            btnExportBom.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Exporting...';
            try {
                const iso = (document.getElementById('bomIsoSearch')?.value || '').trim();
                const sys = document.getElementById('bomSystemFilter')?.value || 'All';
                const cat = document.getElementById('bomCategoryFilter')?.value || 'All';

                let query = supabaseClient.from('bom_detail')
                    .select('system, iso_dwg_no, category, mat_code, full_description, uom, qty')
                    .order('iso_dwg_no');
                if (sys !== 'All') query = query.eq('system', sys);
                if (iso) query = query.ilike('iso_dwg_no', `%${iso}%`);
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

    // PL Filter Button
    const btnFilterPl = document.getElementById('btnFilterPl');
    if(btnFilterPl) {
        btnFilterPl.addEventListener('click', () => {
            const item = document.getElementById('plItemSearch').value.trim().toUpperCase();
            const doc = document.getElementById('plDocFilter').value;
            const pkg = document.getElementById('plPkgFilter').value;
            const cat = document.getElementById('plCategoryFilter')?.value || 'All';
            const itemF = document.getElementById('plItemFilter')?.value || 'All';
            const sizeF = document.getElementById('plSizeFilter')?.value || 'All';

            filteredPlData = db.receiving.filter(r => {
                const matchItem = !item || (r.desc.toUpperCase().includes(item));
                const matchDoc = doc === 'All' || r.docNo === doc;
                const matchPkg = pkg === 'All' || r.plNo === pkg;
                const matchCat = cat === 'All' || r.category === cat;
                const matchItemF = itemF === 'All' || window.extractItemFromMatCode(r.matCode) === itemF;
                const matchSizeF = sizeF === 'All' || window.extractSizeFromMatCode(r.matCode) === sizeF;
                return matchItem && matchDoc && matchPkg && matchCat && matchItemF && matchSizeF;
            });
            currentPlPage = 0;
            renderReceivingTable();
        });
    }

    // Receiving Export Excel
    const btnExportPl = document.getElementById('btnExportPl');
    if (btnExportPl) {
        btnExportPl.addEventListener('click', () => {
            const item = (document.getElementById('plItemSearch')?.value || '').trim().toUpperCase();
            const doc  = document.getElementById('plDocFilter')?.value || 'All';
            const pkg  = document.getElementById('plPkgFilter')?.value || 'All';
            const cat  = document.getElementById('plCategoryFilter')?.value || 'All';

            let data = db.receiving;
            if (doc  !== 'All') data = data.filter(r => r.docNo    === doc);
            if (pkg  !== 'All') data = data.filter(r => r.plNo     === pkg);
            if (cat  !== 'All') data = data.filter(r => r.category === cat);
            if (item)           data = data.filter(r => r.desc.toUpperCase().includes(item));

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

    const sysSelect = document.getElementById('issueSystemFilter');
    if (sysSelect) {
        sysSelect.addEventListener('change', window.updateAreaDropdown);
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

    // Toggle: hide items with no stock
    const toggleHideNoStock = document.getElementById('toggleHideNoStock');
    if (toggleHideNoStock) {
        toggleHideNoStock.addEventListener('change', function() {
            const rows = document.querySelectorAll('#issueTable tbody tr');
            rows.forEach(row => {
                const input = row.querySelector('input[type="number"]');
                if (!input) return;
                const maxVal = parseFloat(input.getAttribute('max')) || 0;
                row.style.display = (this.checked && maxVal <= 0) ? 'none' : '';
            });
        });
    }

    // Fill all rows with BOM Qty
    const btnFillBomQty = document.getElementById('btnFillBomQty');
    if (btnFillBomQty) {
        btnFillBomQty.addEventListener('click', function() {
            document.querySelectorAll('#issueTable tbody tr').forEach(row => {
                const input = row.querySelector('input[type="number"]');
                if (!input) return;
                const bomCell = row.cells[5]; // BOM (Req) column (index 5)
                if (bomCell) input.value = parseFloat(bomCell.textContent) || 0;
            });
        });
    }

    // Fill all rows with Stock Qty
    const btnFillStockQty = document.getElementById('btnFillStockQty');
    if (btnFillStockQty) {
        btnFillStockQty.addEventListener('click', function() {
            document.querySelectorAll('#issueTable tbody tr').forEach(row => {
                const input = row.querySelector('input[type="number"]');
                if (!input) return;
                const maxVal = parseFloat(input.getAttribute('max')) || 0;
                input.value = maxVal;
            });
        });
    }

    // Clear all request quantities
    const btnClearQty = document.getElementById('btnClearQty');
    if (btnClearQty) {
        btnClearQty.addEventListener('click', function() {
            document.querySelectorAll('#issueTable input[type="number"]').forEach(inp => { inp.value = 0; });
        });
    }
    
    const btnFilterIssue = document.getElementById('btnFilterIssue');
    if (btnFilterIssue) {
        btnFilterIssue.addEventListener('click', async () => {
            let sys = document.getElementById('issueSystemFilter')?.value || 'All';
            let iso = (document.getElementById('issueIsoSearch')?.value || '').trim();
            let categoryFilter = document.getElementById('issueCategoryFilter')?.value || 'All';

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

            // Pre-build receiving/issued maps for quick lookup
            const recMap = {};
            db.receiving.forEach(r => { if(r.matCode) recMap[r.matCode] = (recMap[r.matCode] || 0) + r.qty; });
            const issMap = {};
            db.issued.forEach(i => { if(i.matCode) issMap[i.matCode] = (issMap[i.matCode] || 0) + i.qty; });

            // Category color map
            const catColors = {
                'Pipe': '#1565c0', 'Fitting': '#2e7d32', 'Valve': '#e65100',
                'Speciality': '#6a1b9a', 'Others': '#546e7a'
            };

            let htmlString = '';
            let displayCount = 0;
            bomRows.forEach(b => {
                let mat = (b.mat_code || '').trim().toUpperCase();
                if (!mat || mat === 'NONE') return;

                let category = window.getCategory(b.full_description, mat);

                // Apply category filter
                if (categoryFilter !== 'All' && category !== categoryFilter) return;

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
                    <td>${b.iso_dwg_no || '-'}</td>
                    <td><span style="font-size:11px;font-weight:600;color:${catColor};background:${catColor}18;padding:2px 7px;border-radius:10px;white-space:nowrap;">${category}</span></td>
                    <td><strong>${mat}</strong></td>
                    <td title="${safeDesc}">${safeDesc.length > 45 ? safeDesc.substring(0,45)+'...' : safeDesc}</td>
                    <td>${b.uom || 'EA'}</td>
                    <td>${qty.toFixed(2)}</td>
                    <td>${totalRec.toFixed(2)}</td>
                    <td><strong style="color:${stockQty >= qty ? '#2e7d32' : (stockQty > 0 ? '#e65100' : '#c62828')};">${stockQty.toFixed(2)}</strong></td>
                    <td>
                        <input type="number" class="form-control" style="width:80px;" min="0" max="${stockQty}" value="${Math.max(0, defaultReq)}"
                        data-matcode="${mat}" data-iso="${b.iso_dwg_no||'-'}" data-size="${window.extractSizeFromMatCode(mat).replace(/"/g, '&quot;')}" data-unit="${b.uom||'EA'}" data-desc="${safeDesc}" data-category="${category}">
                    </td>
                </tr>`;
                displayCount++;
            });

            tbody.innerHTML = htmlString || `<tr><td colspan="9" style="text-align:center;color:#888;">No materials found for the selected category.</td></tr>`;

            if (!iso || iso === 'All') {
                tbody.innerHTML += `<tr><td colspan="9" style="text-align:center;color:var(--color-warning);font-size:12px;padding:8px;">
                    <i class="fas fa-info-circle"></i> Specify an ISO Drawing to view all materials for that drawing.</td></tr>`;
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
             
             let printTbody = document.getElementById('printTbody');
             printTbody.innerHTML = '';

             // Build matCode → [{plNo, qty}] sorted by PKG NO ascending
             const pkgRecords = {};
             db.receiving.forEach(r => {
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

                 let tr = `<tr>
                     <td style="border:1px solid #000; padding:8px;">${mrItem.iso}</td>
                     <td style="border:1px solid #000; padding:8px; font-weight:600; color:#0d47a1; line-height:1.6;">${pkgDisplay}</td>
                     <td style="border:1px solid #000; padding:8px;">${mrItem.matCode}</td>
                     <td style="border:1px solid #000; padding:8px;">${mrItem.desc}</td>
                     <td style="border:1px solid #000; padding:8px;">${mrItem.size}</td>
                     <td style="border:1px solid #000; padding:8px;">${mrItem.unit}</td>
                     <td style="border:1px solid #000; padding:8px; font-weight:bold;">${mrItem.reqQty.toFixed(2)}</td>
                 </tr>`;
                 printTbody.innerHTML += tr;
             });

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
                        console.log("✅ Material Issue persisted to Supabase.");
                        // Update local DB to reflect new items immediately
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
                    console.log('Saved new MatCode to master:', matCode);
                }
            }

            const catBadge = {Pipe:'info',Fitting:'ok',Valve:'warn',Speciality:'warn',Other:'err'}[category]||'ok';
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

    // Build pkgRecords: matCode → sorted [{plNo, qty}]
    const pkgRecords = {};
    db.receiving.forEach(r => {
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

    db.mrTable.forEach(m => {
        const records = pkgSorted[m.matCode] || [];
        let remaining = m.reqQty;
        const allocated = [];
        for (const rec of records) {
            if (remaining <= 0) break;
            allocated.push({ plNo: rec.plNo, take: Math.min(remaining, rec.qty) });
            remaining -= allocated[allocated.length - 1].take;
        }
        let pkgDisplay;
        if (allocated.length === 0) {
            pkgDisplay = '<span style="color:#999;">-</span>';
        } else if (allocated.length === 1) {
            pkgDisplay = `<span style="font-weight:600;color:#0d47a1;">${allocated[0].plNo}</span>`;
        } else {
            pkgDisplay = allocated.map(a =>
                `<span style="font-weight:600;color:#0d47a1;">${a.plNo}</span><span style="font-size:10px;color:#555;"> (${a.take % 1 === 0 ? a.take : a.take.toFixed(2)})</span>`
            ).join('<br>');
        }

        tbody.innerHTML += `<tr>
            <td><strong>${m.mrNo}</strong></td>
            <td>${m.iso}</td>
            <td style="line-height:1.8;">${pkgDisplay}</td>
            <td><span class="status-badge ok">${m.matCode}</span></td>
            <td title="${m.desc}">${m.desc.substring(0,20)}...</td>
            <td>${m.size}</td><td>${m.unit}</td>
            <td><strong>${(m.reqQty || 0).toFixed(2)}</strong></td>
        </tr>`;
    });
}

// ==========================================
// MR History & ISO Progress
// ==========================================

async function renderMrHistory() {
    if (!supabaseClient) return;

    const dateFrom = document.getElementById('mrHistDateFrom')?.value || '';
    const dateTo   = document.getElementById('mrHistDateTo')?.value || '';
    const isoSearch = (document.getElementById('mrHistIsoSearch')?.value || '').trim().toUpperCase();
    const statusFilter = document.getElementById('mrHistStatus')?.value || 'All';

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

    // 5. Render MR History table
    if (histTbody) {
        if (mrList.length === 0) {
            histTbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#888;padding:20px;">No MR records found.</td></tr>';
        } else {
            histTbody.innerHTML = '';
            mrList.forEach(mr => {
                const status = getIsoStatus(mr.iso);
                const sCls   = status === 'CLOSED' ? 'ok' : (status === 'PARTIAL' ? 'warn' : '');
                const suppBtn = status === 'PARTIAL'
                    ? `<button class="btn btn-primary btn-small" onclick="window.loadSupplementMR('${mr.iso.replace(/'/g,"\\'")}','${mr.mrNo}')"><i class="fas fa-plus-circle"></i> Supplement Issue</button>`
                    : '<span style="color:#aaa;font-size:11px;">Closed</span>';
                histTbody.innerHTML += `<tr>
                    <td><strong style="color:var(--color-primary);">${mr.mrNo}</strong></td>
                    <td style="font-size:12px;">${mr.iso}</td>
                    <td>${mr.date}</td>
                    <td style="text-align:center;">${mr.items.length}</td>
                    <td style="text-align:right;">${mr.totalQty.toFixed(2)}</td>
                    <td><span class="status-badge ${sCls}">${status}</span></td>
                    <td>${suppBtn}</td>
                </tr>`;
            });
        }
    }

    // 6. Render ISO-level progress table
    if (progTbody) {
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
            // Latest MR for this ISO
            const isoMrs = Object.values(mrMap).filter(m => m.iso === iso).sort((a, b) => b.date.localeCompare(a.date));
            const latestMrNo = isoMrs.length > 0 ? isoMrs[0].mrNo : '-';
            isoRows.push({ iso, bomItems: mcs.length, totalBom, totalIssued, remaining, progress, status, latestMrNo });
        });

        isoRows.sort((a, b) => a.progress - b.progress); // PARTIAL first

        if (isoRows.length === 0) {
            progTbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#888;">No data.</td></tr>';
        } else {
            progTbody.innerHTML = '';
            isoRows.forEach(r => {
                const sCls = r.status === 'CLOSED' ? 'ok' : 'warn';
                const pct  = r.progress.toFixed(1);
                const barColor = r.progress >= 100 ? '#2e7d32' : (r.progress >= 50 ? '#f57f17' : '#c62828');
                const suppBtn = r.status === 'PARTIAL'
                    ? `<button class="btn btn-primary btn-small" onclick="window.loadSupplementMR('${r.iso.replace(/'/g,"\\'")}','${r.latestMrNo}')"><i class="fas fa-plus-circle"></i> Supplement Issue</button>`
                    : '<span style="color:#aaa;font-size:11px;">-</span>';
                progTbody.innerHTML += `<tr>
                    <td style="font-size:12px;">${r.iso}</td>
                    <td style="text-align:center;">${r.bomItems}</td>
                    <td style="font-weight:600;color:#0d47a1;text-align:right;">${r.totalBom.toFixed(2)}</td>
                    <td style="font-weight:600;color:#2e7d32;text-align:right;">${r.totalIssued.toFixed(2)}</td>
                    <td style="font-weight:600;color:${r.remaining > 0 ? '#c62828' : '#888'};text-align:right;">${r.remaining.toFixed(2)}</td>
                    <td>
                        <div style="display:flex;align-items:center;gap:8px;">
                            <div style="flex:1;background:#eee;height:8px;border-radius:4px;overflow:hidden;min-width:80px;">
                                <div style="width:${pct}%;background:${barColor};height:100%;border-radius:4px;"></div>
                            </div>
                            <span style="font-size:11px;font-weight:600;min-width:38px;">${pct}%</span>
                        </div>
                    </td>
                    <td><span class="status-badge ${sCls}">${r.status}</span></td>
                    <td>${suppBtn}</td>
                </tr>`;
            });
        }
    }
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
        recRecords.forEach(r => {
            tbody.innerHTML += `<tr>
                <td>${r.docNo}</td>
                <td style="font-weight:600;color:#0d47a1;">${r.plNo}</td>
                <td style="font-weight:700;text-align:right;">${r.qty.toLocaleString()}</td>
                <td>${r.unit || 'EA'}</td>
            </tr>`;
        });
        tbody.innerHTML += `<tr style="background:#f0f4f8;font-weight:700;">
            <td colspan="2" style="text-align:right;">Total</td>
            <td style="text-align:right;color:#2e7d32;">${totalRec.toLocaleString()}</td>
            <td>${unit}</td>
        </tr>`;
    }

    modal.style.display = 'flex';
};
