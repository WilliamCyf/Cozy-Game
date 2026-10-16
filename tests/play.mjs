// Scripted play-tests in a simulated iPhone.
//   node tests/play.mjs <scenario> [outdir]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const scenario = process.argv[2] || 'title';
const out = process.argv[3] || '/tmp/shots';
mkdirSync(out, { recursive: true });
const port = process.env.PORT || 8080;
const base = `http://localhost:${port}/`;

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const errors = [];
async function newPhone(name, landscape = false) {
  const vp = landscape ? { width: 844, height: 390 } : { width: 390, height: 844 };
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${name} ${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[${name} pageerror] ${e.message}\n${e.stack}`));
  return page;
}
const shot = (page, n) => page.screenshot({ path: `${out}/${n}.png` });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const key = async (page, k, ms) => { await page.keyboard.down(k); await wait(ms); await page.keyboard.up(k); };

try {
  if (scenario === 'title') {
    const p = await newPhone('A');
    await p.goto(base + '?nosw');
    await wait(6000);
    await shot(p, 'title');
    await p.getByText('Play on our island').click();
    await wait(1500);
    await shot(p, 'profile');
  } else if (scenario === 'host') {
    const p = await newPhone('A');
    await p.goto(base + '?nosw&autostart=host&name=Mom&notut&debug&fps');
    await p.waitForFunction(() => window.__game, null, { timeout: 60000 });
    await wait(2500);
    await shot(p, 'host1');
    await key(p, 'w', 1200);
    await wait(500);
    await shot(p, 'host2');
    const info = await p.evaluate(() => {
      const g = window.__game;
      return { pos: [g.players.local.x, g.players.local.z], act: g.interact.current, calls: g.R.renderer.info.render.calls, tris: g.R.renderer.info.render.triangles };
    });
    console.log(JSON.stringify(info));
  } else if (scenario === 'fish') {
    const p = await newPhone('A');
    await p.goto(base + '?nosw&nopeer&notry&autostart=host&name=Mom&notut&debug&fps');
    await p.waitForFunction(() => window.__game, null, { timeout: 60000 });
    await wait(1500);
    // teleport to the end of the pier, facing the sea
    await p.evaluate(() => { const g = window.__game, L = g.players.local; L.x = 24; L.z = 56.5; L.heading = 0; g.rig.snap(); });
    await wait(800);
    await shot(p, 'fish0');
    await p.keyboard.down(' ');
    await wait(700);
    await shot(p, 'fish1');
    await p.keyboard.up(' ');
    await wait(1200);
    await shot(p, 'fish2');
    // wait for the bite
    await p.waitForFunction(() => window.__game.fishing.state === 4, null, { timeout: 20000 });
    await shot(p, 'fish3');
    await p.keyboard.down(' ');
    await wait(100);
    await p.keyboard.up(' ');
    await wait(200);
    // reel: hold, release when the fish pulls
    for (let i = 0; i < 120; i++) {
      const st = await p.evaluate(() => ({ s: window.__game.fishing.state, pull: window.__game.fishing.mg.pulling, t: window.__game.fishing.mg.tension }));
      if (st.s !== 5) break;
      if (i === 12) await shot(p, 'fish4');
      if (st.pull || st.t > 0.6) await p.keyboard.up(' '); else await p.keyboard.down(' ');
      await wait(100);
    }
    await p.keyboard.up(' ');
    await wait(900);
    await shot(p, 'fish5');
    const res = await p.evaluate(() => ({ basket: window.__game.session.state.basket, journal: window.__game.session.state.journal, st: window.__game.fishing.state }));
    console.log(JSON.stringify(res));
  } else if (scenario === 'landscape') {
    const p = await newPhone('A', true);
    await p.goto(base + '?nosw&autostart=host&name=Dad&notut&fps');
    await p.waitForFunction(() => window.__game, null, { timeout: 60000 });
    await wait(2500);
    await shot(p, 'land1');
  }
} catch (e) {
  errors.push('[test] ' + e.message);
}
console.log(errors.length ? errors.join('\n') : 'no errors');
await browser.close();
