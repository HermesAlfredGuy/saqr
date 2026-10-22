// Renders the soundtrack for the captured run from the game's own audio engine, offline.
// Wind follows the recorded speed curve; hits land on the recorded event frames.
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/data/integrations/node/node_modules/playwright');

const FR = '/opt/data/cache/scratch/saqr-frames';
const tele = JSON.parse(fs.readFileSync(`${FR}/telemetry.json`, 'utf8'));
const dur = tele.frames.length / tele.fps;

const browser = await chromium.launch({
  executablePath: '/opt/data/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto('http://127.0.0.1:9312/', { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__game, null, { timeout: 40000 });

const b64 = await page.evaluate(async ({ tele, dur }) => {
  const { createAudio } = await import('/src/engine/audio.js');
  const sr = 44100;
  const ctx = new OfflineAudioContext(1, Math.ceil(sr * dur), sr);
  const a = createAudio(ctx);

  const frames = tele.frames;
  let prevRides = 0, prevState = frames[0].state;
  const events = [];
  frames.forEach((f, i) => {
    const t = i / tele.fps;
    a.setClock(t);
    const playing = f.phase !== 'title';
    a.setWind(playing ? f.sp : 0.25, playing);
    if (f.rides > prevRides) { events.push(['thermal', t]); prevRides = f.rides; }
    if (f.state !== prevState) { events.push([f.state === 'crash' ? 'crash' : f.state === 'over' ? 'over' : 'x', t]); prevState = f.state; }
  });
  events.forEach(([name, t]) => { a.setClock(t); a.play(name === 'x' ? 'ui' : name); });
  // opening cue
  a.setClock(0.35); a.play('start');

  const buf = await ctx.startRendering();
  const data = buf.getChannelData(0);
  const n = data.length;
  const out = new ArrayBuffer(44 + n * 2);
  const v = new DataView(out);
  const wr = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  wr(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); wr(8, 'WAVEfmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  wr(36, 'data'); v.setUint32(40, n * 2, true);
  let peak = 0;
  for (let i = 0; i < n; i++) {
    let s = Math.max(-1, Math.min(1, data[i]));
    peak = Math.max(peak, Math.abs(s));
    v.setInt16(44 + i * 2, s * 32767, true);
  }
  const bytes = new Uint8Array(out);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
  return { wav: btoa(bin), peak, events };
}, { tele, dur });

fs.writeFileSync(`${FR}/sound.wav`, Buffer.from(b64.wav, 'base64'));
console.log('wrote sound.wav peak', b64.peak.toFixed(3), 'events', JSON.stringify(b64.events));
await browser.close();
