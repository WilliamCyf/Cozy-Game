// Can you actually walk to every important place? (flood fill over the walking map)
import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto('http://localhost:8080/?nosw&autostart=host&name=Mom&notut&nopeer&notry&debug');
await page.waitForFunction(() => window.__game, null, { timeout: 60000 });
const run = () => page.evaluate(() => {
  const g = window.__game, w = g.world.walk, N = w.N, H = 110, C = 0.5;
  const seen = new Uint8Array(N * N);
  const idx = (x, z) => Math.round((z + H) / C) * N + Math.round((x + H) / C);
  const start = idx(g.players.local.x, g.players.local.z);
  const q = [start]; seen[start] = 1;
  while (q.length) {
    const k = q.pop();
    for (const d of [1, -1, N, -N]) {
      const n = k + d;
      if (n < 0 || n >= N * N || seen[n] || w.flags[n] === 0) continue;
      seen[n] = 1; q.push(n);
    }
  }
  const near = (x, z) => { for (let r = 0; r <= 2.5; r += 0.5) for (let a = 0; a < 8; a++) { const k = idx(x + Math.cos(a) * r, z + Math.sin(a) * r); if (seen[k]) return true; } return false; };
  const W = g.world;
  const spots = { shop: W.shop.front, board: W.board.front, crate: [6.2, 30.8], campfire: [-7, -3], mailbox: [9.5, 24.2], garden: [W.plots[0].x, W.plots[0].z], lighthouse: [-42, -36.5], pierEnd: [24, 56], westBeach: [-55, 10], pond: [24, -24], bridgeFar: [55, 15.5], islet: [65.2, 18.4], picnic: [2.7, -6.5] };
  const out = {};
  for (const [k, [x, z]] of Object.entries(spots)) out[k] = near(x, z);
  return out;
});
console.log('before projects:', JSON.stringify(await run()));
await page.evaluate(async () => { await window.__game.session.request({ a: 'cheat', project: 'path' }); await window.__game.session.request({ a: 'cheat', project: 'bridge' }); });
await page.waitForTimeout(400);
console.log('after projects: ', JSON.stringify(await run()));
await browser.close();
