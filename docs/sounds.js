
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
  let clipBuffer;
  let clipLoading;
  let clipSource;
  let clipGeneration = 0;
  function stopClip() {
    clipGeneration++;
    if (clipSource) {
      try { clipSource.stop(); } catch {}
      clipSource.disconnect();
      clipSource = null;
    }
  }
  function loadClip(ctx) {
    if (clipBuffer) return Promise.resolve(clipBuffer);
    if (!clipLoading) {
      clipLoading = fetch('./countdown-15s.mp3')
        .then(response => {
          if (!response.ok) throw new Error('Countdown audio unavailable');
          return response.arrayBuffer();
        })
        .then(bytes => ctx.decodeAudioData(bytes))
        .then(buffer => (clipBuffer = buffer))
        .catch(error => { clipLoading = null; throw error; });
    }
    return clipLoading;
  }
  async function playClip(seconds = 15) {
    stopClip();
    const generation = clipGeneration;
    const ctx = audio;
    if (!ctx || ctx.state !== 'running') return;
    const requestedAt = performance.now();
    try {
      const buffer = await loadClip(ctx);
      if (generation !== clipGeneration) return;
      const remaining = seconds - (performance.now() - requestedAt) / 1000;
      const offset = Math.max(0, 15 - remaining);
      if (remaining <= 0 || offset >= buffer.duration) return;
      clipSource = ctx.createBufferSource();
      clipSource.buffer = buffer;
      clipSource.connect(ctx.destination);
      clipSource.start(0, offset, Math.min(remaining, buffer.duration - offset));
    } catch (error) { console.warn(error.message); }
  }
  for (const select of [beforeBreak, beforeFocus]) {
    select.addEventListener('change', stopClip);
  }
  for (const id of ['toggle', 'reset', 'sync']) {
    document.getElementById(id)?.addEventListener('click', stopClip);
  }
  document.getElementById('durations')?.addEventListener('submit', stopClip);
  function unlockAudio() {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return null;
    try {
      audio ||= new Audio();
      loadClip(audio).catch(() => {});
      const soundEnabled = () => {
        if (audio.state === 'running') {
          document.getElementById('enable-sound')?.remove();
        }
      };
      
      if (audio.state === 'suspended') {
        audio.resume().then(soundEnabled).catch(() => {});
      } else {
        soundEnabled();
      }
      
      return audio;
    } catch { return null; }
  }

  document.addEventListener('pointerdown', unlockAudio, {capture:true});
  document.addEventListener('keydown', unlockAudio, {capture:true});

  function playNote(name, step, when) {
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
      gain.connect(ctx.destination);
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
      if (selected.value === 'countdown15') { playClip(); return; }
      stopClip();
      const start = ctx.currentTime + 0.08;
      for (let step = 0; step < 3; step++) {
        playNote(selected.value, step, start + step * 0.65);
      }
    });
  });

  let lastPhase = '';
  let lastRemaining = null;
  const played = new Set();

  function checkTimer() {
    if (document.hidden) return;
    const match = countdown.textContent.trim().match(/^(\d+):(\d{2})$/);
    if (!match) return;

    const seconds = Number(match[1]) * 60 + Number(match[2]);
    const phase = phaseLabel.textContent.trim().toLowerCase();
    const running = toggle.textContent.trim() === 'Pause';

    // New cycle or reset: permit the next countdown.
    if (phase !== lastPhase ||
        (lastRemaining !== null && seconds > lastRemaining + 1)) {
      played.clear();
      stopClip();
    }
    lastPhase = phase;
    lastRemaining = seconds;

    if (!running || !['focus', 'break'].includes(phase)) {
      played.clear(); stopClip(); return;
    }
    const selectedSound = phase === 'focus' ? beforeBreak.value : beforeFocus.value;
    if (selectedSound === 'countdown15') {
      if (seconds > 15) { played.clear(); return; }
      if (seconds >= 1 && !played.has('clip') && audio?.state === 'running') {
        played.add('clip');
        playClip(seconds);
      }
      return;
    }
    if (seconds > 3) played.clear();
    if (seconds < 1 || seconds > 3 || played.has(seconds)) return;

    // Exactly one alert for each of 3, 2, and 1.
    played.add(seconds);
    const sound = phase === 'focus' ? beforeBreak.value : beforeFocus.value;
    if (sound === 'off') return;
    const ctx = audio;
    if (!ctx || ctx.state !== 'running') return;
    playNote(sound, 3 - seconds, ctx.currentTime + 0.01);
  }

  setInterval(checkTimer, 150);
  checkTimer();
})();
