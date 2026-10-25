
(() => {
  const beforeBreak = document.getElementById('beforeBreakSound');
  const beforeFocus = document.getElementById('beforeFocusSound');
  const countdown = document.getElementById('countdown');
  const phaseLabel = document.getElementById('phase');
  const toggle = document.getElementById('toggle');
  if (!beforeBreak || !beforeFocus || !countdown || !phaseLabel || !toggle) return;

  const choices = [
    ['countdown15', 'One Sun One Moon · 15 seconds'],
    ['off', 'Off'],
    ['chime', 'Gentle chime'],
    ['bell', 'Soft bell'],
    ['glass', 'Crystal glass'],
    ['musicbox', 'Music box'],
    ['harp', 'Gentle harp'],
    ['marimba', 'Soft marimba'],
    ['piano', 'Soft piano'],
    ['wind', 'Wind chimes'],
    ['zen', 'Zen bowl'],
    ['drop', 'Raindrop'],
    ['warm', 'Warm tone'],
    ['beep', 'Classic beep']
  ];

  // Each instrument is synthesized; no sound files are required.
  const presets = {
    chime:    {wave:'sine',     notes:[523,659,784], duration:0.65, attack:0.035, volume:0.10, parts:[[1,1],[2,0.12]]},
    bell:     {wave:'sine',     notes:[587,698,880], duration:1.05, attack:0.012, volume:0.09, parts:[[1,1],[2.01,0.20],[3.9,0.05]]},
    glass:    {wave:'sine',     notes:[784,880,988], duration:0.90, attack:0.005, volume:0.07, parts:[[1,1],[2.7,0.22],[4.1,0.08]]},
    musicbox: {wave:'triangle', notes:[523,659,784], duration:0.52, attack:0.008, volume:0.095,parts:[[1,1],[2,0.12]]},
    harp:     {wave:'triangle', notes:[392,494,587], duration:0.80, attack:0.008, volume:0.085,parts:[[1,1],[2,0.08]]},
    marimba:  {wave:'sine',     notes:[392,494,587], duration:0.32, attack:0.003, volume:0.12, parts:[[1,1],[3,0.20]]},
    piano:    {wave:'triangle', notes:[440,523,659], duration:0.58, attack:0.010, volume:0.09, parts:[[1,1],[2,0.07]]},
    wind:     {wave:'sine',     notes:[659,784,1047],duration:1.25, attack:0.016, volume:0.07, parts:[[1,1],[2.05,0.13]]},
    zen:      {wave:'sine',     notes:[294,330,392], duration:1.40, attack:0.065, volume:0.09, parts:[[1,1],[2.01,0.12],[3.02,0.04]]},
    drop:     {wave:'sine',     notes:[698,784,880], duration:0.28, attack:0.005, volume:0.10, parts:[[1,1]], sweep:true},
    warm:     {wave:'sine',     notes:[330,392,440], duration:0.50, attack:0.070, volume:0.10, parts:[[1,1]]},
    beep:     {wave:'sine',     notes:[660,660,660], duration:0.18, attack:0.008, volume:0.10, parts:[[1,1]]}
  };

  // Expand both menus and remember existing selections.
  for (const select of [beforeBreak, beforeFocus]) {
    const previous = select.value;
    let saved;
    try { saved = localStorage.getItem('pomo-15s-' + select.id); } catch {}
    select.replaceChildren(...choices.map(([value, label]) => new Option(label, value)));
    select.value = choices.some(([value]) => value === saved) ? saved
      : 'countdown15';
    select.addEventListener('change', () => {
      try { localStorage.setItem('pomo-15s-' + select.id, select.value); } catch {}
    });
  }

  

  let audio;
  let masterGain;
  let volumePercent = 100;
  
  try {
    const saved = localStorage.getItem('pomo-sound-volume');
    if (saved !== null && Number.isFinite(Number(saved))) {
      volumePercent = Math.max(0, Math.min(100, Number(saved)));
    }
  } catch {}
  
  function setSoundVolume(value, save = true) {
    const number = Number(value);
    if (!Number.isFinite(number)) return;
  
    volumePercent = Math.max(0, Math.min(100, number));
  
    const slider = document.getElementById('soundVolume');
    const label = document.getElementById('soundVolumeValue');
  
    if (slider) slider.value = String(volumePercent);
    if (label) label.textContent = `${volumePercent}%`;
  
    // Change volume immediately, including during playback.
    if (audio && masterGain) {
      masterGain.gain.setTargetAtTime(
        volumePercent / 100,
        audio.currentTime,
        0.015
      );
    }
  
    // Also handle HTML audio elements, if used.
    document.querySelectorAll('audio[data-pomo-sound]')
      .forEach(player => {
        player.volume = volumePercent / 100;
      });
  
    if (save) {
      try {
        localStorage.setItem(
          'pomo-sound-volume',
          String(volumePercent)
        );
      } catch {}
    }
  }
  
  // Event delegation also works if Settings moves the slider.
  document.addEventListener('input', event => {
    if (event.target.id === 'soundVolume') {
      setSoundVolume(event.target.value);
    }
  });
  
  setSoundVolume(volumePercent, false);


  
  // Restore 15-second audio and Test playback
  let clipBuffer;
  let clipLoading;
  // Automatic alerts and Test playback have separate audio sources.
  const clipSources = {automatic: null, test: null};
  const clipGenerations = {automatic: 0, test: 0};
  const automaticNotes = new Set();

  function stopClip(kind = 'automatic') {
    clipGenerations[kind]++;
    const source = clipSources[kind];
    if (source) {
      try { source.stop(); } catch {}
      try { source.disconnect(); } catch {}
      clipSources[kind] = null;
    }
  }

  function stopAutomatic() {
    stopClip('automatic');
    for (const oscillator of automaticNotes) {
      try { oscillator.stop(); } catch {}
      try { oscillator.disconnect(); } catch {}
    }
    automaticNotes.clear();
  }

  function loadClip(ctx) {
    if (clipBuffer) return Promise.resolve(clipBuffer);

    if (!clipLoading) {
      clipLoading = fetch('./countdown-15s.mp3')
        .then(response => {
          if (!response.ok) {
            throw new Error('15-second sound file not found');
          }
          return response.arrayBuffer();
        })
        .then(bytes => ctx.decodeAudioData(bytes))
        .then(buffer => (clipBuffer = buffer))
        .catch(error => {
          clipLoading = null;
          throw error;
        });
    }

    return clipLoading;
  }

  async function playClip(seconds = 15, kind = 'automatic') {
    stopClip(kind);
    const generation = clipGenerations[kind];
    const ctx = audio;
    if (!ctx || ctx.state !== 'running' || !masterGain) return;

    const requestedAt = performance.now();
    try {
      const buffer = await loadClip(ctx);
      if (generation !== clipGenerations[kind] || audio !== ctx) return;

      // Align late playback with the *current* countdown.
      const remaining = seconds - (performance.now() - requestedAt) / 1000;
      const offset = Math.max(0, 15 - remaining);
      if (remaining <= 0 || offset >= buffer.duration) return;

      const source = ctx.createBufferSource();
      clipSources[kind] = source;
      source.buffer = buffer;
      source.connect(masterGain);
      source.addEventListener('ended', () => {
        if (clipSources[kind] === source) clipSources[kind] = null;
      }, {once: true});
      source.start(0, offset, Math.min(remaining, buffer.duration - offset));
    } catch (error) {
      console.error('15-second sound could not play:', error);
    }
  }

  // Stop old sounds when timer settings change
  for (const select of [beforeBreak, beforeFocus]) {
    select.addEventListener('change', stopAutomatic);
  }

  for (const id of ['toggle', 'reset', 'sync']) {
    document.getElementById(id)?.addEventListener('click', stopAutomatic);
  }

  document.getElementById('durations')
    ?.addEventListener('submit', stopAutomatic);


  
  function unlockAudio() {
    const AudioContextClass =
      window.AudioContext || window.webkitAudioContext;
  
    if (!AudioContextClass) {
      console.error('Web Audio is not supported');
      return null;
    }
  
    try {
      if (!audio || typeof audio.createGain !== 'function'
          || audio.state === 'closed') {
        audio = new AudioContextClass();
        masterGain = null;
      }
  
      if (!masterGain || masterGain.context !== audio) {
        masterGain = audio.createGain();
  
        const slider = document.getElementById('soundVolume');
        const value = Number(slider?.value ?? 100);
  
        masterGain.gain.value =
          Math.max(0, Math.min(1, value / 100));
  
        masterGain.connect(audio.destination);
      }
  
      if (audio.state !== 'running') {
        audio.resume().catch(error => {
          console.error('Audio resume failed:', error);
        });
      }

      // Prepare the MP3 while the user is interacting, not at 15s.
      // This loads/decodes data only; it does NOT schedule or play it.
      if (!clipBuffer && !clipLoading) {
        loadClip(audio).catch(() => {});
      }

      return audio;
    } catch (error) {
      console.error('Audio initialization failed:', error);
      return null;
    }
  }



  document.addEventListener('pointerdown', unlockAudio, {capture:true});
  document.addEventListener('keydown', unlockAudio, {capture:true});

  function playNote(name, step, when, kind = 'automatic') {
    const p = presets[name];
    if (!p) return;
    const ctx = audio;
    if (!ctx || ctx.state !== 'running') return;
    const frequency = p.notes[step];

    for (const [ratio, amount] of p.parts) {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = p.wave;
      oscillator.frequency.setValueAtTime(frequency * ratio, when);
      if (p.sweep) {
        oscillator.frequency.exponentialRampToValueAtTime(
          frequency * ratio * 0.68, when + p.duration
        );
      }
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.linearRampToValueAtTime(p.volume * amount, when + p.attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + p.duration);
      oscillator.connect(gain);
      gain.connect(masterGain);
      if (kind === 'automatic') {
        automaticNotes.add(oscillator);
        oscillator.addEventListener('ended', () => {
          automaticNotes.delete(oscillator);
        }, {once: true});
      }
      oscillator.start(when);
      oscillator.stop(when + p.duration + 0.02);
    }
  }

  // Test plays a quick preview of all three countdown notes.
  document.querySelectorAll('[data-test-sound]').forEach(button => {
    button.addEventListener('click', async () => {
      const selected = document.getElementById(button.dataset.testSound);
      if (!selected || selected.value === 'off') return;
      const ctx = unlockAudio();
      if (!ctx) return;
      if (ctx.state === 'suspended') {
        try { await ctx.resume(); } catch { return; }
      }
      if (ctx.state !== 'running') return;
      if (selected.value === 'countdown15') {
        playClip(15, 'test');
        return;
      }
      const start = ctx.currentTime + 0.08;
      for (let step = 0; step < 3; step++) {
        playNote(selected.value, step, start + step * 0.65, 'test');
      }
    });
  });

  // Live state notifications from app.js. NO advance scheduling.
  let lastCycle = null;
  let lastEligible = false;
  const played = new Set();

  window.addEventListener('pomo-live-timer', event => {
    const timer = event.detail;
    if (!timer) return;

    const eligible = Boolean(timer.running && timer.safeToNotify);
    const cycle = [
      timer.version, timer.mode, timer.phase,
      timer.endsAt, timer.focus, timer.rest
    ].join('|');

    // A different cycle, pause, reset, remote change,
    // or disconnection immediately cancels AUTOMATIC audio only.
    if (cycle !== lastCycle || eligible !== lastEligible) {
      stopAutomatic();
      played.clear();
    }
    lastCycle = cycle;
    lastEligible = eligible;
    if (!eligible) return;

    const ms = Number(timer.remaining);
    if (!Number.isFinite(ms) || ms <= 0) return;

    const sound = timer.phase === 'focus'
      ? beforeBreak.value
      : beforeFocus.value;
    if (!sound || sound === 'off') return;

    // The recording begins ONLY once we're actually within 15s.
    if (sound === 'countdown15') {
      if (ms <= 15000 && !played.has('clip') &&
          audio?.state === 'running') {
        played.add('clip');
        playClip(ms / 1000, 'automatic');
      }
      return;
    }

    // Live beeps/chimes at 3, 2 and 1 seconds remaining.
    const seconds = Math.ceil(ms / 1000);
    if (seconds < 1 || seconds > 3 || played.has(seconds)) return;
    if (audio?.state !== 'running') return;

    played.add(seconds);
    playNote(sound, 3 - seconds, audio.currentTime + 0.01,
      'automatic');
  });
})();
