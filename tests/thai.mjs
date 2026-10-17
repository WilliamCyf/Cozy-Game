// Thai check: plays through every screen and panel with a Thai iPhone and reports
//   - English words still on screen (Mum can't read them!)
//   - text that doesn't fit (cut off, or spilling out of its box / off the screen)
//   - translations the game asked for but couldn't find
//   node tests/thai.mjs [outdir]        (needs `npm run serve` running)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] || '/tmp/shots-thai';
mkdirSync(out, { recursive: true });
const base = `http://localhost:${process.env.PORT || 8080}/`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const errors = [];
async function phone(name) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'th-TH',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`[${name}] ${e.message}\n${e.stack}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/WebSocket|ERR_|Abort|peer/i.test(m.text())) errors.push(`[${name} console] ${m.text()}`); });
  return p;
}

// Words that are allowed to stay in English
const ALLOWED = new Set(['Cozy', 'Cove', 'English', 'fps']);

// Look at everything visible in the game's UI layer
async function inspect(p, step) {
  const r = await p.evaluate((allowed) => {
    const allow = new Set(allowed);
    const vw = innerWidth;
    const english = [];
    const overflow = [];
    const root = document.getElementById('ui');
    const visible = (el) => {
      if (!el || !el.getClientRects().length) return false;
      const cs = getComputedStyle(el);
      return cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.05;
    };
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
      const el = n.parentElement;
      if (!visible(el)) continue;
      if (el.closest('.code, .code-box .code, .lang-btn, .name-me, [data-noi18n]')) continue;
      const words = (n.textContent.match(/[A-Za-z][A-Za-z'’]+/g) || []).filter((w) => !allow.has(w) && !allow.has(w.replace(/[’']s$/, '')));
      if (words.length) english.push(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')}: "${n.textContent.trim().slice(0, 90)}"`);
    }
    for (const el of root.querySelectorAll('*')) {
      if (!visible(el) || !el.textContent.trim()) continue;
      const cs = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const label = `${el.tagName.toLowerCase()}.${[...el.classList].join('.')} "${el.textContent.trim().slice(0, 50)}"`;
      // only elements that hold text themselves
      const ownText = [...el.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim());
      if (!ownText) continue;
      if (el.closest('.sheet-body, .list, .grid') && rect.bottom < 0) continue; // scrolled away
      if ((cs.overflowX === 'hidden' || cs.overflowX === 'clip' || cs.textOverflow === 'ellipsis') && el.scrollWidth > el.clientWidth + 2) overflow.push(`cut off sideways: ${label}`);
      if ((cs.overflowY === 'hidden' || cs.overflowY === 'clip') && el.scrollHeight > el.clientHeight + 3 && cs.webkitLineClamp === 'none') overflow.push(`cut off top/bottom: ${label} (${el.scrollHeight}>${el.clientHeight})`);
      if (rect.width > 0 && (rect.right > vw + 1 || rect.left < -1) && !el.closest('.toast.out')) overflow.push(`off screen: ${label} (${Math.round(rect.left)}..${Math.round(rect.right)})`);
    }
    return { english, overflow };
  }, [...ALLOWED]);
  const res = { step, english: [...new Set(r.english)], overflow: [...new Set(r.overflow)] };
  report.push(res);
  await p.screenshot({ path: `${out}/${step}.png` });
  return res;
}
const report = [];

// Record every toast / hint / banner text, even the ones that vanish quickly
async function recordMessages(p) {
  await p.evaluate(() => {
    const ui = window.__game.ui, tr = window.__i18n.tr;
    window.__said = [];
    for (const fn of ['toast', 'hint', 'banner']) {
      const orig = ui[fn].bind(ui);
      ui[fn] = (...a) => { for (const x of a) if (x && (typeof x === 'string' || typeof x === 'object')) window.__said.push(`${fn}: ${typeof x === 'object' ? tr(x) : x}`); return orig(...a); };
    }
  });
}

try {
  // ---------------------------------------------------------------- 1. first launch on a Thai phone
  const p = await phone('Mum');
  await p.goto(base + '?nosw&nopeer&notry&debug');
  // brand-new phone: first the "choose your language" screen (written in both languages)
  await p.waitForSelector('.lang-screen', { timeout: 90000 });
  await wait(900);
  console.log('language suggested automatically:', await p.evaluate(() => window.__i18n.getLang()));
  await inspect(p, '00-choose-language');
  const thIdx = await p.$$eval('.lang-pick .btn', (els) => els.findIndex((e) => /ภาษาไทย/.test(e.textContent)));
  await (await p.$$('.lang-pick .btn'))[thIdx].tap();
  await p.waitForSelector('.screen.title', { timeout: 30000 });
  await wait(1500);
  await inspect(p, '01-title');
  await p.tap('.title-buttons .btn.primary');
  await wait(1200);
  await inspect(p, '02-profile');
  await p.fill('.name-input', 'แม่');
  await p.tap('.look-editor .btn.primary');
  await p.waitForFunction(() => window.__game?.session?.state, null, { timeout: 90000 });
  await wait(2500);
  await recordMessages(p);
  await inspect(p, '03-hud-tutorial');

  // give the family some things so every panel has content
  const R = (req) => p.evaluate((r) => window.__game.session.request(r), req);
  for (const [item, n] of [['shell', 4], ['fish:sardine', 3], ['seed:carrot', 3], ['carrot', 2], ['soup', 1], ['driftwood', 5], ['shrimp', 2], ['coconut', 2], ['berry', 3]]) await R({ a: 'cheat', item, n });
  await R({ a: 'catch', fish: 'sardine', size: 14 });
  await R({ a: 'catch', fish: 'koi', size: 40 });
  await R({ a: 'cheat', coins: 900 });
  await wait(500);

  const panels = [['menu'], ['basket'], ['journal', 'fish'], ['journal', 'stickers'], ['journal', 'family'], ['board'], ['shop', 'seeds'], ['shop', 'hats'], ['sell'], ['cook'], ['family'], ['look'], ['settings'], ['help'], ['leave']];
  for (const [name, arg] of panels) {
    await p.evaluate(([n, a]) => window.__game.openPanel(n, a), [name, arg]);
    await wait(900);
    await inspect(p, `10-panel-${name}${arg ? '-' + arg : ''}`);
    // long panels: also look at the bottom
    const scrolled = await p.evaluate(() => { const b = document.querySelector('.sheet-body') || document.querySelector('.sheet'); if (!b || b.scrollHeight <= b.clientHeight + 10) return false; b.scrollTop = b.scrollHeight; return true; });
    if (scrolled) { await wait(300); await inspect(p, `10-panel-${name}${arg ? '-' + arg : ''}-end`); }
    if (name === 'journal' && arg === 'fish') {
      await p.evaluate(() => document.querySelector('.fish-card:not(.unknown)')?.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })));
      await p.evaluate(() => { const c = document.querySelector('.fish-card:not(.unknown)'); c?.click(); });
      await wait(900);
      await inspect(p, '11-fish-detail');
    }
    await p.evaluate(() => window.__game.ui.closeSheet());
    await wait(400);
  }

  // places with their own panels: garden plot, mailbox
  const goAndAct = async (step, fnBody) => {
    await p.evaluate(fnBody);
    await wait(900);
    await p.keyboard.down(' '); await wait(120); await p.keyboard.up(' ');
    await wait(1400);
    await inspect(p, step);
    await p.evaluate(() => window.__game.ui.closeSheet?.());
    await wait(400);
  };
  await goAndAct('20-plant', () => { const g = window.__game, pl = g.world.plots[3]; g.players.local.x = pl.x; g.players.local.z = pl.z + 1.4; g.players.local.heading = Math.PI; g.rig.snap(); });
  // the letter: also try "🔊 Read to me" (we listen in on what the phone is asked to say)
  await p.evaluate(() => { window.__spoke = null; if (window.speechSynthesis) window.speechSynthesis.speak = (u) => { window.__spoke = { text: u.text, lang: u.lang }; }; });
  await p.evaluate(() => { const g = window.__game; g.players.local.x = 9.5; g.players.local.z = 25.4; g.rig.snap(); });
  await wait(900);
  await p.keyboard.down(' '); await wait(120); await p.keyboard.up(' ');
  await wait(1400);
  await inspect(p, '21-mailbox');
  const readIdx = await p.$$eval('.sheet .btn', (els) => els.findIndex((e) => e.textContent.includes('🔊')));
  if (readIdx >= 0) { await (await p.$$('.sheet .btn'))[readIdx].tap(); await wait(300); }
  const spoke = await p.evaluate(() => window.__spoke);
  const readOk = !!spoke && spoke.lang === 'th-TH' && /[\u0E00-\u0E7F]/.test(spoke.text);
  console.log(`read aloud: ${readOk ? 'OK' : 'PROBLEM'} ${JSON.stringify(spoke)}`);
  if (!readOk) report.push({ step: '21-read-aloud', english: [], overflow: ['the letter was not read aloud in Thai'] });
  await p.evaluate(() => window.__game.ui.closeSheet?.());
  await wait(400);

  // ---------------------------------------------------------------- fishing, start to finish
  await p.evaluate(() => { const g = window.__game, L = g.players.local; L.x = 24; L.z = 56.5; L.heading = 0; g.rig.snap(); });
  await wait(1200);
  await inspect(p, '30-fish-ready');
  await p.keyboard.down(' ');
  await wait(700);
  await inspect(p, '31-fish-charge');
  await p.keyboard.up(' ');
  await wait(1500);
  await inspect(p, '32-fish-wait');
  await p.waitForFunction(() => window.__game.fishing.state === 4, null, { timeout: 30000 }).catch(() => {});
  await inspect(p, '33-fish-bite');
  await p.keyboard.down(' '); await wait(100); await p.keyboard.up(' ');
  await wait(300);
  let reelShot = false;
  for (let i = 0; i < 150; i++) {
    const st = await p.evaluate(() => ({ s: window.__game.fishing.state, pull: window.__game.fishing.mg.pulling, t: window.__game.fishing.mg.tension }));
    if (st.s !== 5) break;
    if (i === 8 && !reelShot) { reelShot = true; await inspect(p, '34-fish-reel'); }
    if (st.pull || st.t > 0.6) await p.keyboard.up(' '); else await p.keyboard.down(' ');
    await wait(100);
  }
  await p.keyboard.up(' ');
  await wait(1000);
  await inspect(p, '35-fish-caught');

  // island name + a sticker -> feed messages; a request that fails -> reply message
  await R({ a: 'rename', name: 'เกาะบ้านเรา' });
  await R({ a: 'request' });
  await wait(1500);
  await inspect(p, '40-after-messages');

  const said = await p.evaluate(() => window.__said);
  const saidEnglish = said.filter((s) => (s.replace(/^\w+: /, '').match(/[A-Za-z][A-Za-z'’]+/g) || []).some((w) => !ALLOWED.has(w)));
  report.push({ step: '50-all-toasts-hints-banners', english: saidEnglish, overflow: [] });
  console.log(`messages shown during the run: ${said.length}`);

  const missingMum = await p.evaluate(() => [...window.__i18n.missing]);

  // ---------------------------------------------------------------- 2. joining someone's island (Thai)
  const j = await phone('Kid');
  await j.goto(base + '?nosw&nopeer&notry');
  await j.evaluate(() => localStorage.setItem('cozycove.profile', JSON.stringify({ id: 'pkid1234', name: 'น้อง', look: { skin: '#f1c9a5', shirt: '#6cc4a1', accent: '#f6b04c', hair: '#3b2a20', hat: 'cap' }, tut: {} })));
  await j.reload();
  await j.waitForSelector('.screen.title', { timeout: 90000 });
  await wait(1200);
  await j.tap('.title-buttons .btn.big:not(.primary)');
  await wait(1200);
  await inspect(j, '60-join');
  await j.fill('.code-input', 'CRAB123').catch(() => {});
  await j.keyboard.press('Enter');
  await wait(1500);
  await inspect(j, '61-connecting');
  const missingKid = await j.evaluate(() => [...window.__i18n.missing]);

  // ---------------------------------------------------------------- results
  let problems = 0;
  for (const r of report) {
    if (!r.english.length && !r.overflow.length) continue;
    console.log(`\n== ${r.step}`);
    for (const e of r.english) { console.log('  ENGLISH  ' + e); problems++; }
    for (const o of r.overflow) { console.log('  FIT      ' + o); problems++; }
  }
  const missing = [...new Set([...missingMum, ...missingKid])];
  if (missing.length) { console.log('\n== translations the game asked for but could not find:'); for (const m of missing) console.log('  MISSING  ' + JSON.stringify(m)); }
  problems += missing.length;
  console.log(errors.length ? '\nERRORS:\n' + errors.join('\n') : '\nno page errors');
  console.log(`\n${report.length} screens checked · ${problems} problem(s)`);
  process.exitCode = problems || errors.length ? 1 : 0;
} catch (e) {
  console.error('TEST CRASHED', e);
  console.log(errors.join('\n'));
  process.exitCode = 2;
} finally {
  await browser.close();
}
