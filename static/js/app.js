// Supabase Configuration - LIVE CREDENTIALS (FIXED COLLISION)
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
    bom: [],
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
    if (d.includes('ELBOW') || d.includes('TEE') || d.includes('REDUCER') || d.includes('CAP') || d.includes('OLET') || d.includes('FLANGE') || d.includes('NIPPLE') || d.includes('COUPLING') || d.includes('UNION') || d.includes('GASKET') || d.includes('BOLT') || d.includes('NUT') || d.includes('BLIND') || d.includes('FLN') || d.includes('EL9') || d.includes('EL4')) return 'Fitting';
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
        
        const [matMasterRaw, bomRaw, recvRaw, issuedRaw] = await Promise.all([
            fetchAllRows('matcode_master'),
            fetchAllRows('bom'),
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
                origDesc: m.orig_desc || m.description || '-',
                item: m.item || '-',
                matl: m.matl || '-',
                size: m.size || '-',
                classDetails: m.class_details || '-',
                endType: m.end_type || '-',
                source: 'Supabase DB'
            }));
        }
        
        if (bomRaw.length > 0) { 
            db.bom = bomRaw.map(b => ({
                system: b.system || '-',
                area: b.area || 'General',
                iso: b.iso || '-',
                matCode: (b.mat_code || '').trim().toUpperCase(),
                desc: b.description || '-',
                unit: b.unit || 'EA',
                qty: parseFloat(b.qty) || 0
            })).filter(b => b.qty > 0 && b.matCode); // Filter out zero/empty
        }
        
        if (recvRaw.length > 0) { 
            db.receiving = recvRaw.map(r => ({
                docNo: r.doc_no || '-',
                plNo: r.pl_no || '-',
                matCode: (r.mat_code || '').trim().toUpperCase(),
                desc: r.vendor_desc || r.description || '-',
                unit: r.unit || 'EA',
                qty: parseFloat(r.qty) || 0
            })).filter(r => r.qty > 0 && r.matCode); // Filter out zero/empty
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
    if (d.includes('ELBOW') || d.includes('TEE') || d.includes('REDUCER') || d.includes('CAP') || d.includes('OLET') || d.includes('FLANGE') || d.includes('NIPPLE') || d.includes('COUPLING') || d.includes('UNION') || d.includes('GASKET') || d.includes('BOLT') || d.includes('NUT') || d.includes('BLIND') || d.includes('FLN') || d.includes('EL9') || d.includes('EL4')) return 'Fitting';
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
        if(!bomSummary[b.matCode]) bomSummary[b.matCode] = { qty: 0, desc: b.desc };
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
                    <div class="wi-title">[${matCode}] ${bomSummary[matCode].desc}</div>
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
        let cat = window.getCategory(b.desc, b.matCode);
        catBom[cat] += b.qty;
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

    // Map description
    const descMap = {};
    db.matCodeMaster.forEach(m => { descMap[m.matCode] = m.desc; });

    // Build unique list of MatCodes that have stock activity (received or issued)
    const activeCodes = [...new Set([...Object.keys(recMap), ...Object.keys(issMap)])].sort();

    // Max 1000 rendering to prevent freeze
    let displayList = activeCodes.slice(0, 1000); 

    // Pre-build a map for easy lookup of item/size/cat
    const masterMap = {};
    db.matCodeMaster.forEach(m => { masterMap[m.matCode] = m; });
    const bomLookup = {};
    db.bom.forEach(b => { bomLookup[b.matCode] = { unit: b.unit, area: b.area, system: b.system }; });

    displayList.forEach(matCode => {
        if(matCode.includes('None') && recMap[matCode] === undefined) return;

        let rec = recMap[matCode] || 0;
        let iss = issMap[matCode] || 0;
        let stock = Math.max(0, rec - iss);
        
        let mData = masterMap[matCode] || { desc: 'Unknown', item: '-', size: '-' };
        let desc = mData.desc;
        let cat = window.getCategory(desc, matCode);
        let item = mData.item;
        // Smart size extraction from MatCode as requested
        let size = window.extractSizeFromMatCode(matCode);
        if (size === '-') size = mData.size; // fallback to original size if pattern not found
        
        let shortDesc = desc.length > 40 ? desc.substring(0, 37) + '...' : desc;
        let badge = stock > 0 ? '<span class="status-badge ok">In Stock</span>' : '<span class="status-badge err">Out of Stock</span>';

        let unitStr = bomLookup[matCode] ? bomLookup[matCode].unit : 'EA';
        let tr = `<tr>
            <td style="font-weight:600; color:var(--color-primary);">${matCode}</td>
            <td><strong>${cat}</strong></td>
            <td>${item}</td>
            <td>${size}</td>
            <td title="${desc.replace(/"/g, '&quot;')}">${shortDesc}</td>
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
    let displayList = db.matCodeMaster.slice(0, 500);
    if(db.matCodeMaster.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3">No Master Data available.</td></tr>';
        return;
    }
    displayList.forEach(m => {
        let safeOrigDesc = m.origDesc.replace(/"/g, '&quot;');
        let shortOrigDesc = safeOrigDesc.length > 30 ? safeOrigDesc.substring(0, 30) + '...' : safeOrigDesc;
        
        let tr = `<tr>
            <td title="${safeOrigDesc}"><strong>${shortOrigDesc}</strong></td>
            <td>${m.item}</td>
            <td>${m.matl}</td>
            <td>${m.size}</td>
            <td>${m.classDetails}</td>
            <td>${m.endType}</td>
            <td><strong><span class="status-badge ok">${m.matCode}</span></strong></td>
            <td>${m.source}</td>
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
    const bomArea = document.getElementById('bomAreaFilter');
    const bomIsoData = document.getElementById('bomIsoDatalist');
    
    if(bomSys && bomArea && bomIsoData) {
        const systems = [...new Set(db.bom.map(b => b.system))].sort();
        const areas = [...new Set(db.bom.map(b => b.area))].sort();
        const isos = [...new Set(db.bom.map(b => b.iso))].sort();
        
        bomSys.innerHTML = '<option value="All">All Systems</option>' + systems.map(s => `<option value="${s}">${s}</option>`).join('');
        bomArea.innerHTML = '<option value="All">All Areas</option>' + areas.map(a => `<option value="${a}">${a}</option>`).join('');
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

function renderBomTable() {
    let tbody = document.querySelector('#bomTable tbody');
    if(!tbody) return;
    tbody.innerHTML = '';
    
    // Smart data selection: use filtered if searching/filtering, otherwise full db.
    let isFiltering = false;
    const isoSearchVal = document.getElementById('bomIsoSearch')?.value;
    const sysFilterVal = document.getElementById('bomSystemFilter')?.value;
    
    if (isoSearchVal || (sysFilterVal && sysFilterVal !== 'All')) {
        isFiltering = true;
    }

    let data = (isFiltering) ? filteredBomData : db.bom;
    
    let slicedBom = data.slice(currentBomPage * PAGE_SIZE, (currentBomPage + 1) * PAGE_SIZE);
    
    slicedBom.forEach((b, i) => {
        let isAuto = b.matCode.includes('NEW-MAT');
        let badgeClass = isAuto ? 'warn' : 'ok';
        let cat = window.getCategory(b.desc, b.matCode);
        let tr = `<tr>
            <td>${b.system || '-'}</td>
            <td>${b.iso}</td>
            <td><strong>${cat}</strong></td>
            <td><span class="status-badge ${badgeClass}">${b.matCode}</span></td>
            <td>${b.desc}</td>
            <td>${b.unit}</td>
            <td>${b.qty.toFixed(2)}</td>
            <td><button class="btn-small btn-outline-danger">Del</button></td>
        </tr>`;
        tbody.innerHTML += tr;
    });

    renderTablePagination(
        data.length, 
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
    
    slicedPl.forEach((r, i) => {
        let isMatched = r.matCode && !r.matCode.includes('NEW-MAT');
        let isAuto = r.matCode && r.matCode.includes('NEW-MAT');
        let badge = isMatched ? '<span class="status-badge ok">Matched</span>' : (isAuto ? '<span class="status-badge warn">Auto New</span>' : '<span class="status-badge err">Unmatched</span>');
        let shortDesc = r.desc.length > 50 ? r.desc.substring(0, 47) + '...' : r.desc;

        // Extraction Logic for Packing List
        let cat = window.getCategory(r.desc, r.matCode);
        let itemPart = r.desc.split('-')[0].trim();
        // ... (existing spec logic remains same internally if needed, simplifying for brevity)
        
        let size = window.extractSizeFromMatCode(r.matCode);

        let tr = `<tr>
            <td>${r.docNo}</td>
            <td>${r.plNo}</td>
            <td><strong>${cat}</strong></td>
            <td>${itemPart}</td>
            <td>${size}</td>
            <td title="${r.desc}">${shortDesc}</td>
            <td>${r.unit || 'EA'}</td>
            <td>${r.qty.toFixed(2)}</td>
            <td><strong>${r.matCode}</strong> ${badge}</td>
            <td><button class="btn-small btn-outline">Review</button></td>
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
    const areaSelect = document.getElementById('issueAreaFilter');
    
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
    const sysSelect = document.getElementById('issueSystemFilter');
    const areaSelect = document.getElementById('issueAreaFilter');
    if(!sysSelect || !areaSelect) return;

    let sys = sysSelect.value;
    const areasMap = {};
    db.bom.forEach(b => {
        if(sys === 'All' || b.system === sys) {
            let area = b.area || 'General Area'; 
            areasMap[area] = true;
        }
    });

    const areas = Object.keys(areasMap).sort();
    let areaHtml = '<option value="All">All Areas</option>';
    areas.forEach(a => areaHtml += `<option value="${a.replace(/"/g, '&quot;')}">${a}</option>`);
    areaSelect.innerHTML = areaHtml;
    
    // We update the datalist to show suggested ISOs for that system/area
    updateIsoDropdown();
}

window.updateIsoDropdown = function() {
    const sysSelect = document.getElementById('issueSystemFilter');
    const areaSelect = document.getElementById('issueAreaFilter');
    const isoDatalist = document.getElementById('isoDatalist');
    const isoSearchInput = document.getElementById('issueIsoSearch');
    if (!isoDatalist || !isoSearchInput) return;
    
    let sys = sysSelect ? sysSelect.value : 'All';
    let area = areaSelect ? areaSelect.value : 'All';

    const isosMap = {};
    db.bom.forEach(b => {
        let bSys = b.system ? b.system.trim() : 'Unassigned';
        let bArea = b.area || 'General Area';
        let matchSys = (sys === 'All' || bSys === sys);
        let matchArea = (area === 'All' || bArea === area);

        if (matchSys && matchArea) {
            let iso = (b.iso && b.iso !== 'Unassigned') ? b.iso.trim() : null;
            if (iso) isosMap[iso] = true;
        }
    });

    const isos = Object.keys(isosMap).sort();
    let datalistHtml = '<option value="All">';
    
    isos.forEach(i => {
        let escaped = i.replace(/"/g, '&quot;');
        datalistHtml += `<option value="${escaped}">`;
    });
    
    isoDatalist.innerHTML = datalistHtml;
}

// The action of clicking Search ISO BOM
function attachEventListeners() {
    // BOM Filter Button
    const btnFilterBom = document.getElementById('btnFilterBom');
    if(btnFilterBom) {
        btnFilterBom.addEventListener('click', () => {
            const iso = document.getElementById('bomIsoSearch').value.trim().toUpperCase();
            const sys = document.getElementById('bomSystemFilter').value;
            const area = document.getElementById('bomAreaFilter').value;
            
            filteredBomData = db.bom.filter(b => {
                const matchIso = !iso || b.iso.toUpperCase().includes(iso);
                const matchSys = sys === 'All' || b.system === sys;
                const matchArea = area === 'All' || b.area === area;
                return matchIso && matchSys && matchArea;
            });
            currentBomPage = 0;
            renderBomTable();
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
    const areaSelect = document.getElementById('issueAreaFilter');
    if (areaSelect) {
        areaSelect.addEventListener('change', window.updateIsoDropdown);
    }
    
    const isoSearchInput = document.getElementById('issueIsoSearch');
    if (isoSearchInput) {
        isoSearchInput.addEventListener('focus', function() {
            this.value = ''; // Auto-clear to show all suggestions
        });
    }
    
    const btnFilterIssue = document.getElementById('btnFilterIssue');
    if (btnFilterIssue) {
        btnFilterIssue.addEventListener('click', () => {
            let sys = document.getElementById('issueSystemFilter') ? document.getElementById('issueSystemFilter').value : 'All';
            let area = document.getElementById('issueAreaFilter') ? document.getElementById('issueAreaFilter').value : 'All';
            let iso = document.getElementById('issueIsoSearch').value || 'All';

            let filteredBom = db.bom.filter(b => {
                let bSys = b.system ? b.system.trim() : 'Unassigned';
                let bArea = b.area || 'General Area';
                let bIso = b.iso ? b.iso.trim() : 'Unassigned';
                
                let matchSys = (sys === 'All') || (bSys === sys);
                let matchArea = (area === 'All') || (bArea === area);
                let matchIso = (iso === 'All') || (bIso === iso);
                return matchSys && matchArea && matchIso;
            });

            let tbody = document.querySelector('#issueTable tbody');
            tbody.innerHTML = '';
            
            if (filteredBom.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">No BOM materials found for the selected ISO Drawing.</td></tr>';
                return;
            }

            // A drawing shouldn't exceed 1000 items, if it does, slice it to prevent freeze
            let renderLimit = 100;
            let overLimit = false;
            if (filteredBom.length > renderLimit) {
                filteredBom = filteredBom.slice(0, renderLimit);
                overLimit = true;
            }

            let htmlString = '';
            filteredBom.forEach(b => {
                let mat = b.matCode;
                if(!mat || mat === 'None') return;

                let totalRec = db.receiving.filter(r => r.matCode === mat).reduce((acc, curr) => acc + curr.qty, 0);
                let totalIss = db.issued.filter(i => i.matCode === mat).reduce((acc, curr) => acc + curr.qty, 0);
                
                // Also double check for cases where BOM/Receiving might have subtle matCode differences
                // but we already normalized them in syncFromSupabase above.
                
                let stockQty = Math.max(0, totalRec - totalIss);
                
                let maxReq = totalRec; 
                let defaultReq = Math.min(b.qty, stockQty);

                // JSON escape description just in case
                let safeDesc = b.desc.replace(/"/g, '&quot;').replace(/'/g, '&#39;');

                htmlString += `<tr>
                    <td>${b.iso}</td>
                    <td>${mat}</td>
                    <td title="${safeDesc}">${safeDesc.length > 40 ? safeDesc.substring(0,40)+'...' : safeDesc}</td>
                    <td>${b.unit || 'EA'}</td>
                    <td>${b.qty.toFixed(2)}</td>
                    <td>${totalRec.toFixed(2)}</td>
                    <td><strong>${stockQty.toFixed(2)}</strong></td>
                    <td>
                        <input type="number" class="form-control" style="width:80px;" min="0" max="${maxReq}" value="${Math.max(0, defaultReq)}" 
                        data-matcode="${mat}" data-iso="${b.iso}" data-size="${b.size||'-'}" data-unit="${b.unit||'EA'}" data-desc="${safeDesc}">
                    </td>
                </tr>`;
            });

            tbody.innerHTML = htmlString;
            
            if(overLimit) {
                 tbody.innerHTML += `<tr><td colspan="7" style="text-align:center; color:var(--color-danger);"><strong>Warning: Too many items. Only showing top ${renderLimit}. Please select a specific ISO drawing.</strong></td></tr>`;
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

             // 2. Confirm Issue: translate MR contents into Issued tracker
             db.mrTable.forEach(mrItem => {
                 db.issued.push({
                     id: Date.now() + Math.random(),
                     iso: mrItem.iso,
                     matCode: mrItem.matCode,
                     qty: mrItem.reqQty,
                     date: new Date().toISOString()
                 });
             });

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

    db.mrTable.forEach((m, idx) => {
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
