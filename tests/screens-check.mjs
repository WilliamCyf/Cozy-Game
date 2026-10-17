// Looks at the screens changed in the audit, the way a person sees them (screenshots + a few checks):
// My Look (you must stay visible above the page), 4 family faces on a small iPhone in Thai,
// a long Thai label on the big button, the catch card with the phone sideways, renaming the island
// on the Family page, and messages showing above a tall page.
//   node tests/screens-check.mjs [outdir]        (needs `npm run serve` running)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] || '/tmp/screens-check';
mkdirSync(out, { recursive: true });
const base = `http://localhost:${process.env.PORT || 8080}/?nosw&nopeer&notry&notut&autostart=host&name=Mum`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
let ok = true;
const check = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) ok = false; };

async function phone(name, w, h, lang = 'en') {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`));
  await p.goto(base + '&lang=' + lang);
  await p.waitForFunction(() => window.__game?.session?.state, null, { timeout: 90000 });
  await wait(2500);
  return p;
}
// where the local character is on screen (0..1 from the top-left)
const onScreen = (p) => p.evaluate(() => {
  const g = window.__game, L = g.players.local;
  const v = new (L.char.mesh.position.constructor)(L.x, L.y + 1, L.z).project(g.rig.camera);
  return { x: (v.x + 1) / 2, y: (1 - v.y) / 2 };
});
const sheetTop = (p) => p.evaluate(() => { const r = document.querySelector('.sheet').getBoundingClientRect(); return { top: r.top / innerHeight, left: r.left / innerWidth }; });

try {
  // 1. My Look, phone upright: the character stands in the open part above the page
  const a = await phone('portrait', 390, 844);
  await a.evaluate(() => window.__game.openPanel('look'));
  await wait(2500);
  let pos = await onScreen(a), sh = await sheetTop(a);
  check(pos.y < sh.top - 0.03 && pos.y > 0.08, `My Look (upright): character at ${(pos.y * 100).toFixed(0)}% from the top, page starts at ${(sh.top * 100).toFixed(0)}%`);
  await a.screenshot({ path: `${out}/1-look-portrait.png` });
  await a.evaluate(() => window.__game.ui.closeSheet());
  await wait(2000);
  pos = await onScreen(a);
  check(Math.abs(pos.y - 0.5) < 0.08 && Math.abs(pos.x - 0.5) < 0.08, `after closing My Look the view comes back to the middle (${(pos.x * 100).toFixed(0)}%, ${(pos.y * 100).toFixed(0)}%)`);

  // 2. renaming the island happens on the page itself (no pop-up box that pauses the game)
  await a.evaluate(() => window.__game.openPanel('family'));
  await wait(800);
  await a.getByRole('button', { name: /Name our island/ }).tap();
  await wait(400);
  check(!!(await a.$('.rename-input')), 'tapping "Name our island" shows a typing box on the page');
  await a.fill('.rename-input', 'Sunny Island');
  // news arriving while typing must not wipe the box
  await a.evaluate(() => window.__game.session.request({ a: 'emote', e: 'wave' }) && window.__game.session.logic.ops([['set', ['coins'], window.__game.session.state.coins + 1]]));
  await wait(500);
  check(await a.$eval('.rename-input', (e) => e.value) === 'Sunny Island', 'island news while typing does not wipe what was typed');
  await a.screenshot({ path: `${out}/2-rename.png` });
  await a.getByRole('button', { name: /^Save$/ }).tap();
  await wait(800);
  check(await a.evaluate(() => window.__game.session.state.name) === 'Sunny Island' && !(await a.$('.rename-input')), 'Save renames the island and closes the typing box');

  // 3. a message shows above a tall page (Settings)
  await a.evaluate(() => { window.__game.openPanel('settings'); });
  await wait(700);
  await a.evaluate(() => window.__game.ui.toast('Hello above the page', '✨', 4000));
  await wait(500);
  // (messages let taps pass through them, so for this look we make them "solid" for a moment)
  const onTop = await a.evaluate(() => {
    const box = document.querySelector('.toasts'); box.style.pointerEvents = 'auto';
    const t = [...document.querySelectorAll('.toast')].pop(), r = t.getBoundingClientRect();
    const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    box.style.pointerEvents = '';
    return !!el?.closest('.toast') && r.top > document.querySelector('.sheet').getBoundingClientRect().top;
  });
  check(onTop, 'a message is visible above the Settings page');
  await a.screenshot({ path: `${out}/3-toast-over-sheet.png` });
  await a.evaluate(() => window.__game.ui.closeSheet());

  // 4. phone sideways: My Look sits on the right, the character on the left
  const b = await phone('landscape', 844, 390);
  await b.evaluate(() => window.__game.openPanel('look'));
  await wait(2500);
  pos = await onScreen(b); sh = await sheetTop(b);
  check(pos.x < sh.left - 0.03, `My Look (sideways): character at ${(pos.x * 100).toFixed(0)}% from the left, page starts at ${(sh.left * 100).toFixed(0)}%`);
  await b.screenshot({ path: `${out}/4-look-landscape.png` });
  await b.evaluate(() => window.__game.ui.closeSheet());
  await wait(600);
  // the catch card fits on the screen sideways (the button can be tapped)
  await b.evaluate(() => window.__game.ui.showCatch({ fish: 'koi', size: 40, res: { ok: true, isNew: true, record: true } }));
  await wait(800);
  const fits = await b.evaluate(() => { const r = document.querySelector('.catch-card .btn.primary').getBoundingClientRect(); return r.bottom <= innerHeight && r.top >= 0; });
  check(fits, 'catch card (sideways): its button is on the screen');
  await b.screenshot({ path: `${out}/5-catch-landscape.png` });

  // 5. small iPhone in Thai with 4 people: the top bar fits; the big button's label stays on screen
  const c = await phone('small-th', 375, 667, 'th');
  await c.evaluate(() => {
    const g = window.__game, on = g.session.online;
    for (const [i, n] of ['พ่อ', 'แม่', 'น้อง'].entries()) on.set('px' + i, { name: n, look: { accent: '#e86b7a', shirt: '#6cc4a1' } });
    g.ui.renderFamily();
    g.session.state.coins = 99999; // a rich family: the widest the coin counter gets
    g.session.state.day = 365;
  });
  await wait(600);
  const barRight = () => c.evaluate(() => [...document.querySelectorAll('.hud .top *')].filter((e) => e.getClientRects().length).map((e) => e.getBoundingClientRect()).reduce((m, r) => Math.max(m, r.right), 0));
  let bar = await barRight();
  check(bar <= 375, `top bar fits a 375-pixel iPhone: Thai, 4 people, day 365, 99999 coins (right edge at ${Math.round(bar)})`);
  await c.screenshot({ path: `${out}/6-small-thai-topbar.png`, clip: { x: 0, y: 0, width: 375, height: 70 } });
  await c.evaluate(() => window.__changeLang('en'));
  await wait(600);
  bar = await barRight();
  check(bar <= 375, `…and in English (right edge at ${Math.round(bar)})`);
  await c.screenshot({ path: `${out}/6-small-en-topbar.png`, clip: { x: 0, y: 0, width: 375, height: 70 } });
  await c.evaluate(() => window.__changeLang('th'));
  await wait(600);
  // the longest Thai label the big button can show
  await c.evaluate(() => { const g = window.__game; const f = g.interact.fixed.find((x) => x.type === 'shop'); g.players.local.x = f.x; g.players.local.z = f.z; g.rig.snap(); });
  await wait(1200);
  const longest = await c.evaluate(() => {
    const el = document.querySelector('.act-label');
    let worst = 0, txt = '';
    for (const s of ['เขย่าต้นมะพร้าวให้หล่นลงมา', el.textContent]) { el.textContent = s; const r = el.getBoundingClientRect(); if (r.right > worst) { worst = r.right; txt = s; } }
    return { right: worst, txt };
  });
  check(longest.right <= 375, `a long Thai label on the big button stays on screen (right edge ${Math.round(longest.right)})`);
  await c.screenshot({ path: `${out}/6-small-thai.png` });
} catch (e) {
  console.error('TEST CRASHED', e);
  ok = false;
} finally {
  console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 20).join('\n') : 'no page errors');
  console.log(ok && !errors.length ? 'ALL PASSED' : 'SOME CHECKS FAILED');
  await browser.close();
  process.exit(ok && !errors.length ? 0 : 1);
}
