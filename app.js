(() => {
  "use strict";

  /* ============================================================
     Constants
     ============================================================ */
  const COLORS = ["#ffab3d","#4fd1c5","#818cf8","#f472b6","#4ade80","#fb923c","#60a5fa","#facc15","#f87171","#a78bfa"];
  const MONTH_NAMES = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  const DAY_LETTERS = ["S","M","T","W","T","F","S"];
  const ROLL_WINDOW = 7;
  const MIN_CHART_H = 150;
  const MAX_CHART_H = 520;

  const PROFILES_KEY = "disciplineLog.profiles.v1";
  const ACTIVE_PROFILE_KEY = "disciplineLog.activeProfile.v1";
  const stateKeyFor = (id) => `disciplineLog.v1.${id}`;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* ============================================================
     Date helpers
     ============================================================ */
  const today = new Date();
  today.setHours(0,0,0,0);

  function pad(n){ return String(n).padStart(2,"0"); }
  function keyFor(y,m,d){ return `${y}-${pad(m+1)}-${pad(d)}`; }
  function keyForDate(dt){ return keyFor(dt.getFullYear(), dt.getMonth(), dt.getDate()); }
  function daysInMonth(y,m){ return new Date(y, m+1, 0).getDate(); }
  function isToday(y,m,d){ return y===today.getFullYear() && m===today.getMonth() && d===today.getDate(); }
  function isFuture(y,m,d){ return new Date(y,m,d) > today; }
  function addDays(dt, n){ const d = new Date(dt); d.setDate(d.getDate()+n); return d; }
  function escapeHtml(s){
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  /* ============================================================
     Profiles (local, device-only — no password / no server)
     ============================================================ */
  function loadProfiles(){
    try{
      const raw = localStorage.getItem(PROFILES_KEY);
      return raw ? JSON.parse(raw) : [];
    }catch(e){ return []; }
  }
  function saveProfiles(list){
    try{ localStorage.setItem(PROFILES_KEY, JSON.stringify(list)); }catch(e){ console.warn("Could not save profiles.", e); }
  }
  function getActiveProfileId(){
    try{ return localStorage.getItem(ACTIVE_PROFILE_KEY); }catch(e){ return null; }
  }
  function setActiveProfileId(id){
    try{ localStorage.setItem(ACTIVE_PROFILE_KEY, id); }catch(e){}
  }

  let profiles = loadProfiles();
  let activeProfileId = getActiveProfileId();
  if(!activeProfileId || !profiles.find(p => p.id === activeProfileId)){
    activeProfileId = profiles[0] ? profiles[0].id : null;
  }
  let STORAGE_KEY = activeProfileId ? stateKeyFor(activeProfileId) : null;

  /* ============================================================
     State
     ============================================================ */
  let state = null;

  function defaultState(){
    return {
      habits: [],              // {id, name, color, note, createdAt: 'YYYY-MM-DD'}
      completions: {},         // { habitId: { 'YYYY-MM-DD': true } }
      journal: {},             // { 'YYYY-MM-DD': "text" }
      viewYear: today.getFullYear(),
      viewMonth: today.getMonth(),
      chartH: 260,
      chartVisible: { overall: true }
    };
  }

  function loadState(){
    try{
      const raw = STORAGE_KEY ? localStorage.getItem(STORAGE_KEY) : null;
      if(!raw) return defaultState();
      const parsed = JSON.parse(raw);
      return Object.assign(defaultState(), parsed);
    }catch(e){
      console.warn("Could not read saved data, starting fresh.", e);
      return defaultState();
    }
  }

  function saveState(){
    try{
      if(STORAGE_KEY) localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }catch(e){
      console.warn("Could not save data.", e);
    }
  }

  /* ============================================================
     Habit CRUD
     ============================================================ */
  function nextColor(){
    const used = state.habits.map(h => h.color);
    const free = COLORS.find(c => !used.includes(c));
    return free || COLORS[state.habits.length % COLORS.length];
  }

  function addHabit(name, color){
    const id = "h_" + Date.now().toString(36) + Math.random().toString(36).slice(2,6);
    state.habits.push({ id, name: name.trim() || "Untitled habit", color, note: "", createdAt: keyForDate(today) });
    state.completions[id] = {};
    state.chartVisible[id] = true;
    saveState();
    render();
  }

  function deleteHabit(id){
    state.habits = state.habits.filter(h => h.id !== id);
    delete state.completions[id];
    delete state.chartVisible[id];
    saveState();
    render();
  }

  function renameHabit(id, name){
    const h = state.habits.find(h => h.id === id);
    if(h){ h.name = name.trim() || h.name; saveState(); }
  }

  function toggleDay(habitId, dateKey){
    const bucket = state.completions[habitId] || (state.completions[habitId] = {});
    if(bucket[dateKey]) delete bucket[dateKey];
    else bucket[dateKey] = true;
    saveState();
  }

  /* ============================================================
     Rendering — header + grid (Today page)
     ============================================================ */
  function render(){
    renderTopbar();
    renderGrid();
    renderChart();
    renderLegend();
    renderStats();
  }

  function renderTopbar(){
    $("#monthName").textContent = MONTH_NAMES[state.viewMonth];
    $("#yearName").textContent = state.viewYear;
  }

  function renderGrid(){
    const grid = $("#logGrid");
    grid.innerHTML = "";

    const y = state.viewYear, m = state.viewMonth;
    const dim = daysInMonth(y,m);

    const header = document.createElement("div");
    header.className = "day-header";
    const spacer = document.createElement("div");
    spacer.className = "name-spacer";
    header.appendChild(spacer);
    for(let d=1; d<=dim; d++){
      const cell = document.createElement("div");
      const dow = new Date(y,m,d).getDay();
      cell.className = "day-num" + (isToday(y,m,d) ? " today" : "") + ((dow===0||dow===6) ? " weekend" : "");
      cell.textContent = d;
      cell.title = DAY_LETTERS[dow];
      header.appendChild(cell);
    }
    grid.appendChild(header);

    $("#emptyState").hidden = state.habits.length > 0;

    const rowTpl = $("#rowTemplate");
    state.habits.forEach(habit => {
      const wrap = rowTpl.content.firstElementChild.cloneNode(true);
      wrap.dataset.id = habit.id;

      const row = $(".habit-row", wrap);
      row.style.setProperty("--habit-color", habit.color);

      const dot = $(".habit-dot", row);
      dot.style.color = habit.color;
      dot.style.background = habit.color;

      const input = $(".habit-name-input", row);
      input.value = habit.name;
      input.addEventListener("change", () => renameHabit(habit.id, input.value));
      input.addEventListener("keydown", e => { if(e.key==="Enter") input.blur(); });

      $(".habit-delete", row).addEventListener("click", () => deleteHabit(habit.id));

      const noteWrap = $(".habit-note", wrap);
      const noteInput = $(".habit-note-input", noteWrap);
      const commentBtn = $(".habit-comment-btn", row);
      noteInput.value = habit.note || "";
      commentBtn.classList.toggle("has-note", !!(habit.note && habit.note.trim()));
      commentBtn.addEventListener("click", () => {
        noteWrap.hidden = !noteWrap.hidden;
        if(!noteWrap.hidden) requestAnimationFrame(() => noteInput.focus());
      });
      let noteTimer;
      noteInput.addEventListener("input", () => {
        clearTimeout(noteTimer);
        noteTimer = setTimeout(() => {
          habit.note = noteInput.value;
          saveState();
          commentBtn.classList.toggle("has-note", !!(habit.note && habit.note.trim()));
        }, 400);
      });

      const daysWrap = $(".habit-days", row);
      for(let d=1; d<=dim; d++){
        const dateKey = keyFor(y,m,d);
        const cellWrap = document.createElement("div");
        cellWrap.className = "day-cell";
        const btn = document.createElement("button");
        const future = isFuture(y,m,d);
        const checked = !!(state.completions[habit.id] && state.completions[habit.id][dateKey]);
        btn.className = (checked ? "checked " : "") + (future ? "future" : "");
        btn.style.setProperty("--habit-color", habit.color);
        btn.setAttribute("aria-label", `${habit.name} — ${dateKey}`);
        if(!future){
          btn.addEventListener("click", () => {
            toggleDay(habit.id, dateKey);
            btn.classList.toggle("checked");
            renderChart();
            renderStats();
          });
        }
        cellWrap.appendChild(btn);
        daysWrap.appendChild(cellWrap);
      }
      grid.appendChild(wrap);
    });
  }

  /* ============================================================
     Add-habit inline form
     ============================================================ */
  let formOpen = false;
  function toggleAddForm(){
    if(formOpen) return;
    formOpen = true;
    const btn = $("#addHabitBtn");
    const tpl = $("#addFormTemplate");
    const form = tpl.content.firstElementChild.cloneNode(true);

    const picker = $("#colorPicker", form);
    let selected = nextColor();
    COLORS.forEach(c => {
      const sw = document.createElement("span");
      sw.className = "color-swatch" + (c===selected ? " selected" : "");
      sw.style.background = c;
      sw.addEventListener("click", () => {
        selected = c;
        $$(".color-swatch", form).forEach(s => s.classList.remove("selected"));
        sw.classList.add("selected");
      });
      picker.appendChild(sw);
    });

    const input = $(".new-habit-input", form);
    const close = () => { form.remove(); formOpen = false; btn.hidden = false; };
    const commit = () => {
      if(input.value.trim()){
        addHabit(input.value, selected);
      }
      close();
    };

    $(".confirm-add", form).addEventListener("click", commit);
    $(".cancel-add", form).addEventListener("click", close);
    input.addEventListener("keydown", e => {
      if(e.key === "Enter") commit();
      if(e.key === "Escape") close();
    });

    btn.hidden = true;
    btn.insertAdjacentElement("beforebegin", form);
    requestAnimationFrame(() => input.focus());
  }

  /* ============================================================
     Stats: current streak / best streak / month average
     ============================================================ */
  function successDateSet(){
    const set = new Set();
    for(const id in state.completions){
      for(const dk in state.completions[id]){
        if(state.completions[id][dk]) set.add(dk);
      }
    }
    return set;
  }

  function streaksFromSet(set){
    if(set.size === 0) return { current: 0, best: 0 };
    let cursor = new Date(today);
    if(!set.has(keyForDate(cursor))) cursor = addDays(cursor, -1);
    let current = 0;
    while(set.has(keyForDate(cursor))){
      current++;
      cursor = addDays(cursor, -1);
    }
    const dates = Array.from(set).sort();
    let best = 0, run = 0, prev = null;
    dates.forEach(dk => {
      const [Y,M,D] = dk.split("-").map(Number);
      const dt = new Date(Y, M-1, D);
      if(prev && (dt - prev) === 86400000) run++;
      else run = 1;
      best = Math.max(best, run);
      prev = dt;
    });
    return { current, best };
  }

  function computeStreaks(){
    return streaksFromSet(successDateSet());
  }

  function computeHabitStreak(habitId){
    const bucket = state.completions[habitId] || {};
    const set = new Set(Object.keys(bucket).filter(dk => bucket[dk]));
    return streaksFromSet(set);
  }

  function monthBounds(y, m){
    const dim = daysInMonth(y,m);
    if(y > today.getFullYear() || (y===today.getFullYear() && m > today.getMonth())) return 0;
    return (y===today.getFullYear() && m===today.getMonth()) ? today.getDate() : dim;
  }

  function computeMonthAverage(){
    const y = state.viewYear, m = state.viewMonth;
    if(state.habits.length === 0) return 0;
    const lastDay = monthBounds(y,m);
    let possible = 0, done = 0;
    for(let d=1; d<=lastDay; d++){
      const dateKey = keyFor(y,m,d);
      state.habits.forEach(h => {
        if(h.createdAt > dateKey) return;
        possible++;
        if(state.completions[h.id] && state.completions[h.id][dateKey]) done++;
      });
    }
    return possible === 0 ? 0 : Math.round((done/possible)*100);
  }

  function computeHabitMonthPct(habitId){
    const y = state.viewYear, m = state.viewMonth;
    const habit = state.habits.find(h => h.id === habitId);
    if(!habit) return 0;
    const lastDay = monthBounds(y,m);
    let possible = 0, done = 0;
    for(let d=1; d<=lastDay; d++){
      const dk = keyFor(y,m,d);
      if(habit.createdAt > dk) continue;
      possible++;
      if(state.completions[habitId] && state.completions[habitId][dk]) done++;
    }
    return possible === 0 ? 0 : Math.round((done/possible)*100);
  }

  function renderStats(){
    const { current, best } = computeStreaks();
    $("#statStreak").textContent = current;
    $("#statBest").textContent = best;
    $("#statAvg").textContent = computeMonthAverage() + "%";
  }

  /* ============================================================
     Chart
     ============================================================ */
  function renderLegend(){
    const legend = $("#legend");
    legend.innerHTML = "";

    const overallChip = document.createElement("div");
    overallChip.className = "legend-chip" + (state.chartVisible.overall === false ? " off" : "");
    overallChip.innerHTML = `<span class="swatch" style="background:${"#4fd1c5"}"></span>Overall`;
    overallChip.addEventListener("click", () => {
      state.chartVisible.overall = !state.chartVisible.overall;
      saveState(); renderLegend(); renderChart();
    });
    legend.appendChild(overallChip);

    state.habits.forEach(h => {
      const chip = document.createElement("div");
      chip.className = "legend-chip" + (state.chartVisible[h.id] === false ? " off" : "");
      chip.innerHTML = `<span class="swatch" style="background:${h.color}"></span>${escapeHtml(h.name)}`;
      chip.addEventListener("click", () => {
        state.chartVisible[h.id] = !state.chartVisible[h.id];
        saveState(); renderLegend(); renderChart();
      });
      legend.appendChild(chip);
    });
  }

  function buildSeries(){
    const y = state.viewYear, m = state.viewMonth;
    const lastDay = monthBounds(y,m);

    const dayKeys = [];
    for(let d=1; d<=lastDay; d++) dayKeys.push(keyFor(y,m,d));

    const rawPerHabit = {};
    state.habits.forEach(h => {
      rawPerHabit[h.id] = dayKeys.map(dk => {
        if(h.createdAt > dk) return null;
        return (state.completions[h.id] && state.completions[h.id][dk]) ? 100 : 0;
      });
    });

    const rawOverall = dayKeys.map((dk, i) => {
      const vals = state.habits
        .filter(h => h.createdAt <= dk)
        .map(h => rawPerHabit[h.id][i])
        .filter(v => v !== null);
      if(vals.length === 0) return null;
      return vals.reduce((a,b)=>a+b,0) / vals.length;
    });

    function rollingAvg(arr){
      const out = [];
      for(let i=0;i<arr.length;i++){
        const start = Math.max(0, i-ROLL_WINDOW+1);
        const slice = arr.slice(start, i+1).filter(v => v !== null);
        out.push(slice.length ? Math.round(slice.reduce((a,b)=>a+b,0)/slice.length) : null);
      }
      return out;
    }

    const series = {};
    series.overall = { color: "#4fd1c5", values: rollingAvg(rawOverall) };
    state.habits.forEach(h => {
      series[h.id] = { color: h.color, values: rollingAvg(rawPerHabit[h.id]) };
    });

    return { dayKeys, series };
  }

  function smoothPath(points){
    if(points.length === 0) return "";
    if(points.length === 1) return `M ${points[0][0]} ${points[0][1]}`;
    let d = `M ${points[0][0]} ${points[0][1]}`;
    for(let i=0; i<points.length-1; i++){
      const p0 = points[i===0 ? i : i-1];
      const p1 = points[i];
      const p2 = points[i+1];
      const p3 = points[i+2 < points.length ? i+2 : i+1];
      const cp1x = p1[0] + (p2[0]-p0[0])/6;
      const cp1y = p1[1] + (p2[1]-p0[1])/6;
      const cp2x = p2[0] - (p3[0]-p1[0])/6;
      const cp2y = p2[1] - (p3[1]-p1[1])/6;
      d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2[0]} ${p2[1]}`;
    }
    return d;
  }

  function renderChart(){
    const svg = $("#chartSvg");
    svg.innerHTML = "";
    const { dayKeys, series } = buildSeries();

    const box = svg.getBoundingClientRect();
    const W = Math.max(box.width, 100);
    const H = Math.max(box.height, 100);
    const padL = 32, padR = 10, padT = 14, padB = 20;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);

    const ns = "http://www.w3.org/2000/svg";
    const el = (tag, attrs) => {
      const n = document.createElementNS(ns, tag);
      for(const k in attrs) n.setAttribute(k, attrs[k]);
      return n;
    };

    [0,50,100].forEach(v => {
      const yy = padT + plotH - (v/100)*plotH;
      svg.appendChild(el("line", { x1: padL, x2: W-padR, y1: yy, y2: yy, stroke: "var(--line)", "stroke-width": 1, "stroke-dasharray": v===0?"0":"3 4" }));
      const t = el("text", { x: 4, y: yy+3, fill: "var(--text-faint)", "font-size": 9, "font-family": "var(--mono)" });
      t.textContent = v + "%";
      svg.appendChild(t);
    });

    if(dayKeys.length < 2){
      const t = el("text", { x: W/2, y: H/2, fill: "var(--text-faint)", "font-size": 11, "text-anchor": "middle", "font-family": "var(--sans)" });
      t.textContent = "Log a few days to see your trend";
      svg.appendChild(t);
      return;
    }

    const xFor = i => padL + (i/(dayKeys.length-1)) * plotW;
    const yFor = v => padT + plotH - (v/100)*plotH;

    const todayIdx = dayKeys.indexOf(keyForDate(today));
    if(todayIdx > -1){
      const tx = xFor(todayIdx);
      svg.appendChild(el("line", { x1: tx, x2: tx, y1: padT, y2: padT+plotH, stroke: "var(--line-strong)", "stroke-width": 1 }));
    }

    [0, Math.floor((dayKeys.length-1)/2), dayKeys.length-1].forEach(i => {
      const d = Number(dayKeys[i].split("-")[2]);
      const t = el("text", { x: xFor(i), y: H-4, fill: "var(--text-faint)", "font-size": 9, "text-anchor": "middle", "font-family": "var(--mono)" });
      t.textContent = d;
      svg.appendChild(t);
    });

    const order = ["overall", ...state.habits.map(h=>h.id)];
    order.forEach(id => {
      if(state.chartVisible[id] === false) return;
      const s = series[id];
      if(!s) return;
      const pts = [];
      s.values.forEach((v,i) => { if(v !== null) pts.push([xFor(i), yFor(v)]); });
      if(pts.length === 0) return;

      const path = el("path", {
        d: smoothPath(pts),
        fill: "none",
        stroke: s.color,
        "stroke-width": id === "overall" ? 2.5 : 1.6,
        "stroke-linecap": "round",
        opacity: id === "overall" ? 1 : 0.85
      });
      path.style.filter = id === "overall" ? `drop-shadow(0 0 5px ${s.color}88)` : "none";
      svg.appendChild(path);

      const lastPt = pts[pts.length-1];
      svg.appendChild(el("circle", { cx: lastPt[0], cy: lastPt[1], r: id==="overall"?3.5:2.5, fill: s.color }));
    });

    const hitLine = el("line", { x1:0,x2:0,y1:padT,y2:padT+plotH, stroke:"var(--line-strong)", "stroke-width":1, opacity:0 });
    svg.appendChild(hitLine);

    const overlay = el("rect", { x: padL, y: padT, width: plotW, height: plotH, fill: "transparent" });
    svg.appendChild(overlay);

    const tooltip = $("#chartTooltip");
    overlay.addEventListener("mousemove", (e) => {
      const rect = svg.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const scaleX = W / rect.width;
      const localX = mx * scaleX;
      let idx = Math.round(((localX - padL) / plotW) * (dayKeys.length-1));
      idx = Math.max(0, Math.min(dayKeys.length-1, idx));

      hitLine.setAttribute("x1", xFor(idx));
      hitLine.setAttribute("x2", xFor(idx));
      hitLine.setAttribute("opacity", 1);

      const dk = dayKeys[idx];
      let rows = "";
      order.forEach(id => {
        if(state.chartVisible[id] === false) return;
        const s = series[id];
        const v = s.values[idx];
        if(v === null || v === undefined) return;
        const label = id === "overall" ? "Overall" : (state.habits.find(h=>h.id===id)?.name || "");
        rows += `<div class="tt-row"><span class="tt-dot" style="background:${s.color}"></span>${escapeHtml(label)}: ${v}%</div>`;
      });
      tooltip.innerHTML = `<span class="tt-date">${dk}</span>${rows}`;
      tooltip.hidden = false;
      tooltip.style.left = (e.clientX - rect.left) + "px";
      tooltip.style.top = (e.clientY - rect.top) + "px";
    });
    overlay.addEventListener("mouseleave", () => {
      hitLine.setAttribute("opacity", 0);
      tooltip.hidden = true;
    });
  }

  /* ============================================================
     Chart resize handle
     ============================================================ */
  function initResize(){
    const handle = $("#resizeHandle");
    const panel = $("#chartPanel");
    panel.style.setProperty("--chart-h", state.chartH + "px");

    let dragging = false, startY = 0, startH = 0;

    const onMove = (e) => {
      if(!dragging) return;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const delta = startY - clientY;
      const newH = Math.min(MAX_CHART_H, Math.max(MIN_CHART_H, startH + delta));
      panel.style.setProperty("--chart-h", newH + "px");
    };
    const onUp = () => {
      if(!dragging) return;
      dragging = false;
      state.chartH = parseInt(panel.style.getPropertyValue("--chart-h"), 10);
      saveState();
      renderChart();
      document.body.style.userSelect = "";
    };
    const onDown = (e) => {
      dragging = true;
      startY = e.touches ? e.touches[0].clientY : e.clientY;
      startH = parseInt(getComputedStyle(panel).getPropertyValue("--chart-h"), 10) || state.chartH;
      document.body.style.userSelect = "none";
    };

    handle.addEventListener("mousedown", onDown);
    handle.addEventListener("touchstart", onDown, { passive:true });
    window.addEventListener("mousemove", onMove);
    window.addEventListener("touchmove", onMove, { passive:true });
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchend", onUp);

    let resizeTimer;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(renderChart, 120);
    });
  }

  /* ============================================================
     Month navigation
     ============================================================ */
  function shiftMonth(delta){
    let m = state.viewMonth + delta;
    let y = state.viewYear;
    if(m < 0){ m = 11; y--; }
    if(m > 11){ m = 0; y++; }
    state.viewMonth = m;
    state.viewYear = y;
    saveState();
    render();
  }

  /* ============================================================
     Page navigation (Today / Journal / Insights / Settings / Export)
     ============================================================ */
  function showPage(page){
    $$(".page").forEach(p => { p.hidden = p.dataset.page !== page; });
    $$(".menu-item").forEach(b => b.classList.toggle("active", b.dataset.page === page));
    closeMenu();
    if(page === "journal") renderJournal();
    if(page === "insights") renderInsights();
    if(page === "settings") renderSettingsProfiles();
  }

  function openMenu(){
    $("#dropdownMenu").hidden = false;
    $("#menuBtn").setAttribute("aria-expanded", "true");
    document.addEventListener("click", onOutsideMenuClick);
  }
  function closeMenu(){
    $("#dropdownMenu").hidden = true;
    $("#menuBtn").setAttribute("aria-expanded", "false");
    document.removeEventListener("click", onOutsideMenuClick);
  }
  function onOutsideMenuClick(e){
    const menu = $("#dropdownMenu"), btn = $("#menuBtn");
    if(!menu.contains(e.target) && !btn.contains(e.target)) closeMenu();
  }

  /* ============================================================
     Journal
     ============================================================ */
  let journalCursor = new Date(today);

  function formatLongDate(d){
    return d.toLocaleDateString(undefined, { weekday:"short", month:"short", day:"numeric", year:"numeric" });
  }

  function renderJournal(){
    const dk = keyForDate(journalCursor);
    $("#journalDateLabel").textContent = formatLongDate(journalCursor);
    $("#journalTextarea").value = (state.journal && state.journal[dk]) || "";
    $("#journalSavedHint").hidden = true;
    renderJournalList();
  }

  function shiftJournalDay(delta){
    journalCursor = addDays(journalCursor, delta);
    renderJournal();
  }

  let journalSaveTimer;
  function onJournalInput(){
    clearTimeout(journalSaveTimer);
    $("#journalSavedHint").hidden = true;
    journalSaveTimer = setTimeout(() => {
      const dk = keyForDate(journalCursor);
      const val = $("#journalTextarea").value;
      if(!state.journal) state.journal = {};
      if(val.trim()) state.journal[dk] = val;
      else delete state.journal[dk];
      saveState();
      $("#journalSavedHint").hidden = false;
      renderJournalList();
    }, 500);
  }

  function renderJournalList(){
    const list = $("#journalList");
    list.innerHTML = "";
    const entries = Object.keys(state.journal || {}).sort().reverse();
    if(entries.length === 0){
      list.innerHTML = `<p class="journal-empty">No entries yet.</p>`;
      return;
    }
    const activeKey = keyForDate(journalCursor);
    entries.forEach(dk => {
      const text = state.journal[dk];
      const row = document.createElement("button");
      row.className = "journal-entry" + (dk === activeKey ? " active" : "");
      const [y,m,d] = dk.split("-").map(Number);
      const label = new Date(y,m-1,d).toLocaleDateString(undefined,{ month:"short", day:"numeric", year:"numeric" });
      row.innerHTML = `<span class="je-date">${label}</span><span class="je-preview">${escapeHtml(text.slice(0,80))}</span>`;
      row.addEventListener("click", () => { journalCursor = new Date(y,m-1,d); renderJournal(); });
      list.appendChild(row);
    });
  }

  /* ============================================================
     Insights
     ============================================================ */
  function renderInsights(){
    const { current, best } = computeStreaks();
    $("#insCurrentStreak").textContent = current;
    $("#insBestStreak").textContent = best;
    $("#insMonthAvg").textContent = computeMonthAverage() + "%";
    $("#insHabitCount").textContent = state.habits.length;

    const tbody = $("#insightsTableBody");
    tbody.innerHTML = "";
    if(state.habits.length === 0){
      $("#insightsEmpty").hidden = false;
      $("#insightsTable").hidden = true;
      return;
    }
    $("#insightsEmpty").hidden = true;
    $("#insightsTable").hidden = false;
    state.habits.forEach(h => {
      const s = computeHabitStreak(h.id);
      const pct = computeHabitMonthPct(h.id);
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><span class="ins-dot" style="background:${h.color};color:${h.color}"></span>${escapeHtml(h.name)}</td>
        <td>${pct}%</td>
        <td>${s.current}</td>
        <td>${s.best}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  /* ============================================================
     Settings — profiles, chart reset, clear data
     ============================================================ */
  function renderProfileBadge(){
    const p = profiles.find(p => p.id === activeProfileId);
    $("#profileName").textContent = p ? p.name : "—";
  }

  function renderSettingsProfiles(){
    const wrap = $("#profileList");
    wrap.innerHTML = "";
    profiles.forEach(p => {
      const row = document.createElement("div");
      row.className = "profile-row" + (p.id === activeProfileId ? " active" : "");
      row.innerHTML = `
        <span class="profile-row-name">${escapeHtml(p.name)}</span>
        <span class="profile-row-actions">
          ${p.id === activeProfileId ? '<span class="profile-current-tag">current</span>' : '<button class="profile-switch-btn">Switch</button>'}
          <button class="profile-rename-btn" title="Rename">✎</button>
          ${profiles.length > 1 ? '<button class="profile-delete-btn" title="Delete">×</button>' : ''}
        </span>
      `;
      const switchBtn = $(".profile-switch-btn", row);
      if(switchBtn) switchBtn.addEventListener("click", () => switchProfile(p.id));
      $(".profile-rename-btn", row).addEventListener("click", () => renameProfile(p.id));
      const delBtn = $(".profile-delete-btn", row);
      if(delBtn) delBtn.addEventListener("click", () => deleteProfile(p.id));
      wrap.appendChild(row);
    });
  }

  function switchProfile(id){
    if(id === activeProfileId) return;
    activeProfileId = id;
    setActiveProfileId(id);
    STORAGE_KEY = stateKeyFor(id);
    state = loadState();
    renderProfileBadge();
    render();
    renderSettingsProfiles();
    showPage("today");
  }

  function renameProfile(id){
    const p = profiles.find(p => p.id === id);
    if(!p) return;
    const name = prompt("Rename profile", p.name);
    if(name && name.trim()){
      p.name = name.trim();
      saveProfiles(profiles);
      renderProfileBadge();
      renderSettingsProfiles();
    }
  }

  function deleteProfile(id){
    if(profiles.length <= 1) return;
    const p = profiles.find(p => p.id === id);
    if(!p) return;
    if(!confirm(`Delete profile "${p.name}"? This removes all its data from this device.`)) return;
    try{ localStorage.removeItem(stateKeyFor(id)); }catch(e){}
    profiles = profiles.filter(p => p.id !== id);
    saveProfiles(profiles);
    if(id === activeProfileId){
      activeProfileId = profiles[0].id;
      setActiveProfileId(activeProfileId);
      STORAGE_KEY = stateKeyFor(activeProfileId);
      state = loadState();
      renderProfileBadge();
      render();
    }
    renderSettingsProfiles();
  }

  /* ============================================================
     Profile creation modal
     ============================================================ */
  let profileModalMode = "first";

  function openProfileModal(mode){
    profileModalMode = mode;
    $("#profileModalTitle").textContent = mode === "first" ? "Welcome" : "New profile";
    $("#profileModalSub").textContent = mode === "first"
      ? "Enter a name for your local profile. It's saved on this device only."
      : "This adds a separate local profile with its own habits and log.";
    $("#cancelProfileBtn").hidden = mode === "first";
    $("#newProfileNameInput").value = "";
    $("#profileModalOverlay").hidden = false;
    requestAnimationFrame(() => $("#newProfileNameInput").focus());
  }
  function closeProfileModal(){
    $("#profileModalOverlay").hidden = true;
  }

  function handleCreateProfile(){
    const input = $("#newProfileNameInput");
    const name = input.value.trim();
    if(!name){ input.focus(); return; }
    const id = "p_" + Date.now().toString(36) + Math.random().toString(36).slice(2,6);
    profiles.push({ id, name });
    saveProfiles(profiles);
    const wasFirst = profileModalMode === "first";
    activeProfileId = id;
    setActiveProfileId(id);
    STORAGE_KEY = stateKeyFor(id);
    closeProfileModal();
    if(wasFirst){
      boot();
    } else {
      state = loadState();
      renderProfileBadge();
      render();
      renderSettingsProfiles();
      showPage("today");
    }
  }

  /* ============================================================
     Export / Backup
     ============================================================ */
  function flashExportHint(msg, isError){
    const hint = $("#exportHint");
    hint.textContent = msg;
    hint.hidden = false;
    hint.classList.toggle("error", !!isError);
  }

  function exportBackup(){
    const p = profiles.find(p => p.id === activeProfileId);
    const payload = {
      app: "discipline-log",
      version: 1,
      profileName: p ? p.name : "profile",
      exportedAt: new Date().toISOString(),
      state
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safeName = (p ? p.name : "backup").replace(/[^a-z0-9]/gi, "_").toLowerCase();
    a.href = url;
    a.download = `discipline-log-${safeName}-${keyForDate(today)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    flashExportHint("Backup downloaded.");
  }

  function importBackup(file){
    const reader = new FileReader();
    reader.onload = () => {
      try{
        const parsed = JSON.parse(reader.result);
        const incoming = parsed && parsed.state ? parsed.state : parsed;
        if(!incoming || typeof incoming !== "object" || !Array.isArray(incoming.habits)){
          throw new Error("not a recognizable backup");
        }
        state = Object.assign(defaultState(), incoming);
        saveState();
        render();
        flashExportHint("Data restored from backup.");
      }catch(e){
        flashExportHint("Couldn't read that file — is it a Discipline Log backup?", true);
      }
    };
    reader.readAsText(file);
  }

  /* ============================================================
     PWA install ("download" to home screen)
     ============================================================ */
  let deferredInstallPrompt = null;

  function isStandalone(){
    return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  }
  function isIOS(){
    return /iphone|ipad|ipod/i.test(navigator.userAgent);
  }

  function initInstallUI(){
    if(isStandalone()){
      $("#installStatusText").textContent = "This app is already installed and running standalone.";
      return;
    }
    if(isIOS()){
      $("#installIOSHint").hidden = false;
    }
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      deferredInstallPrompt = e;
      $("#installBtn").hidden = false;
    });
    $("#installBtn").addEventListener("click", async () => {
      if(!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      $("#installBtn").hidden = true;
    });
    window.addEventListener("appinstalled", () => {
      $("#installBtn").hidden = true;
      $("#installStatusText").textContent = "Installed ✓ — open it from your home screen.";
    });
  }

  function registerSW(){
    if("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")){
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }
  }

  /* ============================================================
     Wiring + Init
     ============================================================ */
  function bindGlobalUI(){
    $("#prevMonth").addEventListener("click", () => shiftMonth(-1));
    $("#nextMonth").addEventListener("click", () => shiftMonth(1));
    $("#addHabitBtn").addEventListener("click", toggleAddForm);

    $("#menuBtn").addEventListener("click", (e) => {
      e.stopPropagation();
      $("#dropdownMenu").hidden ? openMenu() : closeMenu();
    });
    $$(".menu-item").forEach(btn => btn.addEventListener("click", () => showPage(btn.dataset.page)));
    $("#profileBtn").addEventListener("click", () => showPage("settings"));

    $("#journalPrevDay").addEventListener("click", () => shiftJournalDay(-1));
    $("#journalNextDay").addEventListener("click", () => shiftJournalDay(1));
    $("#journalTextarea").addEventListener("input", onJournalInput);

    $("#addProfileBtn").addEventListener("click", () => openProfileModal("add"));
    $("#createProfileBtn").addEventListener("click", handleCreateProfile);
    $("#cancelProfileBtn").addEventListener("click", closeProfileModal);
    $("#newProfileNameInput").addEventListener("keydown", e => { if(e.key === "Enter") handleCreateProfile(); });

    $("#resetChartHeightBtn").addEventListener("click", () => {
      state.chartH = 260;
      saveState();
      $("#chartPanel").style.setProperty("--chart-h", "260px");
      renderChart();
    });
    $("#clearProfileDataBtn").addEventListener("click", () => {
      if(!confirm("Clear all habits, logs, notes, and journal entries for this profile? This can't be undone.")) return;
      state = defaultState();
      saveState();
      render();
      renderSettingsProfiles();
    });

    $("#exportBtn").addEventListener("click", exportBackup);
    $("#importFile").addEventListener("change", (e) => {
      const f = e.target.files[0];
      if(f) importBackup(f);
      e.target.value = "";
    });
  }

  function boot(){
    state = loadState();
    renderProfileBadge();
    render();
    initResize();
    initInstallUI();
    registerSW();
  }

  function init(){
    bindGlobalUI();
    if(profiles.length === 0){
      openProfileModal("first");
    } else {
      boot();
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
