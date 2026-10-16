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
  } else if (scenario === 'flow') {
    const p = await newPhone('A');
    await p.goto(base + '?nosw&nopeer&notry&autostart=host&name=Mom&notut&debug');
    await p.waitForFunction(() => window.__game, null, { timeout: 60000 });
    await wait(1200);
    const log = (m) => console.log(m);
    const R = (req) => p.evaluate((r) => window.__game.session.request(r), req);
    const S = () => p.evaluate(() => JSON.parse(JSON.stringify(window.__game.session.state)));
    let s = await S();
    // 1) pick up a beach item
    const [iid, it] = Object.entries(s.items)[0];
    let r = await R({ a: 'pick', id: iid }); log(`pick ${it.k}: ${r.ok}`);
    // 2) shake a palm, pick the coconut
    r = await R({ a: 'shake', i: 0 }); log(`shake: ${JSON.stringify(r)}`);
    s = await S();
    const coco = Object.entries(s.items).find(([, v]) => v.k === 'coconut');
    r = await R({ a: 'pick', id: coco?.[0] }); log(`coconut picked: ${r.ok}`);
    r = await R({ a: 'shake', i: 0 }); log(`shake again (should be empty): ${JSON.stringify(r)}`);
    // 3) bush
    r = await R({ a: 'bush', i: 0 }); log(`bush: ${JSON.stringify(r)}`);
    // 4) garden: plant -> water -> grow -> harvest
    r = await R({ a: 'plant', i: 0, crop: 'carrot' }); log(`plant: ${r.ok}`);
    r = await R({ a: 'water', i: 0 }); log(`water: ${r.ok}`);
    for (let st = 0; st < 3; st++) {
      await p.evaluate(() => { const pl = window.__game.session.state.plots[0]; pl.grow = 999; pl.water = true; });
      await wait(1600);
    }
    s = await S(); log(`plot after growing: ${JSON.stringify(s.plots[0])}`);
    await p.evaluate(() => { const g = window.__game; g.players.local.x = g.world.plots[0].x; g.players.local.z = g.world.plots[0].z + 1.6; g.rig.snap(); });
    await wait(800);
    await shot(p, 'flow-garden');
    r = await R({ a: 'harvest', i: 0 }); log(`harvest: ${JSON.stringify(r)}`);
    r = await R({ a: 'plant', i: 1, crop: 'carrot' }); r = await R({ a: 'plant', i: 2, crop: 'strawberry' }); r = await R({ a: 'water', i: 2 });
    // 5) shop + sell
    r = await R({ a: 'buy', i: 0 }); log(`buy seeds: ${r.ok}`);
    r = await R({ a: 'cheat', coins: 500, item: 'driftwood', n: 20 });
    r = await R({ a: 'buyHat', hat: 'bunny' }); log(`buy bunny hat: ${r.ok}`);
    r = await R({ a: 'sell', item: 'driftwood', n: 2 }); log(`sell: ${JSON.stringify(r)}`);
    // 6) cook (give ingredients first)
    await R({ a: 'cheat', item: 'fish:sardine', n: 3 }); await R({ a: 'cheat', item: 'carrot', n: 2 });
    r = await R({ a: 'cook', r: 'soup' }); log(`cook soup: ${r.ok}`);
    r = await R({ a: 'cook', r: 'pie' }); log(`cook pie without pumpkin (should fail): ${JSON.stringify(r)}`);
    // 7) family projects
    r = await R({ a: 'donate', p: 'path', need: 'driftwood', n: 6 }); log(`donate driftwood: ${JSON.stringify(r)}`);
    r = await R({ a: 'donate', p: 'path', need: 'coins', n: 30 }); log(`donate coins: ${JSON.stringify(r)}`);
    s = await S(); log(`path project done: ${s.projects.path.done}`);
    const walkOk = await p.evaluate(() => window.__game.world.walk.canWalk(8.2, -10.6)); log(`ramp walkable after project: ${walkOk}`);
    r = await R({ a: 'donate', p: 'festival', need: 'coins', n: 10 }); log(`festival before others (should fail): ${JSON.stringify(r)}`);
    r = await R({ a: 'donate', p: 'bridge', need: 'driftwood', n: 12 }); r = await R({ a: 'donate', p: 'bridge', need: 'coins', n: 120 }); log(`bridge: ${JSON.stringify(r)}`);
    const bridgeOk = await p.evaluate(() => window.__game.world.walk.canWalk(44, 15.5)); log(`bridge gap walkable: ${bridgeOk}`);
    await wait(1500);
    await shot(p, 'flow-celebrate');
    await p.evaluate(() => window.__game.ui.hideOverlay());
    // 8) mail
    r = await R({ a: 'mail' }); log(`mail: ${JSON.stringify(r).slice(0, 120)}`);
    r = await R({ a: 'mail' }); log(`mail again (should be empty): ${r.ok}`);
    // 9) every panel opens without errors
    for (const name of ['basket', 'journal', 'board', 'shop', 'sell', 'cook', 'family', 'look', 'settings', 'help', 'menu']) {
      await p.evaluate((n) => window.__game.openPanel(n), name);
      await wait(500);
      await shot(p, 'panel-' + name);
      await p.evaluate(() => window.__game.ui.closeSheet());
      await wait(300);
    }
    // 10) catch card
    await p.evaluate(() => window.__game.ui.showCatch({ fish: 'tuna', size: 88, res: { isNew: true, record: false } }));
    await wait(700);
    await shot(p, 'catch-card');
    await p.evaluate(() => document.querySelector('.catch .btn')?.dispatchEvent(new PointerEvent('pointerdown')));
    // 11) night + rain
    await p.evaluate(() => { const g = window.__game; g.players.local.x = 2; g.players.local.z = 22; g.rig.snap(); g.session.state.time = 22.5; });
    await wait(2500);
    await shot(p, 'night');
    await R({ a: 'cheat', weather: 'rain' });
    await p.evaluate(() => { window.__game.session.state.time = 13; });
    await wait(4000);
    await shot(p, 'rain');
    s = await S(); log(`final coins ${s.coins}, basket ${JSON.stringify(s.basket)}`);
  } else if (scenario === 'scenes') {
    const p = await newPhone('A');
    await p.goto(base + '?nosw&nopeer&notry&autostart=host&name=Mom&notut&debug');
    await p.waitForFunction(() => window.__game, null, { timeout: 60000 });
    await wait(1500);
    const place = process.env.PLACE || '6,37';
    const [px, pz] = place.split(',').map(Number);
    await p.evaluate(([x, z]) => { const g = window.__game; g.players.local.x = x; g.players.local.z = z; g.rig.snap(); g.ui.hud.style.display = 'none'; }, [px, pz]);
    for (const [n, t, w] of [['noon', 12, 'sun'], ['sunset', 18.4, 'sun'], ['night', 22, 'sun'], ['rain', 13, 'rain']]) {
      await p.evaluate(async ([t, w]) => { const g = window.__game; await g.session.request({ a: 'cheat', weather: w }); g.session.state.time = t; g.daynight.rain = w === 'rain' ? 1 : 0; }, [t, w]);
      await wait(2500);
      await shot(p, 'scene-' + n);
    }
  } else if (scenario === 'visual2') {
    const t = await newPhone('T');
    await t.goto(base + '?nosw&nopeer&notry');
    await wait(5000);
    await t.getByText('Play on our island').click();
    await wait(2500);
    await shot(t, 'v-profile');
    const p = await newPhone('A');
    await p.goto(base + '?nosw&nopeer&notry&autostart=host&name=Mom&notut&debug');
    await p.waitForFunction(() => window.__game, null, { timeout: 60000 });
    await wait(1200);
    const R = (req) => p.evaluate((r) => window.__game.session.request(r), req);
    // fishing from the beach: should sit down
    await p.evaluate(() => { const g = window.__game, L = g.players.local; L.x = -4; L.z = 37.5; L.heading = 0; g.rig.snap(); g.fishing.press(); setTimeout(() => g.fishing.release(), 500); });
    await wait(3500);
    await shot(p, 'v-beachfish');
    await p.evaluate(() => window.__game.fishing.stop());
    // repaired bridge + islet treasure mark
    await R({ a: 'cheat', project: 'bridge' }); await R({ a: 'cheat', project: 'path' });
    await p.evaluate(() => { const g = window.__game, L = g.players.local; L.x = 58; L.z = 17; g.rig.snap(); });
    await wait(2500);
    await shot(p, 'v-islet');
    await p.evaluate(() => { const g = window.__game, L = g.players.local; L.x = 9; L.z = -12; g.rig.snap(); });
    await wait(2500);
    await shot(p, 'v-ramp');
    // cooking through the real buttons
    await R({ a: 'cheat', item: 'fish:sardine', n: 2 });
    await p.evaluate(() => { const g = window.__game, L = g.players.local; L.x = -7; L.z = -0.4; L.heading = Math.PI; g.rig.snap(); });
    await wait(1200);
    await p.evaluate(() => window.__game.openPanel('cook'));
    await wait(700);
    const bb = await p.locator('.recipe .btn').first().boundingBox();
    await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
    await wait(1500);
    await shot(p, 'v-cooking');
    await p.waitForFunction(() => (window.__game.session.state.basket.grilled || 0) > 0, null, { timeout: 30000 });
    console.log('cooked via UI: grilled =', await p.evaluate(() => window.__game.session.state.basket.grilled));
  } else if (scenario === 'landscape') {
    const t = await newPhone('T', true);
    await t.goto(base + '?nosw&nopeer&notry');
    await wait(6000);
    await shot(t, 'land-title');
    const p = await newPhone('A', true);
    await p.goto(base + '?nosw&nopeer&notry&autostart=host&name=Dad&notut');
    await p.waitForFunction(() => window.__game, null, { timeout: 60000 });
    await wait(2500);
    await shot(p, 'land1');
    await p.evaluate(() => window.__game.openPanel('board'));
    await wait(800);
    await shot(p, 'land-board');
    await p.evaluate(() => { window.__game.ui.closeSheet(); const L = window.__game.players.local; L.x = 24; L.z = 56; L.heading = 0; window.__game.fishing.press(); });
    await wait(1500);
    await shot(p, 'land-fish');
  }
} catch (e) {
  errors.push('[test] ' + e.message);
}
console.log(errors.length ? errors.join('\n') : 'no errors');
await browser.close();
