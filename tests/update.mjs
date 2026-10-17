// Updates: does a phone that already has the game get a NEW version reliably?
// A pretend GitHub Pages (same 10-minute caching rules) publishes versions A, B, C and D in turn.
//   node tests/update.mjs [workdir]
// (It runs `npm run build` a few times; the last build is left in docs/.)
import { chromium } from 'playwright';
import express from 'express';
import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const work = process.argv[2] || '/tmp/cozy-update-test';
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = true;
const check = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) ok = false; };

// ---------------------------------------------------------------- four versions of the game
const versions = {};
for (const v of ['A', 'B', 'C', 'D']) {
  execSync('node tools/build.mjs', { cwd: ROOT, stdio: 'pipe' });
  cpSync(join(ROOT, 'docs'), join(work, v), { recursive: true });
  versions[v] = /__BUILT_AT__|"(\d{4}-\d\d-\d\dT[\d:.]+Z)"/.exec(readFileSync(join(work, v, readFileSync(join(work, v, 'index.html'), 'utf8').match(/app\.[a-f0-9]+\.js/)[0]), 'utf8'))[1];
  await wait(1100); // different build times
}
// E: a broken page pointing at a game file that doesn't exist (worst case)
cpSync(join(work, 'D'), join(work, 'E'), { recursive: true });
writeFileSync(join(work, 'E', 'index.html'), readFileSync(join(work, 'E', 'index.html'), 'utf8').replace(/app\.[a-f0-9]+\.js/, 'app.0000000000.js'));

// ---------------------------------------------------------------- pretend GitHub Pages
let live = 'A';
const hits = [];
const app = express();
app.use('/Cozy-Game', (req, res, next) => { hits.push(req.path); next(); }, (req, res, next) => express.static(join(work, live), { maxAge: 600 * 1000, etag: true, lastModified: true })(req, res, next));
const server = app.listen(8095, '127.0.0.1');
const URL0 = 'http://localhost:8095/Cozy-Game/?nopeer&notry&lang=en';

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
const build = () => p.evaluate(() => window.__i18n?.build).catch(() => null);
const comeBackToScreen = () => p.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); // like reopening the app from the background

try {
  // first visit: the phone saves a copy of version A
  await p.goto(URL0);
  await p.waitForSelector('.screen.title', { timeout: 90000 });
  await p.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 30000 });
  await p.reload();
  await p.waitForSelector('.screen.title', { timeout: 90000 });
  check(await build() === versions.A, 'phone has version A (saved for offline)');

  // 1. a new version is published while the app sits on the title screen
  live = 'B';
  hits.length = 0;
  await comeBackToScreen();
  await p.waitForFunction((b) => window.__i18n?.build === b, versions.B, { timeout: 60000 }).catch(() => {});
  check(await build() === versions.B, 'title screen: switched to version B by itself when the app came back on screen');
  await p.waitForSelector('.toast.solo', { timeout: 5000 }).catch(() => {});
  const flash = await p.$eval('.toast.solo', (e) => e.textContent).catch(() => '');
  check(/Updated/.test(flash), `it says so: "${flash}"`);
  const downloaded = hits.filter((h) => !/^\/($|index\.html|sw\.js|app\.)/.test(h) && !/__files/.test(h));
  check(downloaded.length === 0, `unchanged pictures and fonts were not downloaded again (${downloaded.length ? downloaded.slice(0, 5).join(', ') : 'only the new game file + page'})`);

  // 2. a new version is published during a game
  await p.goto(URL0 + '&autostart=host&name=Mum&notut');
  await p.waitForFunction(() => window.__game?.session?.state, null, { timeout: 90000 });
  await wait(1500);
  await p.evaluate(() => { window.__stillHere = true; });
  live = 'C';
  await comeBackToScreen();
  await p.waitForSelector('.update-pill.in', { timeout: 60000 }).catch(() => {});
  check(!!(await p.$('.update-pill.in')), 'in a game: a "New version ready · tap to update" button appears');
  check(await p.evaluate(() => window.__stillHere === true), '…and the game was NOT interrupted');
  await p.tap('.update-pill');
  await p.waitForFunction((b) => window.__i18n?.build === b && window.__game?.session?.state, versions.C, { timeout: 90000 }).catch(() => {});
  check(await build() === versions.C && await p.evaluate(() => !!window.__game?.session?.isHost), 'tapping it: version C, straight back into the game');

  // 3. opening the app again after a new version was published (website says "keep 10 minutes")
  live = 'D';
  await p.evaluate(() => sessionStorage.removeItem('cozycove.resume'));
  await p.goto(URL0);
  await p.waitForSelector('.screen.title', { timeout: 90000 });
  check(await build() === versions.D, 'reopening the app: newest version D at once (no 10-minute wait)');
  await p.evaluate(() => { window.__stillHere = true; });
  await wait(9000);
  check(await p.evaluate(() => window.__stillHere === true), 'and no extra reload afterwards (no flicker)');

  // 4. no internet: the phone's copy still works
  await ctx.setOffline(true);
  await p.reload().catch(() => {});
  await p.waitForSelector('.screen.title', { timeout: 90000 }).catch(() => {});
  check(await build() === versions.D, 'offline: the game still opens (version D from the phone)');
  await ctx.setOffline(false);

  // 5. worst case: a page that points at a missing game file
  live = 'E';
  await p.evaluate(() => sessionStorage.clear());
  await p.goto(URL0);
  await p.waitForSelector('.boot-retry', { timeout: 60000 }).catch(() => {});
  const msg = await p.$eval('#boot-msg', (e) => e.textContent).catch(() => '');
  check(/try again/.test(msg) && /ลองใหม่/.test(msg), `broken page: it tried once more, then offers a button (“${msg}”)`);
} catch (e) {
  console.error('TEST CRASHED', e);
  ok = false;
} finally {
  const real = errors.filter((e) => !/app\.0000000000|Failed to fetch dynamically imported|Importing a module script failed/.test(e));
  console.log(real.length ? 'ERRORS:\n' + real.slice(0, 10).join('\n') : 'no page errors');
  console.log(ok && !real.length ? 'ALL PASSED' : 'SOME CHECKS FAILED');
  await browser.close();
  server.close();
  process.exit(ok && !real.length ? 0 : 1);
}
