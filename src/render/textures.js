// All textures are painted by code at start-up (no image downloads needed).
import * as THREE from 'three';
import { clamp, smoothstep, hash2, distToSegment } from '../util/math.js';
import { WORLD_HALF, WORLD_SIZE, PATHS, GARDEN, CAMPFIRE, SHOP, PICNIC, SUN_DIR, PLATEAU, LIGHTHOUSE_POINT } from '../world/layout.js';

export const MASK_RES = 1024;
export const HEIGHT_MIN = -6, HEIGHT_RANGE = 12; // how heights are packed into 0..255

// Tileable smooth noise (wraps around at the edges so it can repeat seamlessly)
function tileNoise(x, y, period, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const w = (n) => ((n % period) + period) % period;
  const a = hash2(w(xi), w(yi), seed), b = hash2(w(xi + 1), w(yi), seed);
  const c = hash2(w(xi), w(yi + 1), seed), d = hash2(w(xi + 1), w(yi + 1), seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function tileFbm(px, py, size, base, octaves, seed) {
  let s = 0, amp = 0.5, norm = 0, p = base;
  for (let o = 0; o < octaves; o++) {
    s += tileNoise((px / size) * p, (py / size) * p, p, seed + o * 31) * amp;
    norm += amp;
    amp *= 0.5;
    p *= 2;
  }
  return s / norm;
}

function makeDataTexture(data, size, { repeat = false, mips = true } = {}) {
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  tex.generateMipmaps = mips;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

// R: medium noise, G: fine grain, B: big soft cloud blobs, A: foam lace
export function makeNoiseTexture() {
  const S = 256;
  const data = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const k = (y * S + x) * 4;
      data[k] = tileFbm(x, y, S, 8, 4, 1) * 255;
      data[k + 1] = tileFbm(x, y, S, 32, 3, 2) * 255;
      const c = tileFbm(x, y, S, 3, 4, 3);
      data[k + 2] = smoothstep(0.45, 0.72, c) * 255;
      const f = tileFbm(x, y, S, 16, 3, 4);
      data[k + 3] = f * 255;
    }
  }
  return makeDataTexture(data, S, { repeat: true });
}

// Water caustics: a web of bright lines (Voronoi cell borders), tileable.
export function makeCausticTexture() {
  const S = 256, CELLS = 7;
  const pts = [];
  for (let j = 0; j < CELLS; j++) for (let i = 0; i < CELLS; i++) {
    pts.push([(i + 0.15 + 0.7 * hash2(i, j, 91)) / CELLS, (j + 0.15 + 0.7 * hash2(i, j, 92)) / CELLS]);
  }
  const data = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S;
      const ci = Math.floor(u * CELLS), cj = Math.floor(v * CELLS);
      let f1 = 9, f2 = 9;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ii = (ci + di + CELLS) % CELLS, jj = (cj + dj + CELLS) % CELLS;
        const p = pts[jj * CELLS + ii];
        const px = p[0] + (ci + di - ii) / CELLS; // shift points across the wrap-around edge
        const py = p[1] + (cj + dj - jj) / CELLS;
        const d = Math.hypot(px - u, py - v);
        if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
      }
      const e = f2 - f1;
      const line = Math.pow(1 - smoothstep(0.0, 0.05, e), 1.6);
      const k = (y * S + x) * 4;
      const val = clamp(line, 0, 1) * 255;
      data[k] = data[k + 1] = data[k + 2] = val;
      data[k + 3] = 255;
    }
  }
  return makeDataTexture(data, S, { repeat: true });
}

// Little sprite sheet for particles: 0 soft dot, 1 heart, 2 sparkle, 3 ring, (4x4 grid of 64px)
export function makeParticleAtlas() {
  const S = 256, C = 64;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, S, S);
  const cell = (i) => [(i % 4) * C + C / 2, Math.floor(i / 4) * C + C / 2];
  // 0: soft dot
  let [cx, cy] = cell(0);
  let grd = g.createRadialGradient(cx, cy, 0, cx, cy, C / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.45, 'rgba(255,255,255,0.75)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(cx - C / 2, cy - C / 2, C, C);
  // 1: heart
  [cx, cy] = cell(1);
  g.fillStyle = '#fff';
  g.beginPath();
  g.moveTo(cx, cy + 20);
  g.bezierCurveTo(cx - 30, cy - 2, cx - 16, cy - 26, cx, cy - 10);
  g.bezierCurveTo(cx + 16, cy - 26, cx + 30, cy - 2, cx, cy + 20);
  g.fill();
  // 2: sparkle star
  [cx, cy] = cell(2);
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? 28 : 7;
    g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
  // 3: ring
  [cx, cy] = cell(3);
  g.strokeStyle = '#fff';
  g.lineWidth = 5;
  g.beginPath();
  g.arc(cx, cy, 24, 0, Math.PI * 2);
  g.stroke();
  // 4: leaf
  [cx, cy] = cell(4);
  g.beginPath();
  g.ellipse(cx, cy, 10, 24, 0.6, 0, Math.PI * 2);
  g.fill();
  // 5: music note
  [cx, cy] = cell(5);
  g.font = 'bold 48px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('♪', cx, cy);
  // 6: rain streak
  [cx, cy] = cell(6);
  grd = g.createLinearGradient(cx, cy - 30, cx, cy + 30);
  grd.addColorStop(0, 'rgba(255,255,255,0)');
  grd.addColorStop(1, 'rgba(255,255,255,0.9)');
  g.fillStyle = grd;
  g.fillRect(cx - 2, cy - 30, 4, 60);
  // 7: zzz / dust puff
  [cx, cy] = cell(7);
  grd = g.createRadialGradient(cx, cy, 4, cx, cy, 30);
  grd.addColorStop(0, 'rgba(255,255,255,0.9)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.beginPath();
  g.arc(cx - 8, cy + 4, 18, 0, Math.PI * 2);
  g.arc(cx + 10, cy - 2, 16, 0, Math.PI * 2);
  g.fill();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.NoColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

// The "map" texture of the whole island:
//  R = grass amount, G = dirt path amount, B = painted shadow, A = ground height
export function makeMaskTexture(terrain, shadowShapes) {
  const S = MASK_RES;
  const data = new Uint8Array(S * S * 4);
  const scale = WORLD_SIZE / S;
  const { N, CELL, H, grass } = terrain;

  // Grass + height (sampled from the terrain grid)
  for (let y = 0; y < S; y++) {
    const z = -WORLD_HALF + (y + 0.5) * scale;
    const fz = clamp((z + WORLD_HALF) / CELL, 0, N - 1.001);
    const j = fz | 0, tz = fz - j;
    for (let x = 0; x < S; x++) {
      const wx = -WORLD_HALF + (x + 0.5) * scale;
      const fx = clamp((wx + WORLD_HALF) / CELL, 0, N - 1.001);
      const i = fx | 0, tx = fx - i;
      const kk = j * N + i;
      const g0 = grass[kk] + (grass[kk + 1] - grass[kk]) * tx;
      const g1 = grass[kk + N] + (grass[kk + N + 1] - grass[kk + N]) * tx;
      const h0 = H[kk] + (H[kk + 1] - H[kk]) * tx;
      const h1 = H[kk + N] + (H[kk + N + 1] - H[kk + N]) * tx;
      const k = (y * S + x) * 4;
      data[k] = clamp(g0 + (g1 - g0) * tz, 0, 1) * 255;
      data[k + 3] = clamp(((h0 + (h1 - h0) * tz) - HEIGHT_MIN) / HEIGHT_RANGE, 0, 1) * 255;
    }
  }

  // Dirt paths
  const stampG = (cx0, cz0, cx1, cz1, fn) => {
    const x0 = clamp(Math.floor((cx0 + WORLD_HALF) / scale), 0, S - 1), x1 = clamp(Math.ceil((cx1 + WORLD_HALF) / scale), 0, S - 1);
    const y0 = clamp(Math.floor((cz0 + WORLD_HALF) / scale), 0, S - 1), y1 = clamp(Math.ceil((cz1 + WORLD_HALF) / scale), 0, S - 1);
    for (let y = y0; y <= y1; y++) {
      const z = -WORLD_HALF + (y + 0.5) * scale;
      for (let x = x0; x <= x1; x++) {
        const wx = -WORLD_HALF + (x + 0.5) * scale;
        const v = fn(wx, z);
        const k = (y * S + x) * 4 + 1;
        if (v * 255 > data[k]) data[k] = v * 255;
      }
    }
  };
  for (const p of PATHS) {
    const half = p.w * 0.5;
    for (let s = 0; s < p.pts.length - 1; s++) {
      const [ax, az] = p.pts[s], [bx, bz] = p.pts[s + 1];
      const pad = half + 1;
      stampG(Math.min(ax, bx) - pad, Math.min(az, bz) - pad, Math.max(ax, bx) + pad, Math.max(az, bz) + pad, (x, z) => {
        const d = distToSegment(x, z, ax, az, bx, bz);
        return 1 - smoothstep(half - 0.5, half + 0.4, d);
      });
    }
  }
  const disc = (cx, cz, r) => stampG(cx - r - 1, cz - r - 1, cx + r + 1, cz + r + 1, (x, z) => 1 - smoothstep(r - 0.6, r + 0.4, Math.hypot(x - cx, z - cz)));
  disc(CAMPFIRE.x, CAMPFIRE.z, 3.6);
  disc(SHOP.x, SHOP.z + 1, 3.2);
  disc(PICNIC.x, PICNIC.z, 2.6);
  // Garden soil area
  const gw = GARDEN.cols * GARDEN.plot + (GARDEN.cols - 1) * GARDEN.gap;
  const gd = (GARDEN.rows + GARDEN.extraRows) * GARDEN.plot + (GARDEN.rows + GARDEN.extraRows - 1) * GARDEN.gap;
  const gx0 = GARDEN.x - gw / 2 - 0.8, gx1 = GARDEN.x + gw / 2 + 0.8;
  const gz0 = GARDEN.z - GARDEN.plot / 2 - 0.8, gz1 = gz0 + gd + 1.6;
  stampG(gx0 - 1, gz0 - 1, gx1 + 1, gz1 + 1, (x, z) => {
    const dx = Math.max(gx0 - x, x - gx1, 0), dz = Math.max(gz0 - z, z - gz1, 0);
    return 1 - smoothstep(0, 0.8, Math.hypot(dx, dz));
  });

  // Painted shadows: draw dark shapes on a white canvas, then copy into channel B.
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#fff';
  g.fillRect(0, 0, S, S);
  g.fillStyle = '#000';
  g.strokeStyle = '#000';
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const tx = (x) => (x + WORLD_HALF) / scale, tz = (z) => (z + WORLD_HALF) / scale;
  for (const sh of shadowShapes) {
    g.globalAlpha = sh.a ?? 1;
    if (sh.t === 'c') {
      g.beginPath();
      g.arc(tx(sh.x), tz(sh.z), sh.r / scale, 0, Math.PI * 2);
      g.fill();
    } else if (sh.t === 'e') {
      g.beginPath();
      g.ellipse(tx(sh.x), tz(sh.z), sh.rx / scale, sh.rz / scale, sh.rot || 0, 0, Math.PI * 2);
      g.fill();
    } else if (sh.t === 'p') {
      g.beginPath();
      sh.pts.forEach(([x, z], i) => (i ? g.lineTo(tx(x), tz(z)) : g.moveTo(tx(x), tz(z))));
      g.closePath();
      g.fill();
    } else if (sh.t === 'l') {
      g.lineWidth = sh.w / scale;
      g.beginPath();
      sh.pts.forEach(([x, z], i) => (i ? g.lineTo(tx(x), tz(z)) : g.moveTo(tx(x), tz(z))));
      g.stroke();
    }
  }
  g.globalAlpha = 1;
  const img = g.getImageData(0, 0, S, S).data;
  // light blur so the shadow edges are soft
  const tmp = new Uint8Array(S * S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let s = 0;
      for (let d = -1; d <= 1; d++) s += 255 - img[(y * S + clamp(x + d, 0, S - 1)) * 4];
      tmp[y * S + x] = s / 3;
    }
  }
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let s = 0;
      for (let d = -1; d <= 1; d++) s += tmp[clamp(y + d, 0, S - 1) * S + x];
      data[(y * S + x) * 4 + 2] = s / 3;
    }
  }

  // Shadows cast by the land itself (cliffs, the lighthouse headland):
  // from each spot, walk towards the sun; if the ground rises above the sun ray, it's in shadow.
  const hl = Math.hypot(SUN_DIR[0], SUN_DIR[2]);
  const dx = SUN_DIR[0] / hl, dz = SUN_DIR[2] / hl, rise = 0.95; // a lower sun than the trees use: longer, clearer cliff shadows
  const regions = [
    [PLATEAU.x - PLATEAU.rx - 2, PLATEAU.z - PLATEAU.rz - 2, PLATEAU.x + PLATEAU.rx + 8, PLATEAU.z + PLATEAU.rz + 8],
    [LIGHTHOUSE_POINT.x - LIGHTHOUSE_POINT.rx - 3, LIGHTHOUSE_POINT.z - LIGHTHOUSE_POINT.rz - 3, LIGHTHOUSE_POINT.x + LIGHTHOUSE_POINT.rx + 6, LIGHTHOUSE_POINT.z + LIGHTHOUSE_POINT.rz + 6],
  ];
  const land = new Float32Array(S * S);
  for (const [rx0, rz0, rx1, rz1] of regions) {
    const x0 = clamp(Math.floor((rx0 + WORLD_HALF) / scale), 1, S - 2), x1 = clamp(Math.ceil((rx1 + WORLD_HALF) / scale), 1, S - 2);
    const y0 = clamp(Math.floor((rz0 + WORLD_HALF) / scale), 1, S - 2), y1 = clamp(Math.ceil((rz1 + WORLD_HALF) / scale), 1, S - 2);
    for (let y = y0; y <= y1; y++) {
      const z = -WORLD_HALF + (y + 0.5) * scale;
      for (let x = x0; x <= x1; x++) {
        const wx = -WORLD_HALF + (x + 0.5) * scale;
        const h0 = Math.max(terrain.heightAt(wx, z), 0);
        let shadow = 0;
        for (let t = 0.3; t < 8; t += 0.2) {
          const over = terrain.heightAt(wx + dx * t, z + dz * t) - (h0 + rise * t);
          if (over > 0.05) { shadow = clamp(over * 2, 0, 1); break; }
        }
        land[y * S + x] = shadow;
      }
    }
    // soften (2 small blurs) so there is no striping, then merge into the shadow channel
    for (let pass = 0; pass < 2; pass++) {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const k = y * S + x;
        land[k] = (land[k] * 4 + land[k - 1] + land[k + 1] + land[k - S] + land[k + S]) / 8;
      }
    }
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const k = (y * S + x) * 4 + 2;
      const v = land[y * S + x] * 230;
      if (v > data[k]) data[k] = v;
    }
  }

  const tex = makeDataTexture(data, S, { repeat: false, mips: true });
  return { tex, data, size: S };
}

// Sample the painted shadow on the CPU (used to darken characters under trees)
export function sampleMaskShadow(mask, x, z) {
  const S = mask.size;
  const i = clamp(Math.floor(((x + WORLD_HALF) / WORLD_SIZE) * S), 0, S - 1);
  const j = clamp(Math.floor(((z + WORLD_HALF) / WORLD_SIZE) * S), 0, S - 1);
  return mask.data[(j * S + i) * 4 + 2] / 255;
}
