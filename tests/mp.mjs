// Multiplayer test: 1 host + 3 guests (+1 extra who should be turned away), all on this computer.
//   node tests/mp.mjs [peer|try|both] [outdir]
import { chromium } from 'playwright';
import { startServers } from './servers.mjs';
import { mkdirSync } from 'node:fs';

const mode = process.argv[2] || 'both';
const out = process.argv[3] || '/tmp/mp';
mkdirSync(out, { recursive: true });
const servers = startServers();
const net = `&signal=127.0.0.1:9000&relay=ws://127.0.0.1:7777${mode === 'peer' ? '&notry' : mode === 'try' ? '&nopeer' : ''}`;
const base = 'http://localhost:8080/?nosw&notut&quality=saver' + net;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
let ok = true;
const check = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) ok = false; };

async function phone(name) {
  // small screens: four software-drawn phones share one computer here
  const ctx = await browser.newContext({ viewport: { width: 260, height: 560 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('WebSocket') && !m.text().includes('ERR_') && !m.text().includes('User-Initiated Abort')) errors.push(`[${name} console] ${m.text()}`); });
  return { p, ctx, name };
}

try {
  const host = await phone('Mom');
  await host.p.goto(base + '&autostart=host&name=Mom');
  await host.p.waitForFunction(() => window.__game, null, { timeout: 60000 });
  const code = await host.p.evaluate(() => window.__game.session.code);
  console.log('island code', code);
  await wait(mode === 'try' ? 3000 : 1500);

  const t0 = Date.now();
  const guests = [];
  for (const n of ['Dad', 'Mia', 'Leo']) {
    const g = await phone(n);
    await g.p.goto(base + `&join=${code}&name=${n}`);
    guests.push(g);
  }
  await Promise.all(guests.map((g) => g.p.waitForFunction(() => window.__game?.session?.connected, null, { timeout: 60000 })));
  console.log(`all guests joined in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  const kinds = await Promise.all(guests.map((g) => g.p.evaluate(() => window.__game.session.link?.kind)));
  console.log('transports used:', kinds.join(', '));
  await wait(2500);
  const hostOnline = await host.p.evaluate(() => window.__game.session.online.size);
  check(hostOnline === 4, `host sees 4 players (got ${hostOnline})`);
  for (const g of guests) {
    const n = await g.p.evaluate(() => [window.__game.session.online.size, window.__game.players.remotes.size]);
    check(n[0] === 4 && n[1] === 3, `${g.name} sees 4 online and 3 other characters (got ${n})`);
  }

  // movement shows up on other phones
  await guests[0].p.evaluate(() => { const L = window.__game.players.local; L.x = 10; L.z = 20; });
  await wait(2500);
  const seen = await host.p.evaluate((pid) => { const r = [...window.__game.players.remotes.values()]; return r.map((x) => [x.x.toFixed(1), x.z.toFixed(1)]); });
  check(seen.some(([x, z]) => Math.abs(x - 10) < 1 && Math.abs(z - 20) < 1), `host sees Dad at (10,20): ${JSON.stringify(seen)}`);

  // a guest picks something up -> shared basket on every phone
  const item = await host.p.evaluate(() => Object.entries(window.__game.session.state.items)[0]);
  const before = await host.p.evaluate((k) => window.__game.session.state.basket[k] || 0, item[1].k);
  const res = await guests[1].p.evaluate((id) => window.__game.session.request({ a: 'pick', id }), item[0]);
  check(res.ok, `Mia picked up a ${item[1].k}`);
  await wait(800);
  const after = await Promise.all([host, ...guests].map((ph) => ph.p.evaluate((k) => window.__game.session.state.basket[k] || 0, item[1].k)));
  check(after.every((n) => n === before + 1), `everyone's basket shows ${item[1].k} = ${before + 1} (got ${after})`);
  const gone = await Promise.all([host, ...guests].map((ph) => ph.p.evaluate((id) => !!window.__game.session.state.items[id], item[0])));
  check(gone.every((x) => !x), 'the item disappeared on every phone');

  // two people try to pick the same thing at once: only one gets it
  const item2 = await host.p.evaluate(() => Object.keys(window.__game.session.state.items)[0]);
  const both = await Promise.all([guests[0], guests[2]].map((g) => g.p.evaluate((id) => window.__game.session.request({ a: 'pick', id }), item2)));
  check(both.filter((r) => r.ok).length === 1, `same item picked twice at once -> exactly one success (${JSON.stringify(both.map((r) => r.ok))})`);

  // ledgers identical
  await wait(800);
  const ledgers = await Promise.all([host, ...guests].map((ph) => ph.p.evaluate(() => { const s = window.__game.session.state; return JSON.stringify([s.coins, s.basket, Object.keys(s.items).sort(), s.journal, s.projects]); })));
  check(ledgers.every((l) => l === ledgers[0]), 'all four ledgers are identical');

  // a 5th player is turned away politely
  const extra = await phone('Gran');
  await extra.p.goto(base + `&join=${code}&name=Gran`);
  await extra.p.waitForFunction(() => document.querySelector('.error') || window.__game, null, { timeout: 45000 }).catch(() => {});
  const extraState = await extra.p.evaluate(() => ({ joined: !!window.__game, text: document.querySelector('.error')?.textContent || '' }));
  check(!extraState.joined && /full/i.test(extraState.text), `5th player told the island is full ("${extraState.text}")`);
  await extra.ctx.close();

  // a guest leaves -> others see them go
  await guests[2].p.evaluate(() => window.__game.leave());
  await wait(3000);
  const afterLeave = await host.p.evaluate(() => window.__game.session.online.size);
  check(afterLeave === 3, `after Leo leaves, host sees 3 (got ${afterLeave})`);

  for (const ph of [host, ...guests.slice(0, 2)]) await ph.p.screenshot({ path: `${out}/${mode}-${ph.name}.png` });

  // the host closes the island -> guests get a friendly message
  await host.p.evaluate(() => window.__game.leave());
  await wait(3500);
  const msg = await guests[0].p.evaluate(() => document.querySelector('.overlay:not(.hidden)')?.textContent || '');
  check(/closed/i.test(msg), `guests told the host closed the island ("${msg.slice(0, 60)}")`);
} catch (e) {
  ok = false;
  console.log('FAIL exception', e.message);
}
console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 20).join('\n') : 'no page errors');
console.log(ok ? 'ALL PASSED' : 'SOME FAILED');
await browser.close();
servers.close();
process.exit(0);
