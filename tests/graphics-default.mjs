// The Graphics default, the way people meet it: a brand-new phone starts on "Extra smooth (60 fps)",
// a phone that played before keeps what it had, and the heat guard (60 -> 30 when the phone can't
// keep up) really switches on in a browser that can't draw 60 pictures a second, with a note in Settings.
//   node tests/graphics-default.mjs [outdir]        (needs `npm run serve` running)
import { chromium } from 'playwright';
import { startNewIsland } from './helpers.mjs';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] || '/tmp/graphics-default';
mkdirSync(out, { recursive: true });
const base = `http://localhost:${process.env.PORT || 8080}/?nosw&nopeer&notry`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
let ok = true;
const check = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) ok = false; };

async function phone(name, locale = 'en-GB') {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`));
  return p;
}
const graphics = (p) => p.evaluate(() => ({ quality: window.__game.settings.quality, fps: window.__game.R.state.preset.fps, guard: window.__game.R.state.guard }));
const chosen = (p) => p.evaluate(() => { window.__game.openPanel('settings'); return new Promise((r) => setTimeout(() => r([...document.querySelectorAll('.sheet .seg-b.on')].map((b) => b.textContent)), 700)); });

try {
  // 1. a brand-new phone: choose a language -> Start a new family island -> make your islander
  const a = await phone('new');
  await a.goto(base);
  await a.waitForSelector('.lang-screen', { timeout: 90000 });
  await a.tap('.lang-pick .btn.primary');
  await a.waitForSelector('.screen.title');
  await wait(500);
  await startNewIsland(a, 'Leo');
  await wait(1500);
  let gr = await graphics(a);
  check(gr.quality === 'smooth' && gr.fps === 60, `a brand-new phone starts on Extra smooth (${gr.quality}, ${gr.fps} fps)`);
  const on = await chosen(a);
  check(on.some((x) => /Extra smooth/.test(x)), `Settings shows Extra smooth chosen (${on.join(' / ')})`);
  await a.evaluate(() => window.__game.ui.closeSheet());
  // this test computer has no graphics chip, so it can't draw 60 a second: the guard must step in
  await a.waitForFunction(() => window.__game.R.state.guard, null, { timeout: 30000, polling: 500 }).catch(() => {});
  gr = await graphics(a);
  check(gr.guard, 'on a phone that can\'t keep up, the heat guard switches to 30 fps by itself');
  await a.evaluate(() => window.__game.openPanel('settings'));
  await wait(700);
  const note = await a.evaluate(() => [...document.querySelectorAll('.sheet p')].map((p) => p.textContent).find((x) => /30 fps for now/.test(x)) || '');
  check(!!note, `Settings says so: "${note}"`);
  await a.screenshot({ path: `${out}/1-settings-guard-en.png` });
  await a.evaluate(() => window.__changeLang('th'));
  await wait(800);
  const noteTh = await a.evaluate(() => [...document.querySelectorAll('.sheet p')].map((p) => p.textContent).find((x) => /🌡️/.test(x)) || '');
  check(/[฀-๿]/.test(noteTh), `…and in Thai: "${noteTh}"`);
  await a.screenshot({ path: `${out}/2-settings-guard-th.png` });
  // the choice is remembered: open the app again
  await a.evaluate(() => sessionStorage.removeItem('cozycove.resume'));
  await a.goto(base);
  await a.waitForSelector('.screen.title', { timeout: 90000 });
  await a.tap('.title-buttons .btn.primary');
  await a.waitForFunction(() => window.__game?.session?.state, null, { timeout: 90000 });
  gr = await graphics(a);
  check(gr.quality === 'smooth', `next time it is still Extra smooth (${gr.quality})`);

  // 2. a phone that played before 60 fps was the default (an islander, no Graphics choice saved): keeps 30
  const b = await phone('returning');
  await b.goto(base + '&lang=en');
  await b.evaluate(() => { localStorage.clear(); localStorage.setItem('cozycove.profile', JSON.stringify({ id: 'pold0001', name: 'Mum', look: { skin: '#f1c9a5', shirt: '#e86b7a', accent: '#f6b04c', hair: '#2a1d16', hat: 'straw' }, tut: { moved: 1, fished: 1, board: 1, planted: 1 } })); });
  await b.goto(base + '&lang=en');
  await startNewIsland(b);
  gr = await graphics(b);
  check(gr.quality === 'cool' && gr.fps === 30, `a phone that played before keeps Cool & cozy (${gr.quality}, ${gr.fps} fps)`);

  // 3. a phone that chose Battery saver keeps it
  const c = await phone('saver');
  await c.goto(base + '&lang=en');
  await c.evaluate(() => { localStorage.clear(); localStorage.setItem('cozycove.settings', JSON.stringify({ quality: 'saver', lang: 'en' })); });
  await c.goto(base + '&lang=en&autostart=host&name=Dad&notut');
  await c.waitForFunction(() => window.__game?.session?.state, null, { timeout: 90000 });
  gr = await graphics(c);
  check(gr.quality === 'saver', `a phone that chose Battery saver keeps it (${gr.quality})`);
} catch (e) {
  console.error('TEST CRASHED', e);
  ok = false;
} finally {
  console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 20).join('\n') : 'no page errors');
  console.log(ok && !errors.length ? 'ALL PASSED' : 'SOME CHECKS FAILED');
  await browser.close();
  process.exit(ok && !errors.length ? 0 : 1);
}
