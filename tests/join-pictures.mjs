// Joining with a picture code: Dad hosts (English phone), Mum joins from a Thai phone by
// tapping the picture and typing the 3 numbers, exactly like a person would.
//   node tests/join-pictures.mjs [outdir]       (needs `npm run serve` running)
import { chromium } from 'playwright';
import { startServers } from './servers.mjs';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] || '/tmp/join-pictures';
mkdirSync(out, { recursive: true });
const servers = startServers();
const net = '&signal=127.0.0.1:9000&relay=ws://127.0.0.1:7777';
const base = 'http://localhost:8080/?nosw&notut&quality=saver' + net;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
let ok = true;
const check = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) ok = false; };

async function phone(name, locale) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/WebSocket|ERR_|User-Initiated Abort/.test(m.text())) errors.push(`[${name} console] ${m.text()}`); });
  return p;
}

try {
  const host = await phone('Dad', 'en-GB');
  await host.goto(base + '&autostart=host&name=Dad');
  await host.waitForFunction(() => window.__game, null, { timeout: 60000 });
  const code = await host.evaluate(() => window.__game.session.code);
  check(/^[A-Z]+\d{3}$/.test(code), `host made a picture code: ${code}`);
  await host.evaluate(() => window.__game.openPanel('family'));
  await wait(900);
  const shown = await host.evaluate(() => document.querySelector('.code')?.textContent);
  check(/\d{3}/.test(shown) && /\p{Extended_Pictographic}/u.test(shown), `host's Family panel shows the picture and numbers: "${shown}"`);
  await host.screenshot({ path: `${out}/host-family.png` });
  await wait(1500);

  // Mum: a Thai phone that has already made her islander
  const mum = await phone('Mum', 'th-TH');
  await mum.goto(base);
  await mum.evaluate(() => localStorage.setItem('cozycove.profile', JSON.stringify({ id: 'pmum0001', name: 'แม่', look: { skin: '#f1c9a5', shirt: '#e86b7a', accent: '#f6b04c', hair: '#2a1d16', hat: 'sunhat' }, tut: { moved: 1, fished: 1, board: 1, planted: 1 } })));
  await mum.reload();
  await mum.waitForSelector('.screen.title', { timeout: 60000 });
  await wait(1200);
  await mum.tap('.title-buttons .btn.primary'); // "🤝 Join your family" (no island on this phone yet)
  await mum.waitForSelector('.pic-grid .pic');
  await wait(500);
  const word = code.replace(/\d+$/, ''), digits = code.slice(word.length);
  // the numbers first, then the picture: either order must work
  await mum.tap(`.pic[aria-label="${word === 'CRAB' ? 'FISH' : 'CRAB'}"]`); // oops, wrong picture first
  await mum.tap(`.pic[aria-label="${word}"]`); // the right one
  await mum.screenshot({ path: `${out}/mum-join-picture.png` });
  const selected = await mum.evaluate(() => [...document.querySelectorAll('.pic.on')].map((b) => b.getAttribute('aria-label')));
  check(selected.length === 1 && selected[0] === word, `exactly one picture selected (${selected})`);
  await mum.focus('.num-input');
  await mum.keyboard.type(digits, { delay: 120 });
  await mum.screenshot({ path: `${out}/mum-join-typed.png` });
  // it joins by itself once the 3 numbers are in (the iPhone number pad has no Go key)
  await mum.waitForFunction(() => window.__game?.session?.connected, null, { timeout: 60000 });
  check(true, 'Mum joined without pressing Join');
  await wait(2500);
  const both = await host.evaluate(() => [...window.__game.session.online.values()].map((o) => o.name));
  check(both.includes('แม่'), `host sees Mum (${both.join(', ')})`);
  check(await mum.evaluate(() => window.__i18n.getLang()) === 'th', 'Mum plays in Thai');
  check(await host.evaluate(() => window.__i18n.getLang()) === 'en', 'Dad still plays in English');
  // one shared news item, read in two languages
  await host.evaluate(() => window.__game.session.request({ a: 'rename', name: 'Smith Island' }));
  await wait(1500);
  const mumToasts = await mum.evaluate(() => [...document.querySelectorAll('.toast')].map((x) => x.textContent));
  check(mumToasts.some((x) => /Smith Island/.test(x) && /[฀-๿]/.test(x)), `Mum gets the news in Thai: ${JSON.stringify(mumToasts)}`);
  await mum.screenshot({ path: `${out}/mum-in-game.png` });
  // Dad (the host) switches his phone to Thai in the middle of the game: nobody may be disconnected
  await host.evaluate(() => { window.__notReloaded = true; window.__game.openPanel('settings'); });
  await wait(800);
  const thIdx = await host.$$eval('.seg-b.lang', (els) => els.findIndex((e) => /ภาษาไทย/.test(e.textContent)));
  await (await host.$$('.seg-b.lang'))[thIdx].tap();
  await wait(5000);
  const hostNow = await host.evaluate(() => ({ th: window.__i18n.getLang() === 'th', same: window.__notReloaded === true, online: window.__game.session.online.size }));
  const mumOk = await mum.evaluate(() => ({ connected: window.__game.session.connected, lost: !document.querySelector('.overlay')?.classList.contains('hidden') }));
  check(hostNow.th && hostNow.same && hostNow.online === 2 && mumOk.connected && !mumOk.lost, `host switched to Thai mid-game: no reload, Mum stays connected (${JSON.stringify({ ...hostNow, ...mumOk })})`);
  check(await mum.evaluate(() => window.__i18n.getLang()) === 'th' && await host.evaluate(() => window.__i18n.getLang()) === 'th', 'each phone keeps its own language choice');
  await host.evaluate(() => window.__game.ui.closeSheet());
  await host.evaluate(() => { const g = window.__game, m = [...g.players.remotes.values()][0]; if (m) { g.players.local.x = m.x + 1.2; g.players.local.z = m.z + 1.5; g.rig.snap(); g.rig.setZoom(1.5); } });
  await wait(1500);
  await host.screenshot({ path: `${out}/host-sees-mum-tag.png` });

  // a wrong number goes back to the join screen with her picture still chosen
  const kid = await phone('Kid', 'th-TH');
  await kid.goto(base);
  await kid.evaluate(() => localStorage.setItem('cozycove.profile', JSON.stringify({ id: 'pkid0001', name: 'น้อง', look: { skin: '#f1c9a5', shirt: '#6cc4a1', accent: '#f6b04c', hair: '#3b2a20', hat: 'cap' }, tut: {} })));
  await kid.reload();
  await kid.waitForSelector('.screen.title', { timeout: 60000 });
  await wait(1000);
  await kid.tap('.title-buttons .btn.primary');
  await kid.waitForSelector('.pic-grid .pic');
  await kid.tap(`.pic[aria-label="${word}"]`);
  await kid.focus('.num-input');
  const wrong = String((+digits + 1) % 900 + 100);
  await kid.keyboard.type(wrong, { delay: 80 });
  await kid.waitForSelector('.screen.join .error', { timeout: 90000 });
  const after = await kid.evaluate(() => ({ err: document.querySelector('.error')?.textContent, pic: document.querySelector('.pic.on')?.getAttribute('aria-label'), num: document.querySelector('.num-input')?.value }));
  check(after.pic === word && after.num === wrong && /[฀-๿]/.test(after.err || ''), `wrong number: back to join with the same picture and numbers, Thai message ("${after.err}")`);
  await kid.screenshot({ path: `${out}/kid-wrong-number.png` });
} catch (e) {
  console.error('TEST CRASHED', e);
  ok = false;
} finally {
  console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 20).join('\n') : 'no page errors');
  console.log(ok && !errors.length ? 'ALL PASSED' : 'SOME CHECKS FAILED');
  await browser.close();
  servers.close?.();
  process.exit(ok && !errors.length ? 0 : 1);
}
