// Connection hiccups: a dropped connection, and the host's phone "going to sleep" for a while.
//   node tests/reconnect.mjs [both|peer|relay]    (needs `npm run serve` running)
// Phones connect over two roads at once (PeerJS and the Trystero relay) and use whichever answers
// first, so 'peer' and 'relay' force one road, to test each for sure.
import { chromium } from 'playwright';
import { startServers } from './servers.mjs';

const road = process.argv[2] || 'both';
const servers = startServers();
const base = 'http://localhost:8080/?nosw&notut&quality=saver&signal=127.0.0.1:9000&relay=ws://127.0.0.1:7777' + (road === 'peer' ? '&notry' : road === 'relay' ? '&nopeer' : '');
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
  return p;
}
try {
  const host = await phone('Mom');
  await host.goto(base + '&autostart=host&name=Mom');
  await host.waitForFunction(() => window.__game, null, { timeout: 60000 });
  const code = await host.evaluate(() => window.__game.session.code);
  await wait(1500);
  const guest = await phone('Dad');
  await guest.goto(base + `&join=${code}&name=Dad`);
  await guest.waitForFunction(() => window.__game?.session?.connected, null, { timeout: 60000 });
  await guest.evaluate(() => { window.__lost = 0; window.__game.session.on('lost', () => { window.__lost++; window.__lostAt = performance.now(); }); });
  await wait(1500);

  // 1) the host suddenly loses the connection to Dad
  await host.evaluate(() => { for (const l of window.__game.session.links) l.close(); });
  // (on the relay road the guest waits 1.5 s on purpose before letting go: see HANGUP_WAIT)
  await guest.waitForFunction(() => window.__lost >= 1, null, { timeout: 5000, polling: 100 }).catch(() => {});
  const lost1 = await guest.evaluate(() => window.__lost);
  check(lost1 === 1, `guest noticed the dropped connection (lost events: ${lost1})`);
  await guest.waitForFunction(() => window.__game.session.connected, null, { timeout: 40000 }).catch(() => {});
  await wait(1500);
  const back = await guest.evaluate(() => ({ c: window.__game.session.connected, overlay: !document.querySelector('.overlay').classList.contains('hidden') }));
  const hostSees = await host.evaluate(() => window.__game.session.online.size);
  check(back.c && !back.overlay && hostSees === 2, `guest reconnected by itself (connected=${back.c}, host sees ${hostSees})`);

  // 2) the host's phone "sleeps" for 12 seconds (no messages at all), then wakes up
  await host.evaluate(() => {
    const s = window.__game.session;
    s._update = s.update;
    s.update = () => {};
    s._links = [...s.links];
    for (const l of s._links) { l._send = l.send; l.send = () => {}; }
  });
  await wait(12000);
  const lost2 = await guest.evaluate(() => window.__lost);
  check(lost2 === 2, `guest noticed the host went quiet (lost events: ${lost2})`);
  await host.evaluate(() => {
    const s = window.__game.session;
    s.update = s._update;
    for (const l of s._links) l.send = l._send;
    s.wake();
  });
  await guest.waitForFunction(() => window.__game.session.connected, null, { timeout: 60000 }).catch(() => {});
  await wait(2000);
  const again = await guest.evaluate(() => window.__game.session.connected);
  const n = await host.evaluate(() => window.__game.session.online.size);
  check(again && n === 2, `after the host wakes up, the guest is back (connected=${again}, host sees ${n})`);
  // the shared ledger survived
  const item = await host.evaluate(() => Object.keys(window.__game.session.state.items)[0]);
  const r = await guest.evaluate((id) => window.__game.session.request({ a: 'pick', id }), item);
  check(r.ok, 'guest can still pick things up after reconnecting');
} catch (e) {
  ok = false;
  console.log('FAIL exception', e.message);
}
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
console.log(ok && !errors.length ? 'ALL PASSED' : 'SOME CHECKS FAILED');
await browser.close();
servers.close();
process.exit(ok && !errors.length ? 0 : 1);
