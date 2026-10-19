// Family islands in the browser: every phone keeps the island, any phone can lead, and when the leading
// phone goes away another one takes over by itself (no "lost connection" screen).
//   node tests/family.mjs [both|peer|try] [outdir]      (needs `npm run serve` running)
import { chromium } from 'playwright';
import { startServers } from './servers.mjs';
import { mkdirSync } from 'node:fs';

const mode = process.argv[2] || 'both';
const out = process.argv[3] || '/tmp/family';
mkdirSync(out, { recursive: true });
const servers = startServers();
const net = `&signal=127.0.0.1:9000&relay=ws://127.0.0.1:7777${mode === 'peer' ? '&notry' : mode === 'try' ? '&nopeer' : ''}`;
const base = 'http://localhost:8080/?nosw&notut&quality=saver&debug' + net;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
let ok = true;
const check = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) ok = false; return cond; };

async function phone(name) {
  const ctx = await browser.newContext({ viewport: { width: 260, height: 560 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/WebSocket|ERR_|User-Initiated Abort|Could not connect to peer|Lost connection to server/.test(m.text())) errors.push(`[${name} console] ${m.text()}`); });
  return { p, ctx, name };
}
// wait for something on a page (asking every 250 ms; waitForFunction is unreliable with several pages)
async function until(ph, fn, arg, ms = 30000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { if (await ph.p.evaluate(fn, arg)) return true; } catch { /* page busy */ }
    await wait(250);
  }
  return false;
}
const S = (ph, fn, arg) => ph.p.evaluate(fn, arg);
const phase = (ph) => S(ph, () => window.__game?.session?.phase);
const overlay = (ph) => S(ph, () => { const o = document.querySelector('.overlay:not(.hidden)'); return o ? o.textContent : ''; });
const books = (ph) => S(ph, () => { const s = window.__game.session.state; return JSON.stringify([s.coins, s.basket, s.journal, s.vx.c.coins]); });

try {
  // ---- Mum starts a new family island
  const mum = await phone('Mum');
  await mum.p.goto(base + '&autostart=new&name=Mum');
  await until(mum, () => window.__game?.session?.phase === 'leading', null, 60000);
  const code = await S(mum, () => window.__game.session.code);
  console.log('island code', code);
  await wait(mode === 'try' ? 3000 : 1500);

  // ---- Dad joins with the code (his phone has no island yet)
  const dad = await phone('Dad');
  await dad.p.goto(base + `&join=${code}&name=Dad`);
  check(await until(dad, () => window.__game?.session?.phase === 'visiting', null, 60000), 'Dad joined the family island');
  await wait(1500);
  check(await S(mum, () => window.__game.session.online.size) === 2, 'Mum sees 2 on the island');
  const dadSaved = await S(dad, () => { const raw = localStorage.getItem('cozycove.island.v1'); return raw ? JSON.parse(raw).vx.vid : null; });
  const vid = await S(mum, () => window.__game.session.state.vx.vid);
  check(dadSaved === vid, `Dad's phone keeps its own copy of the family island (${dadSaved})`);

  // Dad earns coins while visiting (the leading phone writes it in its books, Dad's copy gets it too)
  await S(dad, () => window.__game.session.request({ a: 'cheat', coins: 100 }));
  await wait(800);
  const c1 = await Promise.all([mum, dad].map((ph) => S(ph, () => window.__game.session.state.coins)));
  check(c1[0] === c1[1] && c1[0] === 150, `both phones show the family jar: ${c1}`);

  // ---- Mum's phone goes away (back to the start screen): Dad takes over by himself, no waiting screen
  await S(mum, () => window.__game.leave());
  check(await until(dad, () => window.__game.session.isHost, null, 15000), 'Dad’s phone took over leading');
  check(!(await overlay(dad)), 'no "lost connection" screen on Dad’s phone');
  const r = await S(dad, () => window.__game.session.request({ a: 'cheat', coins: 7 }));
  check(r?.ok !== false, 'Dad keeps playing (asks the rule book on his own phone now)');
  check(await until(dad, () => window.__game.session.phase === 'leading', null, 20000), 'Dad’s phone now holds the meeting place');

  // ---- Kid joins with the same code: finds Dad's phone
  const kid = await phone('Kid');
  await kid.p.goto(base + `&join=${code}&name=Kid`);
  check(await until(kid, () => window.__game?.session?.phase === 'visiting', null, 60000), 'Kid joined (Dad’s phone leads now)');
  await wait(1000);
  check(await S(kid, () => window.__game.session.state.coins) === 157, 'Kid sees the family jar with everything (157)');

  // ---- Mum comes back ("Play"): her copy is older; she visits Dad's phone and the copies are merged
  await mum.p.waitForLoadState();
  await until(mum, () => document.querySelector('.screen.title'), null, 30000);
  await S(mum, () => { window.__game = null; });
  await mum.p.goto(base + '&autostart=host&name=Mum');
  check(await until(mum, () => window.__game?.session?.phase === 'visiting', null, 60000), 'Mum pressed Play: her phone found the family and visits');
  await wait(1500);
  const all = await Promise.all([mum, dad, kid].map(books));
  check(all.every((b) => b === all[0]), 'all three phones have the very same books');
  check(await S(mum, () => window.__game.session.state.coins) === 157, 'nothing counted twice after merging (157)');
  check(await S(dad, () => window.__game.session.online.size) === 3, 'Dad sees 3 on the island');

  // ---- Dad's phone is put in a pocket (hidden): he hands over; someone else leads at once
  await S(dad, () => { window.__game.session.hide(); });
  check(await until(mum, () => window.__game.session.isHost || window.__game.session.phase === 'visiting', null, 5000), 'Mum still playing');
  const leaders = async () => (await Promise.all([mum, kid].map((ph) => S(ph, () => window.__game.session.phase)))).filter((x) => x === 'leading').length;
  let one = false;
  for (let i = 0; i < 40 && !one; i++) { await wait(500); one = (await leaders()) === 1; }
  check(one, 'exactly one of Mum and Kid took over the meeting place');
  check(await until(mum, () => window.__game.session.online.size === 2, null, 20000), 'Mum and Kid play together again');
  check(!(await overlay(mum)) && !(await overlay(kid)), 'no waiting screen for anyone');
  // Dad's phone comes back: he visits whoever leads now
  await S(dad, () => { window.__game.session.show(); });
  check(await until(dad, () => window.__game.session.phase === 'visiting', null, 30000), 'Dad came back and visits');
  await wait(1500);
  const all2 = await Promise.all([mum, dad, kid].map(books));
  check(all2.every((b) => b === all2[0]), 'all three phones have the very same books again');

  for (const ph of [mum, dad, kid]) await ph.p.screenshot({ path: `${out}/${mode}-${ph.name}.png` });

  // ---- everyone goes back to the start screen, then all three press Play at the very same moment:
  // nobody is there yet, so all three try to lead; they must sort it out into one island by themselves
  for (const ph of [mum, dad, kid]) await S(ph, () => window.__game.leave());
  await Promise.all([mum, dad, kid].map((ph) => until(ph, () => document.querySelector('.screen.title.in'), null, 30000)));
  await wait(2500);
  await Promise.all([mum, dad, kid].map((ph) => S(ph, () => { const b = document.querySelector('.screen.title.in .title-buttons .btn.primary'); b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); })));
  let sorted = false, st = [];
  for (let i = 0; i < 90 && !sorted; i++) {
    await wait(500);
    st = await Promise.all([mum, dad, kid].map((ph) => S(ph, () => window.__game ? [window.__game.session.phase, window.__game.session.online.size] : null).catch(() => null)));
    sorted = st.every(Boolean) && st.filter((x) => x[0] === 'leading').length === 1 && st.filter((x) => x[0] === 'visiting').length === 2 && st.every((x) => x[1] === 3);
  }
  check(sorted, `all three pressed Play at once: one leads, two visit, all three together (${JSON.stringify(st)})`);
  await wait(1500);
  const all3 = await Promise.all([mum, dad, kid].map(books));
  check(all3.every((b) => b === all3[0]), 'and all three have the very same books');
} catch (e) {
  ok = false;
  console.log('FAIL exception', e.message);
}
console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 20).join('\n') : 'no page errors');
console.log(ok ? 'ALL PASSED' : 'SOME FAILED');
await browser.close();
servers.close();
process.exit(ok && !errors.length ? 0 : 1);
