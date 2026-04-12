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

// --- Helper Functions (Globally Available) ---
window.getCategory = function(desc, matCode) {
    if (!desc && !matCode) return 'Others';
    let d = ((desc||'') + ' ' + (matCode||'')).toUpperCase();
    if (d.includes('PIPE') || d.includes('TUBE')) return 'Pipe';
    if (d.includes('VALVE') || d.includes('VLV')) return 'Valve';
    if (d.includes('SUPPORT') || d.includes('SHOE') || d.includes('GUIDE') || d.includes('U-BOLT') || d.includes('UBOLT')) return 'Support';
    if (d.includes('TRAP') || d.includes('STRAINER') || d.includes('SIGHT') || d.includes('HOSE') || d.includes('SPECIALTY')) return 'Speciality';
    // Fasteners (Stud Bolt, Bolt, Nut) → Others. U-BOLT/UBOLT은 위에서 Support 처리됨
    if ((d.includes('BOLT') && !d.includes('U-BOLT') && !d.includes('UBOLT')) || /\bNUT\b/.test(d) || d.includes('STB-')) return 'Others';
    if (d.includes('ELBOW') || d.includes('TEE') || d.includes('REDUCER') || d.includes('CAP') || d.includes('OLET') || d.includes('FLANGE') || d.includes('NIPPLE') || d.includes('COUPLING') || d.includes('UNION') || d.includes('GASKET') || d.includes('BLIND') || d.includes('FLN') || d.includes('EL9') || d.includes('EL4')) return 'Fitting';
    return 'Others';
};

window.extractSizeFromMatCode = function(matCode) {
    if (!matCode) return '-';
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
        
        // bom_agg: aggregated view (~수천 행, 1 API 호출)
        // bom_iso_list: distinct ISO 목록 (~수백 행, 1 API 호출)
        // 기존 fetchAllRows('bom') → 73,397행 74회 API 호출 제거
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
                system: b.system || '-',
                uom: b.uom || 'EA',
                qty: parseFloat(b.total_qty) || 0
            })).filter(b => b.qty > 0 && b.matCode);
        }
        db.bomIsoList = bomIsoRaw.map(r => ({
            system: r.system || '-',
            iso: r.iso_dwg_no || '-'
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
                iso: i.iso || '-'
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

// --- Helper: Category Classifier (Moved out of conditional block) ---
window.getCategory = function(desc, matCode) {
    if (!desc && !matCode) return 'Others';
    let d = ((desc||'') + ' ' + (matCode||'')).toUpperCase();
    if (d.includes('PIPE') || d.includes('TUBE')) return 'Pipe';
    if (d.includes('VALVE') || d.includes('VLV')) return 'Valve';
    if (d.includes('SUPPORT') || d.includes('SHOE') || d.includes('GUIDE') || d.includes('U-BOLT') || d.includes('UBOLT')) return 'Support';
    if (d.includes('TRAP') || d.includes('STRAINER') || d.includes('SIGHT') || d.includes('HOSE') || d.includes('SPECIALTY')) return 'Speciality';
    // Fasteners (Stud Bolt, Bolt, Nut) → Others. U-BOLT/UBOLT은 위에서 Support 처리됨
    if ((d.includes('BOLT') && !d.includes('U-BOLT') && !d.includes('UBOLT')) || /\bNUT\b/.test(d) || d.includes('STB-')) return 'Others';
    if (d.includes('ELBOW') || d.includes('TEE') || d.includes('REDUCER') || d.includes('CAP') || d.includes('OLET') || d.includes('FLANGE') || d.includes('NIPPLE') || d.includes('COUPLING') || d.includes('UNION') || d.includes('GASKET') || d.includes('BLIND') || d.includes('FLN') || d.includes('EL9') || d.includes('EL4')) return 'Fitting';
    return 'Others';
};

window.extractSizeFromMatCode = function(matCode) {
    if (!matCode) return '-';
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

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetId = item.getAttribute('data-target');
            navItems.forEach(n => n.classList.remove('active'));
            sections.forEach(s => s.classList.remove('active'));
            item.classList.add('active');
            document.getElementById(targetId).classList.add('active');
            
            if(targetId === 'dashboard') updateDashboard();
            if(targetId === 'issue') renderIssueOptions();
            if(targetId === 'bom_management') renderBomTable();
            if(targetId === 'receiving') renderReceivingTable();
            if(targetId === 'matcode_master') renderMatCodeMaster();
            if(targetId === 'stock_ledger') renderStockTable();
        });
    });
}

function renderAllViews() {
    updateDashboard();
    // For large data, we only render the active view on start or when clicked
    // Initial view is dashboard
}

// --- 1. Dashboard & KPI ---
let myChart = null;
function updateDashboard() {
    let totalBom = db.bom.reduce((acc, curr) => acc + curr.qty, 0);
    let totalReceived = db.receiving.reduce((acc, curr) => acc + curr.qty, 0);
    let totalIssued = db.issued.reduce((acc, curr) => acc + curr.qty, 0);
    let currentStock = totalReceived - totalIssued;

    let rPct = totalBom > 0 ? ((totalReceived / totalBom) * 100).toFixed(1) : 0;
    
    // Update the new Overall Progress KPI
    const kpiProgress = document.getElementById('kpi-progress');
    if (kpiProgress) kpiProgress.innerText = `${rPct}%`;

    document.getElementById('kpi-bom').innerHTML = `${totalBom.toLocaleString(undefined, {maximumFractionDigits:1})} <span class="unit">EA/M</span>`;
    document.getElementById('kpi-received').innerHTML = `${totalReceived.toLocaleString(undefined, {maximumFractionDigits:1})} <span class="unit">EA/M</span>`;
    document.getElementById('kpi-issued').innerHTML = `${totalIssued.toLocaleString(undefined, {maximumFractionDigits:1})} <span class="unit">EA/M</span>`;
    document.getElementById('kpi-stock').innerHTML = `${Math.max(0, currentStock).toLocaleString(undefined, {maximumFractionDigits:1})} <span class="unit">EA/M</span>`;

    let iPct = totalBom > 0 ? ((totalIssued / totalBom) * 100).toFixed(1) : 0;
    
    document.getElementById('kpi-received-pct').innerText = `${rPct}% of Total BOM`;
    document.getElementById('kpi-issued-pct').innerText = `${iPct}% of Total BOM`;

    // Expedite Alert Setup ( <= 20% Received per Matcode )
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

    const alertList = document.getElementById('expediteList');
    alertList.innerHTML = '';
    let hasAlert = false;
    let alertCount = 0;
    Object.keys(bomSummary).forEach(matCode => {
        if(alertCount > 50) return;
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
                    <div class="wi-desc">BOM: ${req.toFixed(1)} | Received: ${rec.toFixed(1)} (${pct.toFixed(1)}%)</div>
                </div>
                <button class="btn btn-small btn-outline-danger shadow-none">Expedite</button>
            `;
            alertList.appendChild(li);
        }
    });

    if(!hasAlert) {
        alertList.innerHTML = `<div class="empty-state-small" style="padding:10px; color:#666;">All items are > 20% received.</div>`;
    }

    const catLabels = ['Pipe', 'Fitting', 'Support', 'Valve', 'Speciality', 'Others'];
    let catBom = { Pipe: 0, Fitting: 0, Support: 0, Valve: 0, Speciality: 0, Others: 0 };
    let catRec = { Pipe: 0, Fitting: 0, Support: 0, Valve: 0, Speciality: 0, Others: 0 };

    db.bom.forEach(b => {
        let cat = b.category || window.getCategory('', b.matCode);
        if (catBom[cat] !== undefined) catBom[cat] += b.qty;
        else catBom['Others'] += b.qty;
    });

    db.receiving.forEach(r => {
        let cat = window.getCategory(r.desc, r.matCode);
        catRec[cat] += r.qty;
    });

    let bData = catLabels.map(l => catBom[l]);
    let rData = catLabels.map(l => catRec[l]);

    if(myChart) myChart.destroy();
    const ctx = document.getElementById('progressChart');
    if(ctx) {
        myChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: catLabels,
                datasets: [
                    { label: 'BOM Req', data: bData, backgroundColor: '#0288d1' },
                    { label: 'Received', data: rData, backgroundColor: '#2e7d32' }
                ]
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: false,
                scales: {
                    x: { grid: { display: false } },
                    y: { grid: { display: false } }
                }
            }
        });
    }
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
    db.bom.forEach(b => { bomLookup[b.matCode] = { unit: b.uom, system: b.system }; });

    displayList.forEach(matCode => {
        if(matCode.includes('None') && recMap[matCode] === undefined) return;

        let rec = recMap[matCode] || 0;
        let iss = issMap[matCode] || 0;
        let stock = Math.max(0, rec - iss);

        let mData = masterMap[matCode] || { category: '-', itemDesc: '-', size1: '-', size2: '-' };
        let cat = mData.category !== '-' ? mData.category : window.getCategory(mData.itemDesc, matCode);
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
function renderMatCodeMaster() {
    let tbody = document.querySelector('#matCodeTable tbody');
    tbody.innerHTML = '';
    if(db.matCodeMaster.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8">No Master Data available.</td></tr>';
        return;
    }
    db.matCodeMaster.forEach(m => {
        let catBadge = {Pipe:'info', Fitting:'ok', Valve:'warn', Speciality:'warn', Other:'err'}[m.category] || 'ok';
        let tr = `<tr>
            <td><strong><span class="status-badge ok">${m.matCode}</span></strong></td>
            <td><span class="status-badge ${catBadge}">${m.category}</span></td>
            <td>${m.itemDesc}</td>
            <td>${m.matlDesc}</td>
            <td>${m.size1}</td>
            <td>${m.size2}</td>
            <td>${m.classDesc}</td>
            <td>${m.etDesc}</td>
        </tr>`;
        tbody.innerHTML += tr;
    });
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

    if(bomSys && bomIsoData) {
        const systems = [...new Set(db.bom.map(b => b.system).filter(Boolean))].sort();
        const isos = [...new Set(db.bomIsoList.map(r => r.iso))].sort();

        bomSys.innerHTML = '<option value="All">All Systems</option>' + systems.map(s => `<option value="${s}">${s}</option>`).join('');
        bomIsoData.innerHTML = isos.map(i => `<option value="${i}">`).join('');
    }

    // PL Filters
    const plDoc = document.getElementById('plDocFilter');
    const plPkg = document.getElementById('plPkgFilter');
    if(plDoc && plPkg) {
        const docs = [...new Set(db.receiving.map(r => r.docNo))].sort();
        const pkgs = [...new Set(db.receiving.map(r => r.plNo))].sort();
        plDoc.innerHTML = '<option value="All">All DOCs</option>' + docs.map(d => `<option value="${d}">${d}</option>`).join('');
        plPkg.innerHTML = '<option value="All">All PKGs</option>' + pkgs.map(p => `<option value="${p}">${p}</option>`).join('');
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
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:20px;color:#888;">Loading...</td></tr>';

    const iso = (document.getElementById('bomIsoSearch')?.value || '').trim();
    const sys = document.getElementById('bomSystemFilter')?.value || 'All';

    // bom_detail: ISO 내 동일 MatCode SUM 집계 뷰
    let query = supabaseClient.from('bom_detail')
        .select('mat_code, category, system, iso_dwg_no, full_description, uom, qty', { count: 'exact' })
        .range(currentBomPage * PAGE_SIZE, (currentBomPage + 1) * PAGE_SIZE - 1)
        .order('iso_dwg_no');

    if (sys !== 'All') query = query.eq('system', sys);
    if (iso) query = query.ilike('iso_dwg_no', `%${iso}%`);

    const { data, count, error } = await query;
    if (error) {
        tbody.innerHTML = `<tr><td colspan="8" style="color:red;text-align:center;">Error: ${error.message}</td></tr>`;
        return;
    }

    tbody.innerHTML = '';
    (data || []).forEach(b => {
        let cat = b.category || window.getCategory(b.full_description, b.mat_code);
        let isAuto = (b.mat_code || '').includes('NEW-MAT');
        let badgeClass = isAuto ? 'warn' : 'ok';
        let desc = b.full_description || '-';
        tbody.innerHTML += `<tr>
            <td>${b.system || '-'}</td>
            <td>${b.iso_dwg_no || '-'}</td>
            <td><strong>${cat}</strong></td>
            <td><span class="status-badge ${badgeClass}">${b.mat_code}</span></td>
            <td title="${desc}">${desc.length > 50 ? desc.substring(0,47)+'...' : desc}</td>
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
    
    let data = filteredPlData.length > 0 || document.getElementById('plItemSearch').value || document.getElementById('plDocFilter').value !== 'All' ? filteredPlData : db.receiving;
    
    let slicedPl = data.slice(currentPlPage * PAGE_SIZE, (currentPlPage + 1) * PAGE_SIZE); 
    
    slicedPl.forEach(r => {
        let catBadge = {Pipe:'info', Fitting:'ok', Valve:'warn', Speciality:'warn', Other:'err'}[r.category] || 'ok';
        let shortDesc = r.desc.length > 60 ? r.desc.substring(0, 57) + '...' : r.desc;

        let tr = `<tr>
            <td>${r.docNo}</td>
            <td>${r.plNo}</td>
            <td><span class="status-badge ok">${r.matCode}</span></td>
            <td><span class="status-badge ${catBadge}">${r.category}</span></td>
            <td title="${r.desc}">${shortDesc}</td>
            <td>${r.unit || 'EA'}</td>
            <td>${r.qty.toFixed(2)}</td>
            <td><button class="btn-small btn-outline">Detail</button></td>
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

                // Find header row
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
                    alert('PKG_NO 컬럼을 찾을 수 없습니다. 파일 형식을 확인해주세요.');
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
                alert('파일 파싱 오류: ' + err.message);
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
        alert(`아직 ${unresolved.length}건의 MatCode가 미지정입니다. 모두 지정 후 저장해주세요.`);
        return;
    }

    if (!confirm(`총 ${plReviewData.length}건을 Receiving에 저장하시겠습니까?`)) return;

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
        alert(`✅ ${toInsert.length}건이 Receiving에 저장되었습니다!`);
        document.getElementById('plReviewPanel').style.display = 'none';
        plReviewData = [];
        await syncFromSupabase();
    } catch (err) {
        alert('저장 오류: ' + err.message);
        console.error(err);
    } finally {
        showLoading(false);
    }
}

// The action of clicking Search ISO BOM
function attachEventListeners() {
    // BOM Filter Button
    const btnFilterBom = document.getElementById('btnFilterBom');
    if(btnFilterBom) {
        btnFilterBom.addEventListener('click', () => {
            currentBomPage = 0;
            renderBomTable(); // 서버사이드 필터 쿼리 (필터값은 renderBomTable 내부에서 읽음)
        });
    }

    // PL Filter Button
    const btnFilterPl = document.getElementById('btnFilterPl');
    if(btnFilterPl) {
        btnFilterPl.addEventListener('click', () => {
            const item = document.getElementById('plItemSearch').value.trim().toUpperCase();
            const doc = document.getElementById('plDocFilter').value;
            const pkg = document.getElementById('plPkgFilter').value;
            
            filteredPlData = db.receiving.filter(r => {
                const matchItem = !item || (r.desc.toUpperCase().includes(item));
                const matchDoc = doc === 'All' || r.docNo === doc;
                const matchPkg = pkg === 'All' || r.plNo === pkg;
                return matchItem && matchDoc && matchPkg;
            });
            currentPlPage = 0;
            renderReceivingTable();
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
    }
    
    const btnFilterIssue = document.getElementById('btnFilterIssue');
    if (btnFilterIssue) {
        btnFilterIssue.addEventListener('click', async () => {
            let sys = document.getElementById('issueSystemFilter')?.value || 'All';
            let iso = (document.getElementById('issueIsoSearch')?.value || '').trim();

            let tbody = document.querySelector('#issueTable tbody');
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:16px;color:#888;">Loading...</td></tr>';

            // 서버사이드 쿼리: 선택된 system+ISO로 bom 테이블 직접 필터
            let query = supabaseClient.from('bom')
                .select('mat_code, iso_dwg_no, full_description, uom, qty, system')
                .order('iso_dwg_no')
                .limit(100);
            if (sys !== 'All') query = query.eq('system', sys);
            if (iso && iso !== 'All') query = query.eq('iso_dwg_no', iso);

            const { data: bomRows, error } = await query;
            if (error) {
                tbody.innerHTML = `<tr><td colspan="8" style="color:red;text-align:center;">Error: ${error.message}</td></tr>`;
                return;
            }

            tbody.innerHTML = '';
            if (!bomRows || bomRows.length === 0) {
                tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">No BOM materials found for the selected ISO Drawing.</td></tr>';
                return;
            }

            // Pre-build receiving/issued maps for quick lookup
            const recMap = {};
            db.receiving.forEach(r => { if(r.matCode) recMap[r.matCode] = (recMap[r.matCode] || 0) + r.qty; });
            const issMap = {};
            db.issued.forEach(i => { if(i.matCode) issMap[i.matCode] = (issMap[i.matCode] || 0) + i.qty; });

            let htmlString = '';
            bomRows.forEach(b => {
                let mat = (b.mat_code || '').trim().toUpperCase();
                if (!mat || mat === 'NONE') return;

                let totalRec = recMap[mat] || 0;
                let totalIss = issMap[mat] || 0;
                let stockQty = Math.max(0, totalRec - totalIss);
                let qty = parseFloat(b.qty) || 0;
                let defaultReq = Math.min(qty, stockQty);
                let safeDesc = (b.full_description || '-').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

                htmlString += `<tr>
                    <td>${b.iso_dwg_no || '-'}</td>
                    <td>${mat}</td>
                    <td title="${safeDesc}">${safeDesc.length > 40 ? safeDesc.substring(0,40)+'...' : safeDesc}</td>
                    <td>${b.uom || 'EA'}</td>
                    <td>${qty.toFixed(2)}</td>
                    <td>${totalRec.toFixed(2)}</td>
                    <td><strong>${stockQty.toFixed(2)}</strong></td>
                    <td>
                        <input type="number" class="form-control" style="width:80px;" min="0" max="${totalRec}" value="${Math.max(0, defaultReq)}"
                        data-matcode="${mat}" data-iso="${b.iso_dwg_no||'-'}" data-size="-" data-unit="${b.uom||'EA'}" data-desc="${safeDesc}">
                    </td>
                </tr>`;
            });

            tbody.innerHTML = htmlString;
            if (bomRows.length >= 100) {
                tbody.innerHTML += `<tr><td colspan="8" style="text-align:center;color:var(--color-warning);">최대 100건 표시됩니다. ISO Drawing을 선택하면 더 정확한 결과를 볼 수 있습니다.</td></tr>`;
            }
        });
    }

    // "Add To MR" logic
    const btnAddToMr = document.getElementById('btnAddToMr');
    if (btnAddToMr) {
        btnAddToMr.addEventListener('click', () => {
            const inputs = document.querySelectorAll('#issueTable input[type="number"]');
            let addedCount = 0;
            // Generate ONE MR number for this batch
            let currentMr = "MR-" + new Date().getFullYear() + "-" + (Math.floor(Math.random() * 9000) + 1000);

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
             db.mrTable.forEach(mrItem => {
                 let tr = `<tr>
                     <td style="border:1px solid #000; padding:8px;">${mrItem.iso}</td>
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
                alert('MatCode와 Category를 모두 입력해주세요.');
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

    ['btnCloseNewMatCode', 'btnCancelNewMatCode'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.addEventListener('click', () => {
            document.getElementById('newMatCodeModal').style.display = 'none';
        });
    });
}

// Function to render the MR Table
function renderMrTable() {
    let tbody = document.querySelector('#mrTableOutput tbody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    if (db.mrTable.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color: #888;">MR Table is empty. Please add items using the form above.</td></tr>';
        return;
    }

    db.mrTable.forEach(m => {
        let tr = `<tr>
            <td><strong>${m.mrNo}</strong></td>
            <td>${m.iso}</td>
            <td><span class="status-badge ok">${m.matCode}</span></td>
            <td title="${m.desc}">${m.desc.length > 20 ? m.desc.substring(0,20)+'...' : m.desc}</td>
            <td>${m.size}</td>
            <td>${m.unit}</td>
            <td><strong>${m.reqQty.toFixed(2)}</strong></td>
        </tr>`;
        tbody.innerHTML += tr;
    });
}
