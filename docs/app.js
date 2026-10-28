import {initialState, current, change} from './timer.js?v=10020';
import {SharedTimer} from './shared.js';
import {
  DISCORD_CLIENT_ID,
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
} from './config.js';

const elements = new Map(
  [...document.querySelectorAll('[id]')]
    .map(el => [el.id, el])
);
const $ = id => elements.get(id);
const text = (id, value) => {
  if ($(id).textContent !== value) $(id).textContent = value;
};

const clock = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  hour: 'numeric',
  minute: '2-digit',
  timeZoneName: 'short'
});

const inDiscord =
  new URLSearchParams(location.search).has('frame_id');

let state = change(
  initialState(), {type: 'sync'}, Date.now()
);
let renderTimeout;
let serverOffset = 0;
let shared = null;
let sharedReady = false;
let connecting = inDiscord && Boolean(DISCORD_CLIENT_ID);
let sharedConnection = 'reconnecting';
let pending = false;

const now = () => Date.now() + serverOffset;


function render() {
  const time = now();
  const view = current(state, time);

  // Send the live timer state to the sound system,
  // even when Discord is in the background.
  window.dispatchEvent(new CustomEvent('pomo-live-timer', {
    detail: {
      ...view,
      safeToNotify: !connecting &&
        (!sharedReady || sharedConnection === 'online')
    }
  }));

  const seconds = Math.max(
    0, Math.ceil(view.remaining / 1000)
  );
  const display =
    String(Math.floor(seconds / 60)).padStart(2, '0') +
    ':' + String(seconds % 60).padStart(2, '0');

  text('countdown', display);
  text('phase', view.phase === 'focus' ? 'Focus' : 'Break');

  document.body.classList.toggle(
    'break', view.phase === 'break'
  );

  const title = `${display} · ${
    view.phase === 'focus' ? 'Focus' : 'Break'
  }`;
  if (document.title !== title) document.title = title;

  text(
    'toggle',
    view.running ? 'Pause' :
      view.remaining ===
      (view.phase === 'focus' ? view.focus : view.rest) * 60000
      ? 'Start' : 'Resume'
  );

  text(
    'next',
    view.running
      ? `${view.phase === 'focus' ? 'Break' : 'Focus'} at ${
          clock.format(view.endsAt)
        }`
      : 'Ready when you are.'
  );

  const pressed = String(view.mode === 'hourly');
  if ($('sync').getAttribute('aria-pressed') !== pressed) {
    $('sync').setAttribute('aria-pressed', pressed);
  }

  const label = view.mode === 'hourly'
    ? 'Synchronized to the hour '
    : 'Synchronize to the hour ';

  if ($('sync').firstChild.textContent !== label) {
    $('sync').firstChild.textContent = label;
  }

  const twoHour = view.mode === 'twohour';
  $('sync100').setAttribute('aria-pressed', String(twoHour));
  $('sync100').firstChild.textContent = twoHour
    ? '100 / 20 synchronized ' : 'Sync 100 / 20 ';
  text('schedule', twoHour
    ? '100 min focus · 20 min break · Every 2 hours from midnight Eastern'
    : view.mode === 'hourly'
      ? 'Focus :00–:50 · Break :50–:00 · Eastern Time'
      : 'Personal lengths · Choose a sync schedule to align with the clock');

  const status = connecting
    ? 'Connecting to shared timer…'
    : sharedReady
      ? sharedConnection === 'online'
        ? view.mode === 'hourly'
          ? 'Shared · hourly schedule'
          : twoHour ? 'Shared · 100 / 20 schedule' : 'Shared timer'
        : 'Shared · reconnecting…'
      : view.mode === 'hourly'
        ? 'Hourly schedule · local'
        : twoHour ? '100 / 20 schedule · local' : 'Personal timer · local';

  text('connection', status);
  text('clock', clock.format(time));

  for (const id of ['toggle', 'reset', 'sync', 'sync100', 'apply']) {
    $(id).disabled = pending || connecting;
  }
}


function tick() {
  clearTimeout(renderTimeout);
  render();

  // Keep checking the live timer, even in the background.
  renderTimeout = setTimeout(tick, 250);
}


function updateControls() {
  if (document.activeElement !== $('focus')) {
    $('focus').value = state.focus;
  }
  if (document.activeElement !== $('rest')) {
    $('rest').value = state.rest;
  }
}

function noteAction(type) {
  text(
    'message',
    (type === 'sync' || type === 'sync100')
      ? 'Following the Eastern Time schedule.'
      : type === 'durations'
        ? 'Timer lengths updated for everyone in this Activity.'
        : type === 'pause'
          ? 'Timer paused.'
          : type === 'reset'
            ? 'Timer reset.'
            : 'Timer running.'
  );
}


async function act(type, extra = {}) {
  if (pending) return;

  if (connecting) {
    text('message', 'Connecting to shared timer…');
    return;
  }

  const previousState = {...state};

  try {
    // Validate changes before updating the display.
    if (type === 'durations') {
      change(state, {type, ...extra}, now());
    }

    if (sharedReady) {
      pending = true;

      // Update the interface immediately.
      state = change(state, {type, ...extra}, now());
      updateControls();
      tick();

      try {
        // Save to Supabase and use its confirmed state.
        await shared.command(type, extra);
        noteAction(type);

      } catch (error) {
        // Restore the confirmed state if saving fails.
        state = previousState;

        await shared.refresh().catch(() => {});

        text(
          'message',
          `Shared update failed: ${error.message}`
        );

      } finally {
        pending = false;
      }

    } else {
      state = change(state, {type, ...extra}, now());
      updateControls();
      noteAction(type);
    }

  } catch (error) {
    text('message', error.message);

  } finally {
    updateControls();
    tick();
  }
}


$('toggle').onclick = () =>
  act(current(state, now()).running ? 'pause' : 'start');

$('reset').onclick = () => act('reset');
$('sync').onclick = () => act('sync');
$('sync100').onclick = () => act('sync100');

$('durations').onsubmit = event => {
  event.preventDefault();
  act('durations', {
    focus: Number($('focus').value),
    rest: Number($('rest').value)
  });
};


document.addEventListener('visibilitychange', () => {
  // Continue the live countdown whether Discord is
  // in the foreground or background.
  tick();

  // Refresh from Supabase when Discord becomes visible.
  if (!document.hidden && sharedReady) {
    shared.refresh().catch(() => {});
  }
});


window.addEventListener('pageshow', event => {
  if (event.persisted) shared?.resume();
  if (sharedReady) shared.refresh().catch(() => {});
  tick();
});

window.addEventListener('pagehide', () => shared?.close());

tick();

if (inDiscord && DISCORD_CLIENT_ID) {
  import('./discord-sdk.js').then(async ({DiscordSDK}) => {
    const sdk = new DiscordSDK(DISCORD_CLIENT_ID);
    await sdk.ready();

    
    // Shared Study Board — no Discord authorization required
    window.pomoStudyBoardKey = sdk.channelId
      ? `channel:${sdk.channelId}`
      : `instance:${sdk.instanceId}`;

    window.dispatchEvent(new CustomEvent('pomo-study-ready', {
      detail: {
        boardKey: window.pomoStudyBoardKey
      }
    }));

    
    if (!SUPABASE_PUBLISHABLE_KEY || !sdk.instanceId) {
      connecting = false;
      text(
        'message',
        'Shared timer not configured. Using local timer.'
      );
      tick();
      return;
    }

    const url = location.hostname.endsWith('.discordsays.com')
      ? `${location.origin}/.proxy/supabase`
      : SUPABASE_URL;

    shared = new SharedTimer({
      url,
      key: SUPABASE_PUBLISHABLE_KEY,
      instanceId: sdk.instanceId,

      onState: (newState, offset) => {
        state = newState;
        serverOffset = offset;
        sharedReady = true;
        connecting = false;
        updateControls();
        tick();
      },

      onStatus: (status, error) => {
        sharedConnection = status;
        if (error) {
          text(
            'message',
            `Realtime connection issue: ${error.message}`
          );
        }
        tick();
      }
    });

    shared.connect();

  }).catch(error => {
    connecting = false;
    text(
      'message',
      `Discord connection unavailable; local timer active. ${
        error.message
      }`
    );
    tick();
  });
}
