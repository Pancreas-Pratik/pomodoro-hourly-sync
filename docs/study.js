
import {
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
} from './config.js';

const $ = id => document.getElementById(id);

const url = location.hostname.endsWith('.discordsays.com')
  ? `${location.origin}/.proxy/supabase`
  : SUPABASE_URL;

const storedName = (() => {
  try {
    return localStorage.getItem('pomo-study-name') || '';
  } catch {
    return '';
  }
})();

let boardKey = null;
let name = storedName.trim();
let sessionId = null;
let reading = false;
let doingTask = false;

// Styles for the Study Board and Settings name field
const style = document.createElement('style');

style.textContent = `
#study-open {
  display:block;
  margin:9px auto 0;
  min-height:32px;
  padding:6px 15px;
  font-size:12px;
}
#study-name-box {
  margin:16px 0;
  padding:12px 0;
  border-top:1px solid var(--line);
}
#study-name-box label {
  display:block;
  margin-bottom:8px;
}
#study-name {
  padding:10px;
  border:1px solid var(--line);
  border-radius:7px;
  width:100%;
}
#study-dialog {
  width:min(470px,calc(100vw - 20px));
  max-height:85dvh;
  overflow:auto;
  border:1px solid var(--line);
  border-radius:12px;
  padding:18px;
  background:var(--surface);
  color:inherit;
}
#study-dialog::backdrop {
  background:rgba(0,0,0,.65);
}
.study-top {
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:12px;
}
.study-top h2 {
  margin:0;
  font-size:18px;
}
#study-close {
  min-height:32px;
  padding:5px 10px;
}
#study-status {
  color:var(--muted);
  font-size:12px;
  margin:12px 0;
  line-height:1.5;
}
#study-form {
  display:flex;
  gap:8px;
  align-items:center;
  margin:14px 0;
}
#study-task {
  flex:1;
  min-width:0;
  min-height:36px;
  border:1px solid var(--line);
  border-radius:7px;
  padding:8px;
}
#study-add {
  min-height:36px;
  padding:7px 12px;
}
.study-person {
  border-top:1px solid var(--line);
  padding:13px 0 4px;
}
.study-person-head {
  display:flex;
  flex-wrap:wrap;
  justify-content:space-between;
  align-items:center;
  gap:6px;
  margin-bottom:9px;
}
.study-person-head strong {
  font-size:14px;
}
.study-time {
  font-size:12px;
  font-variant-numeric:tabular-nums;
  color:var(--muted);
}
.study-row {
  display:flex;
  align-items:center;
  gap:9px;
  margin:8px 0;
  font-size:13px;
}
.study-row input {
  width:17px;
  height:17px;
  flex:0 0 17px;
  accent-color:var(--accent);
}
.study-row span {
  flex:1;
  overflow-wrap:anywhere;
}
.study-row button {
  min-height:26px;
  padding:3px 8px;
  font-size:12px;
}
.study-empty {
  font-size:12px;
  color:var(--muted);
}
`;

document.head.appendChild(style);

// Add the name field directly inside existing Settings
const nameBox = document.createElement('section');
nameBox.id = 'study-name-box';

nameBox.innerHTML = `
  <label for="study-name">Your study name</label>
  <input
    id="study-name"
    maxlength="40"
    placeholder="Enter your name"
    autocomplete="nickname"
  >
  <p class="hint">
    Use the same name on all devices to share tasks and
    daily Activity time. No login.
  </p>
`;

(
  document.querySelector('.settings-dialog-body') ||
  document.querySelector('.settings')
)?.prepend(nameBox);

$('study-name').value = name;

// Add the Study Board button under timer controls
const openButton = document.createElement('button');
openButton.id = 'study-open';
openButton.type = 'button';
openButton.textContent = '☑ Study Board';

document.querySelector('.timer .controls')
  ?.insertAdjacentElement('afterend', openButton);

// Create the Study Board popup
const dialog = document.createElement('dialog');
dialog.id = 'study-dialog';

dialog.innerHTML = `
  <div class="study-top">
    <h2>Shared Study Board</h2>
    <button id="study-close" type="button"
      aria-label="Close">✕</button>
  </div>
  <p id="study-status" role="status"></p>
  <form id="study-form">
    <input id="study-task" maxlength="200"
      placeholder="Add your to-do" required>
    <button id="study-add" type="submit">Add</button>
  </form>
  <div id="study-people"></div>
`;

document.body.appendChild(dialog);

function status(message) {
  $('study-status').textContent = message;
}

// Supabase requests
async function rpc(method, params, keepalive = false) {
  const response = await fetch(
    `${url}/rest/v1/rpc/${method}`,
    {
      method: 'POST',
      keepalive,
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(params)
    }
  );

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      result.message || `Supabase error ${response.status}`
    );
  }

  return result;
}

function normalized(value) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

// Record that this person is inside the Activity
async function presence(
  who, id, board, ending = false, keepalive = false
) {
  if (!who || !id || !board) return;

  return rpc('pomo_study_presence', {
    p_board_key: board,
    p_display_name: who,
    p_session_id: id,
    p_end: ending
  }, keepalive);
}

function heartbeat() {
  if (!boardKey || !name) return;

  if (!sessionId) {
    sessionId = crypto.randomUUID();
  }

  presence(name, sessionId, boardKey).catch(error => {
    console.warn('Study clock sync:', error);

    if (dialog.open) {
      status(`Clock: ${error.message}`);
    }
  });
}

function setBoard(nextKey) {
  if (!/^(channel|instance):[A-Za-z0-9_-]{1,128}$/
    .test(nextKey || '')) return;

  if (boardKey === nextKey) return;

  if (boardKey && sessionId && name) {
    presence(name, sessionId, boardKey, true, true)
      .catch(() => {});
  }

  boardKey = nextKey;
  sessionId = null;

  heartbeat();

  if (dialog.open) refresh();
}

// Receive the Discord room identifier from app.js
window.addEventListener(
  'pomo-study-ready',
  event => setBoard(event.detail?.boardKey)
);

if (window.pomoStudyBoardKey) {
  setBoard(window.pomoStudyBoardKey);
}

// Save the study name on this device
$('study-name').addEventListener('change', () => {
  const nextName = $('study-name').value
    .trim()
    .replace(/\s+/g, ' ');

  if (
    normalized(nextName) !== normalized(name) &&
    sessionId && boardKey
  ) {
    presence(name, sessionId, boardKey, true, true)
      .catch(() => {});
    sessionId = null;
  }

  name = nextName;
  $('study-name').value = name;

  try {
    localStorage.setItem('pomo-study-name', name);
  } catch {}

  heartbeat();

  if (dialog.open) refresh();
});

function el(tag, value) {
  const element = document.createElement(tag);

  if (value !== undefined) {
    element.textContent = value;
  }

  return element;
}

function hhmmss(seconds) {
  const n = Math.max(0, Math.floor(seconds));

  return [
    Math.floor(n / 3600),
    Math.floor(n / 60) % 60,
    n % 60
  ].map(v => String(v).padStart(2, '0')).join(':');
}

// Refresh displayed HH:MM:SS every second
function updateClocks() {
  dialog.querySelectorAll('.study-time').forEach(clock => {
    const base = Number(clock.dataset.base) || 0;
    const started =
      Number(clock.dataset.updated) || Date.now();

    const extra = clock.dataset.active === 'true'
      ? Math.max(0, (Date.now() - started) / 1000)
      : 0;

    clock.textContent =
      `Today · ${hhmmss(base + extra)}`;
  });
}

// Group all to-do items and time under each person
function display(snapshot) {
  const holder = $('study-people');
  holder.replaceChildren();

  const people = new Map();

  for (const person of snapshot.people || []) {
    people.set(person.key, {
      name: person.name,
      seconds: person.seconds,
      active: person.active,
      tasks: []
    });
  }

  for (const task of snapshot.tasks || []) {
    if (!people.has(task.key)) {
      people.set(task.key, {
        name: task.name,
        seconds: 0,
        active: false,
        tasks: []
      });
    }

    people.get(task.key).tasks.push(task);
  }

  if (!people.size) {
    holder.appendChild(
      el('p', 'No study activity or tasks yet.')
    );
    return;
  }

  for (const [personKey, person] of [...people].sort(
    (a, b) => a[1].name.localeCompare(b[1].name)
  )) {
    const section = el('section');
    section.className = 'study-person';

    const head = el('div');
    head.className = 'study-person-head';

    const done = person.tasks.filter(
      task => task.done
    ).length;

    head.appendChild(
      el(
        'strong',
        `${person.name} · ${done}/${person.tasks.length} done`
      )
    );

    const timer = el('span');
    timer.className = 'study-time';
    timer.dataset.base = String(person.seconds);
    timer.dataset.updated = String(Date.now());
    timer.dataset.active = String(person.active);

    head.appendChild(timer);
    section.appendChild(head);

    for (const task of person.tasks) {
      const row = el('div');
      row.className = 'study-row';

      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = Boolean(task.done);

      box.disabled = personKey !== normalized(name);
      box.setAttribute('aria-label', task.text);

      const label = el('span', task.text);

      if (task.done) {
        label.style.textDecoration = 'line-through';
      }

      row.append(box, label);

      box.addEventListener('change', () => {
        changeTask('check', {
          p_task_id: task.id,
          p_done: box.checked
        });
      });

      if (personKey === normalized(name)) {
        const remove = el('button', '✕');
        remove.type = 'button';

        remove.setAttribute(
          'aria-label',
          `Delete ${task.text}`
        );

        remove.addEventListener('click', () => {
          changeTask('delete', {
            p_task_id: task.id
          });
        });

        row.appendChild(remove);
      }

      section.appendChild(row);
    }

    holder.appendChild(section);
  }

  updateClocks();
}

// Get updated tasks and daily totals
async function refresh() {
  if (!boardKey || reading) return;

  reading = true;

  try {
    const snapshot = await rpc(
      'pomo_study_snapshot',
      {p_board_key: boardKey}
    );

    display(snapshot);

    status(
      'Shared by everyone in this Discord channel · ' +
      'Today (Eastern Time)'
    );
  } catch (error) {
    status(`Cannot load study board: ${error.message}`);
  } finally {
    reading = false;
  }
}

// Add, check, or delete a task
async function changeTask(action, details = {}) {
  if (doingTask) return false;

  if (!boardKey) {
    status('Open the Activity in Discord to use this board.');
    return false;
  }

  if (!name) {
    status('Enter your study name in Settings first.');
    return false;
  }

  doingTask = true;

  try {
    await rpc('pomo_study_write', {
      p_board_key: boardKey,
      p_display_name: name,
      p_action: action,
      ...details
    });

    await refresh();
    return true;
  } catch (error) {
    status(error.message);
    return false;
  } finally {
    doingTask = false;
  }
}

// Add-task form
$('study-form').addEventListener('submit', event => {
  event.preventDefault();

  const field = $('study-task');
  const task = field.value.trim();

  if (!task) return;

  changeTask('add', {p_task: task})
    .then(success => {
      if (success) field.value = '';
    });
});

// Open and close Study Board
$('study-open').addEventListener('click', () => {
  dialog.showModal();

  if (!boardKey) {
    status(
      'Join this Pomodoro Activity in Discord ' +
      'to use the shared board.'
    );
  } else if (!name) {
    status(
      'Enter your study name in Settings ' +
      'to start the clock.'
    );
  } else {
    refresh();
  }
});

$('study-close').addEventListener(
  'click',
  () => dialog.close()
);

dialog.addEventListener('click', event => {
  if (event.target === dialog) dialog.close();
});

// Count time while visible or backgrounded
setInterval(heartbeat, 20000);

// Update shared board while its popup is open
setInterval(() => {
  if (dialog.open) refresh();
}, 5000);

// Update the displayed seconds
setInterval(updateClocks, 1000);

// Catch up when Discord resumes a backgrounded Activity
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    heartbeat();

    if (dialog.open) refresh();
  }
});

// Try to stop tracking when Activity closes
window.addEventListener('pagehide', () => {
  presence(name, sessionId, boardKey, true, true)
    .catch(() => {});
});

// Restart tracking if a cached page is restored
window.addEventListener('pageshow', event => {
  if (event.persisted) {
    sessionId = null;
    heartbeat();
  }
});
