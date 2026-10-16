// Build script: bundles the game into the docs/ folder (the folder that gets hosted).
//   node tools/build.mjs          -> production build (minified)
//   node tools/build.mjs --watch  -> rebuild automatically while developing
import * as esbuild from 'esbuild';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT = join(ROOT, 'docs');
const watch = process.argv.includes('--watch');

function listFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...listFiles(p));
    else out.push(p);
  }
  return out;
}

async function buildOnce() {
  const t0 = Date.now();
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  const result = await esbuild.build({
    entryPoints: [join(ROOT, 'src/main.js')],
    bundle: true,
    format: 'esm',
    minify: !watch,
    sourcemap: watch ? 'inline' : false,
    target: ['safari15'],
    write: false,
    legalComments: 'none',
    define: { __DEV__: watch ? 'true' : 'false' },
    logLevel: 'warning',
  });
  const js = result.outputFiles[0].contents;
  const jsHash = createHash('sha1').update(js).digest('hex').slice(0, 10);
  const jsName = `app.${jsHash}.js`;
  writeFileSync(join(OUT, jsName), js);

  const css = readFileSync(join(ROOT, 'src/style.css'), 'utf8');
  const cssMin = (await esbuild.transform(css, { loader: 'css', minify: true, target: ['safari15'] })).code;

  // Static files (icons, fonts, manifest)
  cpSync(join(ROOT, 'static'), OUT, { recursive: true });

  let html = readFileSync(join(ROOT, 'src/index.html'), 'utf8');
  // iPhone launch screens: one picture per screen size
  const splash = readdirSync(join(ROOT, 'static/splash')).map((f) => {
    const m = f.match(/splash-(\d+)x(\d+)\./);
    if (!m) return '';
    const w = Number(m[1]), h = Number(m[2]);
    const r = w <= 828 ? 2 : 3;
    return `<link rel="apple-touch-startup-image" media="screen and (device-width: ${w / r}px) and (device-height: ${h / r}px) and (-webkit-device-pixel-ratio: ${r}) and (orientation: portrait)" href="splash/${f}">`;
  }).join('\n');
  html = html.replace('/*%CSS%*/', cssMin).replace('%APP%', jsName).replace('<!--%SPLASH%-->', splash);
  writeFileSync(join(OUT, 'index.html'), html);

  // Service worker: list every file so the game works offline after the first visit.
  const files = listFiles(OUT).map((f) => './' + relative(OUT, f).split('\\').join('/'));
  const version = createHash('sha1').update(js).update(html).digest('hex').slice(0, 10);
  let sw = readFileSync(join(ROOT, 'src/sw.js'), 'utf8');
  sw = sw.replace('%VERSION%', version).replace('%FILES%', JSON.stringify(['./', ...files.filter((f) => f !== './index.html')]));
  writeFileSync(join(OUT, 'sw.js'), sw);
  writeFileSync(join(OUT, '.nojekyll'), '');

  const kb = (js.length / 1024).toFixed(0);
  console.log(`built ${jsName} (${kb} KB) v${version} in ${Date.now() - t0} ms`);
}

if (watch) {
  const { watch: fsWatch } = await import('node:fs');
  let timer = null;
  const rebuild = () => {
    clearTimeout(timer);
    timer = setTimeout(() => buildOnce().catch((e) => console.error(e.message)), 80);
  };
  await buildOnce().catch((e) => console.error(e.message));
  fsWatch(join(ROOT, 'src'), { recursive: true }, rebuild);
  fsWatch(join(ROOT, 'static'), { recursive: true }, rebuild);
  console.log('watching for changes...');
} else {
  await buildOnce();
}
