
import {
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
} from './config.js';

const $ = id => document.getElementById(id);

const url = location.hostname.endsWith('.discordsays.com')
  ? `${location.origin}/.proxy/supabase`
  : SUPABASE_URL;

const getSavedName = () => {
  try {
    return localStorage.getItem('pomo-study-name') || '';
  } catch {
    return '';
  }
};

let boardKey = null;
let name = getSavedName().trim();
let sessionId = null;
let reading = false;
let writing = false;
let interaction = null;

// Interface styling
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
.study-top,.study-person-head {
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
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
  flex-wrap:wrap;
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
  gap:8px;
  margin:8px 0;
  font-size:13px;
}
.study-row input[type=checkbox] {
  width:17px;
  height:17px;
  flex:0 0 17px;
  accent-color:var(--accent);
}
.study-task-text {
  flex:1;
  min-width:0;
  overflow-wrap:anywhere;
}
.study-task-text[data-editable=true] {
  cursor:text;
}
.study-task-text[data-editable=true]:focus-visible {
  outline:2px solid var(--accent);
  outline-offset:3px;
}
.study-inline-edit {
  flex:1;
  min-width:0;
  padding:5px 7px;
  border:1px solid var(--line);
  border-radius:6px;
  font:inherit;
}
.study-grip {
  flex:0 0 auto;
  padding:5px 4px;
  opacity:.55;
  cursor:grab;
  touch-action:none;
  user-select:none;
  font-size:16px;
  letter-spacing:-4px;
}
.study-grip:active {
  cursor:grabbing;
}
.study-row.is-dragging {
  opacity:.55;
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

// Name field inside Settings
const nameBox = document.createElement('section');
nameBox.id = 'study-name-box';

nameBox.innerHTML = `
  <label for="study-name">Your study name</label>
  <input id="study-name" maxlength="40"
    placeholder="Enter your name"
    autocomplete="nickname">
  <p class="hint">
    Use the same name on all devices to share tasks
    and daily Activity time. No login.
  </p>
`;

const settingsHolder =
  document.querySelector('.settings-dialog-body') ||
  document.querySelector('.settings');

settingsHolder?.prepend(nameBox);

if ($('study-name')) {
  $('study-name').value = name;
}

// Main screen Study Board button
const openButton = document.createElement('button');
openButton.id = 'study-open';
openButton.type = 'button';
openButton.textContent = '☑ Study Board';

document.querySelector('.timer .controls')
  ?.insertAdjacentElement('afterend', openButton);

// Study Board dialog
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

const status = message => {
  $('study-status').textContent = message;
};

const normalize = value =>
  value.trim().replace(/\s+/g, ' ').toLowerCase();

const el = (tag, value) => {
  const element = document.createElement(tag);
  if (value !== undefined) {
    element.textContent = value;
  }
  return element;
};

// Supabase connection
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

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data.message || `Supabase error ${response.status}`
    );
  }

  return data;
}

// Activity-time tracking
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

  presence(name, sessionId, boardKey)
    .catch(error => {
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

window.addEventListener(
  'pomo-study-ready',
  event => setBoard(event.detail?.boardKey)
);

if (window.pomoStudyBoardKey) {
  setBoard(window.pomoStudyBoardKey);
}

$('study-name')?.addEventListener('change', () => {
  const nextName = $('study-name').value
    .trim().replace(/\s+/g, ' ');

  if (
    normalize(nextName) !== normalize(name) &&
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

function hhmmss(seconds) {
  const n = Math.max(0, Math.floor(seconds));

  return [
    Math.floor(n / 3600),
    Math.floor(n / 60) % 60,
    n % 60
  ].map(v => String(v).padStart(2, '0')).join(':');
}

// Update visible clocks every second without server requests
function updateClocks() {
  dialog.querySelectorAll('.study-time')
    .forEach(clock => {
      const base = Number(clock.dataset.base) || 0;
      const updated =
        Number(clock.dataset.updated) || Date.now();

      const extra = clock.dataset.active === 'true'
        ? Math.max(0, (Date.now() - updated) / 1000)
        : 0;

      clock.textContent =
        `Today · ${hhmmss(base + extra)}`;
    });
}

// Existing to-do actions
async function taskWrite(action, extra = {}) {
  if (writing) {
    throw new Error('Another task change is saving');
  }

  if (!boardKey) {
    throw new Error('Join this Activity in Discord first');
  }

  if (!name) {
    throw new Error('Enter your study name in Settings');
  }

  writing = true;

  try {
    return await rpc('pomo_study_write', {
      p_board_key: boardKey,
      p_display_name: name,
      p_action: action,
      ...extra
    });
  } finally {
    writing = false;
  }
}

// NEW: Save inline task renames
async function renameTask(task, updated) {
  await rpc('pomo_study_rename', {
    p_board_key: boardKey,
    p_display_name: name,
    p_task_id: task.id,
    p_task: updated
  });
}

// NEW: Save task ordering
async function moveTasks(ids) {
  await rpc('pomo_study_move', {
    p_board_key: boardKey,
    p_display_name: name,
    p_task_ids: ids
  });
}

// NEW: Click task text to edit inline
function startInlineEdit(label, task) {
  if (interaction || writing) return;

  interaction = 'edit';

  const input = el('input');
  input.type = 'text';
  input.maxLength = 200;
  input.value = task.text;
  input.className = 'study-inline-edit';

  label.replaceWith(input);
  input.focus();
  input.select();

  let finished = false;

  async function finish(save) {
    if (finished) return;
    finished = true;

    const value = input.value.trim();
    input.replaceWith(label);

    try {
      if (
        save && value &&
        value !== task.text
      ) {
        await renameTask(task, value);
      }
    } catch (error) {
      status(`Rename failed: ${error.message}`);
    } finally {
      interaction = null;
      await refresh();
    }
  }

  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      finish(true);
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      finish(false);
    }
  });

  input.addEventListener('blur', () => finish(true));
}

// NEW: Drag tasks to reorder
function makeDraggable(grip, row, section) {
  let dragging = false;
  let originalOrder = [];

  const order = () =>
    [...section.querySelectorAll('.study-row')]
      .map(item => Number(item.dataset.taskId));

  grip.addEventListener('pointerdown', event => {
    if (
      interaction ||
      writing ||
      (event.pointerType === 'mouse' && event.button !== 0)
    ) return;

    event.preventDefault();

    interaction = 'drag';
    dragging = true;
    originalOrder = order();

    row.classList.add('is-dragging');
    grip.setPointerCapture(event.pointerId);
  });

  grip.addEventListener('pointermove', event => {
    if (!dragging) return;

    const target = document.elementFromPoint(
      event.clientX, event.clientY
    )?.closest('.study-row');

    if (
      !target ||
      target === row ||
      target.parentElement !== section
    ) return;

    const bounds = target.getBoundingClientRect();
    const middle = bounds.top + bounds.height / 2;

    section.insertBefore(
      row,
      event.clientY > middle
        ? target.nextSibling
        : target
    );
  });

  async function stopDragging(save) {
    if (!dragging) return;

    dragging = false;
    row.classList.remove('is-dragging');

    const changedOrder = order();

    try {
      if (
        save &&
        changedOrder.join(',') !== originalOrder.join(',')
      ) {
        await moveTasks(changedOrder);
      }
    } catch (error) {
      status(`Reorder failed: ${error.message}`);
    } finally {
      interaction = null;
      await refresh();
    }
  }

  grip.addEventListener(
    'pointerup',
    () => stopDragging(true)
  );

  grip.addEventListener(
    'pointercancel',
    () => stopDragging(false)
  );

  // Keyboard alternative: focus grip, press Up or Down
  grip.addEventListener('keydown', async event => {
    if (
      !['ArrowUp', 'ArrowDown'].includes(event.key) ||
      interaction || writing
    ) return;

    event.preventDefault();

    const current = order();
    const at = current.indexOf(Number(row.dataset.taskId));
    const next = at + (
      event.key === 'ArrowUp' ? -1 : 1
    );

    if (next < 0 || next >= current.length) return;

    [current[at], current[next]] =
      [current[next], current[at]];

    interaction = 'drag';

    try {
      await moveTasks(current);
    } catch (error) {
      status(`Reorder failed: ${error.message}`);
    } finally {
      interaction = null;
      await refresh();
    }
  });
}

// Build the grouped Study Board
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
      row.dataset.taskId = String(task.id);

      const mine = personKey === normalize(name);

      // Drag grip, only for the current person's tasks
      if (mine) {
        const grip = el('span', '⋮⋮');
        grip.className = 'study-grip';
        grip.title = 'Drag to reorder (or use arrow keys)';
        grip.tabIndex = 0;
        grip.setAttribute('role', 'button');
        grip.setAttribute(
          'aria-label',
          `Move ${task.text}`
        );

        row.appendChild(grip);
        makeDraggable(grip, row, section);
      }

      // Checkbox
      const box = el('input');
      box.type = 'checkbox';
      box.checked = Boolean(task.done);
      box.disabled = !mine;
      box.setAttribute('aria-label', task.text);

      box.addEventListener('change', async () => {
        try {
          await taskWrite('check', {
            p_task_id: task.id,
            p_done: box.checked
          });
          await refresh();
        } catch (error) {
          status(error.message);
          box.checked = !box.checked;
        }
      });

      row.appendChild(box);

      // Click-to-edit task text
      const label = el('span', task.text);
      label.className = 'study-task-text';

      if (task.done) {
        label.style.textDecoration = 'line-through';
      }

      if (mine) {
        label.dataset.editable = 'true';
        label.tabIndex = 0;
        label.setAttribute('role', 'button');
        label.setAttribute(
          'aria-label',
          `Rename ${task.text}`
        );
        label.title = 'Click to rename';

        label.addEventListener(
          'click',
          () => startInlineEdit(label, task)
        );

        label.addEventListener('keydown', event => {
          if (
            event.key === 'Enter' ||
            event.key === ' '
          ) {
            event.preventDefault();
            startInlineEdit(label, task);
          }
        });
      }

      row.appendChild(label);

      // Delete button
      if (mine) {
        const remove = el('button', '✕');
        remove.type = 'button';
        remove.setAttribute(
          'aria-label',
          `Delete ${task.text}`
        );

        remove.addEventListener('click', async () => {
          try {
            await taskWrite('delete', {
              p_task_id: task.id
            });
            await refresh();
          } catch (error) {
            status(error.message);
          }
        });

        row.appendChild(remove);
      }

      section.appendChild(row);
    }

    holder.appendChild(section);
  }

  updateClocks();
}

// Refresh the board from Supabase
async function refresh() {
  if (!boardKey || reading || interaction) return;

  reading = true;

  try {
    const snapshot = await rpc(
      'pomo_study_snapshot_v2',
      {p_board_key: boardKey}
    );

    if (interaction) return;

    display(snapshot);

    status(
      'Shared by everyone in this Discord channel · ' +
      'Today (Eastern Time)'
    );
  } catch (error) {
    status(
      `Cannot load Study Board: ${error.message}`
    );
  } finally {
    reading = false;
  }
}

// Add tasks
$('study-form').addEventListener('submit', async event => {
  event.preventDefault();

  const field = $('study-task');
  const task = field.value.trim();

  if (!task) return;

  try {
    await taskWrite('add', {p_task: task});
    field.value = '';
    await refresh();
  } catch (error) {
    status(error.message);
  }
});

// Open and close board
$('study-open').addEventListener('click', () => {
  dialog.showModal();

  if (!boardKey) {
    status(
      'Join the Pomodoro Activity in Discord ' +
      'to use this board.'
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

// Activity-time heartbeat: every 20 seconds.
// Runs even when document is hidden, when permitted.
setInterval(heartbeat, 20000);

// Study Board synchronization: every 15 seconds.
// Pauses refreshing while editing or dragging.
setInterval(() => {
  if (dialog.open && boardKey && !interaction) {
    refresh();
  }
}, 15000);

// Displayed clock: every second (no API requests).
setInterval(updateClocks, 1000);

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    heartbeat();

    if (dialog.open) refresh();
  }
});

window.addEventListener('pagehide', () => {
  presence(name, sessionId, boardKey, true, true)
    .catch(() => {});
});

window.addEventListener('pageshow', event => {
  if (event.persisted) {
    sessionId = null;
    heartbeat();
  }
});



/* Compact Study Board + reliable drag handling */

const compactStudyStyle = document.createElement('style');

compactStudyStyle.textContent = `
#study-dialog {
  width:min(560px,calc(100vw - 20px));
  max-height:82dvh;
  padding:14px;
  overflow-y:auto;
}

#study-form { margin:9px 0 }
#study-task,#study-add { min-height:32px }

.study-person {
  padding:6px 0 1px;
}

.study-person-head {
  display:grid;
  grid-template-columns:12px minmax(0,1fr) auto;
  gap:7px;
  align-items:center;
  min-height:30px;
  margin-bottom:3px;
  cursor:pointer;
  user-select:none;
}

.study-person-head::before {
  content:'▾';
  font-size:13px;
  color:var(--muted);
}

.study-collapsed .study-person-head::before {
  content:'▸';
}

.study-person-head strong {
  min-width:0;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
  font-size:13px;
}

.study-time {
  font-size:11px;
  white-space:nowrap;
}

.study-row {
  gap:6px;
  min-height:30px;
  margin:2px 0;
  font-size:12px;
}

.study-row button {
  min-height:24px;
  padding:2px 6px;
}

.study-grip {
  padding:4px 3px;
  flex:0 0 auto;
}

.study-collapsed > .study-row {
  display:none;
}
`;

document.head.appendChild(compactStudyStyle);

// Remember which participant sections are open.
const studyExpanded = new Map();
const previousStudyDisplay = display;

display = function(snapshot) {
  previousStudyDisplay(snapshot);

  const names = new Map();

  for (const person of snapshot.people || []) {
    names.set(person.key, person.name);
  }

  for (const task of snapshot.tasks || []) {
    if (!names.has(task.key)) {
      names.set(task.key, task.name);
    }
  }

  const sorted = [...names].sort(
    (a,b) => a[1].localeCompare(b[1])
  );

  const sections = [
    ...$('study-people').querySelectorAll(
      ':scope > .study-person'
    )
  ];

  sorted.forEach(([key], index) => {
    const section = sections[index];
    const head = section?.querySelector(
      '.study-person-head'
    );

    if (!head) return;

    const isOpen = () =>
      studyExpanded.has(key)
        ? studyExpanded.get(key)
        : key === normalize(name);

    const renderFold = () => {
      section.classList.toggle(
        'study-collapsed', !isOpen()
      );

      head.setAttribute(
        'aria-expanded', String(isOpen())
      );
    };

    head.tabIndex = 0;
    head.setAttribute('role','button');
    head.setAttribute(
      'aria-label','Expand or collapse tasks'
    );

    const toggle = () => {
      studyExpanded.set(key,!isOpen());
      renderFold();
    };

    head.addEventListener('click', toggle);

    head.addEventListener('keydown', event => {
      if (
        event.key !== 'Enter' &&
        event.key !== ' '
      ) return;

      event.preventDefault();
      toggle();
    });

    renderFold();
  });
};

// Fix drag-and-drop by listening on the document,
// not on the grip that moves with the row.
makeDraggable = function(grip, row, section) {
  let pointerId = null;
  let before = [];

  const order = () =>
    [...section.querySelectorAll(
      ':scope > .study-row'
    )].map(item => Number(item.dataset.taskId));

  function onMove(event) {
    if (pointerId !== event.pointerId) return;

    event.preventDefault();

    const target = document.elementFromPoint(
      event.clientX, event.clientY
    )?.closest('.study-row');

    if (
      !target ||
      target === row ||
      target.parentElement !== section
    ) return;

    const bounds = target.getBoundingClientRect();
    const middle = bounds.top + bounds.height / 2;

    section.insertBefore(
      row,
      event.clientY > middle
        ? target.nextSibling
        : target
    );
  }

  function detach() {
    document.removeEventListener(
      'pointermove', onMove, true
    );
    document.removeEventListener(
      'pointerup', onUp, true
    );
    document.removeEventListener(
      'pointercancel', onCancel, true
    );

    pointerId = null;
    row.style.pointerEvents = '';
    row.classList.remove('is-dragging');
  }

  async function finish(shouldSave) {
    const after = order();
    detach();

    let error = null;

    try {
      if (
        shouldSave &&
        after.join(',') !== before.join(',')
      ) {
        await moveTasks(after);
      }
    } catch (e) {
      error = e;
    } finally {
      interaction = null;
      await refresh();

      if (error) {
        status(`Could not reorder: ${error.message}`);
      }
    }
  }

  function onUp(event) {
    if (event.pointerId === pointerId) {
      void finish(true);
    }
  }

  function onCancel(event) {
    if (event.pointerId === pointerId) {
      void finish(false);
    }
  }

  grip.addEventListener('pointerdown', event => {
    if (
      interaction ||
      writing ||
      (event.pointerType === 'mouse' &&
       event.button !== 0)
    ) return;

    event.preventDefault();

    interaction = 'drag';
    pointerId = event.pointerId;
    before = order();

    row.classList.add('is-dragging');
    row.style.pointerEvents = 'none';

    document.addEventListener(
      'pointermove', onMove,
      {capture:true,passive:false}
    );

    document.addEventListener(
      'pointerup', onUp, true
    );

    document.addEventListener(
      'pointercancel', onCancel, true
    );
  });

  // Keyboard alternative: arrow keys on the grip.
  grip.addEventListener('keydown', async event => {
    if (
      !['ArrowUp','ArrowDown'].includes(event.key) ||
      interaction ||
      writing
    ) return;

    event.preventDefault();

    const ids = order();
    const old = ids.indexOf(
      Number(row.dataset.taskId)
    );

    const next = old + (
      event.key === 'ArrowUp' ? -1 : 1
    );

    if (next < 0 || next >= ids.length) return;

    [ids[old],ids[next]] =
      [ids[next],ids[old]];

    interaction = 'drag';

    let error = null;

    try {
      await moveTasks(ids);
    } catch (e) {
      error = e;
    } finally {
      interaction = null;
      await refresh();

      if (error) {
        status(`Could not reorder: ${error.message}`);
      }
    }
  });
};


/* Compact shared Pomodoro timer inside Study Board */

const miniTimerStyle = document.createElement('style');

miniTimerStyle.textContent = `
#study-mini-timer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  margin: 10px 0 12px;
  border: 1px solid var(--line);
  border-radius: 9px;
}

.study-mini-readout {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

#study-mini-phase {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}

#study-mini-countdown {
  font-size: 24px;
  font-weight: 600;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.03em;
}

.study-mini-controls {
  display: flex;
  align-items: center;
  gap: 6px;
}

.study-mini-controls button {
  min-height: 32px;
  padding: 6px 11px;
  font-size: 12px;
  white-space: nowrap;
}

.study-mini-controls button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@media (max-width: 360px) {
  #study-mini-timer {
    padding: 9px;
    gap: 7px;
  }

  #study-mini-countdown {
    font-size: 21px;
  }

  .study-mini-controls button {
    padding: 6px 8px;
  }
}
`;

document.head.appendChild(miniTimerStyle);

// Build the mini timer
const miniTimer = document.createElement('section');

miniTimer.id = 'study-mini-timer';
miniTimer.setAttribute(
  'aria-label',
  'Shared Pomodoro timer'
);

miniTimer.innerHTML = `
  <div class="study-mini-readout">
    <span id="study-mini-phase">Focus</span>
    <strong id="study-mini-countdown">50:00</strong>
  </div>

  <div class="study-mini-controls">
    <button
      id="study-mini-toggle"
      type="button"
    >Pause</button>

    <button
      id="study-mini-reset"
      type="button"
    >Reset</button>
  </div>
`;

// Place directly below the Study Board title
dialog.querySelector('.study-top')
  ?.insertAdjacentElement('afterend', miniTimer);

// Reference the existing main Pomodoro controls
const mainToggle = document.getElementById('toggle');
const mainReset = document.getElementById('reset');
const mainPhase = document.getElementById('phase');
const mainCountdown = document.getElementById('countdown');

const miniToggle = document.getElementById(
  'study-mini-toggle'
);

const miniReset = document.getElementById(
  'study-mini-reset'
);

// Forward button clicks to the real shared timer.
// This preserves Supabase synchronization.
miniToggle.addEventListener('click', () => {
  if (mainToggle && !mainToggle.disabled) {
    mainToggle.click();
    updateMiniTimer();
  }
});

miniReset.addEventListener('click', () => {
  if (mainReset && !mainReset.disabled) {
    mainReset.click();
    updateMiniTimer();
  }
});


// Mirror the main countdown and current timer phase
function updateMiniTimer() {
  if (!dialog.open) return;

  const phase = mainPhase?.textContent?.trim() || 'Focus';

  const countdown =
    mainCountdown?.textContent?.trim() || '50:00';

  const toggleText =
    mainToggle?.textContent?.trim() || 'Pause';

  const miniPhase = document.getElementById(
    'study-mini-phase'
  );

  const miniCountdown = document.getElementById(
    'study-mini-countdown'
  );

  miniPhase.textContent = phase;
  miniCountdown.textContent = countdown;

  miniToggle.textContent = toggleText;

  miniToggle.disabled =
    !mainToggle || mainToggle.disabled;

  miniReset.disabled =
    !mainReset || mainReset.disabled;
}

// Update display without making Supabase requests
setInterval(updateMiniTimer, 500);

// Initialize the display
updateMiniTimer();




