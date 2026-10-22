// Phone probe: loads the game, dumps runtime errors, and takes real screenshots at states.
// node tools/probe.mjs [url] [outdir]
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/data/integrations/node/node_modules/playwright');

const url = process.argv[2] || 'http://127.0.0.1:9312/';
const out = process.argv[3] || '/opt/data/cache/scratch/saqr-probe';
fs.mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({
  executablePath: '/opt/data/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required', '--ignore-gpu-blocklist'],
});
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('requestfailed', (r) => errors.push('reqfail: ' + r.url() + ' ' + (r.failure()?.errorText || '')));

await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => !!window.__game, null, { timeout: 30000 }).catch(() => errors.push('no __game hook'));
await sleep(2500);
await page.screenshot({ path: path.join(out, '01-title.png') });

const state0 = await page.evaluate(() => {
  const S = window.__game.S;
  return { state: S.state, pos: S.pos.toArray().map((v) => +v.toFixed(1)), score: Math.round(S.score) };
});

await page.evaluate(() => { window.__game.autoplay(true); window.__game.start(); });
await sleep(3000);
await page.screenshot({ path: path.join(out, '02-play-3s.png') });
const state1 = await page.evaluate(() => {
  const S = window.__game.S;
  return { state: S.state, pos: S.pos.toArray().map((v) => +v.toFixed(1)), score: Math.round(S.score), speed: +S.speed.toFixed(1), thermalRide: +S.thermalRide.toFixed(2) };
});
await sleep(4000);
await page.screenshot({ path: path.join(out, '03-play-7s.png') });
const state2 = await page.evaluate(() => {
  const S = window.__game.S;
  return { state: S.state, pos: S.pos.toArray().map((v) => +v.toFixed(1)), score: Math.round(S.score), speed: +S.speed.toFixed(1), rides: S.rides };
});

const info = await page.evaluate(() => {
  const r = window.__game;
  return {
    fps: Math.round(1000 / ((performance.now() - r.loop.time * 1000) || 1)),
    units: r.units.length,
    drawCalls: null,
  };
});

console.log(JSON.stringify({ state0, state1, state2, info, errors }, null, 2));
await browser.close();
