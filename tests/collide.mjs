// Two different islands accidentally get the same code -> they notice, and the newer one changes its code.
import { chromium } from 'playwright';
import { startServers } from './servers.mjs';
const servers = startServers();
const base = 'http://localhost:8080/?nosw&notut&quality=saver&nopeer&signal=127.0.0.1:9000&relay=ws://127.0.0.1:7777';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const mk = async () => { const c = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 }); return c.newPage(); };
const a = await mk(), b = await mk();
await a.goto(base + '&autostart=host&name=A');
await b.goto(base + '&autostart=host&name=B');
await a.waitForFunction(() => window.__game, null, { timeout: 60000 });
await b.waitForFunction(() => window.__game, null, { timeout: 60000 });
const codeA = await a.evaluate(() => window.__game.session.code);
await wait(1500);
// B's island (the newer one) is given A's code, as if both had picked the same one by chance
await b.evaluate((c) => { const s = window.__game.session; s.release(false); s.state.code = c; setTimeout(() => s.claim(), 2000); }, codeA);
await wait(15000);
const [ca, cb] = await Promise.all([a.evaluate(() => window.__game.session.code), b.evaluate(() => window.__game.session.code)]);
const good = ca === codeA && cb !== codeA;
console.log('codes after collision:', codeA, '->', ca, '/', cb, good ? 'PASS (the newer island took a new code; the older one kept its own)' : 'FAIL');
await browser.close();
servers.close();
process.exit(good ? 0 : 1);
