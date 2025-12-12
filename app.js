/* =============================================
   CREATOR PRODUCTIVITY DASHBOARD - JAVASCRIPT
   10x Enhanced with Advanced Analytics & Features
   ============================================= */

// Configuration
const SHEET_ID = "18wIazB6wExNteYnsUrkTwzQuO40QIYdvKamdlGNalec";
const SHEET_NAME = "ContentTracker";
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?sheet=${encodeURIComponent(SHEET_NAME)}&tqx=out:json`;
const STORAGE_KEY = "creator_dashboard_state_v5";

// State
let allData = [], months = [], creators = [];
let searchTerm = "", selectedPlatform = "", monthlyTarget = 30, selectedDayKey = "", sortMode = "date-desc";
let creatorChartInstance = null, platformChartInstance = null, typeChartInstance = null;

// Status Categories
const COMPLETED_STATUSES = ["completed", "done", "published", "posted"];
const INPROGRESS_STATUSES = ["in progress", "draft", "editing", "in edit", "edit"];
const PENDING_STATUSES = ["pending", "todo", "backlog", "not started", "assign"];

// Utility Functions
const $ = (id) => document.getElementById(id);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const pad2 = (n) => String(n).padStart(2, "0");
const normalizeStatus = (s) => (s || "").toLowerCase().trim();

function parseGoogleDate(value) {
    if (!value) return null;
    if (typeof value === "string" && value.startsWith("Date(")) {
        const parts = value.slice(5, -1).split(",").map(Number);
        const [y, m, d, hh = 0, mm = 0, ss = 0] = parts;
        return new Date(y, m, d, hh, mm, ss);
    }
    return new Date(value);
}

const getMonthKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
const dateToDayKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const formatMonthLabelFromKey = (key) => {
    const [y, m] = key.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleString(undefined, { month: "short", year: "numeric" });
};
const formatDateDisplay = (d) => d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "2-digit" });

function statusMatchesFilter(rowStatus, filterValue) {
    const s = normalizeStatus(rowStatus);
    if (!filterValue) return true;
    if (filterValue === "completed") return COMPLETED_STATUSES.includes(s);
    if (filterValue === "in-progress") return INPROGRESS_STATUSES.includes(s);
    if (filterValue === "pending") return PENDING_STATUSES.includes(s);
    if (filterValue === "other") return !COMPLETED_STATUSES.includes(s) && !INPROGRESS_STATUSES.includes(s) && !PENDING_STATUSES.includes(s);
    return true;
}

function getStatusClass(status) {
    const s = normalizeStatus(status);
    if (COMPLETED_STATUSES.includes(s)) return "status-completed";
    if (INPROGRESS_STATUSES.includes(s)) return "status-in-progress";
    if (PENDING_STATUSES.includes(s)) return "status-pending";
    return "status-other";
}

function showError(msg) {
    const el = $("errorMsg");
    if (!el) return;
    el.textContent = msg;
    el.style.display = "block";
}

function clearError() {
    const el = $("errorMsg");
    if (!el) return;
    el.textContent = "";
    el.style.display = "none";
}

// State Persistence
function saveState() {
    try {
        const state = {
            month: $("monthFilter")?.value || "",
            creator: $("creatorFilter")?.value || "",
            status: $("statusFilter")?.value || "",
            search: $("searchFilter")?.value || "",
            platform: selectedPlatform || "",
            target: monthlyTarget || 30,
            day: selectedDayKey || "",
            sort: sortMode || "date-desc",
            theme: document.documentElement.getAttribute("data-theme") || "light"
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_) { }
}

function loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (_) {
        return null;
    }
}

// Theme Toggle
function initTheme() {
    const state = loadState();
    const theme = state?.theme || "light"; // Default to light mode
    document.documentElement.setAttribute("data-theme", theme);
    updateThemeIcon();

    const toggle = $("themeToggle");
    if (toggle) {
        toggle.addEventListener("click", () => {
            const current = document.documentElement.getAttribute("data-theme");
            const next = current === "dark" ? "light" : "dark";
            document.documentElement.setAttribute("data-theme", next);
            updateThemeIcon();
            saveState();
        });
    }
}

function updateThemeIcon() {
    const toggle = $("themeToggle");
    if (!toggle) return;
    const theme = document.documentElement.getAttribute("data-theme");
    toggle.textContent = theme === "dark" ? "☀️" : "🌙";
}

// Data Fetching
async function fetchSheetData() {
    try {
        const res = await fetch(SHEET_URL, { cache: "no-store" });
        const text = await res.text();
        const jsonStr = text.substring(text.indexOf("{"), text.lastIndexOf("}") + 1);
        const parsed = JSON.parse(jsonStr);
        const rows = parsed.table?.rows || [];
        const data = [];

        for (const row of rows) {
            const c = row.c || [];
            const rawDate = c[0]?.v;
            if (!rawDate) continue;
            const date = parseGoogleDate(rawDate);
            if (!date || isNaN(date)) continue;

            data.push({
                date,
                videoType: (c[1]?.v ?? "").toString(),
                location: (c[2]?.v ?? "").toString(),
                topic: (c[3]?.v ?? "").toString(),
                DropboxLink_Script: (c[4]?.v ?? "").toString(),
                platform: (c[5]?.v ?? "").toString(),
                status: (c[6]?.v ?? "").toString(),
                creator: (c[7]?.v ?? "Unassigned").toString(),
                caption: (c[8]?.v ?? "").toString()
            });
        }
        return data;
    } catch (err) {
        console.error(err);
        showError("Could not load data from Google Sheets. Check Sheet ID, Sheet Name, and public access.");
        return [];
    }
}

// Build Filters
function buildFilters() {
    const monthFilter = $("monthFilter");
    const creatorFilter = $("creatorFilter");
    const creatorCountBadge = $("creatorCountBadge");
    const statusFilter = $("statusFilter");
    const searchFilter = $("searchFilter");
    const targetInput = $("targetInput");
    const sortFilter = $("sortFilter");

    const monthSet = new Set(), creatorSet = new Set(), platformSet = new Set();
    allData.forEach(r => {
        monthSet.add(getMonthKey(r.date));
        creatorSet.add(r.creator || "Unassigned");
        platformSet.add(r.platform || "Unassigned");
    });

    months = Array.from(monthSet).sort();
    creators = Array.from(creatorSet).sort();
    const platforms = Array.from(platformSet).sort();

    monthFilter.innerHTML = "";
    months.forEach((key, idx) => {
        const opt = document.createElement("option");
        opt.value = key;
        opt.textContent = formatMonthLabelFromKey(key);
        if (idx === months.length - 1) opt.selected = true;
        monthFilter.appendChild(opt);
    });

    creatorFilter.innerHTML = "";
    const allOpt = document.createElement("option");
    allOpt.value = "";
    allOpt.textContent = "All Creators";
    creatorFilter.appendChild(allOpt);
    creators.forEach(name => {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        creatorFilter.appendChild(opt);
    });

    creatorCountBadge.textContent = String(creators.length || 0);

    // Event Listeners
    monthFilter.addEventListener("change", () => { selectedDayKey = ""; saveState(); renderDashboard(); });
    creatorFilter.addEventListener("change", () => { saveState(); renderDashboard(); });
    statusFilter.addEventListener("change", () => { saveState(); renderDashboard(); });
    searchFilter.addEventListener("input", (e) => { searchTerm = (e.target.value || "").toLowerCase().trim(); saveState(); renderDashboard(); });

    targetInput.addEventListener("input", (e) => {
        const val = Number(e.target.value);
        if (!isNaN(val) && val > 0) { monthlyTarget = val; saveState(); renderDashboard(); }
    });

    sortFilter.addEventListener("change", (e) => { sortMode = e.target.value || "date-desc"; saveState(); renderDashboard(); });

    $("quickCompleted").addEventListener("click", () => { statusFilter.value = "completed"; saveState(); renderDashboard(); });
    $("quickInEdit").addEventListener("click", () => { statusFilter.value = "in-progress"; saveState(); renderDashboard(); });
    $("quickPending").addEventListener("click", () => { statusFilter.value = "pending"; saveState(); renderDashboard(); });

    $("calendarClearBtn").addEventListener("click", () => { selectedDayKey = ""; saveState(); renderDashboard(); });
    $("clearDayBtn").addEventListener("click", () => { selectedDayKey = ""; saveState(); renderDashboard(); });

    $("resetFiltersBtn").addEventListener("click", () => {
        searchFilter.value = ""; searchTerm = "";
        statusFilter.value = ""; creatorFilter.value = "";
        selectedPlatform = ""; selectedDayKey = "";
        sortMode = "date-desc"; sortFilter.value = "date-desc";
        targetInput.value = "60"; monthlyTarget = 60;
        saveState(); buildPlatformChips(platforms); renderDashboard();
    });

    $("exportCsvBtn").addEventListener("click", exportCurrentViewCsv);
    $("refreshBtn")?.addEventListener("click", async () => {
        allData = await fetchSheetData();
        if (allData.length) renderDashboard();
    });

    buildPlatformChips(platforms);
    applyLoadedState();
    buildPlatformChips(platforms);
}

function buildPlatformChips(platforms) {
    const container = $("platformChipRow");
    container.innerHTML = "";

    const addChip = (label, value) => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "filter-chip" + (selectedPlatform === value ? " active" : "");
        chip.textContent = label;
        chip.addEventListener("click", () => {
            selectedPlatform = value;
            saveState();
            buildPlatformChips(platforms);
            renderDashboard();
        });
        container.appendChild(chip);
    };

    addChip("All", "");
    platforms.forEach(p => addChip(p, p));
}

function applyLoadedState() {
    const state = loadState();
    if (!state) return;

    const monthFilter = $("monthFilter"), creatorFilter = $("creatorFilter"), statusFilter = $("statusFilter");
    const searchFilter = $("searchFilter"), targetInput = $("targetInput"), sortFilter = $("sortFilter");

    if (state.month && Array.from(monthFilter.options).some(o => o.value === state.month)) monthFilter.value = state.month;
    if (state.creator && Array.from(creatorFilter.options).some(o => o.value === state.creator)) creatorFilter.value = state.creator;
    if (state.status) statusFilter.value = state.status;
    if (typeof state.search === "string") { searchFilter.value = state.search; searchTerm = state.search.toLowerCase().trim(); }
    if (typeof state.target === "number" && state.target > 0) { monthlyTarget = state.target; targetInput.value = String(state.target); }
    if (typeof state.platform === "string") selectedPlatform = state.platform;
    if (typeof state.day === "string") selectedDayKey = state.day;
    if (typeof state.sort === "string") { sortMode = state.sort; sortFilter.value = state.sort; }
}

// Filtering
function getFilteredRows() {
    if (!allData.length || !months.length) return [];
    const monthKey = $("monthFilter").value || months[months.length - 1];
    const creator = $("creatorFilter").value;
    const statusFilterVal = $("statusFilter").value;

    if (selectedDayKey && !selectedDayKey.startsWith(monthKey + "-")) selectedDayKey = "";

    return allData.filter(row => {
        const sameMonth = getMonthKey(row.date) === monthKey;
        const sameCreator = !creator || row.creator === creator;
        const platformLabel = row.platform || "Unassigned";
        const matchesPlatform = !selectedPlatform || platformLabel === selectedPlatform;
        const textToSearch = [row.topic, row.platform, row.location, row.videoType, row.creator, row.status, row.caption].join(" ").toLowerCase();
        const matchesSearch = !searchTerm || textToSearch.includes(searchTerm);
        const matchesStatus = statusMatchesFilter(row.status, statusFilterVal);
        const matchesDay = !selectedDayKey || dateToDayKey(row.date) === selectedDayKey;
        return sameMonth && sameCreator && matchesPlatform && matchesSearch && matchesStatus && matchesDay;
    });
}

// Main Render
function renderDashboard() {
    clearError();
    if (!allData.length) { showError("No rows found."); return; }

    const monthKey = $("monthFilter").value || months[months.length - 1];
    const monthLabel = formatMonthLabelFromKey(monthKey);
    $("currentMonthLabel").textContent = `Month: ${monthLabel}`;

    const filtered = getFilteredRows();
    const monthOnly = allData.filter(r => getMonthKey(r.date) === monthKey);

    updateSummaryCards(filtered, monthKey);
    updateCreatorStats(filtered);
    updateStatusPlatformStats(filtered);
    updateCalendarView(filtered, monthOnly, monthKey);
    updateInsights(filtered, monthKey);
    updateTable(filtered);
    updateCharts(filtered);
    updateSummaryText(filtered, {
        monthLabel,
        creator: $("creatorFilter").value,
        statusFilterVal: $("statusFilter").value,
        platformLabel: selectedPlatform
    });

    saveState();
}

// Summary Cards
function updateSummaryCards(data, monthKey) {
    const total = data.length;
    let completed = 0, inProgress = 0, pending = 0;

    data.forEach(r => {
        const s = normalizeStatus(r.status);
        if (COMPLETED_STATUSES.includes(s)) completed++;
        else if (INPROGRESS_STATUSES.includes(s)) inProgress++;
        else if (PENDING_STATUSES.includes(s)) pending++;
    });

    $("totalItems").textContent = String(total);
    $("completedItems").textContent = String(completed);
    $("inProgressItems").textContent = String(inProgress);
    $("pendingItems").textContent = String(pending);

    const base = total || 1;
    const completedPct = Math.round((completed / base) * 100);
    const inProgressPct = Math.round((inProgress / base) * 100);
    const pendingPct = Math.round((pending / base) * 100);

    $("completedPct").textContent = `${completedPct}%`;
    $("inProgressPct").textContent = `${inProgressPct}%`;
    $("pendingPct").textContent = `${pendingPct}%`;

    const [y, m] = monthKey.split("-").map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    $("totalItemsPerDay").textContent = (total ? (total / daysInMonth) : 0).toFixed(1);

    updateTargetSummary(total, daysInMonth);

    $("totalItemsBar").style.width = (Math.min(1, total / (monthlyTarget || 1)) * 100) + "%";
    $("completedBar").style.width = completedPct + "%";
    $("inProgressBar").style.width = inProgressPct + "%";
    $("pendingBar").style.width = pendingPct + "%";

    updateConsistencyText(data, daysInMonth);
    updateAlert(total, completed, inProgress, pending);
}

function updateTargetSummary(totalItems, daysInMonth) {
    const remaining = Math.max(0, monthlyTarget - totalItems);
    const pct = monthlyTarget ? Math.round((totalItems / monthlyTarget) * 100) : 0;
    const monthFilterVal = $("monthFilter").value || "";
    const [y, m] = monthFilterVal.split("-").map(Number);
    const today = new Date();
    let remainingDays = daysInMonth;
    if (today.getFullYear() === y && (today.getMonth() + 1) === m) {
        remainingDays = Math.max(0, daysInMonth - today.getDate() + 1);
    }
    const neededPerDay = remainingDays > 0 ? (remaining / remainingDays) : remaining;
    $("targetSummary").textContent = `${totalItems}/${monthlyTarget} • ${pct}% • ${remaining} left (${neededPerDay.toFixed(1)}/day)`;
}

function updateConsistencyText(data, daysInMonth) {
    const el = $("consistencyText");
    if (!data.length) { el.textContent = "No activity recorded for this view."; return; }
    const daySet = new Set(data.map(r => r.date.getDate()));
    const postingDays = daySet.size;
    const daysSorted = Array.from(daySet).sort((a, b) => a - b);
    let longest = 0, cur = 0, prev = null;
    daysSorted.forEach(d => {
        cur = (prev === null || d === prev + 1) ? cur + 1 : 1;
        longest = Math.max(longest, cur);
        prev = d;
    });
    el.textContent = `📊 Consistency: ${postingDays}/${daysInMonth} days • 🔥 Streak ${longest} day${longest !== 1 ? "s" : ""}.`;
}

function updateAlert(total, completed, inProgress, pending) {
    const el = $("insightAlert");
    if (!total) { el.className = "alert"; el.innerHTML = "No items match this view. Try Reset."; return; }
    const completedRate = completed / total;
    const pendingRate = pending / total;
    if (completedRate >= 0.6 && pendingRate <= 0.25) {
        el.className = "alert good";
        el.innerHTML = `🎯 <strong>Healthy pipeline.</strong> Done ${(completedRate * 100).toFixed(0)}% • Pending ${(pendingRate * 100).toFixed(0)}%.`;
    } else if (pendingRate >= 0.4) {
        el.className = "alert bad";
        el.innerHTML = `⚠️ <strong>Backlog risk.</strong> Pending ${(pendingRate * 100).toFixed(0)}% — push edits.`;
    } else {
        el.className = "alert warn";
        el.innerHTML = `📝 <strong>Mixed state.</strong> Done ${(completedRate * 100).toFixed(0)}% • In edit ${(inProgress / total * 100).toFixed(0)}%.`;
    }
}

// Stats Updates
function updateCreatorStats(data) {
    const container = $("creatorStats");
    container.innerHTML = "";
    const counts = {};
    data.forEach(r => {
        const name = r.creator || "Unassigned";
        counts[name] = counts[name] || { completed: 0, total: 0 };
        counts[name].total++;
        if (COMPLETED_STATUSES.includes(normalizeStatus(r.status))) counts[name].completed++;
    });
    const entries = Object.entries(counts).sort((a, b) => b[1].completed - a[1].completed);
    if (!entries.length) { container.innerHTML = `<li class="list-item"><span class="list-label">No items in this view.</span></li>`; return; }
    const totalCompleted = entries.reduce((s, [, v]) => s + v.completed, 0) || 1;
    entries.forEach(([name, v]) => {
        const pct = Math.round((v.completed / totalCompleted) * 100);
        const li = document.createElement("li");
        li.className = "list-item";
        li.innerHTML = `
      <div>
        <div class="list-label">${escapeHtml(name)}</div>
        <div style="font-size:0.7rem;color:var(--text-muted);margin-top:2px;">${v.completed} done • ${v.total} total • ${pct}% share</div>
      </div>
      <div style="display:flex;gap:6px;align-items:center;">
        <span class="list-count">${v.completed}</span><span class="list-chip">done</span>
      </div>`;
        container.appendChild(li);
    });
}

function updateStatusPlatformStats(data) {
    const statusContainer = $("statusStats");
    const platformContainer = $("platformStats");
    statusContainer.innerHTML = "";
    platformContainer.innerHTML = "";
    const statusCounts = {}, platformCounts = {};
    data.forEach(r => {
        const s = r.status || "Unknown";
        const p = r.platform || "Unassigned";
        statusCounts[s] = (statusCounts[s] || 0) + 1;
        platformCounts[p] = (platformCounts[p] || 0) + 1;
    });
    const total = data.length || 1;
    Object.entries(statusCounts).sort((a, b) => b[1] - a[1]).forEach(([s, c]) => {
        const li = document.createElement("li");
        li.className = "list-item";
        li.innerHTML = `<div><div class="list-label">${escapeHtml(s)}</div><div style="font-size:0.7rem;color:var(--text-muted);margin-top:2px;">${Math.round(c / total * 100)}%</div></div><span class="list-count">${c}</span>`;
        statusContainer.appendChild(li);
    });
    Object.entries(platformCounts).sort((a, b) => b[1] - a[1]).forEach(([p, c]) => {
        const li = document.createElement("li");
        li.className = "list-item";
        li.innerHTML = `<div><div class="list-label">${escapeHtml(p)}</div><div style="font-size:0.7rem;color:var(--text-muted);margin-top:2px;">${Math.round(c / total * 100)}%</div></div><span class="list-count">${c}</span>`;
        platformContainer.appendChild(li);
    });
}

// Calendar
function buildWeekdayHeader() {
    const container = $("calendarWeekdays");
    container.innerHTML = "";
    ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].forEach(l => {
        const div = document.createElement("div");
        div.className = "calendar-weekday";
        div.textContent = l;
        container.appendChild(div);
    });
}

const startDayOffsetMonFirst = (d) => (d.getDay() + 6) % 7;

function summarizeDayStatuses(items) {
    let c = 0, ip = 0, p = 0, o = 0;
    items.forEach(r => {
        const s = normalizeStatus(r.status);
        if (COMPLETED_STATUSES.includes(s)) c++;
        else if (INPROGRESS_STATUSES.includes(s)) ip++;
        else if (PENDING_STATUSES.includes(s)) p++;
        else o++;
    });
    return { c, ip, p, o };
}

function updateCalendarView(filteredData, monthOnlyData, monthKey) {
    const grid = $("calendarGrid");
    $("calendarMonthLabel").textContent = formatMonthLabelFromKey(monthKey);
    buildWeekdayHeader();
    grid.innerHTML = "";

    const [y, m] = monthKey.split("-").map(Number);
    const first = new Date(y, m - 1, 1);
    const daysInMonth = new Date(y, m, 0).getDate();
    const offset = startDayOffsetMonFirst(first);

    const byDay = {};
    filteredData.forEach(r => ((byDay[dateToDayKey(r.date)] ||= []).push(r)));

    const monthCounts = {};
    monthOnlyData.forEach(r => {
        const k = dateToDayKey(r.date);
        monthCounts[k] = (monthCounts[k] || 0) + 1;
    });
    const maxCount = Math.max(1, ...Object.values(monthCounts));

    const todayKey = dateToDayKey(new Date());
    $("calendarHint").innerHTML = selectedDayKey ? `Filtering: <strong>${selectedDayKey}</strong>` : `Click a day to filter.`;

    for (let i = 0; i < offset; i++) {
        const blank = document.createElement("div");
        blank.className = "calendar-cell muted";
        blank.innerHTML = `<div class="calendar-date">&nbsp;</div>`;
        grid.appendChild(blank);
    }

    for (let d = 1; d <= daysInMonth; d++) {
        const dt = new Date(y, m - 1, d);
        const dayKey = dateToDayKey(dt);
        const items = byDay[dayKey] || [];
        const total = items.length;
        const baseCount = monthCounts[dayKey] || 0;
        const intensity = clamp(baseCount / maxCount, 0, 1);

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "calendar-cell";
        if (dayKey === todayKey) btn.classList.add("today");
        if (selectedDayKey === dayKey) btn.classList.add("active");

        const heat = document.createElement("div");
        heat.className = "heat";
        heat.style.opacity = (0.05 + intensity * 0.3).toFixed(2);
        btn.appendChild(heat);

        const inner = document.createElement("div");
        inner.style.position = "relative";
        inner.style.zIndex = "1";
        inner.innerHTML = `
      <div class="calendar-date">${d}</div>
      <div class="calendar-count">${total || ""}</div>
    `;
        btn.appendChild(inner);

        btn.addEventListener("click", () => {
            selectedDayKey = (selectedDayKey === dayKey) ? "" : dayKey;
            saveState();
            renderDashboard();
        });
        btn.addEventListener("mousemove", (e) => showTooltip(e.clientX, e.clientY, tooltipHtml(dayKey, baseCount, total, summarizeDayStatuses(items))));
        btn.addEventListener("mouseleave", hideTooltip);

        grid.appendChild(btn);
    }
}

function tooltipHtml(dayKey, monthTotal, total, stats) {
    return `
    <div><strong>${dayKey}</strong></div>
    <div style="margin-top:8px;">Month total: <strong>${monthTotal}</strong></div>
    <div>In view: <strong>${total}</strong></div>
    <div style="margin-top:4px;">✅ Done: ${stats.c} | 🔵 Edit: ${stats.ip}</div>
    <div>🟠 Pending: ${stats.p} | ⚪ Other: ${stats.o}</div>
  `;
}

function showTooltip(x, y, html) {
    const tip = $("tooltip");
    tip.innerHTML = html;
    const margin = 12;
    const w = tip.offsetWidth, h = tip.offsetHeight;
    let left = x + margin, top = y + margin;
    if (left + w > window.innerWidth - margin) left = x - w - margin;
    if (top + h > window.innerHeight - margin) top = y - h - margin;
    tip.style.transform = `translate(${left}px, ${top}px)`;
}

function hideTooltip() {
    $("tooltip").style.transform = "translate(-9999px,-9999px)";
}

// Insights
function updateInsights(data, monthKey) {
    const list = $("insightsList");
    const tag = $("insightsTag");
    list.innerHTML = "";
    tag.textContent = selectedDayKey ? `Day ${selectedDayKey}` : formatMonthLabelFromKey(monthKey);

    if (!data.length) { list.innerHTML = `<li class="list-item"><div class="list-label">No insights.</div><span class="list-chip">Empty</span></li>`; return; }

    let completed = 0, inEdit = 0, pending = 0;
    const creatorCompleted = {}, platformCounts = {}, dayCounts = {};

    data.forEach(r => {
        const st = normalizeStatus(r.status);
        if (COMPLETED_STATUSES.includes(st)) completed++;
        else if (INPROGRESS_STATUSES.includes(st)) inEdit++;
        else if (PENDING_STATUSES.includes(st)) pending++;

        const cr = r.creator || "Unassigned";
        creatorCompleted[cr] = creatorCompleted[cr] || 0;
        if (COMPLETED_STATUSES.includes(st)) creatorCompleted[cr]++;

        const pl = r.platform || "Unassigned";
        platformCounts[pl] = (platformCounts[pl] || 0) + 1;

        const dk = dateToDayKey(r.date);
        dayCounts[dk] = (dayCounts[dk] || 0) + 1;
    });

    const total = data.length;
    const completionRate = total ? completed / total : 0;
    const pendingRate = total ? pending / total : 0;
    const activeDays = Object.keys(dayCounts).length || 1;
    const velocity = completed / activeDays;

    const topCreator = Object.entries(creatorCompleted).sort((a, b) => b[1] - a[1])[0] || ["–", 0];
    const topPlatform = Object.entries(platformCounts).sort((a, b) => b[1] - a[1])[0] || ["–", 0];

    let riskText = "Low", emoji = "✅";
    if (pendingRate >= 0.45) { riskText = "High"; emoji = "🔴"; }
    else if (pendingRate >= 0.30) { riskText = "Medium"; emoji = "🟠"; }

    const items = [
        ["🏆 Top Creator", `${escapeHtml(topCreator[0])} • ${topCreator[1]} done`],
        ["📱 Top Platform", `${escapeHtml(topPlatform[0])} • ${topPlatform[1]} items`],
        ["⚡ Velocity", `${velocity.toFixed(2)} done/active day`],
        ["✅ Completion", `${(completionRate * 100).toFixed(0)}%`],
        [`${emoji} Backlog Risk`, `${riskText} • ${(pendingRate * 100).toFixed(0)}% pending`],
    ];

    items.forEach(([k, v]) => {
        const li = document.createElement("li");
        li.className = "list-item";
        li.innerHTML = `<div><div class="list-label">${k}</div><div style="font-size:0.7rem;color:var(--text-secondary);margin-top:2px;">${v}</div></div><span class="list-chip">Insight</span>`;
        list.appendChild(li);
    });
}

// Table
function sortRows(data) {
    const arr = [...data];
    const safe = (x) => (x || "").toString().toLowerCase();
    arr.sort((a, b) => {
        if (sortMode === "date-desc") return b.date - a.date;
        if (sortMode === "date-asc") return a.date - b.date;
        if (sortMode === "creator-asc") return safe(a.creator).localeCompare(safe(b.creator));
        if (sortMode === "platform-asc") return safe(a.platform).localeCompare(safe(b.platform));
        if (sortMode === "status-asc") return safe(a.status).localeCompare(safe(b.status));
        return b.date - a.date;
    });
    return arr;
}

function updateTable(data) {
    const tbody = $("tableBody");
    $("rowCount").textContent = String(data.length);
    tbody.innerHTML = "";
    if (!data.length) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:var(--text-muted);padding:24px;">No items match this view.</td></tr>`;
        return;
    }

    sortRows(data).forEach(row => {
        const linkText = (row.DropboxLink_Script || "").toString().trim();
        const isScriptReady = linkText.toLowerCase() === "yes";
        const linkCell = isScriptReady
            ? `<span class="tag">✓ Script Ready</span>`
            : (isProbablyUrl(linkText)
                ? `<a class="tag" href="${escapeAttr(linkText)}" target="_blank" rel="noopener noreferrer">${escapeHtml(shorten(linkText, 30))}</a>`
                : `<span class="tag" title="${escapeAttr(linkText || "-")}">${escapeHtml(shorten(linkText || "-", 30))}</span>`);

        const tr = document.createElement("tr");
        tr.innerHTML = `
      <td>${formatDateDisplay(row.date)}</td>
      <td>${escapeHtml(row.creator || "-")}</td>
      <td>${escapeHtml(row.videoType || "-")}</td>
      <td>${escapeHtml(row.platform || "-")}</td>
      <td>${escapeHtml(row.location || "-")}</td>
      <td>${escapeHtml(row.topic || "-")}</td>
      <td>${linkCell}</td>
      <td><span class="status-pill ${getStatusClass(row.status)}">${escapeHtml(row.status || "-")}</span></td>
      <td title="${escapeAttr(row.caption)}">${escapeHtml(shorten(row.caption, 50) || "-")}</td>`;
        tbody.appendChild(tr);
    });
}

// Export CSV
function exportCurrentViewCsv() {
    const monthKey = $("monthFilter").value || months[months.length - 1];
    const current = getFilteredRows();

    const rows = sortRows(current).map(r => [
        dateToDayKey(r.date),
        r.creator || "", r.videoType || "", r.platform || "", r.location || "",
        r.topic || "", r.DropboxLink_Script || "", r.status || "", r.caption || ""
    ]);

    const csv = toCsv([["Date", "Creator", "Video Type", "Platform", "Location", "Topic", "Dropbox/Script", "Status", "Caption"], ...rows]);
    const filename = `content_log_${monthKey}${selectedDayKey ? "_" + selectedDayKey : ""}.csv`;

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
}

function toCsv(rows) {
    return rows.map(r => r.map(cell => {
        const s = (cell ?? "").toString().replace(/"/g, '""');
        return /[",\n]/.test(s) ? `"${s}"` : s;
    }).join(",")).join("\n");
}

// Charts
function updateCharts(data) {
    const creatorCounts = {}, platformCounts = {}, typeCounts = {};
    data.forEach(r => {
        creatorCounts[r.creator || "Unassigned"] = (creatorCounts[r.creator || "Unassigned"] || 0) + 1;
        platformCounts[r.platform || "Unassigned"] = (platformCounts[r.platform || "Unassigned"] || 0) + 1;
        typeCounts[r.videoType || "Other"] = (typeCounts[r.videoType || "Other"] || 0) + 1;
    });

    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    const gridColor = isDark ? "rgba(148,163,184,0.15)" : "rgba(148,163,184,0.2)";
    const textColor = isDark ? "#94a3b8" : "#64748b";

    const commonOpts = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
            x: { grid: { color: gridColor }, ticks: { color: textColor } },
            y: { grid: { color: gridColor }, ticks: { color: textColor, precision: 0 }, beginAtZero: true }
        }
    };

    const safeUpdate = (instance, ctx, config) => {
        if (instance && instance.canvas && instance.canvas.isConnected) {
            instance.data.labels = config.data.labels;
            instance.data.datasets[0].data = config.data.datasets[0].data;
            instance.options = config.options;
            instance.update();
            return instance;
        }
        if (instance) instance.destroy();
        return new Chart(ctx, config);
    };

    creatorChartInstance = safeUpdate(creatorChartInstance, $("creatorChart").getContext("2d"), {
        type: "bar",
        data: { labels: Object.keys(creatorCounts), datasets: [{ data: Object.values(creatorCounts), borderWidth: 0, borderRadius: 8, backgroundColor: "rgba(99, 102, 241, 0.6)" }] },
        options: commonOpts
    });

    platformChartInstance = safeUpdate(platformChartInstance, $("platformChart").getContext("2d"), {
        type: "bar",
        data: { labels: Object.keys(platformCounts), datasets: [{ data: Object.values(platformCounts), borderWidth: 0, borderRadius: 8, backgroundColor: "rgba(34, 197, 94, 0.6)" }] },
        options: { ...commonOpts, indexAxis: "y" }
    });

    typeChartInstance = safeUpdate(typeChartInstance, $("typeChart").getContext("2d"), {
        type: "bar",
        data: { labels: Object.keys(typeCounts), datasets: [{ data: Object.values(typeCounts), borderWidth: 0, borderRadius: 8, backgroundColor: "rgba(139, 92, 246, 0.6)" }] },
        options: commonOpts
    });
}

// Summary Text
function getStatusFilterLabel(val) {
    if (!val) return "all";
    if (val === "completed") return "completed";
    if (val === "in-progress") return "in-edit";
    if (val === "pending") return "pending";
    if (val === "other") return "other";
    return "all";
}

function updateSummaryText(data, ctx) {
    const el = $("autoSummary");
    if (!data.length) { el.textContent = "No content found for these filters."; return; }
    const total = data.length;
    let completed = 0;
    const platformCounts = {}, topicCounts = {};
    data.forEach(r => {
        if (COMPLETED_STATUSES.includes(normalizeStatus(r.status))) completed++;
        const pl = r.platform || "Unassigned"; platformCounts[pl] = (platformCounts[pl] || 0) + 1;
        const tp = r.topic || "Unspecified"; topicCounts[tp] = (topicCounts[tp] || 0) + 1;
    });
    const mainPlatform = Object.entries(platformCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
    const topTopic = Object.entries(topicCounts).sort((a, b) => b[1] - a[1])[0]?.[0];

    const creatorText = ctx.creator ? ` for <strong>${escapeHtml(ctx.creator)}</strong>` : "";
    const statusText = getStatusFilterLabel(ctx.statusFilterVal);
    const platformText = ctx.platformLabel ? ` on <strong>${escapeHtml(ctx.platformLabel)}</strong>` : (mainPlatform ? ` • mostly <strong>${escapeHtml(mainPlatform)}</strong>` : "");
    const dayText = selectedDayKey ? ` • day <strong>${selectedDayKey}</strong>` : "";

    el.innerHTML =
        `📅 In <strong>${ctx.monthLabel}</strong>${creatorText}: <strong>${total}</strong> items, <strong>${completed}</strong> done (${Math.round((completed / total) * 100)}%). ` +
        `Filters: <strong>${statusText}</strong>${platformText}${dayText}.` +
        (topTopic ? ` 🎯 Top topic: <strong>${escapeHtml(topTopic)}</strong>.` : "");
}

// Helpers
function escapeHtml(str) {
    return (str ?? "").toString()
        .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
function escapeAttr(str) { return escapeHtml(str).replaceAll("`", "&#096;"); }
function shorten(s, n) { s = (s ?? "").toString(); return s.length <= n ? s : s.slice(0, n - 1) + "…"; }
function isProbablyUrl(s) { try { const u = new URL((s || "").trim()); return u.protocol === "http:" || u.protocol === "https:"; } catch { return false; } }

// Markdown to HTML Parser for AI Output
function parseMarkdown(text) {
    if (!text) return "";

    let html = escapeHtml(text);

    // Code blocks (```code```)
    html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (match, lang, code) => {
        return `<pre class="ai-code-block"><code>${code.trim()}</code></pre>`;
    });

    // Inline code (`code`)
    html = html.replace(/`([^`]+)`/g, '<code class="ai-inline-code">$1</code>');

    // Bold (**text** or __text__)
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');

    // Italic (*text* or _text_)
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    html = html.replace(/_([^_]+)_/g, '<em>$1</em>');

    // Headers (### text)
    html = html.replace(/^### (.+)$/gm, '<h4 class="ai-heading">$1</h4>');
    html = html.replace(/^## (.+)$/gm, '<h3 class="ai-heading">$1</h3>');
    html = html.replace(/^# (.+)$/gm, '<h2 class="ai-heading">$1</h2>');

    // Unordered lists (- item or * item)
    html = html.replace(/^[\-\*] (.+)$/gm, '<li class="ai-list-item">$1</li>');

    // Ordered lists (1. item)
    html = html.replace(/^\d+\. (.+)$/gm, '<li class="ai-list-item ai-ordered">$1</li>');

    // Wrap consecutive list items
    html = html.replace(/(<li class="ai-list-item">[\s\S]*?<\/li>)(\s*<li class="ai-list-item">)/g, '$1$2');
    html = html.replace(/(<li class="ai-list-item">[^<]*<\/li>(\s*)?)+/g, (match) => {
        if (match.includes('ai-ordered')) {
            return `<ol class="ai-list">${match}</ol>`;
        }
        return `<ul class="ai-list">${match}</ul>`;
    });

    // Horizontal rule (---)
    html = html.replace(/^---$/gm, '<hr class="ai-divider">');

    // Line breaks
    html = html.replace(/\n\n/g, '</p><p class="ai-paragraph">');
    html = html.replace(/\n/g, '<br>');

    // Wrap in paragraph
    html = `<p class="ai-paragraph">${html}</p>`;

    // Clean up empty paragraphs
    html = html.replace(/<p class="ai-paragraph"><\/p>/g, '');
    html = html.replace(/<p class="ai-paragraph">(<[huo])/g, '$1');
    html = html.replace(/(<\/[huo][^>]*>)<\/p>/g, '$1');

    return html;
}

// AI Workbench - Chat UI
let aiMode = "caption";
let lastAiOutput = "";

function initAi() {
    const modes = ["caption", "script", "hook", "calendar", "ideas", "fix", "sop"];
    const modeLabels = { caption: "📝 Captions", script: "🎬 Scripts", hook: "💥 Hooks", calendar: "📅 30-day Plan", ideas: "💡 Ideas", fix: "🔧 Fixer", sop: "🎓 SOP Writer" };
    const modeEmojis = { caption: "📝", script: "🎬", hook: "💥", calendar: "📅", ideas: "💡", fix: "🔧", sop: "🎓" };

    const metaEl = $("aiMeta");
    const modeBadge = $("aiModeBadge");
    const statusBadge = $("aiStatusBadge");
    const messagesContainer = $("aiMessages");

    // Panel elements
    const contentPanel = $("contentContextPanel");
    const sopPanel = $("sopContextPanel");

    // Mode buttons
    modes.forEach(m => {
        const btn = $(`aiTab${m.charAt(0).toUpperCase() + m.slice(1)}`);
        if (!btn) return;
        btn.addEventListener("click", () => {
            aiMode = m;
            modes.forEach(mm => {
                const b = $(`aiTab${mm.charAt(0).toUpperCase() + mm.slice(1)}`);
                if (b) b.classList.toggle("active", mm === aiMode);
            });
            if (metaEl) metaEl.textContent = `Out of Galaxy Creativity • Powered by Srijan Dona Mind AI`;
            if (modeBadge) modeBadge.textContent = modeLabels[aiMode];

            // Switch panels based on mode
            if (m === "sop") {
                if (contentPanel) contentPanel.style.display = "none";
                if (sopPanel) sopPanel.style.display = "flex";
            } else {
                if (contentPanel) contentPanel.style.display = "flex";
                if (sopPanel) sopPanel.style.display = "none";
            }
        });
    });

    const genBtn = $("aiGenerateBtn");
    const copyBtn = $("aiCopyBtn");
    const promptInput = $("aiPrompt");
    const sopGenBtn = $("sopGenerateBtn");

    // SOP Generate button
    if (sopGenBtn) {
        sopGenBtn.addEventListener("click", () => {
            handleSopGenerate();
        });
    }

    // Generate button
    if (genBtn) genBtn.addEventListener("click", handleAiGenerate);

    // Copy button
    if (copyBtn) {
        copyBtn.addEventListener("click", () => {
            if (!lastAiOutput.trim()) {
                showToast("Nothing to copy");
                return;
            }
            navigator.clipboard?.writeText(lastAiOutput).then(() => {
                showToast("✅ Copied to clipboard!");
            }).catch(() => {
                showToast("Copy failed");
            });
        });
    }

    // Enter to send (Shift+Enter for new line)
    if (promptInput) {
        promptInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleAiGenerate();
            }
        });
        // Auto-resize textarea
        promptInput.addEventListener("input", () => {
            promptInput.style.height = "auto";
            promptInput.style.height = Math.min(promptInput.scrollHeight, 200) + "px";
        });
    }

    // Quick prompt buttons
    document.querySelectorAll(".ai-quick-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const prompt = btn.getAttribute("data-prompt");
            if (promptInput && prompt) {
                promptInput.value = prompt;
                promptInput.style.height = "auto";
                promptInput.style.height = Math.min(promptInput.scrollHeight, 200) + "px";
                promptInput.focus();
            }
        });
    });

    // Example buttons
    document.querySelectorAll(".ai-example-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const prompt = btn.getAttribute("data-prompt");
            if (promptInput && prompt) {
                promptInput.value = prompt;
                promptInput.style.height = "auto";
                promptInput.style.height = Math.min(promptInput.scrollHeight, 200) + "px";
                handleAiGenerate();
            }
        });
    });
}

function showToast(message) {
    // Remove any existing toast
    const existingToast = document.querySelector('.toast');
    if (existingToast) existingToast.remove();

    // Create new toast
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    // Trigger animation
    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    // Remove after 3 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
    }, 3000);
}

function addChatMessage(content, type = "assistant") {
    const messagesContainer = $("aiMessages");
    if (!messagesContainer) return;

    // Remove welcome message if exists
    const welcomeMsg = messagesContainer.querySelector(".ai-welcome-message");
    if (welcomeMsg) welcomeMsg.remove();

    const messageDiv = document.createElement("div");
    messageDiv.className = `ai-message ${type}`;

    if (type === "user") {
        messageDiv.innerHTML = `<div class="ai-message-content">${escapeHtml(content)}</div>`;
    } else {
        // Parse markdown for AI responses
        const formattedContent = parseMarkdown(content);
        messageDiv.innerHTML = `
            <div class="ai-message-header">
                <span class="ai-avatar-small">🤖</span>
                <span>Srijan's Mind AI</span>
                <button class="ai-copy-message" onclick="copyMessageContent(this)" title="Copy this response">📋</button>
            </div>
            <div class="ai-message-content ai-formatted">${formattedContent}</div>
        `;
    }

    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function copyMessageContent(btn) {
    const messageContent = btn.closest('.ai-message').querySelector('.ai-message-content');
    if (!messageContent) return;

    const text = messageContent.innerText || messageContent.textContent;
    navigator.clipboard?.writeText(text).then(() => {
        const originalText = btn.textContent;
        btn.textContent = "✅";
        setTimeout(() => { btn.textContent = originalText; }, 1500);
    });
}

function showLoadingMessage() {
    const messagesContainer = $("aiMessages");
    if (!messagesContainer) return;

    const loadingDiv = document.createElement("div");
    loadingDiv.className = "ai-loading";
    loadingDiv.id = "aiLoadingMessage";
    loadingDiv.innerHTML = `
        <div class="ai-loading-dots">
            <span></span><span></span><span></span>
        </div>
        <span>Generating content...</span>
    `;
    messagesContainer.appendChild(loadingDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function removeLoadingMessage() {
    const loading = $("aiLoadingMessage");
    if (loading) loading.remove();
}

function updateStatusBadge(status, isLoading = false) {
    const statusBadge = $("aiStatusBadge");
    if (!statusBadge) return;

    if (isLoading) {
        statusBadge.innerHTML = `<span class="ai-status-dot" style="background: var(--accent); animation: pulse 0.5s ease-in-out infinite;"></span>Generating...`;
        statusBadge.style.background = "var(--accent-light)";
        statusBadge.style.borderColor = "rgba(99, 102, 241, 0.2)";
        statusBadge.style.color = "var(--accent)";
    } else {
        statusBadge.innerHTML = `<span class="ai-status-dot"></span>${status}`;
        statusBadge.style.background = "rgba(34, 197, 94, 0.1)";
        statusBadge.style.borderColor = "rgba(34, 197, 94, 0.2)";
        statusBadge.style.color = "var(--good)";
    }
}

// Handle SOP Generation from form fields
async function handleSopGenerate() {
    const sopGenBtn = $("sopGenerateBtn");

    // Collect all SOP form fields
    const name = $("sopName")?.value?.trim() || "";
    const age = $("sopAge")?.value?.trim() || "";
    const education = $("sopEducation")?.value?.trim() || "";
    const gpa = $("sopGpa")?.value?.trim() || "";
    const country = $("sopCountry")?.value || "";
    const university = $("sopUniversity")?.value?.trim() || "";
    const course = $("sopCourse")?.value?.trim() || "";
    const englishScore = $("sopEnglishScore")?.value?.trim() || "";
    const workExp = $("sopWorkExp")?.value?.trim() || "";
    const goals = $("sopGoals")?.value?.trim() || "";
    const whyCountry = $("sopWhyCountry")?.value?.trim() || "";
    const family = $("sopFamily")?.value?.trim() || "";
    const extras = $("sopExtras")?.value?.trim() || "";

    // Validate required fields
    if (!name || !education || !country || !university || !course) {
        showToast("Please fill required fields: Name, Education, Country, University, Course");
        return;
    }

    // Build the SOP prompt from form data
    let sopPrompt = `Write a complete Statement of Purpose (SOP) for a Nepali student with the following details:\n\n`;
    sopPrompt += `**Student Information:**\n`;
    sopPrompt += `- Full Name: ${name}\n`;
    if (age) sopPrompt += `- Age: ${age} years old\n`;
    sopPrompt += `- Current Education: ${education}\n`;
    if (gpa) sopPrompt += `- Academic Score: ${gpa}\n`;
    if (englishScore) sopPrompt += `- English Proficiency: ${englishScore}\n`;

    sopPrompt += `\n**Application Details:**\n`;
    sopPrompt += `- Destination Country: ${country}\n`;
    sopPrompt += `- University: ${university}\n`;
    sopPrompt += `- Course/Program: ${course}\n`;

    if (workExp) {
        sopPrompt += `\n**Work Experience:**\n${workExp}\n`;
    }

    if (goals) {
        sopPrompt += `\n**Career Goals:**\n${goals}\n`;
    }

    if (whyCountry) {
        sopPrompt += `\n**Why This Country/University:**\n${whyCountry}\n`;
    }

    if (family) {
        sopPrompt += `\n**Family Background:**\n${family}\n`;
    }

    if (extras) {
        sopPrompt += `\n**Extracurricular Activities:**\n${extras}\n`;
    }

    sopPrompt += `\n**Instructions:**
- Write a compelling 800-1000 word SOP
- Include a strong opening hook with personal motivation
- Highlight academic achievements and relevance to the chosen course
- Emphasize career goals and how this degree helps achieve them
- Include reasons for choosing this specific university and country
- Address intention to return to Nepal after studies (important for visa)
- Use professional yet personal tone
- Make it unique and avoid generic statements`;

    // Set the prompt and trigger generation
    const promptInput = $("aiPrompt");
    if (promptInput) {
        promptInput.value = sopPrompt;
    }

    // Add user message showing summary
    addChatMessage(`Generate SOP for ${name} applying to ${course} at ${university}, ${country}`, "user");

    // Show loading
    updateStatusBadge("Generating SOP...", true);
    showLoadingMessage();
    if (sopGenBtn) sopGenBtn.disabled = true;

    // AI Configuration
    const apiBase = "https://api.groq.com/openai/v1/chat/completions";
    const model = "llama-3.1-8b-instant";
    const apiKey = process.env.GROQ_API_KEY; // Best practice: use env variable

    const messages = buildAiMessages();
    const body = { model, messages, temperature: 0.7, max_tokens: 4000 };

    try {
        const headers = { "Content-Type": "application/json" };
        if (apiKey) headers["Authorization"] = "Bearer " + apiKey;

        const res = await fetch(apiBase, { method: "POST", headers, body: JSON.stringify(body) });

        removeLoadingMessage();

        if (!res.ok) {
            const text = await res.text().catch(() => res.statusText);
            addChatMessage(`Error ${res.status}: ${text.slice(0, 200)}`, "assistant");
            updateStatusBadge("Error", false);
            return;
        }

        const data = await res.json();
        let content = "";
        if (Array.isArray(data.choices) && data.choices[0]?.message?.content) {
            content = data.choices[0].message.content;
        } else if (data.output) {
            content = data.output;
        } else {
            content = JSON.stringify(data, null, 2);
        }

        lastAiOutput = content || "(empty response)";
        addChatMessage(lastAiOutput, "assistant");
        updateStatusBadge("Ready", false);
    } catch (err) {
        console.error(err);
        removeLoadingMessage();
        addChatMessage(`Request failed: ${err.message || "Network error"}`, "assistant");
        updateStatusBadge("Error", false);
    } finally {
        if (sopGenBtn) sopGenBtn.disabled = false;
    }
}

function buildAiMessages() {
    const niche = $("aiNiche")?.value?.trim() || "";
    const platform = $("aiPlatform")?.value?.trim() || "";
    const tone = $("aiTone")?.value?.trim() || "";
    const length = $("aiLength")?.value || "medium";
    const brand = $("aiBrandMemory")?.value?.trim() || "";
    const prompt = $("aiPrompt")?.value?.trim() || "";

    const lengthText = length === "short" ? "Keep outputs very concise." :
        length === "long" ? "You may write in more depth where helpful." :
            "Keep outputs balanced in length.";

    const modeInstructions = {
        caption: "You write multiple social media captions optimized for engagement (hooks, CTAs, relatable tone). Return bullet points or numbered list.",
        script: "You write short-form video scripts (Reels/TikTok/Shorts) with hook, body and CTA. Keep them punchy and spoken-language friendly.",
        hook: "You generate only hooks/headlines that stop scroll. Make them sharp, curiosity-driven and niche-specific.",
        calendar: "You create a 30-day content calendar. Return a structured list with Day, Topic, Angle and suggested format. Keep it compact but clear.",
        ideas: "You generate a bank of specific, non-generic content ideas. Each idea should be clear enough to brief a creator.",
        fix: "You improve or rewrite the provided text to match the requested tone and platform. Show before/after if useful.",
        sop: `You are an expert Statement of Purpose (SOP) writer specializing in helping Nepali students apply to universities abroad.

**Your task is to write a compelling, personalized SOP based on the student's details provided.**

**SOP Structure to follow:**
1. **Opening Hook** - A compelling personal story or motivation that grabs attention
2. **Academic Background** - Educational journey, achievements, relevant coursework
3. **Professional/Work Experience** - Internships, jobs, projects, skills gained
4. **Why This Field/Course** - Passion, interest development, career relevance
5. **Why This University/Country** - Specific reasons (faculty, research, opportunities)
6. **Career Goals** - Short-term and long-term goals, how the degree helps achieve them
7. **Why You'll Return to Nepal** - Contribution to home country (important for visa)
8. **Closing** - Strong conclusion reiterating commitment and fit

**Important Guidelines:**
- Write in first person, professional yet personal tone
- Be specific - avoid generic statements
- Show genuine motivation and clear goals
- Address visa officer concerns (genuine student, will return home)
- Keep it 800-1000 words unless specified otherwise
- Use proper paragraph formatting
- Make it unique to the student's story

**For the prompt, expect details like:**
- Name, Age, Current education
- Country & University applying to
- Course/Program name
- Work experience/Internships
- Academic scores (GPA, IELTS/PTE/TOEFL)
- Career goals
- Why this specific country/university
- Family background (optional)
- Extracurricular activities

If details are incomplete, write based on what's provided and add [PLACEHOLDER] for missing critical info.`
    };

    // Different system prompt for SOP mode
    const basePrompt = aiMode === "sop"
        ? "You are an expert SOP writer for Nepali students applying to study abroad. Write professional, compelling, and visa-friendly Statements of Purpose."
        : "You are an elite content strategist and copywriter for short-form and social content. You speak clearly, avoid fluff, and format results for easy copy-paste.";

    const systemParts = [
        basePrompt,
        modeInstructions[aiMode] || "",
        aiMode !== "sop" ? lengthText : ""
    ];

    if (niche) systemParts.push(`The niche/offer is: ${niche}.`);
    if (platform) systemParts.push(`The main platform is: ${platform}. Adjust style accordingly.`);
    if (tone) systemParts.push(`Desired tone: ${tone}.`);
    if (brand) systemParts.push(`Brand rules / memory: ${brand}. Follow these closely.`);

    return [
        { role: "system", content: systemParts.join(" ") },
        { role: "user", content: prompt || "Generate useful suggestions for this mode even if the prompt is light." }
    ];
}

async function handleAiGenerate() {
    const genBtn = $("aiGenerateBtn");
    const promptInput = $("aiPrompt");
    const userPrompt = promptInput?.value?.trim() || "";

    if (!userPrompt) {
        showToast("Please enter a prompt");
        return;
    }

    // AI Configuration (hidden from frontend)
    const apiBase = "https://api.groq.com/openai/v1/chat/completions";
    const model = "llama-3.1-8b-instant";
    const apiKey = ""; // USER MUST PROVIDE API KEY HERE

    // Add user message to chat
    addChatMessage(userPrompt, "user");

    // Clear input
    if (promptInput) {
        promptInput.value = "";
        promptInput.style.height = "auto";
    }

    // Show loading state
    updateStatusBadge("Generating...", true);
    showLoadingMessage();
    if (genBtn) genBtn.disabled = true;

    const messages = buildAiMessages();
    const body = { model, messages, temperature: 0.8 };

    try {
        const headers = { "Content-Type": "application/json" };
        if (apiKey) headers["Authorization"] = "Bearer " + apiKey;

        const res = await fetch(apiBase, { method: "POST", headers, body: JSON.stringify(body) });

        removeLoadingMessage();

        if (!res.ok) {
            const text = await res.text().catch(() => res.statusText);
            addChatMessage(`Error ${res.status}: ${text.slice(0, 200)}`, "assistant");
            updateStatusBadge("Error", false);
            return;
        }

        const data = await res.json();
        let content = "";
        if (Array.isArray(data.choices) && data.choices[0]?.message?.content) {
            content = data.choices[0].message.content;
        } else if (data.output) {
            content = data.output;
        } else {
            content = JSON.stringify(data, null, 2);
        }

        lastAiOutput = content || "(empty response)";
        addChatMessage(lastAiOutput, "assistant");
        updateStatusBadge("Ready", false);
    } catch (err) {
        console.error(err);
        removeLoadingMessage();
        addChatMessage(`Request failed: ${err.message || "Network error"}`, "assistant");
        updateStatusBadge("Error", false);
    } finally {
        if (genBtn) genBtn.disabled = false;
    }
}

// Initialize
async function init() {
    initTheme();
    allData = await fetchSheetData();
    if (!allData.length) return;
    buildFilters();
    renderDashboard();
}

document.addEventListener("DOMContentLoaded", () => {
    init();
    initAi();
});
