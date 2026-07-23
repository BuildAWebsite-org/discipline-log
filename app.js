(() => {
  "use strict";

  /* ============================================================
     Constants
     ============================================================ */
  const STORAGE_KEY = "disciplineLog.v1";
  const COLORS = ["#ffab3d","#4fd1c5","#818cf8","#f472b6","#4ade80","#fb923c","#60a5fa","#facc15","#f87171","#a78bfa"];
  const MONTH_NAMES = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  const DAY_LETTERS = ["S","M","T","W","T","F","S"];
  const ROLL_WINDOW = 7;
  const MIN_CHART_H = 150;
  const MAX_CHART_H = 520;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* ============================================================
     State
     ============================================================ */
  const today = new Date();
  today.setHours(0,0,0,0);

  let state = loadState();

  function defaultState(){
    return {
      habits: [],              // {id, name, color, createdAt: 'YYYY-MM-DD'}
      completions: {},         // { habitId: { 'YYYY-MM-DD': true } }
      viewYear: today.getFullYear(),
      viewMonth: today.getMonth(),
      chartH: 260,
      chartVisible: { overall: true }
    };
  }

  function loadState(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
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
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }catch(e){
      console.warn("Could not save data.", e);
    }
  }

  /* ============================================================
     Date helpers
     ============================================================ */
  function pad(n){ return String(n).padStart(2,"0"); }
  function keyFor(y,m,d){ return `${y}-${pad(m+1)}-${pad(d)}`; }
  function keyForDate(dt){ return keyFor(dt.getFullYear(), dt.getMonth(), dt.getDate()); }
  function daysInMonth(y,m){ return new Date(y, m+1, 0).getDate(); }
  function isToday(y,m,d){ return y===today.getFullYear() && m===today.getMonth() && d===today.getDate(); }
  function isFuture(y,m,d){ return new Date(y,m,d) > today; }
  function addDays(dt, n){ const d = new Date(dt); d.setDate(d.getDate()+n); return d; }

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
    state.habits.push({ id, name: name.trim() || "Untitled habit", color, createdAt: keyForDate(today) });
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
     Rendering — header + grid
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

    // day header row
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
      const row = rowTpl.content.firstElementChild.cloneNode(true);
      row.dataset.id = habit.id;
      row.style.setProperty("--habit-color", habit.color);

      const dot = $(".habit-dot", row);
      dot.style.color = habit.color;
      dot.style.background = habit.color;

      const input = $(".habit-name-input", row);
      input.value = habit.name;
      input.addEventListener("change", () => renameHabit(habit.id, input.value));
      input.addEventListener("keydown", e => { if(e.key==="Enter") input.blur(); });

      $(".habit-delete", row).addEventListener("click", () => deleteHabit(habit.id));

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
      grid.appendChild(row);
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

  function computeStreaks(){
    const set = successDateSet();
    if(set.size === 0) return { current: 0, best: 0 };

    // current streak: walk back from today (allow today to be un-checked so far)
    let cursor = new Date(today);
    if(!set.has(keyForDate(cursor))) cursor = addDays(cursor, -1);
    let current = 0;
    while(set.has(keyForDate(cursor))){
      current++;
      cursor = addDays(cursor, -1);
    }

    // best streak: scan all dates present, sorted
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

  function computeMonthAverage(){
    const y = state.viewYear, m = state.viewMonth;
    if(state.habits.length === 0) return 0;
    const dim = daysInMonth(y,m);
    const lastDay = (y===today.getFullYear() && m===today.getMonth()) ? today.getDate() : dim;
    if(y > today.getFullYear() || (y===today.getFullYear() && m > today.getMonth())) return 0;

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

  function escapeHtml(s){
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  // Build per-series rolling-average data for the viewed month
  function buildSeries(){
    const y = state.viewYear, m = state.viewMonth;
    const dim = daysInMonth(y,m);
    const lastDay = (y===today.getFullYear() && m===today.getMonth()) ? today.getDate()
                    : (y>today.getFullYear() || (y===today.getFullYear()&&m>today.getMonth())) ? 0 : dim;

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

  let lastChartData = null;

  function renderChart(){
    const svg = $("#chartSvg");
    svg.innerHTML = "";
    const { dayKeys, series } = buildSeries();
    lastChartData = { dayKeys, series };

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

    // gridlines + y labels
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

    // today marker
    const todayIdx = dayKeys.indexOf(keyForDate(today));
    if(todayIdx > -1){
      const tx = xFor(todayIdx);
      svg.appendChild(el("line", { x1: tx, x2: tx, y1: padT, y2: padT+plotH, stroke: "var(--line-strong)", "stroke-width": 1 }));
    }

    // x labels: first, mid, last
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

    // hover layer
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
     Init
     ============================================================ */
  function init(){
    $("#prevMonth").addEventListener("click", () => shiftMonth(-1));
    $("#nextMonth").addEventListener("click", () => shiftMonth(1));
    $("#addHabitBtn").addEventListener("click", toggleAddForm);

    initResize();
    render();

    if("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")){
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
