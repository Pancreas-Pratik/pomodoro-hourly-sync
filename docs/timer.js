export const MINUTE = 60000;

const eastern = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  minute: 'numeric',
  second: 'numeric'
});

export function initialState() {
  return {
    mode: 'custom', focus: 50, rest: 10,
    phase: 'focus', running: false,
    remaining: 50 * MINUTE, endsAt: null, version: 0
  };
}

export function current(state, now) {
  if (state.mode === 'hourly') {
    const parts = Object.fromEntries(
      eastern.formatToParts(now).map(p => [p.type, p.value])
    );
    const elapsed =
      Number(parts.minute) * MINUTE +
      Number(parts.second) * 1000 +
      ((now % 1000) + 1000) % 1000;

    const phase = elapsed < 50 * MINUTE ? 'focus' : 'break';
    const remaining =
      (phase === 'focus' ? 50 : 60) * MINUTE - elapsed;

    return {
      ...state, focus: 50, rest: 10,
      phase, running: true,
      remaining, endsAt: now + remaining
    };
  }

  if (!state.running) return {...state};

  let phase = state.phase, end = state.endsAt;
  if (now >= end) {
    const cycle = (state.focus + state.rest) * MINUTE;
    end += Math.floor((now - end) / cycle) * cycle;

    while (now >= end) {
      phase = phase === 'focus' ? 'break' : 'focus';
      end += (phase === 'focus'
        ? state.focus : state.rest) * MINUTE;
    }
  }

  return {...state, phase, endsAt: end, remaining: end - now};
}

export function change(state, action, now) {
  let next = current(state, now);

  switch (action.type) {
    case 'sync':
      next = current({...next, mode: 'hourly'}, now);
      break;
    case 'pause':
      next = {...next, mode: 'custom',
        running: false, endsAt: null};
      break;
    case 'start':
      if (!next.running) {
        next = {...next, running: true,
          endsAt: now + next.remaining};
      }
      break;
    case 'reset':
      next = {...next, mode: 'custom', phase: 'focus',
        running: false, remaining: next.focus * MINUTE,
        endsAt: null};
      break;
    case 'durations':
      if (![action.focus, action.rest].every(
        n => Number.isInteger(n) && n >= 1 && n <= 180
      )) throw new Error('Use whole minutes between 1 and 180.');
      next = {...next, mode: 'custom',
        focus: action.focus, rest: action.rest,
        phase: 'focus', remaining: action.focus * MINUTE,
        endsAt: next.running ? now + action.focus * MINUTE : null};
      break;
    default:
      throw new Error('Unknown timer action.');
  }

  return {...next, version: state.version + 1};
}
