// Connection hiccups on a family island: the leading phone drops the connection, and the leading phone
// "freezes" for a while (what an iPhone does to an app it puts away). Nobody may see a waiting screen:
// the other phone keeps playing, and the two find each other again by themselves afterwards.
//   node tests/reconnect.mjs [both|peer|relay]    (needs `npm run serve` running)
// Phones connect over two roads at once (PeerJS and the Trystero relay) and use whichever answers
// first, so 'peer' and 'relay' force one road, to test each for sure.
import { chromium } from 'playwright';
import { startServers } from './servers.mjs';

const road = process.argv[2] || 'both';
const servers = startServers();
const base = 'http://localhost:8080/?nosw&notut&quality=saver&debug&signal=127.0.0.1:9000&relay=ws://127.0.0.1:7777' + (road === 'peer' ? '&notry' : road === 'relay' ? '&nopeer' : '');
console.log(`road: ${road}`);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = true;
const check = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) ok = false; };
const errors = [];
async function phone(name) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`));
  return { p, ctx };
}
async function until(p, fn, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { if (await p.evaluate(fn)) return true; } catch { /* busy */ }
    await wait(250);
  }
  return false;
}
const overlay = (p) => p.evaluate(() => !!document.querySelector('.overlay:not(.hidden)'));
const books = (p) => p.evaluate(() => { const s = window.__game.session.state; return JSON.stringify([s.coins, s.basket, s.vx.c.coins]); });
try {
  const { p: mum } = await phone('Mum');
  await mum.goto(base + '&autostart=host&name=Mum');
  await until(mum, () => window.__game?.session?.phase === 'leading', 60000);
  const code = await mum.evaluate(() => window.__game.session.code);
  await wait(1500);
  const { p: dad } = await phone('Dad');
  await dad.goto(base + `&join=${code}&name=Dad`);
  await until(dad, () => window.__game?.session?.phase === 'visiting', 60000);
  await wait(1500);

  // 1) the leading phone suddenly drops the connection to Dad: he keeps playing, and comes back by himself
  await dad.evaluate(() => { window.__oldLink = window.__game.session.link; });
  await mum.evaluate(() => { for (const l of window.__game.session.links) l.close(); });
  const back = await until(dad, () => { const s = window.__game.session; return s.phase === 'visiting' && s.link !== window.__oldLink && s.online.size === 2; }, 30000);
  check(back && !(await overlay(dad)) && await mum.evaluate(() => window.__game.session.online.size) === 2, 'dropped connection: Dad kept playing (no waiting screen) and is back with Mum by himself');

  // 2) Mum's phone freezes for 15 seconds (like an iPhone putting the app away without telling it):
  //    her game is stopped completely (paused in the debugger), so it can't send or answer anything
  const cdp = await mum.context().newCDPSession(mum);
  await cdp.send('Debugger.enable');
  await cdp.send('Debugger.pause');
  const tookOver = await until(dad, () => window.__game.session.isHost, 20000);
  check(tookOver && !(await overlay(dad)), 'Mum’s phone froze: Dad’s phone took over by itself (no waiting screen)');
  const item = await dad.evaluate(() => Object.keys(window.__game.session.state.items)[0]);
  const r = await dad.evaluate((id) => window.__game.session.request({ a: 'pick', id }), item);
  check(r.ok, 'Dad keeps playing while Mum’s phone is frozen (picked something up)');
  await dad.evaluate(() => window.__game.session.request({ a: 'cheat', coins: 25 }));
  await wait(Math.max(0, 15000 - 4000));
  await cdp.send('Debugger.resume');
  await cdp.send('Debugger.disable');
  // Mum's phone wakes up: the two phones find each other and become one island again
  let one = false;
  for (let i = 0; i < 120 && !one; i++) {
    await wait(500);
    const st = await Promise.all([mum, dad].map((p) => p.evaluate(() => [window.__game.session.phase, window.__game.session.online.size]).catch(() => ['?', 0])));
    one = st.filter((x) => x[0] === 'leading').length === 1 && st.filter((x) => x[0] === 'visiting').length === 1 && st.every((x) => x[1] === 2);
  }
  check(one, 'after Mum’s phone woke up: one phone leads, the other visits, both play together');
  await wait(1500);
  const b = await Promise.all([mum, dad].map(books));
  check(b[0] === b[1], 'both phones have the very same books (Dad’s coins from while Mum was frozen are there once)');
  const coins = await mum.evaluate(() => window.__game.session.state.coins);
  check(coins === 50 + 25, `the family jar: ${coins} (= 50 + 25)`);
} catch (e) {
  ok = false;
  console.log('FAIL exception', e.message);
}
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
console.log(ok && !errors.length ? 'ALL PASSED' : 'SOME CHECKS FAILED');
await browser.close();
servers.close();
process.exit(ok && !errors.length ? 0 : 1);
