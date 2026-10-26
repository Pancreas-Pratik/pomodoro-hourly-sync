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
    #study-anki-content {padding:3px 0 2px;min-width:0;max-height:min(59dvh,570px);overflow:hidden}
    /* One participant per row; all columns fit the panel without horizontal scrolling. */
    #study-anki-content .study-anki-table {width:100%;border-collapse:collapse;table-layout:fixed;
      font-variant-numeric:tabular-nums;font-size:clamp(7px,1.05vw,11px)}
    #study-anki-content .study-anki-table th {font-size:clamp(7px,.93vw,10px);
      font-weight:500;color:var(--muted);text-align:left;white-space:normal;line-height:1.1;
      padding:4px 3px;border-bottom:1px solid var(--line)}
    #study-anki-content .study-anki-table td {padding:6px 3px;border-bottom:1px solid var(--line);
      vertical-align:middle;line-height:1.15;overflow-wrap:anywhere;word-break:normal}
    #study-anki-content .study-anki-table tr:last-child td {border-bottom:0}
    #study-anki-content .study-anki-table td:first-child {font-weight:600}
    #study-anki-content .study-anki-table .anki-number {color:var(--muted);font-weight:400}
    #study-anki-content .study-anki-table .anki-sub {font-size:clamp(6px,.9vw,9px);
      color:var(--muted);display:block;line-height:1.1;margin-top:2px}
    #study-anki-foot {font-size:10px;line-height:1.3;color:var(--muted);margin:5px 0 0}
    @media(max-width:600px) {
      #study-anki-content .study-anki-table {font-size:clamp(5px,1.25vw,8px)}
      #study-anki-content .study-anki-table th {font-size:clamp(5px,1.15vw,7px);padding:3px 1px}
      #study-anki-content .study-anki-table td {padding:4px 1px}
      #study-anki-content .study-anki-table .anki-sub {font-size:clamp(5px,1vw,7px)}
    }
    .study-anki-card {padding:9px 2px;border-bottom:1px solid var(--line)}
    .study-anki-card:last-of-type {border-bottom:0}
    .study-anki-card-title {display:flex;gap:7px;align-items:baseline;min-width:0;
      font-size:12px;font-weight:600;line-height:1.4;overflow-wrap:anywhere}
    .study-anki-rank {color:var(--muted);font-variant-numeric:tabular-nums;flex:0 0 auto}
    .study-anki-card-name {min-width:0}
    .study-anki-metrics {display:grid;grid-template-columns:repeat(4,minmax(0,1fr));
      gap:6px 10px;padding:7px 0 2px 22px}
    .study-anki-metric {min-width:0;display:flex;flex-direction:column;gap:2px}
    .study-anki-label {color:var(--muted);font-size:10px;line-height:1.2}
    .study-anki-value {font-size:11px;line-height:1.3;overflow-wrap:anywhere;
      font-variant-numeric:tabular-nums}
    .study-anki-subvalue {font-size:10px;color:var(--muted)}
    .study-anki-pages {display:flex;align-items:center;justify-content:center;gap:10px;font-size:10px}
    .study-anki-pages button {min-height:23px;padding:2px 8px;font-size:10px}
    #study-dialog:has(#study-anki[open]) #study-people {flex:0 1 auto;overflow:hidden}
    @media(max-width:480px){
      .study-anki-metrics {grid-template-columns:repeat(2,minmax(0,1fr));gap:6px 9px}
      .study-anki-card-title {font-size:11px}
      #study-anki summary {font-size:11px}
    }
    @media(max-height:480px){.study-anki-card {padding:5px 2px}}
    /* Calendar hover and day-click history use the same one-row-per-person
       table as the Study Board. Every column stays visible without scrolling. */
    #study-calendar #study-preview {width:min(1080px,calc(100vw - 16px))}
    #study-anki-hover,#study-anki-history {
      min-width:0;width:100%;border-top:1px solid var(--line);
      padding-top:4px;margin-top:5px;overflow:hidden;
    }
    #study-anki-hover summary,#study-anki-history summary {
      font-size:11px;font-weight:600;list-style:none;cursor:default;
    }
    #study-anki-hover summary::-webkit-details-marker,
    #study-anki-history summary::-webkit-details-marker {display:none}
    #study-anki-hover .study-anki-table,#study-anki-history .study-anki-table {
      width:100%;border-collapse:collapse;table-layout:fixed;
      font-variant-numeric:tabular-nums;font-size:clamp(6px,.85vw,10px);
    }
    #study-anki-hover .study-anki-table th,#study-anki-history .study-anki-table th {
      font-size:clamp(6px,.8vw,9px);font-weight:500;color:var(--muted);
      text-align:left;line-height:1.1;white-space:normal;
      padding:3px 2px;border-bottom:1px solid var(--line);
    }
    #study-anki-hover .study-anki-table td,#study-anki-history .study-anki-table td {
      padding:4px 2px;vertical-align:middle;line-height:1.15;
      border-bottom:1px solid var(--line);overflow-wrap:anywhere;word-break:normal;
    }
    #study-anki-hover .study-anki-table tr:last-child td,
    #study-anki-history .study-anki-table tr:last-child td {border-bottom:0}
    #study-anki-hover .study-anki-table td:first-child,
    #study-anki-history .study-anki-table td:first-child {font-weight:600}
    #study-anki-hover .study-anki-table .anki-sub,
    #study-anki-history .study-anki-table .anki-sub {
      display:block;margin-top:1px;color:var(--muted);
      font-size:clamp(5px,.75vw,8px);line-height:1.1;
    }
    #study-anki-hover .study-anki-foot,#study-anki-history .study-anki-foot {
      margin:3px 0 0;font-size:9px;color:var(--muted);
    }
    #study-day-dialog #study-anki-history {flex:0 0 auto;max-height:none;overflow:hidden}
    #study-preview #study-anki-hover {pointer-events:none}
    @media(max-width:600px){
      #study-anki-hover .study-anki-table,#study-anki-history .study-anki-table {
        font-size:clamp(5px,1.25vw,8px)}
      #study-anki-hover .study-anki-table th,#study-anki-history .study-anki-table th {
        font-size:clamp(5px,1.1vw,7px);padding:2px 1px}
      #study-anki-hover .study-anki-table td,#study-anki-history .study-anki-table td {
        padding:3px 1px}
    }

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
  summary.appendChild(document.createTextNode('Anki Leaderboard'));
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

  // User names come from their Study Board setting, not their Anki account.
  // Historical names are also read from the Study Board's saved people/tasks.
  let configuredNames = new Map();
  const namesFromStudy = snapshot => {
    const names = new Map();
    for (const item of [...(snapshot?.people || []), ...(snapshot?.tasks || [])]) {
      const display = String(item.name || item.display_name || '').trim();
      const identifier = key(item.key || display);
      if (identifier && display && !names.has(identifier)) names.set(identifier, display);
    }
    return names;
  };
  const displayName = (row, names = configuredNames) => {
    const studyKey = key(row.study_name_key || '');
    const locallyConfigured = studyKey && studyKey === key(person()) ? person() : '';
    const named = row.study_name || row.display_name ||
      names.get(studyKey) || locallyConfigured || row.study_name_key;
    const label = String(named || '').trim();
    const username = String(row.username || '').trim();
    return label && username ? `${label} (${username})` : (label || username);
  };
  const appendMetric = (metrics, label, value, subvalue = '') => {
    const item = document.createElement('div');
    item.className = 'study-anki-metric';
    const labelNode = document.createElement('span');
    labelNode.className = 'study-anki-label';
    labelNode.textContent = label;
    const valueNode = document.createElement('span');
    valueNode.className = 'study-anki-value';
    valueNode.textContent = String(value);
    item.append(labelNode, valueNode);
    if (subvalue) {
      const sub = document.createElement('span');
      sub.className = 'study-anki-subvalue';
      sub.textContent = subvalue;
      item.appendChild(sub);
    }
    metrics.appendChild(item);
  };
  // Show every stored Anki metric, including Country, League and Group.
  function scoreGrid(scores, startRank = 1, names = configuredNames) {
    const list = document.createElement('div');
    list.className = 'study-anki-list';
    scores.forEach((row, i) => {
      const card = document.createElement('section');
      card.className = 'study-anki-card';
      const title = document.createElement('div');
      title.className = 'study-anki-card-title';
      const rank = document.createElement('span');
      rank.className = 'study-anki-rank';
      rank.textContent = `${startRank + i}.`;
      const name = document.createElement('span');
      name.className = 'study-anki-card-name';
      name.textContent = displayName(row, names);
      title.append(rank, name);
      card.appendChild(title);
      const metrics = document.createElement('div');
      metrics.className = 'study-anki-metrics';
      const last31 = row.reviews_31d == null ? '—' : number(row.reviews_31d);
      const average = row.reviews_31d == null ? '' :
        `${(Number(row.reviews_31d) / 31).toFixed(1)} per day`;
      appendMetric(metrics, 'Reviews today', number(row.reviews));
      appendMetric(metrics, 'Time today', fmtMinutes(row.minutes));
      appendMetric(metrics, 'Streak', row.streak == null ? '—' : `${row.streak} days`);
      appendMetric(metrics, 'Reviews past 31 days', last31, average);
      appendMetric(metrics, 'Retention', row.retention == null ? '—' : `${Number(row.retention).toFixed(1)}%`);
      appendMetric(metrics, 'Country', row.country || '—');
      appendMetric(metrics, 'League', row.league || '—');
      appendMetric(metrics, 'Group', row.anki_group || '—');
      appendMetric(metrics, 'Anki review rank', number(row.review_rank));
      appendMetric(metrics, 'Anki day', row.anki_day || '—');
      appendMetric(metrics, 'Last saved', row.captured_at
        ? new Date(row.captured_at).toLocaleString() : '—');
      card.appendChild(metrics);
      list.appendChild(card);
    });
    return list;
  }

  // Compact leaderboard table: every metric remains visible in each person's row.
  // Column widths add up to 100%, so the panel never needs horizontal scrolling.
  function scoreTable(scores, startRank = 1, names = configuredNames) {
    const table = document.createElement('table');
    table.className = 'study-anki-table';
    table.setAttribute('aria-label', 'Anki leaderboard statistics');
    const columns = [
      ['Participant', 'Participant name (Anki username)', '25%'],
      ['Today', 'Reviews today', '5.5%'],
      ['Time', 'Study time today', '6%'],
      ['Streak', 'Streak in days', '6%'],
      ['31d', 'Reviews in the past 31 days and average per day', '8%'],
      ['Ret.', 'Retention percentage', '5.5%'],
      ['Country', 'Country', '7%'],
      ['League', 'League', '7%'],
      ['Group', 'Anki group', '8%'],
      ['Rank', 'Anki review rank', '5.5%'],
      ['Day', 'Anki day', '8%'],
      ['Saved', 'Last snapshot saved', '8.5%']
    ];
    const colgroup = document.createElement('colgroup');
    const head = document.createElement('thead');
    const heading = document.createElement('tr');
    columns.forEach(([short, full, width]) => {
      const col = document.createElement('col');
      col.style.width = width;
      colgroup.appendChild(col);
      const th = document.createElement('th');
      th.scope = 'col';
      th.textContent = short;
      th.title = full;
      heading.appendChild(th);
    });
    head.appendChild(heading);
    const tbody = document.createElement('tbody');
    const shortDateTime = raw => {
      if (!raw) return '—';
      const date = new Date(raw);
      if (Number.isNaN(date.getTime())) return '—';
      const day = `${date.getMonth() + 1}/${date.getDate()}`;
      const h = date.getHours();
      return `${day} ${h % 12 || 12}:${String(date.getMinutes()).padStart(2, '0')}${h < 12 ? 'a' : 'p'}`;
    };
    scores.forEach((row, i) => {
      const tr = document.createElement('tr');
      const cell = (value, full = '', secondary = '') => {
        const td = document.createElement('td');
        td.textContent = String(value == null ? '—' : value);
        if (full) td.title = full;
        if (secondary) {
          const sub = document.createElement('span');
          sub.className = 'anki-sub';
          sub.textContent = secondary;
          td.appendChild(sub);
        }
        tr.appendChild(td);
      };
      const name = displayName(row, names);
      cell(`${startRank + i}. ${name}`, name);
      cell(number(row.reviews));
      cell(fmtMinutes(row.minutes).replace(/\s/g, ''), fmtMinutes(row.minutes));
      cell(row.streak == null ? '—' : `${row.streak}d`, row.streak == null ? '' : `${row.streak} days`);
      cell(number(row.reviews_31d), 'Reviews in the past 31 days',
        row.reviews_31d == null ? '' : `${(Number(row.reviews_31d) / 31).toFixed(1)}/day`);
      cell(row.retention == null ? '—' : `${Number(row.retention).toFixed(1)}%`);
      cell(row.country || '—');
      cell(row.league || '—');
      cell(row.anki_group || '—');
      cell(number(row.review_rank));
      cell(row.anki_day || '—');
      cell(shortDateTime(row.captured_at), row.captured_at ? new Date(row.captured_at).toLocaleString() : '');
      tbody.appendChild(tr);
    });
    table.append(colgroup, head, tbody);
    return table;
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

  window.addEventListener('pomo-study-roster', event => {
    if (event.detail?.boardKey !== boardKey) return;
    configuredNames = namesFromStudy(event.detail?.snapshot);
    if (panel.open && allRows.length) draw();
  });

  function draw() {
    body.replaceChildren();
    if (!allRows.length) {
      body.textContent = 'No participants registered. Enter your Anki username in Settings.';
      panelStatus.textContent = 'No registrations';
      return;
    }
    const rows = [...allRows].sort((a, b) => (b.reviews ?? -1) - (a.reviews ?? -1)
      || String(a.username).localeCompare(String(b.username)));
    const pageSize = Math.max(2, Math.min(8, Math.floor((window.innerHeight - 260) / 32)));
    const pages = Math.max(1, Math.ceil(rows.length / pageSize));
    pageIndex = Math.max(0, Math.min(pageIndex, pages - 1));
    const recent = rows.map(r => r.anki_day).filter(Boolean).sort().at(-1);
    panelStatus.textContent = recent ? `Latest: ${recent}` : `${rows.length} registered`;

    body.appendChild(scoreTable(
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
    foot.textContent = latest ? `Last website check saved: ${new Date(latest).toLocaleString()}. GitHub collection scheduled hourly at 5 minutes past the hour; runs may be delayed.` : 'Awaiting first Anki website check. — means unavailable.';
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
    configuredNames = new Map();
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

  // Calendar hover and day editor use the saved snapshot for the selected
  // date, rendered in the same compact table as the current leaderboard.
  async function drawHistorical(day, host, id, limit) {
    document.getElementById(id)?.remove();
    if (!boardKey || !host || !host.isConnected || !day) return;
    const details = document.createElement('details');
    details.id = id;
    details.open = true;
    const caption = document.createElement('summary');
    caption.textContent = 'Anki Leaderboard · ' + day;
    const content = document.createElement('div');
    content.textContent = 'Loading Anki history…';
    details.append(caption, content);
    host.appendChild(details);
    const isHover = id === 'study-anki-hover';
    if (isHover) window.dispatchEvent(new Event('pomo-study-preview-resize'));
    try {
      const [rows, studyResult] = await Promise.all([
        rpc('pomo_anki_day_scores', {p_board_key: boardKey, p_day: day}),
        rpc('pomo_study_calendar_read', {p_board_key: boardKey, p_day: day})
          .catch(() => null)
      ]);
      const historicalNames = studyResult ? namesFromStudy(studyResult) : configuredNames;
      if (!details.isConnected) return;
      content.replaceChildren();
      if (!Array.isArray(rows) || !rows.length) {
        content.textContent = 'No Anki history recorded for this day.';
      } else {
        const sorted = [...rows].sort((a, b) => (b.reviews ?? -1) - (a.reviews ?? -1));
        // Page instead of scroll: on the hover, the day click reveals more users.
        // Keep the clicked day's task editor visible at shorter window heights.
        const pageSize = isHover
          ? Math.max(1, Math.min(limit, Math.floor((window.innerHeight - 210) / 55)))
          : Math.max(1, Math.min(limit, Math.floor((window.innerHeight - 285) / 42)));
        let page = 0;
        const paint = () => {
          if (!details.isConnected) return;
          content.replaceChildren(scoreTable(
            sorted.slice(page * pageSize, (page + 1) * pageSize),
            page * pageSize + 1, historicalNames
          ));
          if (sorted.length > pageSize) {
            if (isHover) {
              const note = document.createElement('p');
              note.className = 'study-task-more';
              note.textContent = `+${sorted.length - pageSize} more participants · click the date`;
              content.appendChild(note);
            } else {
              const nav = document.createElement('div');
              nav.className = 'study-anki-pages';
              const previous = document.createElement('button');
              previous.type = 'button'; previous.textContent = '‹ Prev';
              previous.disabled = page === 0;
              const next = document.createElement('button');
              next.type = 'button'; next.textContent = 'Next ›';
              next.disabled = (page + 1) * pageSize >= sorted.length;
              const counter = document.createElement('span');
              counter.textContent = `${page + 1} / ${Math.ceil(sorted.length / pageSize)}`;
              previous.onclick = () => { page--; paint(); };
              next.onclick = () => { page++; paint(); };
              nav.append(previous, counter, next);
              content.appendChild(nav);
            }
          }
          const foot = document.createElement('p');
          foot.className = 'study-anki-foot';
          const captured = sorted.map(r => r.captured_at).filter(Boolean).sort().at(-1);
          foot.textContent = captured
            ? `Last saved: ${new Date(captured).toLocaleString()}`
            : 'No stats collected yet.';
          content.appendChild(foot);
          if (isHover) window.dispatchEvent(new Event('pomo-study-preview-resize'));
        };
        paint();
      }
    } catch (error) {
      if (details.isConnected) content.textContent = `Anki history unavailable: ${error.message}`;
    } finally {
      if (isHover && details.isConnected) {
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

  window.addEventListener('pomo-study-person-expanded', () => {
    if (panel.open) panel.open = false;
  });

  panel.addEventListener('toggle', () => {
    if (panel.open) {
      window.dispatchEvent(new Event('pomo-study-collapse-people'));
      if (!boardKey) body.textContent = 'Open this Activity in Discord first.';
      else {
        if (fetchedBoard === boardKey) draw();
        void load();
      }
    }
  });
  setInterval(() => {
    if (panel.open && board.open) void load();
  }, 60_000);
}
