/* Minimal Pomo: user-configured, channel-scoped Anki Leaderboard.
   No hard-coded Anki usernames; every participant opts in from Settings.
   Never includes a Supabase service-role key in public browser code. */
import {SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY} from './config.js';

const board = document.getElementById('study-dialog');
const toDos = document.getElementById('study-people');
const settings = document.getElementById('study-name-box');

if (board && toDos && settings) {
  const css = document.createElement('style');
  css.textContent = `
    #study-anki-settings {margin-top:7px;padding-top:7px;border-top:1px solid var(--line)}
    #study-anki-settings label {display:block;font-size:12px;margin-bottom:4px}
    #study-anki-form {display:flex;align-items:center;gap:5px;min-width:0}
    #study-anki-username {flex:1;min-width:0;height:31px;padding:5px 7px;border:1px solid var(--line);border-radius:6px}
    #study-anki-save {height:31px;min-height:31px;padding:4px 10px;font-size:11px}
    #study-anki-setting-status {margin:3px 0 0;font-size:10px;color:var(--muted);line-height:1.2}
    #study-anki {border-top:1px solid var(--line);margin-top:4px;min-width:0;flex:0 0 auto}
    #study-anki summary {display:flex;align-items:center;gap:8px;min-height:27px;
      cursor:pointer;user-select:none;font-size:12px;font-weight:600;list-style:none}
    #study-anki summary::-webkit-details-marker {display:none}
    #study-anki summary::before {content:'▸';color:var(--muted);font-weight:400}
    #study-anki[open] summary::before {content:'▾'}
    #study-anki-summary-status {margin-left:auto;min-width:0;font-size:10px;
      font-weight:400;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #study-anki-content {padding:4px 0 2px;min-width:0}
    .study-anki-grid {display:grid;
      grid-template-columns:minmax(17px,.35fr) minmax(66px,1.6fr) minmax(39px,.85fr)
      minmax(42px,.9fr) minmax(29px,.6fr) minmax(72px,1.45fr)
      minmax(37px,.8fr) minmax(36px,.7fr);
      gap:0 3px;align-items:center;min-width:0}
    .study-anki-grid > * {min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
      padding:4px 1px;font-size:clamp(9px,1.2vw,12px);font-variant-numeric:tabular-nums}
    .study-anki-grid .study-anki-label {color:var(--muted);font-size:clamp(8px,1vw,11px);
      border-bottom:1px solid var(--line)}
    .study-anki-grid .study-anki-user {font-weight:600}
    .study-anki-grid .study-anki-cell {text-align:right}
    .study-anki-grid .study-anki-rank {text-align:center;font-weight:600}
    .study-anki-grid .study-anki-past {white-space:pre-line;line-height:1.15}
    #study-anki-foot {margin:2px 0;color:var(--muted);font-size:10px;line-height:1.25}
    .study-anki-pages {display:flex;align-items:center;justify-content:center;gap:10px;font-size:10px}
    .study-anki-pages button {min-height:23px;padding:2px 8px;font-size:10px}
    #study-dialog:has(#study-anki[open]) #study-people {flex:0 1 auto;overflow:hidden}
    #study-dialog:has(#study-anki[open]) #study-people .study-task-rows,
    #study-dialog:has(#study-anki[open]) #study-people .study-task-pages {display:none}
    @media(max-width:480px){
      .study-anki-grid {grid-template-columns:17px minmax(61px,1.6fr) minmax(32px,.7fr)
        minmax(36px,.8fr) minmax(25px,.5fr) minmax(63px,1.3fr)
        minmax(31px,.6fr) minmax(31px,.55fr);gap:0 2px}
      .study-anki-grid > * {font-size:9px;padding:3px 0}
      .study-anki-grid .study-anki-label {font-size:8px}
      #study-anki summary {font-size:11px}
    }
    @media(max-height:480px){.study-anki-grid > * {padding-block:2px}}
    /* Floating month hover: always-open Anki summary, no separate scrolling. */
    #study-anki-hover,#study-anki-history {min-width:0;border-top:1px solid var(--line);padding-top:5px;margin-top:6px}
    #study-anki-hover summary,#study-anki-history summary {font-size:11px;font-weight:600;list-style:none}
    #study-anki-hover summary::-webkit-details-marker,#study-anki-history summary::-webkit-details-marker {display:none}
    #study-anki-hover .study-anki-grid > *,#study-anki-history .study-anki-grid > * {
      padding:2px 0;font-size:8px}
    #study-anki-hover .study-anki-grid,#study-anki-history .study-anki-grid {
      grid-template-columns:14px minmax(58px,1.6fr) minmax(30px,.7fr)
        minmax(32px,.7fr) minmax(22px,.5fr) minmax(58px,1.3fr)
        minmax(28px,.6fr) minmax(29px,.55fr);gap:0 1px}
    #study-day-dialog #study-anki-history {flex:0 0 auto;max-height:40dvh;overflow:hidden}
    #study-preview #study-anki-hover {pointer-events:none}
  `;
  document.head.appendChild(css);

  // The only Anki-specific setting required from an individual participant.
  const section = document.createElement('div');
  section.id = 'study-anki-settings';
  section.innerHTML = `
    <label for="study-anki-username">Anki Leaderboard username</label>
    <form id="study-anki-form">
      <input id="study-anki-username" type="text" maxlength="80"
        autocomplete="off" placeholder="Your public Anki username">
      <button type="submit" id="study-anki-save">Save</button>
    </form>
    <p id="study-anki-setting-status" role="status">Optional. Save blank to remove yourself.</p>`;
  settings.appendChild(section);
  const input = document.getElementById('study-anki-username');
  const form = document.getElementById('study-anki-form');
  const settingStatus = document.getElementById('study-anki-setting-status');

  // Collapsible panel below the to-dos.
  const panel = document.createElement('details');
  panel.id = 'study-anki';
  const summary = document.createElement('summary');
  summary.appendChild(document.createTextNode('🏆 Anki Leaderboard'));
  const panelStatus = document.createElement('span');
  panelStatus.id = 'study-anki-summary-status';
  panelStatus.textContent = 'Expand to view';
  summary.appendChild(panelStatus);
  const body = document.createElement('div');
  body.id = 'study-anki-content';
  body.textContent = 'Expand to view registered participants.';
  panel.append(summary, body);
  toDos.insertAdjacentElement('afterend', panel);

  const endpoint = location.hostname.endsWith('.discordsays.com')
    ? `${location.origin}/.proxy/supabase` : SUPABASE_URL;
  let boardKey = null;
  let allRows = [];
  let fetchedAt = 0;
  let fetchedBoard = null;
  let busy = false;
  let saving = false;
  let inputDirty = false;
  let pageIndex = 0;

  const person = () => (document.getElementById('study-name')?.value || '')
    .trim().replace(/\s+/g, ' ');
  const key = str => String(str || '').trim().replace(/\s+/g, ' ').toLowerCase();
  const fmtMinutes = value => {
    if (value == null) return '—';
    const n = Math.max(0, Math.round(Number(value) || 0));
    return `${Math.floor(n / 60)}h ${String(n % 60).padStart(2, '0')}m`;
  };
  const number = value => value == null ? '—' : Number(value).toLocaleString('en-US');

  // Shared Anki-style grid for the live board and saved calendar snapshots.
  // Reviews today, NOT 31-day reviews, decides rank after every collection.
  function scoreGrid(scores, startRank = 1) {
    const grid = document.createElement('div');
    grid.className = 'study-anki-grid';
    function cell(value, klass = '', tooltip = '') {
      const span = document.createElement('span');
      span.className = klass;
      span.textContent = String(value);
      span.title = tooltip || String(value);
      grid.appendChild(span);
    }
    const headers = ['#', 'Username', 'Reviews', 'Time', 'Streak', 'Past 31d', 'Ret.', 'Country'];
    headers.forEach((title, i) => cell(title, 'study-anki-label' + (i > 1 ? ' study-anki-cell' : ''),
      ['Rank within this channel', 'Anki username', 'Reviews today', 'Minutes today',
       'Streak (days)', 'Past 31 days: average per day and total', 'Retention %', 'Country'][i]));
    scores.forEach((row, i) => {
      const extra = [row.league && `League: ${row.league}`,
        row.anki_group && `Group: ${row.anki_group}`].filter(Boolean).join(' · ');
      cell(startRank + i, 'study-anki-rank');
      cell(row.username, 'study-anki-user', extra ? `${row.username} · ${extra}` : row.username);
      cell(number(row.reviews), 'study-anki-cell', 'Reviews today');
      cell(fmtMinutes(row.minutes), 'study-anki-cell', 'Time today');
      cell(row.streak == null ? '—' : `${row.streak}d`, 'study-anki-cell');
      const past = row.reviews_31d == null ? '—' :
        `${Math.floor(Number(row.reviews_31d) / 31)}/d\n(${number(row.reviews_31d)})`;
      cell(past, 'study-anki-cell study-anki-past', 'Past 31 days: average per day / total');
      cell(row.retention == null ? '—' : `${Number(row.retention).toFixed(1).replace(/\.0$/, '')}%`,
        'study-anki-cell');
      cell(row.country && !['-', '—'].includes(row.country) ? row.country : '—', 'study-anki-cell');
    });
    return grid;
  }

  async function rpc(method, params) {
    const response = await fetch(`${endpoint}/rest/v1/rpc/${method}`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(params)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || `Supabase error ${response.status}`);
    return data;
  }

  function reflectSettings() {
    if (inputDirty || document.activeElement === input) return;
    const current = allRows.find(row => row.study_name_key === key(person()));
    input.value = current?.username || '';
    settingStatus.textContent = current
      ? `Registered for this Discord channel as ${current.username}. Save blank to remove.`
      : 'Optional. Save your username to join this channel’s leaderboard.';
  }

  function draw() {
    body.replaceChildren();
    if (!allRows.length) {
      body.textContent = 'No participants registered. Enter your Anki username in Settings.';
      panelStatus.textContent = 'No registrations';
      return;
    }
    const rows = [...allRows].sort((a, b) => (b.reviews ?? -1) - (a.reviews ?? -1)
      || String(a.username).localeCompare(String(b.username)));
    const pageSize = Math.max(4, Math.min(8, Math.floor((window.innerHeight - 290) / 25)));
    const pages = Math.max(1, Math.ceil(rows.length / pageSize));
    pageIndex = Math.max(0, Math.min(pageIndex, pages - 1));
    const recent = rows.map(r => r.anki_day).filter(Boolean).sort().at(-1);
    panelStatus.textContent = recent ? `Latest: ${recent}` : `${rows.length} registered`;

    body.appendChild(scoreGrid(
      rows.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize),
      pageIndex * pageSize + 1
    ));

    if (pages > 1) {
      const nav = document.createElement('div');
      nav.className = 'study-anki-pages';
      const prev = document.createElement('button');
      prev.textContent = '‹ Previous'; prev.type = 'button'; prev.disabled = pageIndex === 0;
      const next = document.createElement('button');
      next.textContent = 'Next ›'; next.type = 'button'; next.disabled = pageIndex === pages - 1;
      const label = document.createElement('span');
      label.textContent = `${pageIndex + 1}/${pages}`;
      prev.onclick = () => { pageIndex--; draw(); };
      next.onclick = () => { pageIndex++; draw(); };
      nav.append(prev, label, next);
      body.appendChild(nav);
    }
    const foot = document.createElement('p');
    foot.id = 'study-anki-foot';
    const latest = rows.map(r => r.captured_at).filter(Boolean).sort().at(-1);
    foot.textContent = latest ? `Last website check saved: ${new Date(latest).toLocaleString()}. GitHub collection scheduled every 5 minutes.` : 'Awaiting first Anki website check. — means unavailable.';
    body.appendChild(foot);
  }

  async function load(force = false) {
    if (!boardKey || busy || (!force && fetchedBoard === boardKey && Date.now() - fetchedAt < 60_000)) return;
    busy = true;
    if (panel.open) body.textContent = 'Loading Anki leaderboard…';
    try {
      const rows = await rpc('pomo_anki_board_scores', {p_board_key: boardKey});
      if (!Array.isArray(rows)) throw new Error('Unexpected leaderboard response');
      allRows = rows;
      fetchedAt = Date.now();
      fetchedBoard = boardKey;
      reflectSettings();
      if (panel.open) draw();
      else panelStatus.textContent = `${rows.length} registered`;
    } catch (error) {
      if (panel.open) body.textContent = `Could not load leaderboard: ${error.message}`;
      settingStatus.textContent = `Could not load Anki username: ${error.message}`;
      panelStatus.textContent = 'Sync error';
    } finally {
      busy = false;
    }
  }

  function acceptBoard(candidate) {
    if (!/^(channel|instance):[A-Za-z0-9_-]{1,128}$/.test(candidate || '')) return;
    if (candidate === boardKey) return;
    boardKey = candidate;
    allRows = [];
    fetchedAt = 0;
    fetchedBoard = null;
    pageIndex = 0;
    if (!inputDirty) input.value = '';
    void load(true);
  }
  window.addEventListener('pomo-study-ready', event => acceptBoard(event.detail?.boardKey));
  acceptBoard(window.pomoStudyBoardKey);

  input.addEventListener('input', () => { inputDirty = true; });
  document.getElementById('study-name')?.addEventListener('change', () => {
    inputDirty = false;
    input.value = '';
    reflectSettings();
  });
  document.getElementById('settings-gear')?.addEventListener('click', () => void load());

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (saving) return;
    if (!boardKey) { settingStatus.textContent = 'Join the Activity in Discord first.'; return; }
    const studyName = person();
    if (!studyName) { settingStatus.textContent = 'Enter your study name above first.'; return; }
    saving = true;
    const save = document.getElementById('study-anki-save');
    save.disabled = true;
    try {
      const username = input.value.trim();
      await rpc('pomo_anki_set_username', {
        p_board_key: boardKey,
        p_study_name: studyName,
        p_anki_username: username
      });
      inputDirty = false;
      fetchedAt = 0;
      settingStatus.textContent = username ? `Saved: ${username}` : 'Registration removed.';
      await load(true);
    } catch (error) {
      settingStatus.textContent = `Could not save: ${error.message}`;
    } finally {
      saving = false;
      save.disabled = false;
    }
  });

  // Calendar hover and day editor use the dated Anki snapshot, not live
  // data from the current day. Your to-dos are expanded by study.js;
  // other participants' to-dos default to collapsed. Anki stays expanded.
  async function drawHistorical(day, host, id, limit) {
    const existing = document.getElementById(id);
    existing?.remove();
    if (!boardKey || !host || !host.isConnected) return;
    const details = document.createElement('details');
    details.id = id;
    details.open = true;
    const caption = document.createElement('summary');
    caption.textContent = '🏆 Anki Leaderboard · ' + day;
    const content = document.createElement('div');
    content.textContent = 'Loading Anki history…';
    details.append(caption, content);
    host.appendChild(details);
    if (id === 'study-anki-hover') {
      window.dispatchEvent(new Event('pomo-study-preview-resize'));
    }
    try {
      const rows = await rpc('pomo_anki_day_scores', {
        p_board_key: boardKey, p_day: day
      });
      if (!details.isConnected) return;
      content.replaceChildren();
      if (!Array.isArray(rows) || !rows.length) {
        content.textContent = 'No Anki history recorded for this day.';
      } else {
        const sorted = rows.sort((a, b) => (b.reviews ?? -1) - (a.reviews ?? -1));
        content.appendChild(scoreGrid(sorted.slice(0, limit)));
        if (sorted.length > limit) {
          const note = document.createElement('p');
          note.className = 'study-task-more';
          note.textContent = `+${sorted.length - limit} more users`;
          content.appendChild(note);
        }
        const foot = document.createElement('p');
        foot.className = 'study-anki-foot';
        const captured = sorted.map(r => r.captured_at).filter(Boolean).sort().at(-1);
        foot.textContent = captured
          ? `Last saved: ${new Date(captured).toLocaleString()}`
          : 'No stats collected yet.';
        content.appendChild(foot);
      }
    } catch (error) {
      if (details.isConnected) content.textContent = `Anki history unavailable: ${error.message}`;
    } finally {
      if (id === 'study-anki-hover' && details.isConnected) {
        window.dispatchEvent(new Event('pomo-study-preview-resize'));
      }
    }
  }

  window.addEventListener('pomo-study-preview-ready', event => {
    void drawHistorical(event.detail?.day,
      document.getElementById('study-preview'), 'study-anki-hover', 5);
  });
  window.addEventListener('pomo-study-day-open', event => {
    void drawHistorical(event.detail?.day,
      document.getElementById('study-day-dialog'), 'study-anki-history', 8);
  });
  document.getElementById('study-day-dialog')?.addEventListener('close', () => {
    document.getElementById('study-anki-history')?.remove();
  });

  panel.addEventListener('toggle', () => {
    if (panel.open) {
      if (!boardKey) body.textContent = 'Open this Activity in Discord first.';
      else void load();
    }
  });
  setInterval(() => {
    if (panel.open && board.open) void load();
  }, 60_000);
}
