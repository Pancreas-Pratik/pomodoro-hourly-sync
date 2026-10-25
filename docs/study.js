/* Minimal Pomo shared Study Board & Calendar (Eastern Time).
   Only this module and the SQL migration are new: timer/sounds remain unchanged.
   A user-entered study name is the matching key; no identity authentication. */
import {SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY} from './config.js';

const $ = id => document.getElementById(id);
const apiUrl = location.hostname.endsWith('.discordsays.com')
  ? `${location.origin}/.proxy/supabase` : SUPABASE_URL;
const nyParts = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit'
});
const dateFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric'
});
const monthFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC', year: 'numeric', month: 'long'
});

function todayET() {
  const p = Object.fromEntries(nyParts.formatToParts(Date.now())
    .map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
const dateUTC = key => new Date(`${key}T12:00:00Z`);
const dateTitle = day => dateFmt.format(dateUTC(day));
const firstOfMonth = day => `${day.slice(0, 7)}-01`;
const normalize = s => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
const el = (tag, text) => {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  return n;
};
const pad = n => String(n).padStart(2, '0');
const duration = seconds => {
  const n = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${pad(Math.floor(n / 3600))}:${pad(Math.floor(n / 60) % 60)}:${pad(n % 60)}`;
};
const shortDuration = seconds => {
  const n = Math.max(0, Math.round(Number(seconds) || 0));
  if (n < 3600) return `${Math.floor(n / 60)}m`;
  return `${Math.floor(n / 3600)}h${Math.floor(n % 3600 / 60) ? `${Math.floor(n % 3600 / 60)}m` : ''}`;
};
const savedName = (() => {
  try { return localStorage.getItem('pomo-study-name') || ''; }
  catch { return ''; }
})();

let boardKey = null;
let name = savedName.trim();
let sessionId = null;
let interaction = null;
let writing = false;
let readingToday = false;
let readingDay = false;
let readingMonth = false;
let activeDay = todayET();
let calendarMonth = firstOfMonth(activeDay);
let selectedDay = activeDay;
let previewDay = null;
let previewGeneration = 0;
let monthData = [];
const previewCache = new Map();
const expanded = new Map();
const taskPages = new Map();
let previewAnchor = null;
let previewHideTimer = null;

const css = document.createElement('style');
css.textContent = `
#study-open {display:block;margin:9px auto 0;min-height:32px;padding:6px 15px;font-size:12px}
#study-name-box {margin:16px 0;padding:12px 0;border-top:1px solid var(--line)}
#study-name-box label {display:block;margin-bottom:8px}
#study-name {width:100%;padding:10px;border:1px solid var(--line);border-radius:7px}
#study-dialog,#study-calendar,#study-day-dialog {
  width:min(560px,calc(100vw - 20px));max-height:84dvh;overflow:auto;
  padding:14px;border:1px solid var(--line);border-radius:12px;
  background:var(--surface);color:inherit;
}
#study-calendar {width:min(870px,calc(100vw - 16px));max-height:90dvh}
#study-day-dialog {width:min(590px,calc(100vw - 20px))}
#study-dialog::backdrop,#study-calendar::backdrop,#study-day-dialog::backdrop {background:rgba(0,0,0,.68)}
.study-top,.study-calendar-nav {display:flex;align-items:center;justify-content:space-between;gap:8px}
.study-top h2 {font-size:17px;margin:0;min-width:0}
.study-actions {display:flex;align-items:center;gap:6px}
.study-actions button,.study-calendar-nav button {min-height:28px;padding:4px 9px;font-size:12px}
.study-status {color:var(--muted);font-size:11px;line-height:1.4;margin:7px 0}
.study-form {display:flex;align-items:center;gap:7px;margin:8px 0}
.study-form input {min-width:0;flex:1;min-height:33px;padding:7px;border:1px solid var(--line);border-radius:6px}
.study-form button {min-height:33px;padding:6px 12px}
.study-person {border-top:1px solid var(--line);padding:5px 0 1px}
.study-person-head {display:grid;grid-template-columns:12px minmax(0,1fr) auto;gap:5px;align-items:center;min-height:30px;cursor:pointer;user-select:none}
.study-person-head::before {content:'▾';color:var(--muted);font-size:12px}
.study-person.is-collapsed .study-person-head::before {content:'▸'}
.study-person-head strong {min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12px}
.study-time {font-size:10px;font-variant-numeric:tabular-nums;white-space:nowrap;color:var(--muted)}
.study-task-rows {padding-left:6px}
.study-person.is-collapsed .study-task-rows {display:none}
.study-row {display:flex;align-items:center;gap:5px;min-height:28px;margin:1px 0;font-size:12px}
.study-row input[type=checkbox] {width:15px;height:15px;flex:0 0 15px;accent-color:var(--accent)}
.study-task-text {flex:1;min-width:0;overflow-wrap:anywhere}
.study-task-text[data-editable=true] {cursor:text}
.study-task-text[data-editable=true]:focus-visible {outline:2px solid var(--accent);outline-offset:2px}
.study-inline-edit {flex:1;min-width:0;padding:4px;border:1px solid var(--line);border-radius:5px;font:inherit}
.study-grip {padding:4px 3px;opacity:.6;cursor:grab;touch-action:none;user-select:none;font-size:16px;letter-spacing:-4px}
.study-grip:active {cursor:grabbing}
.study-row.is-dragging {opacity:.6}
.study-row button {min-height:24px;padding:2px 6px;font-size:12px}
.study-empty {color:var(--muted);font-size:12px;margin:7px 0}
#study-mini-timer {display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 10px;margin:9px 0;border:1px solid var(--line);border-radius:9px}
.study-mini-readout {display:flex;flex-direction:column;gap:2px}
#study-mini-phase {font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em}
#study-mini-countdown {font-variant-numeric:tabular-nums;font-size:23px;line-height:1.1}
.study-mini-controls {display:flex;gap:6px}
.study-mini-controls button {min-height:30px;padding:5px 9px;font-size:12px}
.study-mini-controls button:disabled {opacity:.5}
.study-calendar-nav {margin:12px 0 9px}
.study-calendar-nav strong {font-size:15px}
.study-calendar-grid {display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:3px}
.study-weekday {text-align:center;font-size:10px;color:var(--muted);padding:3px 0}
.study-day-cell {min-width:0;min-height:96px;max-height:180px;overflow-y:auto;border:1px solid var(--line);border-radius:6px;padding:4px;cursor:pointer;background:transparent;color:inherit;text-align:left;display:flex;flex-direction:column;gap:3px;font:inherit}
.study-day-cell:hover,.study-day-cell:focus-visible,.study-day-cell.is-previewed {outline:1px solid var(--accent);outline-offset:0}
.study-day-cell.is-today .study-day-number {text-decoration:underline;font-weight:700}
.study-day-cell:disabled {opacity:.45;cursor:default}
.study-day-number {font-size:11px;font-weight:600;line-height:1.1}
.study-day-person {font-size:9px;line-height:1.15;display:flex;justify-content:space-between;gap:2px;min-width:0}
.study-day-person-name {white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;flex:1}
.study-day-person-stats {white-space:nowrap;flex:0 0 auto;font-variant-numeric:tabular-nums}
.study-day-more {font-size:9px;color:var(--muted)}
#study-preview {border-top:1px solid var(--line);margin-top:12px;padding-top:8px}
#study-preview h3 {font-size:13px;margin:0 0 8px}
.study-preview-empty {color:var(--muted);font-size:12px;margin:4px 0}
#study-preview .study-row {pointer-events:none}
@media(max-width:560px) {
  .study-day-cell {min-height:78px;padding:3px}
  .study-day-person {font-size:8px}
  .study-day-person-stats {display:none}
  .study-person-head {grid-template-columns:10px minmax(0,1fr) auto}
  .study-time {font-size:9px}
  .study-actions button {padding:4px 6px}
}

/* Full-window, no-scroll Study Board, day editor and calendar. */
#study-dialog,#study-day-dialog {
  width:min(940px,calc(100vw - 12px));
  max-width:none;
  height:calc(100dvh - 12px);
  max-height:calc(100dvh - 12px);
  margin:auto;
  overflow:hidden;
  padding:clamp(7px,1.4dvh,14px);
  flex-direction:column;
  gap:4px;
}
#study-dialog[open],#study-day-dialog[open] {display:flex}
#study-people,#study-day-people {flex:1;min-height:0;overflow:hidden}
#study-dialog .study-top,#study-day-dialog .study-top,
#study-mini-timer,#study-dialog .study-form,#study-day-dialog .study-form,
#study-dialog .study-status,#study-day-dialog .study-status {flex-shrink:0}
#study-mini-timer {margin:4px 0;padding:5px 9px}
#study-dialog .study-form,#study-day-dialog .study-form {margin:3px 0}
#study-dialog .study-status,#study-day-dialog .study-status {margin:2px 0}
.study-person {padding:3px 0 0}
.study-person-head {min-height:25px}
.study-row {min-height:25px;margin:0}
.study-task-pages {display:flex;gap:6px;align-items:center;justify-content:flex-start;
  padding:3px 0;font-size:10px;color:var(--muted)}
.study-task-pages button {min-height:23px;padding:2px 8px;font-size:11px}
.study-task-more {font-size:10px;color:var(--muted);margin:3px 0 5px 8px}

#study-calendar {
  width:min(1180px,calc(100vw - 12px));
  max-width:none;
  height:calc(100dvh - 12px);
  max-height:calc(100dvh - 12px);
  margin:auto;
  overflow:visible;
  position:relative;
  padding:clamp(7px,1.5dvh,13px);
  flex-direction:column;
  gap:4px;
}
#study-calendar[open] {display:flex}
#study-calendar .study-top,#study-calendar .study-calendar-nav,
#study-calendar #study-month-status {flex-shrink:0}
#study-calendar .study-calendar-nav {margin:2px 0;min-height:28px}
#study-calendar #study-month-status {margin:0;white-space:nowrap;
  text-overflow:ellipsis;overflow:hidden}
#study-calendar .study-calendar-grid {
  display:grid;
  grid-template-columns:repeat(7,minmax(0,1fr));
  flex:1;
  min-height:0;
  overflow:hidden;
  gap:3px;
}
#study-calendar .study-weekday {font-size:10px;padding:1px 0}
#study-calendar .study-day-cell {
  min-height:0;
  max-height:none;
  height:100%;
  overflow:hidden;
  padding:clamp(2px,.6vh,5px);
  gap:clamp(1px,.4vh,3px);
  align-items:stretch;
  justify-content:flex-start;
}
#study-calendar .study-day-number {font-size:clamp(9px,1.2vw,12px)}
#study-calendar .study-day-person {font-size:clamp(7px,.8vw,10px);line-height:1.15}
#study-calendar .study-day-more {font-size:clamp(7px,.8vw,10px)}
#study-calendar .study-day-person[hidden] {display:none}
#study-calendar #study-preview {
  display:none;
  position:fixed;
  width:min(400px,calc(100vw - 18px));
  max-height:calc(100dvh - 18px);
  overflow:hidden;
  box-shadow:0 15px 45px #0009;
  border:1px solid var(--accent);
  border-radius:10px;
  padding:10px 12px;
  margin:0;
  background:var(--surface);
  color:inherit;
  z-index:50;
  pointer-events:none;
}
#study-calendar #study-preview.is-visible {display:block}
#study-preview h3 {font-size:12px;margin:0 0 5px}
#study-preview .study-person {padding:2px 0}
#study-preview .study-person-head {min-height:22px}
#study-preview .study-row {min-height:20px;font-size:11px}
#study-preview .study-task-rows {padding-left:3px}
#study-preview .study-task-more {font-size:10px}
@media(max-width:550px) {
  #study-calendar .study-day-person-stats {display:none}
  #study-calendar #study-preview {width:min(340px,calc(100vw - 16px))}
  #study-calendar .study-day-person {font-size:8px}
  #study-calendar .study-day-cell {padding:2px}
}
@media(max-height:450px) {
  #study-calendar .study-top h2 {font-size:14px}
  #study-calendar #study-month-status {font-size:10px}
  #study-calendar .study-calendar-nav {min-height:23px}
  #study-calendar .study-calendar-nav button {min-height:23px}
  #study-calendar #study-preview {padding:6px 9px}
}

`;
document.head.appendChild(css);

// Name setting; matching name on devices deliberately shares an identity.
const nameBox = el('section');
nameBox.id = 'study-name-box';
nameBox.innerHTML = `<label for="study-name">Your study name</label>
  <input id="study-name" maxlength="40" placeholder="Enter your name" autocomplete="nickname">
  <p class="hint">Use the same name across devices for shared tasks and Activity time. No login.</p>`;
(document.querySelector('.settings-dialog-body') || document.querySelector('.settings'))?.prepend(nameBox);
if ($('study-name')) $('study-name').value = name;

const openButton = el('button', '☑ Study Board');
openButton.id = 'study-open';
openButton.type = 'button';
document.querySelector('.timer .controls')?.insertAdjacentElement('afterend', openButton);

// Main board and its original mini timer.
const boardDialog = el('dialog');
boardDialog.id = 'study-dialog';
boardDialog.innerHTML = `
  <div class="study-top"><h2>Shared Study Board</h2>
    <div class="study-actions"><button type="button" id="study-calendar-open">▦ Calendar</button>
      <button type="button" id="study-close" aria-label="Close board">✕</button></div>
  </div>
  <section id="study-mini-timer" aria-label="Shared Pomodoro timer">
    <div class="study-mini-readout"><span id="study-mini-phase">Focus</span>
      <strong id="study-mini-countdown">50:00</strong></div>
    <div class="study-mini-controls"><button type="button" id="study-mini-toggle">Pause</button>
      <button type="button" id="study-mini-reset">Reset</button></div>
  </section>
  <p class="study-status" id="study-status" role="status"></p>
  <form class="study-form" id="study-form">
    <input id="study-task" maxlength="200" placeholder="Add today's to-do" required>
    <button type="submit">Add</button></form>
  <div id="study-people"></div>`;
document.body.appendChild(boardDialog);

// Separate calendar window inside Discord (not an external browser tab).
const calendarDialog = el('dialog');
calendarDialog.id = 'study-calendar';
calendarDialog.innerHTML = `
  <div class="study-top"><h2>Study Calendar</h2>
    <div class="study-actions"><button type="button" id="study-calendar-close" aria-label="Close calendar">✕</button></div></div>
  <div class="study-calendar-nav">
    <button type="button" id="study-prev-month" aria-label="Previous month">‹</button>
    <strong id="study-month-label"></strong>
    <div class="study-actions"><button type="button" id="study-this-month">Today</button>
      <button type="button" id="study-next-month" aria-label="Next month">›</button></div>
  </div>
  <p class="study-status" id="study-month-status">Hover to preview a date; click to edit that day's tasks.</p>
  <div class="study-calendar-grid" id="study-month-grid"></div>
  <aside id="study-preview" role="tooltip" aria-live="off"></aside>`;
document.body.appendChild(calendarDialog);

const dayDialog = el('dialog');
dayDialog.id = 'study-day-dialog';
dayDialog.innerHTML = `
  <div class="study-top"><h2 id="study-day-title"></h2>
    <div class="study-actions"><button type="button" id="study-day-close" aria-label="Close day">✕</button></div></div>
  <p id="study-day-status" class="study-status" role="status"></p>
  <form class="study-form" id="study-day-form">
    <input id="study-day-task" maxlength="200" placeholder="Add a task to this date" required>
    <button type="submit">Add</button></form>
  <div id="study-day-people"></div>`;
document.body.appendChild(dayDialog);

function status(message, where = 'study-status') { $(where).textContent = message; }

async function rpc(method, params, keepalive = false) {
  const response = await fetch(`${apiUrl}/rest/v1/rpc/${method}`, {
    method: 'POST', keepalive,
    headers: {apikey: SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json'},
    body: JSON.stringify(params)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || `Supabase error ${response.status}`);
  return result;
}

async function presence(who, id, board, ending = false, keepalive = false) {
  if (!who || !id || !board) return;
  return rpc('pomo_study_presence', {
    p_board_key: board, p_display_name: who, p_session_id: id, p_end: ending
  }, keepalive);
}
function heartbeat() {
  if (!boardKey || !name) return;
  if (!sessionId) sessionId = crypto.randomUUID();
  presence(name, sessionId, boardKey).catch(error => {
    console.warn('Study Activity clock:', error);
    if (boardDialog.open) status(`Clock: ${error.message}`);
  });
}
function setBoard(next) {
  if (!/^(channel|instance):[A-Za-z0-9_-]{1,128}$/.test(next || '') || boardKey === next) return;
  if (boardKey && sessionId && name) presence(name, sessionId, boardKey, true, true).catch(() => {});
  boardKey = next;
  sessionId = null;
  previewCache.clear();
  heartbeat();
  if (boardDialog.open) refreshToday();
  if (calendarDialog.open) loadMonth();
}
window.addEventListener('pomo-study-ready', event => setBoard(event.detail?.boardKey));
if (window.pomoStudyBoardKey) setBoard(window.pomoStudyBoardKey);
$('study-name')?.addEventListener('change', () => {
  const next = $('study-name').value.trim().replace(/\s+/g, ' ');
  if (normalize(next) !== normalize(name) && sessionId && boardKey) {
    presence(name, sessionId, boardKey, true, true).catch(() => {});
    sessionId = null;
  }
  name = next;
  $('study-name').value = name;
  try { localStorage.setItem('pomo-study-name', name); } catch {}
  expanded.clear();
  heartbeat();
  if (boardDialog.open) refreshToday();
  if (dayDialog.open) refreshSelectedDay();
  if (calendarDialog.open && previewDay) showPreview(previewDay, true);
});

async function saveTask(day, action, fields = {}) {
  if (writing) throw new Error('Another task is being saved');
  if (!boardKey) throw new Error('Open the Activity inside Discord first');
  if (!name) throw new Error('Enter your study name in Settings first');
  writing = true;
  try {
    return await rpc('pomo_study_calendar_write', {
      p_board_key: boardKey, p_display_name: name, p_day: day,
      p_action: action, ...fields
    });
  } finally { writing = false; }
}

function updateStudyClocks() {
  document.querySelectorAll('.study-time').forEach(clock => {
    const baseDay = Number(clock.dataset.day) || 0;
    const baseTotal = Number(clock.dataset.total) || 0;
    const since = Number(clock.dataset.updated) || Date.now();
    const isCurrentDay = clock.dataset.date === todayET();
    const extra = isCurrentDay && clock.dataset.active === 'true'
      ? Math.max(0, (Date.now() - since) / 1000) : 0;
    clock.textContent = `${duration(baseDay + extra)} / ${duration(baseTotal + extra)}`;
    clock.title = `That day: ${duration(baseDay + extra)} · All-time: ${duration(baseTotal + extra)}`;
  });
}

// Shared UI for today, archived days and hover previews.
function renderPeople(container, snapshot, {editable = false, scope = 'today'} = {}) {
  container.replaceChildren();
  const members = new Map();
  for (const p of snapshot.people || []) {
    members.set(p.key, {...p, tasks: []});
  }
  for (const t of snapshot.tasks || []) {
    if (!members.has(t.key)) {
      members.set(t.key, {key: t.key, name: t.name, seconds: 0,
        total_seconds: 0, active: false, tasks: []});
    }
    members.get(t.key).tasks.push(t);
  }
  const sorted = [...members.values()].sort((a, b) => a.name.localeCompare(b.name));
  const preview = scope === 'preview';
  const openCount = sorted.filter(p => {
    const k = `${scope}/${snapshot.day}/${p.key}`;
    return expanded.has(k) ? expanded.get(k) : p.key === normalize(name);
  }).length;
  const availableRows = Math.floor(
    (window.innerHeight - (scope === 'today' ? 235 : 170) - sorted.length * 35) / 30
  );
  const pageSize = preview ? 4 : Math.max(1, Math.min(10,
    Math.floor(Math.max(1, availableRows) / Math.max(1, openCount))
  ));
  if (!sorted.length) {
    const empty = el('p', 'No tasks or Activity time recorded for this day.');
    empty.className = 'study-empty';
    container.appendChild(empty);
    return;
  }

  for (const person of sorted) {
    const section = el('section');
    section.className = 'study-person';
    const head = el('div');
    head.className = 'study-person-head';
    head.tabIndex = 0;
    head.setAttribute('role', 'button');
    const count = person.tasks.filter(t => t.done).length;
    const strong = el('strong', `${person.name} · ${count}/${person.tasks.length}`);
    strong.title = person.name;
    head.appendChild(strong);
    const time = el('span');
    time.className = 'study-time';
    time.dataset.day = String(person.seconds || 0);
    time.dataset.total = String(person.total_seconds || 0);
    time.dataset.active = String(Boolean(person.active));
    time.dataset.updated = String(Date.now());
    time.dataset.date = snapshot.day;
    head.appendChild(time);

    const rows = el('div');
    rows.className = 'study-task-rows';
    const foldKey = `${scope}/${snapshot.day}/${person.key}`;
    const isOpen = () => expanded.has(foldKey)
      ? expanded.get(foldKey) : person.key === normalize(name);
    const applyFold = () => {
      section.classList.toggle('is-collapsed', !isOpen());
      head.setAttribute('aria-expanded', String(isOpen()));
    };
    const toggle = () => {
      expanded.set(foldKey, !isOpen());
      if (editable && !preview) renderPeople(container, snapshot, {editable, scope});
      else applyFold();
      if (preview) requestAnimationFrame(positionPreview);
    };
    head.addEventListener('click', toggle);
    head.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault(); toggle();
    });
    section.append(head, rows);
    applyFold();

    const pages = Math.max(1, Math.ceil(person.tasks.length / pageSize));
    const page = preview ? 0 : Math.max(0, Math.min(pages - 1, taskPages.get(foldKey) || 0));
    const pageStart = page * pageSize;
    const visibleTasks = person.tasks.slice(pageStart, pageStart + pageSize);
    const fullIds = person.tasks.map(t => Number(t.id));
    for (const task of visibleTasks) {
      const mine = editable && person.key === normalize(name);
      const row = el('div');
      row.className = 'study-row';
      row.dataset.taskId = String(task.id);
      if (mine) {
        const grip = el('span', '⋮⋮');
        grip.className = 'study-grip';
        grip.tabIndex = 0;
        grip.setAttribute('role', 'button');
        grip.setAttribute('aria-label', `Move ${task.text}`);
        grip.title = 'Drag or press Up/Down to reorder';
        row.appendChild(grip);
        enableDrag(grip, row, rows, snapshot.day, fullIds, pageStart, foldKey, pageSize);
      }
      const checkbox = el('input');
      checkbox.type = 'checkbox';
      checkbox.checked = Boolean(task.done);
      checkbox.disabled = !mine;
      checkbox.setAttribute('aria-label', task.text);
      if (mine) checkbox.addEventListener('change', async () => {
        checkbox.disabled = true;
        try {
          await saveTask(snapshot.day, 'check', {p_task_id: task.id, p_done: checkbox.checked});
          await afterTaskChange(snapshot.day);
        } catch (error) {
          checkbox.checked = !checkbox.checked;
          showTaskError(error, snapshot.day);
        } finally { checkbox.disabled = false; }
      });
      row.appendChild(checkbox);
      const label = el('span', task.text);
      label.className = 'study-task-text';
      if (task.done) label.style.textDecoration = 'line-through';
      if (mine) {
        label.dataset.editable = 'true';
        label.tabIndex = 0;
        label.title = 'Click to rename';
        label.setAttribute('role', 'button');
        const edit = () => editInline(label, task, snapshot.day);
        label.addEventListener('click', edit);
        label.addEventListener('keydown', event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault(); edit();
          }
        });
      }
      row.appendChild(label);
      if (mine) {
        const remove = el('button', '✕');
        remove.type = 'button';
        remove.setAttribute('aria-label', `Delete ${task.text}`);
        remove.addEventListener('click', async () => {
          try { await saveTask(snapshot.day, 'delete', {p_task_id: task.id});
            await afterTaskChange(snapshot.day);
          } catch (error) { showTaskError(error, snapshot.day); }
        });
        row.appendChild(remove);
      }
      rows.appendChild(row);
    }
    if (preview && person.tasks.length > pageSize) {
      const more = el('div', `+${person.tasks.length - pageSize} more tasks · click the date`);
      more.className = 'study-task-more';
      rows.appendChild(more);
    } else if (!preview && pages > 1) {
      const controls = el('div');
      controls.className = 'study-task-pages';
      const older = el('button', '‹ Prev');
      const counter = el('span', `${page + 1} / ${pages}`);
      const newer = el('button', 'Next ›');
      older.type = newer.type = 'button';
      older.disabled = page === 0;
      newer.disabled = page === pages - 1;
      older.onclick = () => {
        taskPages.set(foldKey, page - 1);
        renderPeople(container, snapshot, {editable, scope});
      };
      newer.onclick = () => {
        taskPages.set(foldKey, page + 1);
        renderPeople(container, snapshot, {editable, scope});
      };
      controls.append(older, counter, newer);
      rows.appendChild(controls);
    }
    container.appendChild(section);
  }
  updateStudyClocks();
}

function showTaskError(error, day) {
  status(error.message, day === todayET() && boardDialog.open
    ? 'study-status' : 'study-day-status');
}

function editInline(label, task, day) {
  if (interaction || writing) return;
  interaction = 'rename';
  const input = el('input');
  input.className = 'study-inline-edit';
  input.type = 'text';
  input.maxLength = 200;
  input.value = task.text;
  label.replaceWith(input);
  input.focus(); input.select();
  let done = false;
  async function finish(save) {
    if (done) return;
    done = true;
    const value = input.value.trim();
    input.replaceWith(label);
    let error = null;
    try {
      if (save && value && value !== task.text)
        await saveTask(day, 'rename', {p_task_id: task.id, p_task: value});
    } catch (e) { error = e; }
    finally {
      interaction = null;
      await afterTaskChange(day);
      if (error) showTaskError(error, day);
    }
  }
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); void finish(true); }
    if (event.key === 'Escape') { event.preventDefault(); void finish(false); }
  });
  input.addEventListener('blur', () => { void finish(true); });
}

// Pointer events live on document, avoiding lost pointer-up when moving the row.
function enableDrag(grip, row, rows, day, fullIds, pageStart, foldKey, pageSize) {
  let pointer = null;
  let original = [];
  const order = () => [...rows.querySelectorAll(':scope > .study-row')]
    .map(r => Number(r.dataset.taskId));
  const merged = visible => [
    ...fullIds.slice(0, pageStart), ...visible,
    ...fullIds.slice(pageStart + visible.length)
  ];
  function move(event) {
    if (pointer !== event.pointerId) return;
    event.preventDefault();
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('.study-row');
    if (!target || target === row || target.parentElement !== rows) return;
    const rect = target.getBoundingClientRect();
    rows.insertBefore(row, event.clientY > rect.top + rect.height / 2
      ? target.nextSibling : target);
  }
  function clear() {
    document.removeEventListener('pointermove', move, true);
    document.removeEventListener('pointerup', up, true);
    document.removeEventListener('pointercancel', cancel, true);
    pointer = null;
    row.style.pointerEvents = '';
    row.classList.remove('is-dragging');
  }
  async function finish(save) {
    const next = order();
    clear();
    let error = null;
    try {
      if (save && original.join(',') !== next.join(','))
        await saveTask(day, 'move', {p_task_ids: merged(next)});
    } catch (e) { error = e; }
    finally {
      interaction = null;
      await afterTaskChange(day);
      if (error) showTaskError(error, day);
    }
  }
  function up(event) { if (pointer === event.pointerId) void finish(true); }
  function cancel(event) { if (pointer === event.pointerId) void finish(false); }
  grip.addEventListener('pointerdown', event => {
    if (interaction || writing || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault();
    pointer = event.pointerId;
    interaction = 'drag';
    original = order();
    row.classList.add('is-dragging');
    row.style.pointerEvents = 'none';
    document.addEventListener('pointermove', move, {capture: true, passive: false});
    document.addEventListener('pointerup', up, true);
    document.addEventListener('pointercancel', cancel, true);
  });
  grip.addEventListener('keydown', async event => {
    if (!['ArrowUp', 'ArrowDown'].includes(event.key) || interaction || writing) return;
    event.preventDefault();
    const ids = order();
    const i = ids.indexOf(Number(row.dataset.taskId));
    const j = i + (event.key === 'ArrowUp' ? -1 : 1);
    if (j < 0 || j >= ids.length) {
      // Arrow keys can cross a page boundary even though dragging cannot.
      const entire = [...fullIds];
      const absolute = entire.indexOf(Number(row.dataset.taskId));
      const adjacent = absolute + (event.key === 'ArrowUp' ? -1 : 1);
      if (adjacent < 0 || adjacent >= entire.length) return;
      [entire[absolute], entire[adjacent]] = [entire[adjacent], entire[absolute]];
      interaction = 'drag';
      let failure = null;
      try {
        await saveTask(day, 'move', {p_task_ids: entire});
        taskPages.set(foldKey, Math.floor(adjacent / pageSize));
      } catch (error) { failure = error; }
      finally {
        interaction = null;
        await afterTaskChange(day);
        if (failure) showTaskError(failure, day);
      }
      return;
    }
    [ids[i], ids[j]] = [ids[j], ids[i]];
    interaction = 'drag';
    let error = null;
    try { await saveTask(day, 'move', {p_task_ids: merged(ids)}); }
    catch (e) { error = e; }
    finally { interaction = null; await afterTaskChange(day);
      if (error) showTaskError(error, day); }
  });
}

async function readDay(day) {
  return rpc('pomo_study_calendar_read', {p_board_key: boardKey, p_day: day});
}
async function refreshToday() {
  if (!boardKey || readingToday || interaction || !boardDialog.open) return;
  readingToday = true;
  try {
    const day = todayET();
    const result = await readDay(day);
    if (!interaction && boardDialog.open && day === todayET()) {
      renderPeople($('study-people'), result, {editable: true, scope: 'today'});
      status(`Today's tasks · Eastern Time · time: day / all-time`);
    }
  } catch (error) { status(`Could not load Study Board: ${error.message}`); }
  finally { readingToday = false; }
}
async function refreshSelectedDay() {
  if (!dayDialog.open || !boardKey || readingDay || interaction) return;
  readingDay = true;
  const day = selectedDay;
  try {
    const result = await readDay(day);
    if (dayDialog.open && day === selectedDay && !interaction) {
      renderPeople($('study-day-people'), result, {editable: true, scope: 'history'});
      status(`Shared tasks · ${day === todayET() ? 'Today' : 'Past day'} · time: day / all-time`,
        'study-day-status');
    }
  } catch (error) { status(`Could not load this day: ${error.message}`, 'study-day-status'); }
  finally {
    readingDay = false;
    if (dayDialog.open && selectedDay !== day) void refreshSelectedDay();
  }
}

async function afterTaskChange(day) {
  previewCache.delete(day);
  if (day === todayET() && boardDialog.open) await refreshToday();
  if (dayDialog.open && selectedDay === day) await refreshSelectedDay();
  if (calendarDialog.open) {
    await loadMonth();
    if (previewDay === day) void showPreview(day, true);
  }
}

$('study-form').addEventListener('submit', async event => {
  event.preventDefault();
  const field = $('study-task');
  const task = field.value.trim();
  if (!task) return;
  try {
    await saveTask(todayET(), 'add', {p_task: task});
    field.value = '';
    await afterTaskChange(todayET());
  } catch (error) { status(error.message); }
});
$('study-day-form').addEventListener('submit', async event => {
  event.preventDefault();
  const field = $('study-day-task');
  const task = field.value.trim();
  if (!task) return;
  try {
    await saveTask(selectedDay, 'add', {p_task: task});
    field.value = '';
    await afterTaskChange(selectedDay);
  } catch (error) { status(error.message, 'study-day-status'); }
});

// Month overview: one request returns all dates and participants' day totals.
function shiftMonth(month, delta) {
  const [year, m] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, m - 1 + delta, 1, 12));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-01`;
}
function renderMonth() {
  $('study-month-label').textContent = monthFmt.format(dateUTC(calendarMonth));
  const grid = $('study-month-grid');
  grid.replaceChildren();
  for (const weekday of ['S', 'M', 'T', 'W', 'T', 'F', 'S']) {
    const label = el('div', weekday);
    label.className = 'study-weekday';
    grid.appendChild(label);
  }
  const first = dateUTC(calendarMonth);
  const dayNumber = first.getUTCDay();
  const [year, month] = calendarMonth.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0, 12)).getUTCDate();
  const weekCount = Math.ceil((dayNumber + daysInMonth) / 7);
  grid.style.gridTemplateRows = `18px repeat(${weekCount},minmax(0,1fr))`;
  for (let i = 0; i < dayNumber; i++) grid.appendChild(el('div'));
  const dates = new Map(monthData.map(d => [d.day, d.people]));
  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${calendarMonth.slice(0, 7)}-${pad(day)}`;
    const people = dates.get(date) || [];
    const cell = el('button');
    cell.type = 'button';
    cell.className = 'study-day-cell';
    cell.disabled = date > todayET();
    cell.dataset.day = date;
    if (date === todayET()) cell.classList.add('is-today');
    if (date === previewDay) cell.classList.add('is-previewed');
    const number = el('span', String(day));
    number.className = 'study-day-number';
    cell.appendChild(number);
    // Compact one-line name / completed / day-time summary per person.
    // Full day + lifetime HH:MM:SS is visible on hover and click.
    for (const person of people) {
      const line = el('span');
      line.className = 'study-day-person';
      const personName = el('span', `${person.name} ${person.done}/${person.total}`);
      personName.className = 'study-day-person-name';
      const time = el('span', `${shortDuration(person.seconds)}/${shortDuration(person.total_seconds)}`);
      time.className = 'study-day-person-stats';
      line.append(personName, time);
      line.title = `${person.name}: ${person.done}/${person.total} · Day ${duration(person.seconds)} / All-time ${duration(person.total_seconds)}`;
      cell.appendChild(line);
    }
    cell.setAttribute('aria-label', `${dateTitle(date)}: ${people.length} participants. Open editable list.`);
    if (!cell.disabled) {
      cell.addEventListener('mouseenter', () => {
        clearTimeout(previewHideTimer);
        void showPreview(date, false, cell);
      });
      cell.addEventListener('mouseleave', event => {
        if (!$('study-preview').contains(event.relatedTarget)) schedulePreviewHide();
      });
      cell.addEventListener('focus', () => { void showPreview(date, false, cell); });
      cell.addEventListener('blur', () => { schedulePreviewHide(); });
      cell.addEventListener('click', () => { hidePreview(); void openDay(date); });
    }
    grid.appendChild(cell);
  }
  requestAnimationFrame(fitCalendarSummaries);
}

// Keep every date cell inside the month grid: never add date-cell scrollbars.
// A compact +N row points to the complete list in the floating preview.
function fitCalendarSummaries() {
  if (!calendarDialog.open) return;
  for (const cell of $('study-month-grid').querySelectorAll('.study-day-cell')) {
    const rows = [...cell.querySelectorAll('.study-day-person')];
    cell.querySelector('.study-day-more')?.remove();
    rows.forEach(r => { r.hidden = false; });
    if (!rows.length) continue;
    const height = cell.clientHeight;
    const rowHeight = Math.max(10, rows[0].getBoundingClientRect().height + 2);
    const max = Math.max(0, Math.floor((height - 22) / rowHeight));
    const visible = rows.length <= max ? rows.length : Math.max(0,max - 1);
    rows.forEach((r,i) => { r.hidden = i >= visible; });
    if (visible < rows.length) {
      const extra = el('span', `+${rows.length - visible} more`);
      extra.className = 'study-day-more';
      cell.appendChild(extra);
    }
  }
}

function schedulePreviewHide() {
  clearTimeout(previewHideTimer);
  previewHideTimer = setTimeout(hidePreview, 200);
}
function hidePreview() {
  clearTimeout(previewHideTimer);
  previewDay = null;
  previewAnchor = null;
  previewGeneration++;
  $('study-preview').classList.remove('is-visible');
  $('study-month-grid').querySelectorAll('.is-previewed').forEach(node => {
    node.classList.remove('is-previewed');
  });
}
function positionPreview() {
  const card = $('study-preview');
  if (!card.classList.contains('is-visible') || !previewAnchor?.isConnected) return;
  const anchor = previewAnchor.getBoundingClientRect();
  const width = card.offsetWidth;
  const height = card.offsetHeight;
  const margin = 8;
  let left = anchor.right + 7;
  if (left + width > window.innerWidth - margin) left = anchor.left - width - 7;
  if (left < margin) {
    left = Math.max(margin, Math.min(window.innerWidth - width - margin,
      anchor.left + anchor.width / 2 - width / 2));
  }
  let top = anchor.top + Math.min(12,anchor.height/3);
  top = Math.max(margin, Math.min(top,window.innerHeight - height - margin));
  card.style.left = `${Math.round(left)}px`;
  card.style.top = `${Math.round(top)}px`;
}
$('study-preview').addEventListener('mouseenter', () => clearTimeout(previewHideTimer));
$('study-preview').addEventListener('mouseleave', schedulePreviewHide);
window.addEventListener('resize', () => {
  positionPreview();
  requestAnimationFrame(fitCalendarSummaries);
});

async function loadMonth() {
  if (!calendarDialog.open || !boardKey || readingMonth) return;
  readingMonth = true;
  const month = calendarMonth;
  status('Loading month…', 'study-month-status');
  try {
    const result = await rpc('pomo_study_calendar_month', {
      p_board_key: boardKey, p_month: month
    });
    if (calendarDialog.open && calendarMonth === month) {
      monthData = Array.isArray(result) ? result : [];
      renderMonth();
      status('Hover for a task preview; click any past or current date to edit. Eastern Time.',
        'study-month-status');
    }
  } catch (error) { status(`Could not load calendar: ${error.message}`, 'study-month-status'); }
  finally {
    readingMonth = false;
    // Navigation while a request was in flight must not leave a blank month.
    if (calendarDialog.open && calendarMonth !== month) void loadMonth();
  }
}

async function showPreview(day, force = false, anchor = null) {
  if (!boardKey || !calendarDialog.open || day > todayET()) return;
  clearTimeout(previewHideTimer);
  const wasVisible = $('study-preview').classList.contains('is-visible');
  if (previewDay === day && wasVisible && !force) {
    if (anchor) previewAnchor = anchor;
    positionPreview();
    return;
  }
  previewDay = day;
  previewAnchor = anchor || $('study-month-grid').querySelector(`[data-day="${day}"]`);
  const generation = ++previewGeneration;
  $('study-month-grid').querySelectorAll('.study-day-cell').forEach(cell => {
    cell.classList.toggle('is-previewed', cell.dataset.day === day);
  });
  const panel = $('study-preview');
  panel.replaceChildren(el('h3', `${dateTitle(day)} · loading…`));
  panel.classList.add('is-visible');
  positionPreview();
  try {
    let record = previewCache.get(day);
    if (force || !record || Date.now() - record.saved > 30000) {
      record = {data: await readDay(day), saved: Date.now()};
      previewCache.set(day, record);
    }
    if (generation !== previewGeneration || !calendarDialog.open) return;
    panel.replaceChildren(el('h3', `${dateTitle(day)} · click date to edit`));
    const list = el('div');
    panel.appendChild(list);
    renderPeople(list, record.data, {editable: false, scope: 'preview'});
    positionPreview();
  } catch (error) {
    if (generation === previewGeneration) {
      panel.replaceChildren(el('p', `Preview unavailable: ${error.message}`));
      positionPreview();
    }
  }
}

async function openDay(day) {
  if (!boardKey || day > todayET()) return;
  selectedDay = day;
  $('study-day-title').textContent = dateTitle(day);
  $('study-day-task').value = '';
  dayDialog.showModal();
  await refreshSelectedDay();
}
function openCalendar() {
  calendarMonth = firstOfMonth(todayET());
  previewDay = null;
  previewCache.clear();
  hidePreview();
  calendarDialog.showModal();
  renderMonth();
  if (!boardKey) status('Open this Activity inside Discord to view shared history.', 'study-month-status');
  else void loadMonth();
}

$('study-calendar-open').addEventListener('click', openCalendar);
$('study-calendar-close').addEventListener('click', () => { hidePreview(); calendarDialog.close(); });
calendarDialog.addEventListener('close', hidePreview);
$('study-day-close').addEventListener('click', () => dayDialog.close());
$('study-prev-month').addEventListener('click', () => {
  calendarMonth = shiftMonth(calendarMonth, -1);
  hidePreview();
  monthData = [];
  renderMonth();
  void loadMonth();
});
$('study-next-month').addEventListener('click', () => {
  calendarMonth = shiftMonth(calendarMonth, 1);
  hidePreview();
  monthData = [];
  renderMonth();
  void loadMonth();
});
$('study-this-month').addEventListener('click', () => {
  calendarMonth = firstOfMonth(todayET());
  hidePreview();
  monthData = [];
  renderMonth();
  void loadMonth();
});

$('study-open').addEventListener('click', () => {
  boardDialog.showModal();
  if (!boardKey) status('Join the Activity inside Discord to use this board.');
  else if (!name) status('Enter your study name in Settings to start your Activity clock.');
  else void refreshToday();
});
$('study-close').addEventListener('click', () => boardDialog.close());
for (const dialog of [boardDialog, calendarDialog, dayDialog]) {
  dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  });
}

// Same existing shared Pomodoro controls, reflected in the mini timer.
const mainToggle = $('toggle');
const mainReset = $('reset');
const miniToggle = $('study-mini-toggle');
const miniReset = $('study-mini-reset');
function updateMiniTimer() {
  if (!boardDialog.open) return;
  $('study-mini-phase').textContent = $('phase')?.textContent?.trim() || 'Focus';
  $('study-mini-countdown').textContent = $('countdown')?.textContent?.trim() || '50:00';
  miniToggle.textContent = mainToggle?.textContent?.trim() || 'Pause';
  miniToggle.disabled = !mainToggle || mainToggle.disabled;
  miniReset.disabled = !mainReset || mainReset.disabled;
}
miniToggle.addEventListener('click', () => {
  if (mainToggle && !mainToggle.disabled) { mainToggle.click(); updateMiniTimer(); }
});
miniReset.addEventListener('click', () => {
  if (mainReset && !mainReset.disabled) { mainReset.click(); updateMiniTimer(); }
});

// Presence every 20s; only visible boards synchronize every 15s.
setInterval(heartbeat, 20000);
setInterval(() => {
  const today = todayET();
  if (today !== activeDay) {
    activeDay = today;
    expanded.clear();
    previewCache.clear();
    if (boardDialog.open) void refreshToday();
    if (dayDialog.open) void refreshSelectedDay();
    if (calendarDialog.open) void loadMonth();
  }
  updateStudyClocks();
}, 1000);
setInterval(() => {
  if (boardDialog.open && boardKey && !interaction) void refreshToday();
  if (dayDialog.open && boardKey && !interaction) void refreshSelectedDay();
}, 15000);
setInterval(() => {
  if (calendarDialog.open && boardKey && !interaction) void loadMonth();
}, 30000);
setInterval(updateMiniTimer, 500);

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    heartbeat();
    if (boardDialog.open) void refreshToday();
    if (dayDialog.open) void refreshSelectedDay();
    if (calendarDialog.open) void loadMonth();
  }
});
window.addEventListener('pagehide', () => {
  presence(name, sessionId, boardKey, true, true).catch(() => {});
});
window.addEventListener('pageshow', event => {
  if (event.persisted) { sessionId = null; heartbeat(); }
});
