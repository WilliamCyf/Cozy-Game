// Draws the app icon + iPhone launch screens (run once: node tools/make-icons.mjs).
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const ICONS = join(ROOT, 'static/icons');
const SPLASH = join(ROOT, 'static/splash');
mkdirSync(ICONS, { recursive: true });
mkdirSync(SPLASH, { recursive: true });

const islandSVG = (pad = 0) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} ${-pad} ${1024 + pad * 2} ${1024 + pad * 2}" width="100%" height="100%">
  <defs>
    <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#9ff3e2"/><stop offset="0.55" stop-color="#3fd3cf"/><stop offset="1" stop-color="#1fa9c1"/>
    </linearGradient>
    <radialGradient id="sun" cx="0.5" cy="0.5" r="0.5"><stop offset="0.6" stop-color="#ffd66b"/><stop offset="1" stop-color="#ffd66b" stop-opacity="0"/></radialGradient>
  </defs>
  <rect x="${-pad}" y="${-pad}" width="${1024 + pad * 2}" height="${1024 + pad * 2}" fill="url(#sea)"/>
  <g opacity="0.35" stroke="#fff" stroke-width="10" fill="none" stroke-linecap="round">
    <path d="M90 300 q40 -26 80 0 t80 0"/><path d="M700 210 q40 -26 80 0 t80 0"/><path d="M120 860 q40 -26 80 0 t80 0"/><path d="M760 880 q40 -26 80 0 t80 0"/>
  </g>
  <circle cx="780" cy="230" r="150" fill="url(#sun)"/>
  <circle cx="780" cy="230" r="92" fill="#ffd66b"/>
  <ellipse cx="512" cy="700" rx="380" ry="150" fill="#fff" opacity="0.9"/>
  <ellipse cx="512" cy="690" rx="350" ry="128" fill="#f3e2b4"/>
  <ellipse cx="530" cy="660" rx="230" ry="80" fill="#8fcb52"/>
  <ellipse cx="530" cy="650" rx="200" ry="62" fill="#a4d860"/>
  <path d="M470 660 C 460 560, 430 470, 380 380" stroke="#8b5e3b" stroke-width="34" fill="none" stroke-linecap="round"/>
  <path d="M470 660 C 460 560, 430 470, 380 380" stroke="#a8784e" stroke-width="20" fill="none" stroke-linecap="round" stroke-dasharray="26 18"/>
  <g fill="#6fbf3f" stroke="#4f9a2f" stroke-width="8" stroke-linejoin="round">
    <path d="M380 380 q-120 -40 -210 40 q110 -20 210 -40z"/>
    <path d="M380 380 q-70 -110 -200 -120 q100 50 200 120z"/>
    <path d="M380 380 q20 -130 140 -170 q-70 90 -140 170z"/>
    <path d="M380 380 q130 -40 220 30 q-110 -10 -220 -30z"/>
    <path d="M380 380 q90 60 120 170 q-60 -80 -120 -170z"/>
    <path d="M380 380 q-60 70 -60 180 q20 -100 60 -180z"/>
  </g>
  <circle cx="372" cy="398" r="22" fill="#7a5232"/><circle cx="400" cy="404" r="20" fill="#6a4628"/>
  <g transform="translate(640 640)">
    <ellipse cx="0" cy="0" rx="120" ry="40" fill="#e8c27a" stroke="#c99b52" stroke-width="8"/>
    <path d="M-58 -6 C-58 -70, 58 -70, 58 -6 Z" fill="#d9ad62" stroke="#c99b52" stroke-width="8"/>
    <path d="M-60 -16 C-30 -2, 30 -2, 60 -16 L60 -2 C30 12, -30 12, -60 -2 Z" fill="#3aa39a"/>
  </g>
</svg>`;

const page = await (await chromium.launch()).newPage();
async function renderPNG(html, w, h, file, type = 'png') {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<html><body style="margin:0;overflow:hidden">${html}</body></html>`);
  await page.waitForTimeout(50);
  const buf = await page.screenshot({ type, quality: type === 'jpeg' ? 82 : undefined, clip: { x: 0, y: 0, width: w, height: h } });
  writeFileSync(file, buf);
}

const iconHTML = (size, pad = 0) => `<div style="width:${size}px;height:${size}px">${islandSVG(pad)}</div>`;
for (const s of [180, 192, 512]) await renderPNG(iconHTML(s), s, s, join(ICONS, `icon-${s}.png`));
await renderPNG(iconHTML(512, 110), 512, 512, join(ICONS, 'icon-maskable-512.png'));

// launch screens for common iPhones (portrait), [width, height, pixel ratio]
export const SPLASHES = [
  [1320, 2868, 3], [1206, 2622, 3], [1290, 2796, 3], [1179, 2556, 3], [1284, 2778, 3], [1170, 2532, 3],
  [1080, 2340, 3], [1242, 2688, 3], [1125, 2436, 3], [828, 1792, 2], [750, 1334, 2], [1242, 2208, 3],
];
for (const [w, h] of SPLASHES) {
  const logo = Math.round(w * 0.42);
  const html = `<div style="width:${w}px;height:${h}px;display:flex;flex-direction:column;align-items:center;justify-content:center;background:radial-gradient(120% 80% at 50% 30%, #8ff0dc 0%, #3ad1cf 45%, #20b2c6 100%);font-family:sans-serif">
    <div style="width:${logo}px;height:${logo}px;border-radius:${logo * 0.22}px;overflow:hidden;box-shadow:0 ${w * 0.01}px ${w * 0.04}px rgba(0,60,80,.3)">${islandSVG()}</div>
  </div>`;
  await renderPNG(html, w, h, join(SPLASH, `splash-${w}x${h}.jpg`), 'jpeg');
}
console.log('icons + splash screens written');
process.exit(0);
