// "Is there a second me?" — plays every way of starting an island and counts the characters that
// are actually standing on it. With one player on the island there must be exactly ONE.
//   node tests/clones.mjs [outdir]        (needs `npm run serve` running)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { startServers } from './servers.mjs';
import { startNewIsland } from './helpers.mjs';

const out = process.argv[2] || '/tmp/clones';
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
// Characters in the 3D world. Each character has 3 meshes (body, outline, see-through silhouette)
// that share one set of bones, so we count the bone sets of visible bodies: one per character.
const people = (p) => p.evaluate(() => {
  const scene = window.__game?.scene;
  if (!scene) return null;
  const seen = new Set();
  scene.traverse((o) => {
    const g = o.geometry;
    if (o.isMesh && o.visible && g?.attributes?.aBone && g.attributes.aColor && o.material?.uniforms?.uBones) seen.add(o.material.uniforms.uBones.value);
  });
  return seen.size;
});
// How many games are running? (each game makes its own HUD)
const games = (p) => p.evaluate(() => document.querySelectorAll('.hud').length);

async function intoGame(p) {
  await p.waitForFunction(() => window.__game?.session?.state, null, { timeout: 90000 });
  await wait(2500);
}

try {
  // 1. brand-new phone: choose language -> Start a new family island -> make your islander -> Start
  const a = await phone('new');
  await a.goto(base);
  await a.waitForSelector('.lang-screen', { timeout: 90000 });
  await a.tap('.lang-pick .btn.primary');
  await a.waitForSelector('.screen.title');
  await wait(600);
  await a.tap('.title-buttons .btn.ghost');
  await a.waitForSelector('.name-input');
  await wait(800);
  // play with the look a bit (the preview on the deck changes)
  await a.tap('.swatches .sw:nth-child(3)').catch(() => {});
  await wait(300);
  await a.fill('.name-input', 'Mum');
  await a.tap('.look-editor .btn.primary');
  await a.waitForSelector('.screen.join.in .col-buttons .btn.primary');
  await a.tap('.screen.join.in .col-buttons .btn.primary'); // "🌱 Start a new island"
  await intoGame(a);
  let n = await people(a);
  check(n === 1, `brand-new player, new island: ${n} character(s) on the island`);
  await a.screenshot({ path: `${out}/1-new-island.png` });
  // walk away: a clone would stay behind
  await a.evaluate(() => { const L = window.__game.players.local; L.x += 4; L.z -= 6; });
  await wait(800);
  n = await people(a);
  check(n === 1, `after walking: still ${n} character(s)`);
  await a.screenshot({ path: `${out}/1-walked.png` });

  // 2. "Move out of this family island" (Settings), then start a brand-new island. The old island is
  //    marked first (day 9, 777 coins): it is not on the new island, but it is kept ("Back to …").
  await a.evaluate(() => { const s = window.__game.session; s.state.day = 9; s.state.coins = 777; s.save(); });
  await a.evaluate(() => { window.__oldGame = true; window.__game.openPanel('settings'); });
  await wait(700);
  await a.getByRole('button', { name: /Move out of this family island/ }).tap();
  await wait(600);
  await a.getByRole('button', { name: /^🧳 Move out$/ }).tap();
  await a.waitForSelector('.screen.title.in', { timeout: 90000 });
  check(!!(await a.$('.screen.title.in .btn.ghost.small')), 'after moving out: the start screen offers "↩️ Back to …"');
  await startNewIsland(a);
  await wait(2500);
  n = await people(a);
  check(n === 1, `after moving out and starting a new island: ${n} character(s)`);
  const fresh = await a.evaluate(() => { const s = window.__game.session.state; return { day: s.day, coins: s.coins }; });
  check(fresh.day === 1 && fresh.coins !== 777, `the new island really is new (day ${fresh.day}, ${fresh.coins} coins)`);

  // 3. returning player who first changes their look on the title screen, then plays
  await a.evaluate(() => sessionStorage.removeItem('cozycove.resume'));
  await a.goto(base);
  await a.waitForSelector('.screen.title', { timeout: 90000 });
  await wait(800);
  await a.getByRole('button', { name: /’s look/ }).tap(); // "👕 Mum's look"
  await a.waitForSelector('.look-editor');
  await wait(800);
  await a.tap('.look-editor .btn.primary'); // save -> back to the title
  await a.waitForSelector('.screen.title');
  await wait(600);
  await a.tap('.title-buttons .btn.primary');
  await intoGame(a);
  n = await people(a);
  check(n === 1, `after changing the look on the title screen, then playing: ${n} character(s)`);

  // 4. in the game: open "My Look", change something, close it
  await a.evaluate(() => window.__game.openPanel('look'));
  await wait(900);
  await a.tap('.sheet .swatches .sw:nth-child(2)').catch(() => {});
  await wait(400);
  await a.evaluate(() => window.__game.ui.closeSheet());
  await wait(800);
  n = await people(a);
  check(n === 1, `after "My Look" in the game: ${n} character(s)`);

  // 5. title -> Join family -> Back -> Play (another way to reach the island)
  await a.evaluate(() => sessionStorage.removeItem('cozycove.resume'));
  await a.goto(base);
  await a.waitForSelector('.screen.title', { timeout: 90000 });
  await wait(600);
  await a.tap('.title-buttons .btn.big:not(.primary)');
  await a.waitForSelector('.pic-grid');
  await wait(500);
  await a.tap('.screen.join .btn.ghost');
  await a.waitForSelector('.screen.title');
  await wait(500);
  await a.tap('.title-buttons .btn.primary');
  await intoGame(a);
  n = await people(a);
  check(n === 1, `title -> join -> back -> play: ${n} character(s)`);

  // 6. impatient double tap on "Play on our island" (the phone takes a moment to build the game)
  await a.evaluate(() => sessionStorage.removeItem('cozycove.resume'));
  await a.goto(base);
  await a.waitForSelector('.screen.title', { timeout: 90000 });
  await wait(600);
  const box = await a.$eval('.title-buttons .btn.primary', (e) => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  for (let i = 0; i < 3; i++) { await a.touchscreen.tap(box.x, box.y); await wait(60); }
  await intoGame(a);
  await wait(1500);
  n = await people(a);
  check(n === 1 && await games(a) === 1, `triple tap on "Play": ${n} character(s), ${await games(a)} game(s) running`);
  await a.screenshot({ path: `${out}/6-triple-tap.png` });

  // 7. impatient triple taps on "Let's go!" when making a brand-new islander, then on "Start a new island"
  const b = await phone('new2');
  await b.goto(base + '&lang=en');
  await b.waitForSelector('.screen.title', { timeout: 90000 });
  await wait(600);
  await b.tap('.title-buttons .btn.ghost');
  await b.waitForSelector('.name-input');
  await wait(800);
  await b.fill('.name-input', 'Leo');
  const go = await b.$eval('.look-editor .btn.primary', (e) => { e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  for (let i = 0; i < 3; i++) { await b.touchscreen.tap(go.x, go.y); await wait(60); }
  await b.waitForSelector('.screen.join.in .col-buttons .btn.primary');
  await wait(400);
  const start = await b.$eval('.screen.join.in .col-buttons .btn.primary', (e) => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  for (let i = 0; i < 3; i++) { await b.touchscreen.tap(start.x, start.y); await wait(60); }
  await intoGame(b);
  await wait(1500);
  n = await people(b);
  check(n === 1 && await games(b) === 1, `triple taps on "Let's go!" and "Start": ${n} character(s), ${await games(b)} game(s) running`);

  // 8. Join -> Cancel -> Join again (real matchmakers on this computer, so the join takes a moment):
  //    the cancelled try must not start a second game later, and Dad must see the kid only once
  const servers = startServers();
  const net = '&signal=127.0.0.1:9000&relay=ws://127.0.0.1:7777&notry';
  const host = await phone('dad');
  await host.goto(`http://localhost:${process.env.PORT || 8080}/?nosw&notut&lang=en&autostart=host&name=Dad${net}`);
  await host.waitForFunction(() => window.__game?.session?.state, null, { timeout: 90000 });
  const code = await host.evaluate(() => window.__game.session.code);
  await wait(2000);
  const c = await phone('kid');
  await c.goto(`http://localhost:${process.env.PORT || 8080}/?nosw&lang=en&debug${net}`);
  await c.evaluate(() => localStorage.setItem('cozycove.profile', JSON.stringify({ id: 'pjoin0001', name: 'Kid', look: { skin: '#f1c9a5', shirt: '#6cc4a1', accent: '#f6b04c', hair: '#3b2a20', hat: 'cap' }, tut: {} })));
  await c.reload();
  await c.waitForSelector('.screen.title', { timeout: 90000 });
  await wait(600);
  const word = code.replace(/\d+$/, ''), digits = code.slice(word.length);
  for (let round = 0; round < 2; round++) {
    await c.evaluate((slow) => { window.__slowJoin = slow; }, round === 0 ? 4000 : 0); // the first try is slow, like a phone on bad Wi-Fi
    await c.tap('.screen.title.in .title-buttons .btn.primary'); // "🤝 Join your family" (no island on this phone yet)
    await c.waitForSelector('.screen.join.in .pic-grid .pic');
    await c.tap(`.screen.join.in .pic[aria-label="${word}"]`);
    await c.focus('.screen.join.in .num-input');
    await c.keyboard.type(digits, { delay: 40 });
    if (round === 0) {
      await c.waitForSelector('.screen.join.in .big-emoji', { timeout: 10000 }); // the ⛵ "sailing to the island" screen
      await c.tap('.screen.join.in .btn.ghost'); // Cancel, while the first try is still on its way
      await c.waitForSelector('.screen.title.in');
      await wait(200);
    }
  }
  await c.waitForFunction(() => window.__game?.session?.phase === 'visiting', null, { timeout: 60000 });
  await wait(5000);
  const kidGames = await games(c), kidPeople = await people(c);
  const dadSees = await host.evaluate(() => [...window.__game.session.online.values()].map((o) => o.name));
  check(kidGames === 1 && kidPeople === 2, `Join → Cancel → Join: the kid has ${kidGames} game(s) and sees ${kidPeople} characters (Kid + Dad)`);
  check(dadSees.length === 2 && dadSees.filter((n) => n === 'Kid').length === 1, `Dad sees the kid once (${dadSees.join(', ')})`);
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
