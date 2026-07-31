(() => {
  "use strict";

  /* ============================================================
     Constants
     ============================================================ */
  const STORAGE_KEY = "disciplineLog.v1"; // kept as-is on purpose — renaming would orphan existing saved data
  const COLORS = ["#ffab3d","#4fd1c5","#818cf8","#f472b6","#4ade80","#fb923c","#60a5fa","#facc15","#f87171","#a78bfa"];
  const MONTH_NAMES = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  const DAY_LETTERS = ["S","M","T","W","T","F","S"];
  const ROLL_WINDOW = 7;
  const MIN_CHART_H = 150;
  const MAX_CHART_H = 520;

  const CATEGORIES = [
    { id:"discipline", label:"Discipline", color:"#ffab3d" },
    { id:"focus", label:"Focus", color:"#4fd1c5" },
    { id:"body", label:"Body", color:"#f472b6" },
    { id:"craft", label:"Craft", color:"#818cf8" },
    { id:"other", label:"Other", color:"#9aa5b1" }
  ];

  const TITLES = [
    { min:1, max:2, title:"Novice" },
    { min:3, max:5, title:"Consistent" },
    { min:6, max:9, title:"Disciplined" },
    { min:10, max:14, title:"Relentless" },
    { min:15, max:9999, title:"Unbreakable" }
  ];

  const ACHIEVEMENTS = [
    { key:"first_habit", title:"Started Tracking", test: ctx => ctx.habitCount >= 1 },
    { key:"streak_3", title:"3-Day Streak", test: ctx => ctx.bestStreak >= 3 },
    { key:"streak_7", title:"One Week Strong", test: ctx => ctx.bestStreak >= 7 },
    { key:"streak_30", title:"One Month In", test: ctx => ctx.bestStreak >= 30 },
    { key:"streak_100", title:"Unbreakable", test: ctx => ctx.bestStreak >= 100 },
    { key:"checkins_50", title:"50 Check-ins", test: ctx => ctx.totalCheckins >= 50 },
    { key:"checkins_100", title:"Century", test: ctx => ctx.totalCheckins >= 100 },
    { key:"first_goal", title:"Goal Getter", test: ctx => ctx.goalsDone >= 1 },
    { key:"five_goals", title:"Ambitious", test: ctx => ctx.goalsDone >= 5 }
  ];

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
      habits: [],               // {id, name, color, createdAt, comment, mode, target, category}
      completions: {},          // { habitId: { 'YYYY-MM-DD': true|number } }
      journal: {},               // { 'YYYY-MM-DD': 'text' }
      goals: [],                 // {id, text, done, dueDate, completedAt, createdAt}
      historyNotes: [],          // {id, text, date, createdAt}
      achievements: [],          // {key, title, unlockedAt}
      profile: { birthYear: null },
      xp: 0,
      viewYear: today.getFullYear(),
      viewMonth: today.getMonth(),
      currentView: "today",
      chartH: 260,
      chartVisible: { overall: true }
    };
  }

  function loadState(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return defaultState();
      const parsed = JSON.parse(raw);
      const merged = Object.assign(defaultState(), parsed);
      if(!merged.profile) merged.profile = { birthYear: null };
      return merged;
    }catch(e){
      console.warn("Could not read saved data, starting fresh.", e);
      return defaultState();
    }
  }

  function saveState(){
    try{
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      onSaveSuccess();
      scheduleRemotePush();
    }catch(e){
      console.warn("Could not save data.", e);
      onSaveFailure();
    }
  }

  let lastSavedAt = null;
  function onSaveSuccess(){
    lastSavedAt = new Date();
    hideSaveBanner();
    updateSavedLabel();
  }
  function onSaveFailure(){
    showSaveBanner();
  }
  function updateSavedLabel(){
    const label = document.getElementById("lastSavedLabel");
    if(!label || !lastSavedAt) return;
    const hh = String(lastSavedAt.getHours()).padStart(2,"0");
    const mm = String(lastSavedAt.getMinutes()).padStart(2,"0");
    const ss = String(lastSavedAt.getSeconds()).padStart(2,"0");
    label.textContent = `Last saved ${hh}:${mm}:${ss}`;
  }
  function showSaveBanner(){
    let banner = document.getElementById("saveWarningBanner");
    if(!banner){
      banner = document.createElement("div");
      banner.id = "saveWarningBanner";
      banner.className = "save-warning-banner";
      banner.textContent = "Changes aren't saving on this device — your browser may be blocking local storage (e.g. private/incognito mode, or storage full). Export a backup from Settings as soon as you can switch browsers.";
      document.body.prepend(banner);
    }
  }
  function hideSaveBanner(){
    const banner = document.getElementById("saveWarningBanner");
    if(banner) banner.remove();
  }
  function storageIsAvailable(){
    try{
      const t = "__statlog_test__";
      localStorage.setItem(t, "1");
      localStorage.removeItem(t);
      return true;
    }catch(e){
      return false;
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

  function addHabit(name, color, mode, target, category){
    const id = "h_" + Date.now().toString(36) + Math.random().toString(36).slice(2,6);
    const habit = {
      id, name: name.trim() || "Untitled habit", color,
      createdAt: keyForDate(today), comment: "",
      category: category || "other"
    };
    if(mode === "count"){
      habit.mode = "count";
      habit.target = Math.max(1, Math.min(99, Number(target) || 1));
    }
    state.habits.push(habit);
    state.completions[id] = {};
    state.chartVisible[id] = true;
    saveState();
    render();
    checkAchievements();
  }

  function deleteHabit(id){
    state.habits = state.habits.filter(h => h.id !== id);
    delete state.completions[id];
    delete state.chartVisible[id];
    saveState();
    render();
  }

  function moveHabit(id, dir){
    const i = state.habits.findIndex(h => h.id === id);
    const j = i + dir;
    if(i === -1 || j < 0 || j >= state.habits.length) return;
    [state.habits[i], state.habits[j]] = [state.habits[j], state.habits[i]];
    saveState();
    renderGrid();
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

  function incrementCount(habitId, dateKey){
    const bucket = state.completions[habitId] || (state.completions[habitId] = {});
    const current = bucket[dateKey] || 0;
    const next = current >= 30 ? 0 : current + 1;
    if(next === 0) delete bucket[dateKey];
    else bucket[dateKey] = next;
    saveState();
    return next;
  }

  function resetCount(habitId, dateKey){
    const bucket = state.completions[habitId] || (state.completions[habitId] = {});
    delete bucket[dateKey];
    saveState();
  }

  function dayValue(h, dateKey){
    const raw = state.completions[h.id] && state.completions[h.id][dateKey];
    if(h.mode === "count"){
      const count = raw || 0;
      const target = h.target || 1;
      return Math.min(100, Math.round((count/target)*100));
    }
    return raw ? 100 : 0;
  }

  function dayDone(h, dateKey){
    return dayValue(h, dateKey) >= 100;
  }

  function habitEffectiveStart(h){
    const bucket = state.completions[h.id] || {};
    const loggedDates = Object.keys(bucket);
    if(loggedDates.length === 0) return h.createdAt;
    const earliestLogged = loggedDates.sort()[0];
    return earliestLogged < h.createdAt ? earliestLogged : h.createdAt;
  }

  /* ============================================================
     XP / Levels / Titles
     ============================================================ */
  function xpForLevel(n){ return 50 * n * (n-1); }
  function levelForXp(xp){
    let lvl = 1;
    while(xpForLevel(lvl+1) <= xp) lvl++;
    return lvl;
  }
  function xpProgress(xp){
    const lvl = levelForXp(xp);
    const cur = xpForLevel(lvl);
    const next = xpForLevel(lvl+1);
    const span = next - cur;
    const into = xp - cur;
    return { level: lvl, into, span, pct: span > 0 ? Math.round((into/span)*100) : 100 };
  }
  function titleForLevel(lvl){
    const match = TITLES.find(t => lvl >= t.min && lvl <= t.max);
    return (match || TITLES[TITLES.length-1]).title;
  }
  function addXP(amount){
    state.xp = (state.xp || 0) + amount;
    saveState();
    renderLevelBadge();
    if(document.getElementById("view-insights") && !document.getElementById("view-insights").hidden){
      renderXpCard();
    }
  }

  function setRingProgress(circleEl, radius, pct){
    if(!circleEl) return;
    const c = 2 * Math.PI * radius;
    const clamped = Math.max(0, Math.min(100, pct));
    circleEl.style.strokeDasharray = String(c);
    circleEl.style.strokeDashoffset = String(c * (1 - clamped/100));
  }

  function renderDailyRing(){
    const fill = $("#dailyRingFill");
    if(!fill) return;
    let pct = 0;
    if(state.habits.length > 0){
      const todayKey = keyForDate(today);
      const active = state.habits.filter(h => habitEffectiveStart(h) <= todayKey);
      if(active.length > 0){
        const sum = active.reduce((acc,h) => acc + dayValue(h, todayKey), 0);
        pct = Math.round(sum/active.length);
      }
    }
    setRingProgress(fill, 17, pct);
  }

  function renderLevelBadge(){
    const prog = xpProgress(state.xp || 0);
    const numEl = $("#levelNum"), titleEl = $("#levelTitle");
    if(numEl) numEl.textContent = "Lv " + prog.level;
    if(titleEl) titleEl.textContent = titleForLevel(prog.level);
    renderDailyRing();
  }

  function renderAgeRing(){
    const wrap = $("#ageRingBg");
    const fill = $("#ageRingFill");
    if(!wrap || !fill) return;
    if(!state.profile || !state.profile.birthYear){ wrap.hidden = true; return; }
    wrap.hidden = false;
    const age = today.getFullYear() - state.profile.birthYear;
    setRingProgress(fill, 90, Math.max(0, age));
  }

  /* ============================================================
     Achievements
     ============================================================ */
  function checkAchievements(){
    const { best } = computeStreaks();
    let totalCheckins = 0;
    state.habits.forEach(h => {
      const bucket = state.completions[h.id] || {};
      Object.keys(bucket).forEach(dk => { if(dayDone(h, dk)) totalCheckins++; });
    });
    const ctx = {
      habitCount: state.habits.length,
      bestStreak: best,
      totalCheckins,
      goalsDone: state.goals.filter(g => g.done).length
    };
    const unlockedKeys = new Set(state.achievements.map(a => a.key));
    const newly = [];
    ACHIEVEMENTS.forEach(a => {
      if(!unlockedKeys.has(a.key) && a.test(ctx)){
        state.achievements.push({ key: a.key, title: a.title, unlockedAt: keyForDate(today) });
        newly.push(a);
      }
    });
    if(newly.length){
      state.xp = (state.xp || 0) + 50 * newly.length;
      saveState();
      renderLevelBadge();
      newly.forEach(a => showToast("Achievement unlocked: " + a.title));
      const historyView = document.getElementById("view-history");
      if(historyView && !historyView.hidden) renderHistory();
    }
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
    renderLevelBadge();
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
    state.habits.forEach((habit, idx) => {
      const row = rowTpl.content.firstElementChild.cloneNode(true);
      row.dataset.id = habit.id;
      row.style.setProperty("--habit-color", habit.color);

      const upBtn = $(".reorder-up", row);
      const downBtn = $(".reorder-down", row);
      upBtn.disabled = idx === 0;
      downBtn.disabled = idx === state.habits.length - 1;
      upBtn.addEventListener("click", () => moveHabit(habit.id, -1));
      downBtn.addEventListener("click", () => moveHabit(habit.id, 1));

      const dot = $(".habit-dot", row);
      dot.style.color = habit.color;
      dot.style.background = habit.color;

      const input = $(".habit-name-input", row);
      input.value = habit.name;
      input.addEventListener("change", () => renameHabit(habit.id, input.value));
      input.addEventListener("keydown", e => { if(e.key==="Enter") input.blur(); });

      $(".habit-delete", row).addEventListener("click", () => deleteHabit(habit.id));

      const commentBtn = $(".habit-comment", row);
      if(habit.comment) commentBtn.classList.add("has-note");
      commentBtn.title = habit.comment ? habit.comment : "Add note";
      commentBtn.addEventListener("click", () => {
        showPopover(commentBtn, habit.comment || "", (text) => {
          habit.comment = text.trim();
          saveState();
          commentBtn.classList.toggle("has-note", !!habit.comment);
          commentBtn.title = habit.comment || "Add note";
        });
      });

      const daysWrap = $(".habit-days", row);
      const isCount = habit.mode === "count";
      for(let d=1; d<=dim; d++){
        const dateKey = keyFor(y,m,d);
        const cellWrap = document.createElement("div");
        cellWrap.className = "day-cell";
        const btn = document.createElement("button");
        const future = isFuture(y,m,d);
        btn.style.setProperty("--habit-color", habit.color);

        if(isCount){
          const count = (state.completions[habit.id] && state.completions[habit.id][dateKey]) || 0;
          const atTarget = count >= (habit.target || 1);
          btn.className = "count-btn" + (atTarget ? " checked" : (count > 0 ? " partial" : "")) + (future ? " future" : "");
          btn.textContent = count > 0 ? count : "";
          btn.setAttribute("aria-label", `${habit.name} — ${dateKey}: ${count}/${habit.target || 1}`);
          if(!future){
            btn.addEventListener("click", () => {
              const wasAtTarget = dayDone(habit, dateKey);
              const next = incrementCount(habit.id, dateKey);
              const nowAtTarget = next >= (habit.target || 1);
              btn.className = "count-btn" + (nowAtTarget ? " checked" : (next > 0 ? " partial" : ""));
              btn.textContent = next > 0 ? next : "";
              if(!wasAtTarget && nowAtTarget) addXP(10);
              renderChart();
              renderStats();
              checkAchievements();
            });
            btn.addEventListener("dblclick", (e) => {
              e.preventDefault();
              resetCount(habit.id, dateKey);
              btn.className = "count-btn";
              btn.textContent = "";
              renderChart();
              renderStats();
            });
          }
        } else {
          const checked = !!(state.completions[habit.id] && state.completions[habit.id][dateKey]);
          btn.className = (checked ? "checked " : "") + (future ? "future" : "");
          btn.setAttribute("aria-label", `${habit.name} — ${dateKey}`);
          if(!future){
            btn.addEventListener("click", () => {
              const wasDone = dayDone(habit, dateKey);
              toggleDay(habit.id, dateKey);
              const nowDone = dayDone(habit, dateKey);
              btn.classList.toggle("checked");
              if(!wasDone && nowDone) addXP(10);
              renderChart();
              renderStats();
              checkAchievements();
            });
          }
        }

        cellWrap.appendChild(btn);
        daysWrap.appendChild(cellWrap);
      }
      grid.appendChild(row);
    });

    scrollToToday();
  }

  function scrollToToday(){
    const y = state.viewYear, m = state.viewMonth;
    if(y !== today.getFullYear() || m !== today.getMonth()) return;
    requestAnimationFrame(() => {
      const scrollEl = document.querySelector(".log-scroll");
      const todayCell = document.querySelector(".day-header .day-num.today");
      if(!scrollEl || !todayCell) return;
      const scrollRect = scrollEl.getBoundingClientRect();
      const cellRect = todayCell.getBoundingClientRect();
      const offsetWithinContent = (cellRect.left - scrollRect.left) + scrollEl.scrollLeft;
      const target = offsetWithinContent - (scrollEl.clientWidth / 2) + (cellRect.width / 2);
      scrollEl.scrollLeft = Math.max(0, target);
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
    const categorySelect = $(".category-select", form);
    const countCheckbox = $(".count-mode-checkbox", form);
    const targetRow = $(".count-target-row", form);
    const targetInput = $(".count-target-input", form);
    countCheckbox.addEventListener("change", () => {
      targetRow.hidden = !countCheckbox.checked;
      if(countCheckbox.checked) requestAnimationFrame(() => targetInput.focus());
    });

    const close = () => { form.remove(); formOpen = false; btn.hidden = false; };
    const commit = () => {
      if(input.value.trim()){
        const mode = countCheckbox.checked ? "count" : "check";
        addHabit(input.value, selected, mode, targetInput.value, categorySelect.value);
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
    state.habits.forEach(h => {
      const bucket = state.completions[h.id] || {};
      Object.keys(bucket).forEach(dk => {
        if(dayDone(h, dk)) set.add(dk);
      });
    });
    return set;
  }

  function computeStreaks(){
    const set = successDateSet();
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

  function computeMonthAverage(){
    const y = state.viewYear, m = state.viewMonth;
    if(state.habits.length === 0) return 0;
    const dim = daysInMonth(y,m);
    const lastDay = (y===today.getFullYear() && m===today.getMonth()) ? today.getDate() : dim;
    if(y > today.getFullYear() || (y===today.getFullYear() && m > today.getMonth())) return 0;

    let possible = 0, sum = 0;
    for(let d=1; d<=lastDay; d++){
      const dateKey = keyFor(y,m,d);
      state.habits.forEach(h => {
        if(habitEffectiveStart(h) > dateKey) return;
        possible++;
        sum += dayValue(h, dateKey);
      });
    }
    return possible === 0 ? 0 : Math.round(sum/possible);
  }

  function renderStats(){
    const { current, best } = computeStreaks();
    $("#statStreak").textContent = current;
    $("#statBest").textContent = best;
    $("#statAvg").textContent = computeMonthAverage() + "%";
    renderDailyRing();
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
        if(habitEffectiveStart(h) > dk) return null;
        return dayValue(h, dk);
      });
    });

    const rawOverall = dayKeys.map((dk, i) => {
      const vals = state.habits
        .filter(h => habitEffectiveStart(h) <= dk)
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
     Generic popover (used for per-habit notes)
     ============================================================ */
  let openPopover = null;
  function closePopover(){
    if(openPopover){ openPopover.remove(); openPopover = null; }
  }
  function showPopover(anchorEl, initialText, onSave){
    closePopover();
    const tpl = $("#popoverTemplate");
    const pop = tpl.content.firstElementChild.cloneNode(true);
    document.body.appendChild(pop);
    openPopover = pop;

    const rect = anchorEl.getBoundingClientRect();
    const popW = 220;
    let left = rect.left;
    if(left + popW > window.innerWidth - 12) left = window.innerWidth - popW - 12;
    pop.style.left = left + "px";
    pop.style.top = (rect.bottom + 6) + "px";

    const ta = $(".popover-textarea", pop);
    ta.value = initialText;
    requestAnimationFrame(() => ta.focus());

    const save = () => { onSave(ta.value); closePopover(); };
    $(".popover-save", pop).addEventListener("click", save);
    $(".popover-close", pop).addEventListener("click", closePopover);
    ta.addEventListener("keydown", e => {
      if(e.key === "Escape") closePopover();
      if(e.key === "Enter" && (e.metaKey || e.ctrlKey)) save();
    });

    setTimeout(() => {
      document.addEventListener("click", function onDoc(e){
        if(!pop.contains(e.target) && e.target !== anchorEl){
          closePopover();
          document.removeEventListener("click", onDoc);
        }
      });
    }, 0);
  }

  /* ============================================================
     View switching (Today / Journal / Goals / History / Insights / Settings)
     ============================================================ */
  function switchView(view){
    state.currentView = view;
    saveState();
    $$(".view").forEach(v => v.hidden = (v.id !== "view-" + view));
    $$(".menu-item").forEach(b => b.classList.toggle("active", b.dataset.view === view));
    if(view === "journal") renderJournal();
    if(view === "goals") renderGoals();
    if(view === "history") renderHistory();
    if(view === "insights") renderInsights();
    if(view === "settings"){ updateSavedLabel(); renderAccountUI(); }
  }

  function initMenu(){
    const btn = $("#menuBtn");
    const dropdown = $("#menuDropdown");
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = dropdown.hidden;
      dropdown.hidden = !open;
      btn.setAttribute("aria-expanded", String(open));
    });
    $$(".menu-item").forEach(item => {
      item.addEventListener("click", () => {
        switchView(item.dataset.view);
        dropdown.hidden = true;
        btn.setAttribute("aria-expanded", "false");
      });
    });
    document.addEventListener("click", (e) => {
      if(!dropdown.hidden && !dropdown.contains(e.target) && e.target !== btn){
        dropdown.hidden = true;
        btn.setAttribute("aria-expanded", "false");
      }
    });
  }

  /* ============================================================
     Journal
     ============================================================ */
  let journalDate = keyForDate(today);
  let journalSaveTimer = null;

  function flushJournal(){
    const ta = $("#journalEntry");
    if(!ta) return;
    const hadContentBefore = !!(state.journal[journalDate] && state.journal[journalDate].trim());
    const val = ta.value;
    if(val.trim()) state.journal[journalDate] = val;
    else delete state.journal[journalDate];
    const hasContentNow = !!val.trim();
    if(!hadContentBefore && hasContentNow) addXP(5);
    saveState();
  }

  function renderJournal(){
    const [Y,M,D] = journalDate.split("-").map(Number);
    const dt = new Date(Y, M-1, D);
    $("#journalDateLabel").textContent = `${MONTH_NAMES[dt.getMonth()]} ${D}, ${Y}`;

    const ta = $("#journalEntry");
    ta.value = state.journal[journalDate] || "";

    renderJournalHistory();
  }

  function renderJournalHistory(){
    const list = $("#journalHistoryList");
    list.innerHTML = "";
    const dates = Object.keys(state.journal).filter(dk => state.journal[dk] && state.journal[dk].trim()).sort().reverse().slice(0, 12);
    if(dates.length === 0){
      list.innerHTML = `<div class="journal-empty">No entries yet.</div>`;
      return;
    }
    dates.forEach(dk => {
      const item = document.createElement("div");
      item.className = "journal-history-item";
      const preview = state.journal[dk].slice(0, 60).replace(/\n/g, " ");
      item.innerHTML = `<span class="jh-date">${dk}</span><span class="jh-preview">${escapeHtml(preview)}</span>`;
      item.addEventListener("click", () => {
        flushJournal();
        journalDate = dk;
        renderJournal();
      });
      list.appendChild(item);
    });
  }

  function initJournal(){
    $("#prevDay").addEventListener("click", () => {
      flushJournal();
      const [Y,M,D] = journalDate.split("-").map(Number);
      journalDate = keyForDate(addDays(new Date(Y, M-1, D), -1));
      renderJournal();
    });
    $("#nextDay").addEventListener("click", () => {
      flushJournal();
      const [Y,M,D] = journalDate.split("-").map(Number);
      journalDate = keyForDate(addDays(new Date(Y, M-1, D), 1));
      renderJournal();
    });
    $("#jumpToday").addEventListener("click", () => {
      flushJournal();
      journalDate = keyForDate(today);
      renderJournal();
    });

    const ta = $("#journalEntry");
    ta.addEventListener("input", () => {
      clearTimeout(journalSaveTimer);
      journalSaveTimer = setTimeout(() => {
        flushJournal();
        renderJournalHistory();
      }, 500);
    });
    window.addEventListener("beforeunload", flushJournal);
  }

  /* ============================================================
     Goals
     ============================================================ */
  function addGoal(text, dueDate){
    const id = "g_" + Date.now().toString(36) + Math.random().toString(36).slice(2,6);
    state.goals.push({ id, text: text.trim(), done: false, dueDate: dueDate || "", completedAt: null, createdAt: keyForDate(today) });
    saveState();
    renderGoals();
  }

  function toggleGoalDone(id){
    const g = state.goals.find(g => g.id === id);
    if(g){
      g.done = !g.done;
      g.completedAt = g.done ? keyForDate(today) : null;
      if(g.done) addXP(25);
      saveState();
      renderGoals();
      checkAchievements();
    }
  }

  function renameGoal(id, text){
    const g = state.goals.find(g => g.id === id);
    if(g){ g.text = text.trim() || g.text; saveState(); }
  }

  function deleteGoal(id){
    state.goals = state.goals.filter(g => g.id !== id);
    saveState();
    renderGoals();
  }

  function renderGoals(){
    const list = $("#goalList");
    if(!list) return;
    list.innerHTML = "";
    if(state.goals.length === 0){
      list.innerHTML = `<div class="goal-empty">No goals yet — add something you're working toward.</div>`;
      return;
    }
    const sorted = [...state.goals].sort((a,b) => (a.done === b.done) ? 0 : (a.done ? 1 : -1));
    sorted.forEach(g => {
      const item = document.createElement("div");
      item.className = "goal-item" + (g.done ? " done" : "");

      const check = document.createElement("button");
      check.className = "goal-check" + (g.done ? " done" : "");
      check.setAttribute("aria-label", g.done ? "Mark not done" : "Mark done");
      check.textContent = g.done ? "✓" : "";
      check.addEventListener("click", () => toggleGoalDone(g.id));
      item.appendChild(check);

      const text = document.createElement("input");
      text.className = "goal-text";
      text.type = "text";
      text.maxLength = 120;
      text.value = g.text;
      text.spellcheck = false;
      text.addEventListener("change", () => renameGoal(g.id, text.value));
      text.addEventListener("keydown", e => { if(e.key === "Enter") text.blur(); });
      item.appendChild(text);

      if(g.dueDate){
        const due = document.createElement("span");
        due.className = "goal-due";
        due.textContent = g.dueDate;
        item.appendChild(due);
      }

      const del = document.createElement("button");
      del.className = "goal-delete";
      del.setAttribute("aria-label", "Delete goal");
      del.textContent = "×";
      del.addEventListener("click", () => deleteGoal(g.id));
      item.appendChild(del);

      list.appendChild(item);
    });
  }

  function initGoals(){
    const addBtn = $("#goalAddBtn");
    const input = $("#goalInput");
    const dateInput = $("#goalDateInput");
    const commit = () => {
      if(input.value.trim()){
        addGoal(input.value, dateInput.value);
        input.value = "";
        dateInput.value = "";
        input.focus();
      }
    };
    addBtn.addEventListener("click", commit);
    input.addEventListener("keydown", e => { if(e.key === "Enter") commit(); });
  }

  /* ============================================================
     My History — unified feed: manual notes + journal + goals + achievements
     ============================================================ */
  function addHistoryNote(text, date){
    const id = "n_" + Date.now().toString(36) + Math.random().toString(36).slice(2,6);
    state.historyNotes.push({ id, text: text.trim(), date: date || keyForDate(today), createdAt: keyForDate(today) });
    saveState();
    renderHistory();
  }

  function deleteHistoryNote(id){
    state.historyNotes = state.historyNotes.filter(n => n.id !== id);
    saveState();
    renderHistory();
  }

  function buildHistoryFeed(){
    const items = [];
    state.historyNotes.forEach(n => {
      items.push({ date: n.date || n.createdAt, text: n.text, tag: "📝", type: "note", id: n.id });
    });
    Object.keys(state.journal).forEach(dk => {
      const text = state.journal[dk];
      if(text && text.trim()){
        const preview = text.slice(0, 80).replace(/\n/g, " ");
        items.push({ date: dk, text: "Journal: " + preview, tag: "🖊", type: "journal" });
      }
    });
    state.goals.forEach(g => {
      if(g.done && g.completedAt){
        items.push({ date: g.completedAt, text: "Completed goal: " + g.text, tag: "🎯", type: "goal" });
      }
    });
    state.achievements.forEach(a => {
      items.push({ date: a.unlockedAt, text: "Achievement: " + a.title, tag: "🏆", type: "achievement" });
    });
    items.sort((a,b) => b.date.localeCompare(a.date));
    return items;
  }

  function renderHistory(){
    const list = $("#historyList");
    if(!list) return;
    const items = buildHistoryFeed();
    list.innerHTML = "";
    if(items.length === 0){
      list.innerHTML = `<div class="goal-empty">Nothing logged yet — add something, or keep using the app and milestones will show up here.</div>`;
      return;
    }
    items.forEach(item => {
      const row = document.createElement("div");
      row.className = "history-item" + (item.type === "achievement" ? " achievement" : "");
      row.innerHTML = `
        <span class="history-tag">${item.tag}</span>
        <div class="history-body">
          <div class="history-text">${escapeHtml(item.text)}</div>
          <div class="history-date">${item.date}</div>
        </div>
        ${item.type === "note" ? '<button class="history-delete" aria-label="Delete">×</button>' : ""}
      `;
      if(item.type === "note"){
        $(".history-delete", row).addEventListener("click", () => deleteHistoryNote(item.id));
      }
      list.appendChild(row);
    });
  }

  function initHistory(){
    const addBtn = $("#historyAddBtn");
    const input = $("#historyInput");
    const dateInput = $("#historyDateInput");
    const commit = () => {
      if(input.value.trim()){
        addHistoryNote(input.value, dateInput.value);
        input.value = "";
        dateInput.value = "";
        input.focus();
      }
    };
    addBtn.addEventListener("click", commit);
    input.addEventListener("keydown", e => { if(e.key === "Enter") commit(); });
  }

  /* ============================================================
     Insights
     ============================================================ */
  function renderXpCard(){
    const prog = xpProgress(state.xp || 0);
    const levelText = $("#xpLevelText"), amountText = $("#xpAmountText"), bar = $("#xpBarFill");
    if(levelText) levelText.textContent = `Level ${prog.level} — ${titleForLevel(prog.level)}`;
    if(amountText) amountText.textContent = `${state.xp || 0} XP`;
    if(bar) bar.style.width = prog.pct + "%";
  }

  function renderCategoryBreakdown(){
    const list = $("#categoryList");
    if(!list) return;
    list.innerHTML = "";
    const todayKey = keyForDate(today);
    const present = CATEGORIES.filter(cat => state.habits.some(h => (h.category || "other") === cat.id));
    if(present.length === 0){
      list.innerHTML = `<div class="insight-empty">Add habits to see a category breakdown.</div>`;
      return;
    }
    present.forEach(cat => {
      const habitsInCat = state.habits.filter(h => (h.category || "other") === cat.id);
      let sum = 0, count = 0;
      habitsInCat.forEach(h => {
        const [cy,cm,cd] = habitEffectiveStart(h).split("-").map(Number);
        let cursor = new Date(cy, cm-1, cd);
        while(keyForDate(cursor) <= todayKey){
          sum += dayValue(h, keyForDate(cursor));
          count++;
          cursor = addDays(cursor, 1);
        }
      });
      const pct = count === 0 ? 0 : Math.round(sum/count);
      const row = document.createElement("div");
      row.className = "insight-row";
      row.innerHTML = `
        <span class="insight-name">${cat.label}</span>
        <div class="insight-bar-track"><div class="insight-bar-fill" style="width:${pct}%; background:${cat.color};"></div></div>
        <span class="insight-pct">${pct}%</span>
      `;
      list.appendChild(row);
    });
  }

  function renderInsights(){
    renderXpCard();
    renderCategoryBreakdown();

    const summary = $("#insightSummary");
    const { current, best } = computeStreaks();
    let totalChecks = 0;
    Object.keys(state.completions).forEach(hid => {
      const h = state.habits.find(x => x.id === hid);
      const bucket = state.completions[hid] || {};
      Object.keys(bucket).forEach(dk => { if(h ? dayDone(h, dk) : bucket[dk]) totalChecks++; });
    });
    summary.innerHTML = `
      <div class="stat"><span class="stat-value">${current}</span><span class="stat-label">current streak</span></div>
      <div class="stat"><span class="stat-value">${best}</span><span class="stat-label">best streak</span></div>
      <div class="stat"><span class="stat-value">${totalChecks}</span><span class="stat-label">total check-ins</span></div>
      <div class="stat"><span class="stat-value">${state.achievements.length}</span><span class="stat-label">badges</span></div>
    `;

    const list = $("#insightList");
    list.innerHTML = "";
    if(state.habits.length === 0){
      list.innerHTML = `<div class="insight-empty">Add a habit to see its stats here.</div>`;
      return;
    }
    const todayKey = keyForDate(today);
    state.habits.forEach(h => {
      let possible = 0, sum = 0, doneDays = 0;
      const [cy,cm,cd] = habitEffectiveStart(h).split("-").map(Number);
      let cursor = new Date(cy, cm-1, cd);
      while(keyForDate(cursor) <= todayKey){
        const dk = keyForDate(cursor);
        possible++;
        sum += dayValue(h, dk);
        if(dayDone(h, dk)) doneDays++;
        cursor = addDays(cursor, 1);
      }
      const pct = possible === 0 ? 0 : Math.round(sum/possible);
      const detail = h.mode === "count"
        ? `${doneDays}/${possible} at target · ${pct}%`
        : `${doneDays}/${possible} · ${pct}%`;
      const row = document.createElement("div");
      row.className = "insight-row";
      row.innerHTML = `
        <span class="insight-name">${escapeHtml(h.name)}</span>
        <div class="insight-bar-track"><div class="insight-bar-fill" style="width:${pct}%; background:${h.color};"></div></div>
        <span class="insight-pct">${detail}</span>
      `;
      list.appendChild(row);
    });
  }

  /* ============================================================
     Settings — profile / export / import / reset
     ============================================================ */
  function showToast(msg){
    const t = $("#appToast");
    if(!t) return;
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => { t.hidden = true; }, 2200);
  }

  function initProfile(){
    const input = $("#birthYearInput");
    if(!input) return;
    if(state.profile && state.profile.birthYear) input.value = state.profile.birthYear;
    input.addEventListener("change", () => {
      const val = parseInt(input.value, 10);
      if(val && val >= 1900 && val <= today.getFullYear()){
        state.profile.birthYear = val;
        saveState();
        renderAgeRing();
        checkAchievements();
      }
    });
  }

  function initSettings(){
    $("#exportBtn").addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `stat-log-backup-${keyForDate(today)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("Backup downloaded.");
    });

    $("#importInput").addEventListener("change", (e) => {
      const file = e.target.files[0];
      if(!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try{
          const parsed = JSON.parse(reader.result);
          if(!parsed || typeof parsed !== "object" || !Array.isArray(parsed.habits)){
            throw new Error("Not a valid backup file");
          }
          state = Object.assign(defaultState(), parsed);
          if(!state.profile) state.profile = { birthYear: null };
          saveState();
          render();
          renderJournal();
          renderGoals();
          renderHistory();
          renderInsights();
          renderAgeRing();
          const birthInput = $("#birthYearInput");
          if(birthInput) birthInput.value = state.profile.birthYear || "";
          showToast("Backup imported.");
        }catch(err){
          showToast("Couldn't read that file — is it a Stat Log backup?");
        }
      };
      reader.readAsText(file);
      e.target.value = "";
    });

    $("#resetBtn").addEventListener("click", () => {
      if(!confirm("This clears all habits, history, goals, and journal entries on this device. Export a backup first if you want to keep them. Continue?")) return;
      localStorage.removeItem(STORAGE_KEY);
      state = defaultState();
      journalDate = keyForDate(today);
      saveState();
      render();
      renderJournal();
      renderGoals();
      renderHistory();
      renderInsights();
      renderAgeRing();
      const birthInput = $("#birthYearInput");
      if(birthInput) birthInput.value = "";
      showToast("All data cleared.");
    });
  }

  /* ============================================================
     Account — Netlify Identity login + remote sync via Netlify Blobs
     ============================================================ */
  const STATE_ENDPOINT = "/.netlify/functions/state";
  let lastSyncedAt = null;
  let pushTimer = null;
  let syncing = false;

  function currentIdentityUser(){
    return (window.netlifyIdentity && netlifyIdentity.currentUser()) || null;
  }

  async function authHeaders(){
    const user = currentIdentityUser();
    if(!user) return null;
    try{
      const token = await user.jwt();
      return { "Authorization": "Bearer " + token, "Content-Type": "application/json" };
    }catch(e){
      console.warn("Could not get auth token.", e);
      return null;
    }
  }

  function scheduleRemotePush(){
    if(!currentIdentityUser()) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => pushRemoteState(false), 1500);
  }

  async function pushRemoteState(manual){
    const headers = await authHeaders();
    if(!headers){
      if(manual) showToast("Not logged in — can't sync.");
      return;
    }
    syncing = true;
    updateSyncedLabel();
    try{
      const res = await fetch(STATE_ENDPOINT, { method: "POST", headers, body: JSON.stringify(state) });
      if(res.ok){
        lastSyncedAt = new Date();
        if(manual) showToast("Synced.");
      }else{
        let detail = "";
        try{ const body = await res.json(); if(body.error) detail = ": " + body.error; }catch(e){}
        console.warn("Sync push failed with status", res.status, detail);
        showToast(`Sync failed (${res.status})${detail}`);
      }
    }catch(e){
      console.warn("Remote sync push failed.", e);
      showToast("Sync failed — network error.");
    }
    syncing = false;
    updateSyncedLabel();
  }

  async function pullRemoteState(){
    const headers = await authHeaders();
    if(!headers) return undefined;
    try{
      const res = await fetch(STATE_ENDPOINT, { method: "GET", headers });
      if(!res.ok) return undefined;
      const json = await res.json();
      return json.data;
    }catch(e){
      console.warn("Remote sync pull failed.", e);
      return undefined;
    }
  }

  function updateSyncedLabel(){
    const label = document.getElementById("syncedLabel");
    if(!label) return;
    const user = currentIdentityUser();
    if(!user){ label.hidden = true; return; }
    label.hidden = false;
    if(syncing){ label.textContent = "Syncing…"; return; }
    if(!lastSyncedAt){ label.textContent = "Not synced yet"; return; }
    const hh = String(lastSyncedAt.getHours()).padStart(2,"0");
    const mm = String(lastSyncedAt.getMinutes()).padStart(2,"0");
    const ss = String(lastSyncedAt.getSeconds()).padStart(2,"0");
    label.textContent = `Synced ${hh}:${mm}:${ss}`;
  }

  function renderAccountUI(){
    const note = document.getElementById("accountNote");
    const actions = document.getElementById("accountActions");
    if(!note || !actions) return;
    const user = currentIdentityUser();

    if(user){
      note.textContent = `Logged in as ${user.email}. This device syncs to your account automatically.`;
      actions.innerHTML = "";
      const logoutBtn = document.createElement("button");
      logoutBtn.className = "settings-btn danger";
      logoutBtn.textContent = "Log out";
      logoutBtn.addEventListener("click", () => netlifyIdentity.logout());
      actions.appendChild(logoutBtn);

      const syncBtn = document.createElement("button");
      syncBtn.className = "settings-btn";
      syncBtn.textContent = "Sync now";
      syncBtn.addEventListener("click", () => pushRemoteState(true));
      actions.appendChild(syncBtn);
    }else{
      note.textContent = "Log in to access your habits from another device. Your data on this device stays put either way.";
      actions.innerHTML = `<button class="settings-btn" id="loginBtn">Log in / Sign up</button>`;
      document.getElementById("loginBtn").addEventListener("click", () => netlifyIdentity.open("login"));
    }
    updateSyncedLabel();
  }

  async function handleLogin(user){
    netlifyIdentity.close();
    showToast(`Logged in as ${user.email}`);
    const remote = await pullRemoteState();
    if(remote){
      state = Object.assign(defaultState(), remote);
      if(!state.profile) state.profile = { birthYear: null };
      journalDate = keyForDate(today);
      saveStateLocalOnly();
      render();
      renderJournal();
      renderGoals();
      renderHistory();
      renderInsights();
      renderAgeRing();
      const birthInput = $("#birthYearInput");
      if(birthInput) birthInput.value = state.profile.birthYear || "";
      showToast("Synced data loaded from your account.");
    }else{
      await pushRemoteState(false);
      showToast("This device's data is now synced to your account.");
    }
    renderAccountUI();
  }

  function saveStateLocalOnly(){
    try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); onSaveSuccess(); }
    catch(e){ onSaveFailure(); }
  }

  function initAccount(){
    if(!window.netlifyIdentity){ return; }
    netlifyIdentity.on("init", () => renderAccountUI());
    netlifyIdentity.on("login", handleLogin);
    netlifyIdentity.on("logout", () => {
      showToast("Logged out — this device's data stays local.");
      lastSyncedAt = null;
      renderAccountUI();
    });
    netlifyIdentity.init();
  }

  /* ============================================================
     Daily quote
     ============================================================ */
  function dayOfYear(dt){
    const start = new Date(dt.getFullYear(), 0, 0);
    return Math.floor((dt - start) / 86400000);
  }

  function renderQuote(){
    const el = $("#quoteStrip");
    if(!el || typeof QUOTES === "undefined" || QUOTES.length === 0) return;
    const idx = dayOfYear(today) % QUOTES.length;
    el.textContent = QUOTES[idx];
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

    if(!storageIsAvailable()) showSaveBanner();

    initResize();
    initMenu();
    initJournal();
    initGoals();
    initHistory();
    initSettings();
    initProfile();
    initAccount();
    render();
    renderQuote();
    renderAgeRing();
    switchView(state.currentView || "today");
    updateSavedLabel();

    if("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")){
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
