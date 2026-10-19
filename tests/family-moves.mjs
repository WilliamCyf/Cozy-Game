// Moving between family islands, and islands from before family islands (one phone kept the island).
//   node tests/family-moves.mjs [outdir]      (needs `npm run serve` running)
// 1. an old island that was really played: asked once "is this your family's island?" (yes / no)
// 2. an old island opened once by accident: put away quietly (it can come back)
// 3. a phone with its own island joins another family: "Move to …?" card, Stay or Move
// 4. "↩️ Back to …" brings the island it moved away from back (and keeps the other one)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { startServers } from './servers.mjs';
import { startNewIsland } from './helpers.mjs';

const out = process.argv[2] || '/tmp/family-moves';
mkdirSync(out, { recursive: true });
const PORT = process.env.PORT || 8080;
const net = '&signal=127.0.0.1:9000&relay=ws://127.0.0.1:7777';
const base = `http://localhost:${PORT}/?nosw&notut&lang=en&quality=saver&debug`;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
let ok = true;
const check = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) ok = false; return cond; };
async function phone(name) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: 'en-GB' });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/WebSocket|ERR_|User-Initiated Abort|Could not connect to peer|Lost connection/.test(m.text())) errors.push(`[${name} console] ${m.text()}`); });
  return p;
}
const PROFILE = (id, name) => JSON.stringify({ id, name, look: { skin: '#f1c9a5', shirt: '#e86b7a', accent: '#f6b04c', hair: '#2a1d16', hat: 'straw' }, tut: { moved: 1, fished: 1, board: 1, planted: 1 } });
// an island saved by the version before family islands (no family books)
function oldIsland({ real }) {
  const plots = Array.from({ length: 6 }, () => ({ crop: null, stage: 0, water: false, grow: 0 }));
  return JSON.stringify({
    v: 1, code: 'TURTLE482', created: 1700000000000, clock: 900, day: real ? 6 : 1, time: 9, weather: 'sun', weatherUntil: 0,
    coins: real ? 1234 : 50, basket: real ? { shell: 7, 'seed:carrot': 2 } : { 'seed:carrot': 4 }, journal: real ? { sardine: { n: 3, best: 15, by: 'Dad', first: 5 } } : {},
    plots, bushes: [], palms: [], items: {}, projects: {}, hats: ['straw'], players: real ? { pdad01: { name: 'Dad', caught: 3, joined: 1 }, pkid01: { name: 'Kid', joined: 2 } } : { pdad01: { name: 'Dad', joined: 1 } },
    mail: { day: 0 }, treasure: { day: 0 }, stats: { fish: 3, days: real ? 6 : 1, maxOnline: 2 }, feed: [], nextItem: 1, name: real ? 'Smith Island' : 'Cozy Cove', request: null, stickers: [], picnicDay: 0,
  });
}
const titleText = (p) => p.evaluate(() => document.querySelector('.screen.title.in .title-buttons')?.innerText || '');

try {
  // ---------------------------------------------------------------- 1. a real old island: asked once
  for (const answer of ['ours', 'join']) {
    const p = await phone('Dad-' + answer);
    await p.goto(base + '&nopeer&notry');
    await p.evaluate(([prof, isl]) => { localStorage.setItem('cozycove.profile', prof); localStorage.setItem('cozycove.settings', JSON.stringify({ lang: 'en' })); localStorage.setItem('cozycove.island.v1', isl); }, [PROFILE('pdad01', 'Dad'), oldIsland({ real: true })]);
    await p.goto(base + '&nopeer&notry');
    await p.waitForSelector('.screen.join.in .col-buttons', { timeout: 90000 });
    const q = await p.evaluate(() => document.querySelector('.screen.join.in')?.innerText || '');
    check(/Family islands are here/.test(q) && /Smith Island \(Day 6\)/.test(q), `old island: the first start asks about it once ("${q.split('\n')[0]}")`);
    if (answer === 'ours') {
      await p.screenshot({ path: `${out}/1-question.png` });
      await p.tap('.screen.join.in .col-buttons .btn.primary');
      await p.waitForSelector('.screen.title.in', { timeout: 30000 });
      check(/Play/.test(await titleText(p)) && /Smith Island · Day 6/.test(await titleText(p)), `“Yes, our family island”: the start screen offers Play on it (${(await titleText(p)).replace(/\n/g, ' | ')})`);
      await p.tap('.screen.title.in .title-buttons .btn.primary');
      await p.waitForFunction(() => window.__game?.session?.state, null, { timeout: 90000 });
      const s = await p.evaluate(() => { const s = window.__game.session.state; return { day: s.day, coins: s.coins, shell: s.basket.shell, fish: s.journal.sardine?.n, vid: s.vx.vid, code: s.code }; });
      check(s.day === 6 && s.coins === 1234 && s.shell === 7 && s.fish === 3, `every number kept (day ${s.day}, ${s.coins} coins, ${s.shell} shells, sardine ×${s.fish})`);
      check(s.vid === 'i' + (1700000000000).toString(36) + 'TURTLE482' && s.code === 'TURTLE482', `the island keeps its code and gets the same id on every copy (${s.vid})`);
      // and it doesn't ask again
      await p.evaluate(() => sessionStorage.removeItem('cozycove.resume'));
      await p.goto(base + '&nopeer&notry');
      await p.waitForSelector('.screen.title.in', { timeout: 90000 });
      check(!(await p.$('.screen.join.in')), 'next start: no question any more, straight to the start screen');
    } else {
      await p.tap('.screen.join.in .col-buttons .btn:not(.primary)');
      await p.waitForSelector('.screen.join.in .pic-grid', { timeout: 30000 });
      check(true, '“No, I’ll join my family’s island”: the join screen');
      await p.tap('.screen.join.in .btn.ghost'); // ← Back
      await p.waitForSelector('.screen.title.in', { timeout: 30000 });
      const tt = await titleText(p);
      check(/Join your family/.test(tt) && /Back to Smith Island · Day 6/.test(tt), `the start screen: Join your family, and “Back to Smith Island” (${tt.replace(/\n/g, ' | ')})`);
      await p.screenshot({ path: `${out}/1-no-island-back.png` });
      await p.tap('.screen.title.in .title-buttons .btn.ghost.small');
      await p.waitForFunction(() => window.__game?.session?.state, null, { timeout: 90000 });
      const s = await p.evaluate(() => ({ day: window.__game.session.state.day, coins: window.__game.session.state.coins }));
      check(s.day === 6 && s.coins === 1234, `“Back to Smith Island”: it is back, nothing lost (day ${s.day}, ${s.coins} coins)`);
    }
    await p.context().close();
  }

  // ---------------------------------------------------------------- 2. an old island opened once by accident
  {
    const p = await phone('Kid-tiny');
    await p.goto(base + '&nopeer&notry');
    await p.evaluate(([prof, isl]) => { localStorage.setItem('cozycove.profile', prof); localStorage.setItem('cozycove.settings', JSON.stringify({ lang: 'en' })); localStorage.setItem('cozycove.island.v1', isl); }, [PROFILE('pkid02', 'Kid'), oldIsland({ real: false })]);
    await p.goto(base + '&nopeer&notry');
    await p.waitForSelector('.screen.title.in', { timeout: 90000 });
    const tt = await titleText(p);
    check(!(await p.$('.screen.join.in')) && /Join your family/.test(tt) && /Back to Cozy Cove · Day 1/.test(tt), `a tiny old island: no question, put away quietly, still there under “Back to …” (${tt.replace(/\n/g, ' | ')})`);
    await p.context().close();
  }

  // ---------------------------------------------------------------- 3 + 4. moving to another family, and back
  const servers = startServers();
  const dad = await phone('Dad');
  await dad.goto(base + net + '&autostart=new&name=Dad');
  await dad.waitForFunction(() => window.__game?.session?.phase === 'leading', null, { timeout: 90000 });
  const code = await dad.evaluate(() => window.__game.session.code);
  const dadVid = await dad.evaluate(() => window.__game.session.state.vx.vid);
  await wait(1500);
  // Mum has her own island, played for a few days
  const mum = await phone('Mum');
  await mum.goto(base + net);
  await mum.evaluate((prof) => { localStorage.setItem('cozycove.profile', prof); localStorage.setItem('cozycove.settings', JSON.stringify({ lang: 'en' })); }, PROFILE('pmum01', 'Mum'));
  await mum.goto(base + net);
  await startNewIsland(mum);
  await mum.evaluate(() => { const s = window.__game.session; s.state.day = 4; s.state.name = 'Mango Bay'; s.request({ a: 'cheat', coins: 300 }); s.save(); });
  const mumVid = await mum.evaluate(() => window.__game.session.state.vx.vid);
  await mum.evaluate(() => window.__game.leave());
  await mum.waitForSelector('.screen.title.in', { timeout: 90000 });
  check(/Join another family/.test(await titleText(mum)), 'Mum’s start screen (she has an island): Play, or Join another family');
  // Join another family -> "Move to …?" -> Stay: nothing changes
  await mum.goto(base + net + `&join=${code}`);
  await mum.waitForSelector('.screen.join.in .row .btn.primary', { timeout: 90000 });
  const card = await mum.evaluate(() => document.querySelector('.screen.join.in')?.innerText || '');
  check(/Move to Cozy Cove\?/.test(card) && /Dad/.test(card) && /Mango Bay \(Day 4\)/.test(card), `the “Move to …?” card says where to and that Mango Bay stays safe (${card.replace(/\n/g, ' | ').slice(0, 160)})`);
  await mum.screenshot({ path: `${out}/3-move-card.png` });
  await mum.tap('.screen.join.in .row .btn.ghost'); // Stay
  await mum.waitForSelector('.screen.title.in', { timeout: 30000 });
  check(await mum.evaluate(() => JSON.parse(localStorage.getItem('cozycove.island.v1')).vx.vid) === mumVid, 'Stay: Mum’s island is untouched');
  // again, and Move
  await mum.goto(base + net + `&join=${code}`);
  await mum.waitForSelector('.screen.join.in .row .btn.primary', { timeout: 90000 });
  await mum.tap('.screen.join.in .row .btn.primary'); // 🧳 Move
  await mum.waitForFunction(() => window.__game?.session?.phase === 'visiting', null, { timeout: 90000 });
  check(await mum.evaluate(() => window.__game.session.state.vx.vid) === dadVid, 'Move: Mum plays on Dad’s family island now');
  await wait(1500);
  check(await dad.evaluate(() => window.__game.session.online.size) === 2, 'Dad sees Mum arrive');
  const saved = await mum.evaluate(() => ({ main: JSON.parse(localStorage.getItem('cozycove.island.v1')).vx.vid, archive: JSON.parse(localStorage.getItem('cozycove.island.prev')).map((s) => s.vx.vid) }));
  check(saved.main === dadVid && saved.archive.includes(mumVid), 'Mum’s phone keeps the family island, and Mango Bay in its archive');
  // back to the start screen: "↩️ Back to Mango Bay"
  await mum.evaluate(() => window.__game.leave());
  await mum.waitForSelector('.screen.title.in', { timeout: 90000 });
  const tt = await titleText(mum);
  check(/Back to Mango Bay · Day 4/.test(tt), `the start screen offers “Back to Mango Bay · Day 4” (${tt.replace(/\n/g, ' | ')})`);
  await mum.screenshot({ path: `${out}/4-back-to.png` });
  await mum.tap('.screen.title.in .title-buttons .btn.ghost.small');
  await mum.waitForFunction(() => window.__game?.session?.state, null, { timeout: 90000 });
  const back = await mum.evaluate(() => ({ vid: window.__game.session.state.vx.vid, day: window.__game.session.state.day, coins: window.__game.session.state.coins, archive: JSON.parse(localStorage.getItem('cozycove.island.prev')).map((s) => s.vx.vid) }));
  check(back.vid === mumVid && back.day === 4 && back.coins === 350, `Mango Bay is back as it was (day ${back.day}, ${back.coins} coins)`);
  check(back.archive.includes(dadVid), '…and Dad’s family island is kept in the archive in its place (nothing is ever thrown away)');
  servers.close?.();
} catch (e) {
  console.error('TEST CRASHED', e);
  ok = false;
} finally {
  console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 20).join('\n') : 'no page errors');
  console.log(ok && !errors.length ? 'ALL PASSED' : 'SOME CHECKS FAILED');
  await browser.close();
  process.exit(ok && !errors.length ? 0 : 1);
}
