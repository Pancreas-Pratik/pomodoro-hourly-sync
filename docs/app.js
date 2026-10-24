import {initialState, current, change} from './timer.js';
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
  if (document.hidden) return;

  const time = now();
  const view = current(state, time);
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

  const status = connecting
    ? 'Connecting to shared timer…'
    : sharedReady
      ? sharedConnection === 'online'
        ? view.mode === 'hourly'
          ? 'Shared · hourly schedule'
          : 'Shared timer'
        : 'Shared · reconnecting…'
      : view.mode === 'hourly'
        ? 'Hourly schedule · local'
        : 'Personal timer · local';

  text('connection', status);
  text('clock', clock.format(time));

  for (const id of ['toggle', 'reset', 'sync', 'apply']) {
    $(id).disabled = pending || connecting;
  }
}

function tick() {
  clearTimeout(renderTimeout);
  render();

  if (!document.hidden) {
    renderTimeout = setTimeout(
      tick, 1000 - (Date.now() % 1000) + 5
    );
  }
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
    type === 'sync'
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
    text('message', 'Connecting to the shared timer…');
    return;
  }

  try {
    if (type === 'durations') {
      change(state, {type, ...extra}, now());
    }

    if (sharedReady) {
      pending = true;
      tick();

      try {
        await shared.command(type, extra);
      } catch (error) {
        text(
          'message',
          `Shared update failed: ${error.message}`
        );
        await shared.refresh().catch(() => {});
        return;
      } finally {
        pending = false;
      }
    } else {
      state = change(state, {type, ...extra}, now());
    }

    updateControls();
    noteAction(type);
  } catch (error) {
    text('message', error.message);
  } finally {
    tick();
  }
}

$('toggle').onclick = () =>
  act(current(state, now()).running ? 'pause' : 'start');

$('reset').onclick = () => act('reset');
$('sync').onclick = () => act('sync');

$('durations').onsubmit = event => {
  event.preventDefault();
  act('durations', {
    focus: Number($('focus').value),
    rest: Number($('rest').value)
  });
};

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    clearTimeout(renderTimeout);
  } else {
    if (sharedReady) {
      shared.refresh().catch(() => {});
    }
    tick();
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


    $('people').hidden = false;
    text('members', 'Connecting Discord participants…');

    try {
      // Request permission to identify the Discord user
      const { code } = await sdk.commands.authorize({
        client_id: DISCORD_CLIENT_ID,
        response_type: 'code',
        state: '',
        prompt: 'none',
        scope: ['identify']
      });

      // Exchange authorization code securely via Supabase
      const authUrl =
        location.hostname.endsWith('.discordsays.com')
          ? `${location.origin}/.proxy/supabase`
          : SUPABASE_URL;

      const response = await fetch(
        `${authUrl}/functions/v1/discord-token`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: SUPABASE_PUBLISHABLE_KEY
          },
          body: JSON.stringify({ code })
        }
      );

      const result = await response.json();

      if (!response.ok || !result.access_token) {
        throw new Error(
          result.error || 'Discord token exchange failed'
        );
      }

      await sdk.commands.authenticate({
        access_token: result.access_token
      });

      // Show participants on the main page

      const show = ({ participants = [] } = {}) => {
        text(
          'members',
          `${participants.length} ${
            participants.length === 1 ? 'person' : 'people'
          } in this Activity`
        );
      
        const container = $('names');
        container.replaceChildren();
      
        container.style.display = 'flex';
        container.style.justifyContent = 'center';
        container.style.flexWrap = 'wrap';
        container.style.gap = '16px';
      
        participants.forEach(person => {
          const item = document.createElement('span');
          item.style.display = 'inline-flex';
          item.style.alignItems = 'center';
          item.style.gap = '8px';
      
          const name =
            person.global_name || person.username || 'Participant';
      
          if (person.avatar && person.id) {
            const avatar = document.createElement('img');
            avatar.src =
              `https://cdn.discordapp.com/avatars/${person.id}/${person.avatar}.png?size=64`;
            avatar.width = 32;
            avatar.height = 32;
            avatar.alt = '';
            avatar.style.borderRadius = '50%';
            avatar.style.objectFit = 'cover';
            item.appendChild(avatar);
          }
      
          const label = document.createElement('span');
          label.textContent = name;
          item.appendChild(label);
      
          container.appendChild(item);
        });
      };


      const participants =
        await sdk.commands
          .getActivityInstanceConnectedParticipants();

      show(participants);

      try {
        await sdk.subscribe(
          'ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE',
          show
        );
      } catch (error) {
        console.warn('Live participant updates:', error);
      }

    } catch (error) {
      console.error('Discord authentication:', error);
      text(
        'members',
        `Discord participants unavailable: ${
          error?.message || String(error)
        }`
      );
    }



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
