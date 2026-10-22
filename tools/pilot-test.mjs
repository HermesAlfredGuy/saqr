// Dry run: inject the pilot, run the sim at full speed, report where it ends.
import { createRequire } from 'module';
import { PILOT_SRC } from './pilot.js';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/data/integrations/node/node_modules/playwright');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({
  executablePath: '/opt/data/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
});
const runs = [];
const seeds = (process.argv[3] || '1,2,3,4,5,6').split(',').map(Number);
for (let k = 0; k < seeds.length; k++) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:9312/?seed=' + seeds[k], { waitUntil: 'load' });
  await sleep(2500);
  await page.waitForFunction(() => !!(window.__game && window.__game.update), null, { timeout: 40000 });
  await page.evaluate(() => window.__game.loop.stop());
  await page.click('#btn-start');
  await page.evaluate((src) => { eval(src); window.__game.S.driveByTouch = true; window.__game.S.autoplay = true; window.__game.S.botCrashAt = 999; }, PILOT_SRC);
  const res = await page.evaluate(() => {
    const g = window.__game, S = g.S;
    let crashT = 0;
    for (let i = 0; i < 60 * 40; i++) {
      const { ax, ay } = window.__pilotStep(g, S);
      g.input.injected.x = ax; g.input.injected.y = ay;
      for (let j = 0; j < 2; j++) { g.update(1 / 60); g.loop.time += 1 / 60; }
      if (S.state === 'crash' && !crashT) crashT = +S.time.toFixed(2);
      if (S.state === 'over') break;
    }
    return { crashT, t: +S.time.toFixed(2), state: S.state, score: Math.round(S.score), rides: S.rideCount };
  });
  runs.push(res);
  console.log('seed', seeds[k], JSON.stringify(res));
  await ctx.close();
}
console.log('SUMMARY', JSON.stringify(runs));
await browser.close();
