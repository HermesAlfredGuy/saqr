// Sound: a continuous wind bed that tracks airspeed (the single biggest feel cue), plus
// procedural hits. No samples needed; unlocks on the first gesture, mute persists.
export function createAudio(externalCtx = null) {
  const offline = !!externalCtx;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = externalCtx || new Ctx();
  let clock = 0;                                   // offline renders schedule against this
  const now = () => ctx.currentTime + clock;
  const master = ctx.createGain(), sfx = ctx.createGain();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18; comp.ratio.value = 3; comp.attack.value = 0.004; comp.release.value = 0.25;
  sfx.connect(master); master.connect(comp); comp.connect(ctx.destination);
  sfx.gain.value = 0.85;

  let muted = false;
  try { muted = localStorage.getItem('saqr-muted') === '1'; } catch { /* private mode */ }
  master.gain.value = offline || !muted ? 0.9 : 0;

  if (!offline) {
    const unlock = () => { if (ctx.state === 'suspended') ctx.resume(); };
    ['pointerdown', 'keydown', 'touchstart'].forEach((e) => addEventListener(e, unlock, { passive: true }));
  }

  // ---- wind bed ----
  const noiseBuf = (() => {
    const len = Math.ceil(ctx.sampleRate * 3);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + w * 0.03) * 0.995; d[i] = last * 6; }
    return buf;
  })();
  const windSrc = ctx.createBufferSource();
  windSrc.buffer = noiseBuf; windSrc.loop = true;
  const windLP = ctx.createBiquadFilter(); windLP.type = 'lowpass'; windLP.frequency.value = 420; windLP.Q.value = 0.7;
  const windGain = ctx.createGain(); windGain.gain.value = 0.0;
  const whistleBP = ctx.createBiquadFilter(); whistleBP.type = 'bandpass'; whistleBP.frequency.value = 1500; whistleBP.Q.value = 7;
  const whistleGain = ctx.createGain(); whistleGain.gain.value = 0;
  windSrc.connect(windLP); windLP.connect(windGain); windGain.connect(master);
  windSrc.connect(whistleBP); whistleBP.connect(whistleGain); whistleGain.connect(master);
  windSrc.start();

  // low pad for warmth
  const padGain = ctx.createGain(); padGain.gain.value = 0;
  const padFilter = ctx.createBiquadFilter(); padFilter.type = 'lowpass'; padFilter.frequency.value = 520; padFilter.Q.value = 0.6;
  padFilter.connect(padGain); padGain.connect(master);
  [73.42, 110.0, 146.83].forEach((f, i) => {
    const o = ctx.createOscillator(); o.type = i === 2 ? 'sine' : 'sawtooth'; o.frequency.value = f; o.detune.value = i * 6;
    const g = ctx.createGain(); g.gain.value = i === 2 ? 0.5 : 0.22;
    o.connect(g); g.connect(padFilter); o.start();
  });
  const park = () => padGain.gain.setTargetAtTime(0.05, now(), 1.2);
  park();

  const env = (g, t, a, d, peak) => {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  };
  function tone({ freq = 440, to = null, type = 'sine', a = 0.006, d = 0.2, vol = 0.4, when = 0, detune = 0 }) {
    const t = now() + when;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); o.detune.value = detune;
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + a + d);
    env(g, t, a, d, vol); o.connect(g); g.connect(sfx);
    o.start(t); o.stop(t + a + d + 0.08);
  }
  function noise({ d = 0.3, vol = 0.3, from = 800, to = 200, q = 1, when = 0, type = 'bandpass' }) {
    const t = now() + when;
    const len = Math.ceil(ctx.sampleRate * (d + 0.05));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate), ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = buf; f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, to), t + d);
    env(g, t, 0.012, d, vol); src.connect(f); f.connect(g); g.connect(sfx);
    src.start(t);
  }

  const presets = {
    thermal: () => {
      noise({ d: 1.2, vol: 0.22, from: 300, to: 1600, q: 1.4, type: 'bandpass' });
      [0, 0.1, 0.2].forEach((w, i) => tone({ freq: 587.3 * Math.pow(2, i / 12), type: 'sine', d: 0.5, vol: 0.09, when: w }));
    },
    soar: () => [0, 5, 9, 12].forEach((s, i) => tone({ freq: 329.6 * Math.pow(2, s / 12), type: 'triangle', d: 0.5, vol: 0.12, when: i * 0.07 })),
    whoosh: () => noise({ d: 0.34, vol: 0.20, from: 260, to: 2200, q: 2.4 }),
    crash: () => {
      tone({ freq: 120, to: 38, type: 'sine', d: 0.6, vol: 0.75 });
      tone({ freq: 196, to: 88, type: 'sawtooth', d: 0.4, vol: 0.22 });
      noise({ d: 0.5, vol: 0.5, from: 3200, to: 120, type: 'lowpass', q: 0.8 });
      noise({ d: 0.7, vol: 0.22, from: 900, to: 200, type: 'bandpass', q: 1.2, when: 0.06 });
    },
    start: () => {
      tone({ freq: 146.8, to: 587.3, type: 'triangle', d: 0.55, vol: 0.2 });
      noise({ d: 0.7, vol: 0.22, from: 200, to: 2400, q: 1.6 });
    },
    over: () => [12, 7, 3, 0].forEach((s, i) => tone({ freq: 261.6 * Math.pow(2, s / 12), type: 'triangle', d: 0.6, vol: 0.18, when: i * 0.16 })),
    ui: () => tone({ freq: 880, type: 'sine', d: 0.06, vol: 0.12 }),
  };

  return {
    ctx,
    setClock(t) { clock = t; },
    play(name, ...args) {
      if (!offline && ctx.state !== 'running') return;
      presets[name]?.(...args);
    },
    // speed01: 0 cruise .. 1 full stoop. Called every frame.
    setWind(speed01, active = true) {
      const t = now();
      const k = Math.max(0, Math.min(1, speed01));
      windGain.gain.setTargetAtTime(active ? 0.035 + k * 0.16 : 0.0, t, 0.12);
      windLP.frequency.setTargetAtTime(320 + k * 1500, t, 0.15);
      whistleGain.gain.setTargetAtTime(active ? Math.pow(k, 2.2) * 0.075 : 0, t, 0.2);
      whistleBP.frequency.setTargetAtTime(900 + k * 1500, t, 0.2);
    },
    get muted() { return muted; },
    toggleMute() {
      muted = !muted;
      master.gain.setTargetAtTime(muted ? 0 : 0.9, now(), 0.05);
      try { localStorage.setItem('saqr-muted', muted ? '1' : '0'); } catch { /* ignore */ }
      return muted;
    },
  };
}
