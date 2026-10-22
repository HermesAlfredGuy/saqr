// Records the gameplay video: fixed-timestep simulation, real pointer drags through the game's own
// touch stick, a real rock collision at the end. Writes per-frame telemetry for the soundtrack.
import { createRequire } from 'module';
import fs from 'fs';
import { PILOT_SRC } from './pilot.js';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/data/integrations/node/node_modules/playwright');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const OUT = '/opt/data/cache/scratch/saqr-frames';
const FPS = 30, SIM = 2;
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: '/opt/data/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required'],
});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('ERR', e.message));
const SEED = process.argv[2] || '4242';
await page.goto('http://127.0.0.1:9312/?seed=' + SEED, { waitUntil: 'load' });
await sleep(2600);
await page.waitForFunction(() => !!(window.__game && window.__game.update), null, { timeout: 40000 });
await page.evaluate(() => window.__game.loop.stop());

const tele = { fps: FPS, frames: [] };
let n = 0;
const shot = async () => { await page.screenshot({ path: `${OUT}/f${String(n).padStart(4, '0')}.png` }); n++; };
const advance = () => page.evaluate(([a, b]) => window.__game.loop.advance(a, b), [SIM, 1 / FPS]);
const state = () => page.evaluate(() => {
  const g = window.__game, S = g.S;
  return { t: +S.time.toFixed(3), state: S.state, score: Math.round(S.score), rides: S.rideCount,
    sp: +Math.max(0, Math.min(1, (S.speed - g.tuning.minSpeed) / (g.tuning.maxSpeed - g.tuning.minSpeed))).toFixed(3) };
});

// 1. title
for (let i = 0; i < 32; i++) { await advance(); tele.frames.push({ ...(await state()), phase: 'title' }); await shot(); }
console.log('title frames', n);

// 2. play
await page.click('#btn-start');
await page.evaluate((src) => { eval(src); window.__game.S.autoplay = false; window.__game.S.driveByTouch = true; }, PILOT_SRC);
const AX = 250, AY = 690;
await page.mouse.move(AX, AY);
await page.mouse.down();
let over = false;
for (let i = 0; i < 60 * 26; i++) {
  const st = await state();
  const { ax, ay } = await page.evaluate(() => window.__pilotStep(window.__game, window.__game.S));
  await page.mouse.move(AX + ax * 72, AY - ay * 72);
  await advance();
  tele.frames.push({ ...st, phase: 'play', ax: +ax.toFixed(2), ay: +ay.toFixed(2) });
  await shot();
  if (i % 60 === 0) console.log(i, 't=' + st.t, 'score=' + st.score, st.state);
  if (st.state === 'over') { over = true; console.log('over at play frame', i, 't=' + st.t, 'score=' + st.score); break; }
}
await page.mouse.up();

// 3. results screen
for (let i = 0; i < 72; i++) { await advance(); tele.frames.push({ ...(await state()), phase: 'over' }); await shot(); }
fs.writeFileSync(`${OUT}/telemetry.json`, JSON.stringify(tele));
console.log('seed', SEED, 'total frames', n, 'seconds', (n / FPS).toFixed(1), 'over:', over);
await browser.close();
console.log('DONE');
