// Language switching, the way a person does it: an iPhone set to ENGLISH (and one set to Thai),
// the first-time "choose your language" screen, the 🇹🇭 ภาษาไทย button on the title screen, and
// switching during a game (Settings and the menu) and back again. After every switch, every word
// on screen must be in the chosen language — and switching during a game must NOT reload the game.
//   node tests/lang-switch.mjs [outdir]        (needs `npm run serve` running)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] || '/tmp/lang-switch';
mkdirSync(out, { recursive: true });
const base = `http://localhost:${process.env.PORT || 8080}/?nosw&nopeer&notry`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
let ok = true;
const check = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) ok = false; };

async function phone(name, locale = 'en-GB') {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/WebSocket|ERR_|Abort/.test(m.text())) errors.push(`[${name} console] ${m.text()}`); });
  return p;
}

// Lists visible text in the wrong language. Skipped on purpose: player and island names, the logo,
// and buttons that name a language in its own words ("🇬🇧 English" is how English speakers find it).
async function wrongWords(p, want) {
  return p.evaluate((want) => {
    const skip = '.lang-btn, .lang-pill, .seg-b.lang, .lang-pick, [data-noi18n], .code, .face, .logo-text, .island-name, .row-item .grow, .name-input';
    // (+ the test players' own names; and the language buttons' own names, which tips quote on purpose)
    const okLatin = /^(Cozy|Cove|fps|OK|PM|AM|Nok|Dad|Mum|English)$/;
    const bad = [];
    const vis = (el) => el && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden' && +getComputedStyle(el).opacity > 0.05;
    const tw = document.createTreeWalker(document.getElementById('ui'), NodeFilter.SHOW_TEXT);
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
      const el = n.parentElement, s = n.textContent.trim();
      if (!s || !vis(el) || el.closest(skip)) continue;
      if (want === 'th') { if ((s.match(/[A-Za-z]{2,}/g) || []).some((x) => !okLatin.test(x))) bad.push(s.slice(0, 60)); }
      else if (/[\u0E00-\u0E7F]/.test(s.replace(/ภาษาไทย/g, ''))) bad.push(s.slice(0, 60));
    }
    return bad;
  }, want);
}
const lang = (p) => p.evaluate(() => window.__i18n.getLang());
const tapText = async (p, sel, re) => { const i = await p.$$eval(sel, (els, src) => els.findIndex((e) => new RegExp(src).test(e.textContent)), re.source); if (i < 0) throw new Error(`no ${sel} matching ${re}`); await (await p.$$(sel))[i].tap(); };

try {
  // ------------------------------------------------ 1. brand-new player on an ENGLISH iPhone
  const a = await phone('new-en');
  await a.goto(base);
  await a.waitForSelector('.lang-screen', { timeout: 90000 });
  await wait(800);
  const pick = await a.$$eval('.lang-pick .btn', (els) => els.map((e) => ({ text: e.textContent, primary: e.classList.contains('primary') })));
  check(pick.length === 2 && pick[0].primary && /English/.test(pick[0].text) && /ภาษาไทย/.test(pick[1].text), `first screen: "choose your language", English suggested first (${pick.map((x) => x.text).join(' / ')})`);
  const heading = await a.$eval('.lang-card h2', (e) => e.textContent);
  check(/เลือกภาษา/.test(heading) && /Choose your language/.test(heading), 'the question is written in both languages');
  await a.screenshot({ path: `${out}/1-chooser.png` });
  await tapText(a, '.lang-pick .btn', /English/);
  await a.waitForSelector('.screen.title', { timeout: 30000 });
  await wait(700);
  check(await lang(a) === 'en' && (await wrongWords(a, 'en')).length === 0, 'chose English: title screen in English');
  await a.tap('.lang-btn');
  await wait(700);
  check(await lang(a) === 'th', 'tapping 🇹🇭 ภาษาไทย on the title switches to Thai');
  let bad = await wrongWords(a, 'th');
  check(bad.length === 0, `title screen is all Thai now ${bad.length ? JSON.stringify(bad) : ''}`);
  check(/เวอร์ชัน/.test(await a.$eval('.title-foot .ver', (e) => e.textContent)), 'the title screen shows the version (in Thai)');
  await a.screenshot({ path: `${out}/1-title-th.png` });
  await a.tap('.title-buttons .btn.ghost'); // "🌱 Start a new family island"
  await wait(1200);
  bad = await wrongWords(a, 'th');
  check(bad.length === 0, `"make your islander" screen is Thai ${bad.length ? JSON.stringify(bad) : ''}`);
  await a.fill('.name-input', 'Nok');
  await a.tap('.look-editor .btn.primary');
  await a.waitForSelector('.screen.join.in .col-buttons .btn.primary');
  await wait(700);
  bad = await wrongWords(a, 'th');
  check(bad.length === 0, `"start a new family island?" card is Thai ${bad.length ? JSON.stringify(bad) : ''}`);
  await a.tap('.screen.join.in .col-buttons .btn.primary');
  await a.waitForFunction(() => window.__game?.session?.state, null, { timeout: 90000 });
  await wait(2500);
  bad = await wrongWords(a, 'th');
  check(bad.length === 0, `in the game, the HUD is Thai ${bad.length ? JSON.stringify(bad) : ''}`);
  // the choice is remembered: open the app again
  await a.evaluate(() => sessionStorage.removeItem('cozycove.resume'));
  await a.goto(base);
  await a.waitForSelector('.screen.title', { timeout: 90000 });
  check(await lang(a) === 'th' && !(await a.$('.lang-screen')), 'next time: straight to the title, still in Thai');

  // ------------------------------------------------ 2. brand-new player on a THAI iPhone
  const th = await phone('new-th', 'th-TH');
  await th.goto(base);
  await th.waitForSelector('.lang-screen', { timeout: 90000 });
  await wait(600);
  const pickTh = await th.$$eval('.lang-pick .btn', (els) => els.map((e) => ({ text: e.textContent, primary: e.classList.contains('primary') })));
  check(pickTh[0].primary && /ภาษาไทย/.test(pickTh[0].text), 'on a Thai iPhone, ภาษาไทย is suggested first');
  await tapText(th, '.lang-pick .btn', /ภาษาไทย/);
  await th.waitForSelector('.screen.title', { timeout: 30000 });
  await wait(600);
  bad = await wrongWords(th, 'th');
  check(await lang(th) === 'th' && bad.length === 0, `chose ภาษาไทย: title in Thai ${bad.length ? JSON.stringify(bad) : ''}`);

  // ------------------------------------------------ 3. returning player with an island
  const b = await phone('returning');
  await b.goto(base + '&autostart=host&name=Dad&notut');
  await b.waitForFunction(() => window.__game?.session?.state, null, { timeout: 90000 });
  await b.evaluate(() => { const s = window.__game.session; s.state.day = 3; s.state.journal = { sardine: { n: 2, best: 14 }, koi: { n: 1, best: 40 } }; s.save(); });
  await b.evaluate(() => sessionStorage.removeItem('cozycove.resume')); // (a reload in the same tab would jump back into the game)
  await b.goto(base);
  await b.waitForSelector('.screen.title', { timeout: 90000 });
  await wait(1000);
  check(!(await b.$('.lang-screen')), 'a returning player is not asked again');
  await b.tap('.lang-btn');
  await wait(700);
  bad = await wrongWords(b, 'th');
  check(bad.length === 0, `returning player's title (island summary too) is Thai ${bad.length ? JSON.stringify(bad) : ''}`);
  await b.screenshot({ path: `${out}/3-title-returning-th.png` });

  // ------------------------------------------------ 4. switching in the middle of a game: instant, no reload
  const c = await phone('ingame');
  await c.goto(base + '&autostart=host&name=Mum&notut');
  await c.waitForFunction(() => window.__game?.session?.state, null, { timeout: 90000 });
  await wait(2000);
  await c.evaluate(() => { window.__notReloaded = true; });
  check(await lang(c) === 'en', 'game starts in English');
  await c.evaluate(() => window.__game.openPanel('settings'));
  await wait(900);
  await tapText(c, '.seg-b.lang', /ภาษาไทย/);
  await wait(600);
  check(await c.evaluate(() => window.__notReloaded === true && !!window.__game.session.connected), 'switching did NOT reload the game (nobody gets disconnected)');
  check(await lang(c) === 'th', 'the game is in Thai straight away');
  const sheetTitle = await c.$eval('.sheet-title', (e) => e.textContent);
  check(/ตั้งค่า/.test(sheetTitle), `the open Settings page itself switched too ("${sheetTitle}")`);
  bad = await wrongWords(c, 'th');
  check(bad.length === 0, `everything on screen is Thai ${bad.length ? JSON.stringify(bad) : ''}`);
  await c.screenshot({ path: `${out}/4-settings-th.png` });
  await c.evaluate(() => window.__game.ui.closeSheet());
  await wait(500);
  // walk to the shop: the big button's label must be Thai too
  await c.evaluate(() => { const g = window.__game; const f = g.interact.fixed.find((x) => x.type === 'shop'); g.players.local.x = f.x; g.players.local.z = f.z; g.rig.snap(); });
  await wait(1200);
  const act = await c.$eval('.act-label', (e) => e.textContent);
  check(/[\u0E00-\u0E7F]/.test(act), `the big button speaks Thai at the shop ("${act}")`);
  for (const panel of ['menu', 'shop', 'help', 'journal', 'basket']) {
    await c.evaluate((n) => window.__game.openPanel(n), panel);
    await wait(700);
    bad = await wrongWords(c, 'th');
    check(bad.length === 0, `${panel} panel is Thai ${bad.length ? JSON.stringify(bad) : ''}`);
  }
  // back to English with the button at the top of the menu
  await c.evaluate(() => window.__game.openPanel('menu'));
  await wait(700);
  check(/English/.test(await c.$eval('.lang-pill', (e) => e.textContent)), 'the menu has a 🇬🇧 English button');
  await c.tap('.lang-pill');
  await wait(600);
  check(await lang(c) === 'en' && await c.evaluate(() => window.__notReloaded === true), 'back to English, still without reloading');
  bad = await wrongWords(c, 'en');
  check(bad.length === 0, `no Thai left on screen (the open menu too) ${bad.length ? JSON.stringify(bad) : ''}`);
  check(/ภาษาไทย/.test(await c.$eval('.lang-pill', (e) => e.textContent)), 'and the menu button now offers ภาษาไทย');
  await c.evaluate(() => window.__game.ui.closeSheet());
  await wait(1300);
  check(!/[\u0E00-\u0E7F]/.test(await c.$eval('.act-label', (e) => e.textContent)), 'the big button is English again');
  await c.screenshot({ path: `${out}/4-back-en.png` });
} catch (e) {
  console.error('TEST CRASHED', e);
  ok = false;
} finally {
  console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 20).join('\n') : 'no page errors');
  console.log(ok && !errors.length ? 'ALL PASSED' : 'SOME CHECKS FAILED');
  await browser.close();
  process.exit(ok && !errors.length ? 0 : 1);
}
