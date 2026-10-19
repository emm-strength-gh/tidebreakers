'use strict';
/* =====================================================================
   TIDEBREAKERS — synthesized sound (no audio files needed)
   Snd.play('gun') etc. To use recorded sounds instead, drop files named
   after the effect in assets/audio/ and list them in assets/audio/sounds.json:
   { "gun": "gun.mp3", "ambient": "waves.ogg" }  (any effect not listed stays synthesized)
   ===================================================================== */
(() => {
let ctx = null, master = null, sfxBus = null, ambBus = null, noiseBuf = null;
let enabled = true;
try { enabled = localStorage.getItem('tb.sound') !== 'off'; } catch (e) { /* storage blocked */ }
const files = {};          // name → AudioBuffer from assets/audio
const last = {};           // rate limiting per effect

function init() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = enabled ? 0.8 : 0; master.connect(ctx.destination);
  sfxBus = ctx.createGain(); sfxBus.gain.value = 0.7; sfxBus.connect(master);
  ambBus = ctx.createGain(); ambBus.gain.value = 0.0; ambBus.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  loadFiles();
  startAmbient();
}

async function loadFiles() {
  if (location.protocol === 'file:') return;
  try {
    const r = await fetch('assets/audio/sounds.json', { cache: 'no-cache' });
    if (!r.ok) return;
    const list = await r.json();
    for (const [k, f] of Object.entries(list)) {
      if (k.startsWith('_')) continue;
      fetch('assets/audio/' + f).then(x => x.arrayBuffer()).then(b => ctx.decodeAudioData(b)).then(buf => { files[k] = buf; if (k === 'ambient') startAmbient(); }).catch(() => {});
    }
  } catch (e) { /* no sound pack */ }
}

function noise(dur, type, freq, q, vol, t0 = 0, sweepTo = null) {
  const t = ctx.currentTime + t0;
  const src = ctx.createBufferSource(); src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f); f.connect(g); g.connect(sfxBus);
  src.start(t, Math.random()); src.stop(t + dur + 0.05);
}
function tone(type, f0, f1, dur, vol, t0 = 0) {
  const t = ctx.currentTime + t0;
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + dur + 0.05);
}

const FX = {
  gun:      () => { noise(0.07, 'highpass', 1800, 0.7, 0.35); tone('square', 220, 90, 0.06, 0.08); },
  enemyGun: () => { noise(0.08, 'bandpass', 1200, 1.2, 0.18); },
  harpoon:  () => { tone('sawtooth', 140, 50, 0.25, 0.22); noise(0.18, 'lowpass', 900, 0.5, 0.25); },
  cannon:   () => { noise(0.5, 'lowpass', 500, 0.6, 0.6, 0, 80); tone('sine', 90, 35, 0.35, 0.35); },
  boom:     () => { noise(0.9, 'lowpass', 900, 0.4, 0.7, 0, 60); tone('sine', 70, 28, 0.6, 0.45); },
  smallBoom:() => { noise(0.4, 'lowpass', 1400, 0.4, 0.4, 0, 120); },
  hit:      () => { noise(0.06, 'bandpass', 2400, 2, 0.22); },
  hurt:     () => { noise(0.18, 'lowpass', 700, 1, 0.45); tone('square', 120, 60, 0.15, 0.1); },
  splash:   () => { noise(0.35, 'bandpass', 900, 0.8, 0.3, 0, 300); },
  pickup:   () => { tone('sine', 660, 660, 0.08, 0.2); tone('sine', 990, 990, 0.12, 0.18, 0.07); },
  coin:     () => { tone('triangle', 1320, 1320, 0.07, 0.2); tone('triangle', 1760, 1760, 0.15, 0.18, 0.06); },
  rescue:   () => { [523, 659, 784, 1046].forEach((f, i) => tone('triangle', f, f, 0.18, 0.18, i * 0.08)); },
  build:    () => { noise(0.08, 'bandpass', 600, 2, 0.5); noise(0.08, 'bandpass', 500, 2, 0.45, 0.12); tone('sine', 180, 120, 0.12, 0.2, 0.12); },
  click:    () => { tone('square', 900, 700, 0.03, 0.06); },
  deny:     () => { tone('square', 200, 150, 0.12, 0.1); tone('square', 150, 110, 0.14, 0.1, 0.1); },
  alarm:    () => { for (let i = 0; i < 3; i++) tone('sawtooth', 440, 660, 0.35, 0.12, i * 0.42); },
  horn:     () => { tone('sawtooth', 110, 105, 0.9, 0.16); tone('sawtooth', 165, 160, 0.9, 0.1); },
  sonar:    () => { tone('sine', 1400, 1350, 0.9, 0.2); tone('sine', 1400, 1350, 0.6, 0.06, 0.45); },
  dive:     () => { for (let i = 0; i < 6; i++) tone('sine', 300 + Math.random() * 500, 900 + Math.random() * 400, 0.08, 0.08, i * 0.07); },
  netOn:    () => { noise(0.25, 'bandpass', 700, 1, 0.25, 0, 300); },
  chapter:  () => { [392, 523, 659, 784].forEach((f, i) => tone('triangle', f, f, 0.35, 0.16, i * 0.12)); },
  levelUp:  () => { [523, 784, 1046].forEach((f, i) => tone('sine', f, f, 0.25, 0.16, i * 0.1)); },
  dock:     () => { tone('sine', 300, 300, 0.12, 0.15); tone('sine', 400, 400, 0.18, 0.15, 0.12); },
};

function play(name, opts = {}) {
  if (!ctx || !enabled) return;
  const now = ctx.currentTime;
  const gap = opts.gap != null ? opts.gap : 0.04;
  if (last[name] && now - last[name] < gap) return;
  last[name] = now;
  if (files[name]) {
    const s = ctx.createBufferSource(); s.buffer = files[name];
    const g = ctx.createGain(); g.gain.value = opts.vol != null ? opts.vol : 1;
    s.connect(g); g.connect(sfxBus); s.start(); return;
  }
  const fn = FX[name]; if (fn) fn();
}

// gentle surf: filtered noise with a slow swell (or assets/audio ambient file)
let ambSrc = null;
function startAmbient() {
  if (!ctx) return;
  if (ambSrc) { try { ambSrc.stop(); } catch (e) { /* already stopped */ } ambSrc = null; }
  const src = ctx.createBufferSource(); src.loop = true;
  if (files.ambient) { src.buffer = files.ambient; src.connect(ambBus); }
  else {
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
    const swell = ctx.createGain(); swell.gain.value = 0.5;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.11;
    const lfoG = ctx.createGain(); lfoG.gain.value = 0.35;
    lfo.connect(lfoG); lfoG.connect(swell.gain); lfo.start();
    src.connect(f); f.connect(swell); swell.connect(ambBus);
  }
  src.start(); ambSrc = src;
  ambBus.gain.setTargetAtTime(0.32, ctx.currentTime, 1.5);
}

function setEnabled(on) {
  enabled = on;
  try { localStorage.setItem('tb.sound', on ? 'on' : 'off'); } catch (e) { /* storage blocked */ }
  if (master) master.gain.setTargetAtTime(on ? 0.8 : 0, ctx.currentTime, 0.05);
}

TB.Snd = { init, play, setEnabled, get enabled() { return enabled; } };
})();
