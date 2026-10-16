// Builds the island's height map (how high the ground is at every point).
// Think of it like a contour map: a grid of numbers, one height per grid square.
import { clamp, smoothstep, fbm, distToPolyline, distToSegment } from '../util/math.js';
import {
  WORLD_HALF, LAND_ELLIPSES, WATER_CUTS, PLATEAU, RAMP, POND, RIVER, PLATEAU_RISE,
  LIGHTHOUSE_POINT, POND_LEVEL, WATERFALL,
} from './layout.js';

export const CELL = 0.5; // grid spacing in metres
export const N = Math.round((WORLD_HALF * 2) / CELL) + 1; // grid points per side (441)

const ellipseField = (x, z, e) => 1 - Math.sqrt(((x - e.x) / e.rx) ** 2 + ((z - e.z) / e.rz) ** 2);

// 1D squared distance transform (Felzenszwalb & Huttenlocher). Used to find how far
// every grid square is from the coastline.
function edt1d(f, n, d, v, zz) {
  let k = 0;
  v[0] = 0;
  zz[0] = -1e20;
  zz[1] = 1e20;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= zz[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    zz[k] = s;
    zz[k + 1] = 1e20;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (zz[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}

// Distance (in cells) from each cell to the nearest cell where feature[i] is true.
function distanceTransform(feature, n) {
  const INF = 1e12;
  const grid = new Float64Array(n * n);
  for (let i = 0; i < n * n; i++) grid[i] = feature[i] ? 0 : INF;
  const f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), zz = new Float64Array(n + 1);
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) f[y] = grid[y * n + x];
    edt1d(f, n, d, v, zz);
    for (let y = 0; y < n; y++) grid[y * n + x] = d[y];
  }
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) f[x] = grid[y * n + x];
    edt1d(f, n, d, v, zz);
    for (let x = 0; x < n; x++) grid[y * n + x] = Math.sqrt(d[x]);
  }
  return grid;
}

export function generateTerrain() {
  const total = N * N;
  const land = new Uint8Array(total);
  const warp = new Float32Array(total);

  // 1) Which cells are land?
  for (let j = 0; j < N; j++) {
    const z = -WORLD_HALF + j * CELL;
    for (let i = 0; i < N; i++) {
      const x = -WORLD_HALF + i * CELL;
      let F = -1;
      for (const e of LAND_ELLIPSES) F = Math.max(F, ellipseField(x, z, e));
      for (const c of WATER_CUTS) F = Math.min(F, -ellipseField(x, z, c));
      const nz = fbm(x * 0.045 + 3.1, z * 0.045 - 7.7, 3, 11) - 0.5;
      warp[j * N + i] = nz;
      F += nz * 0.16;
      land[j * N + i] = F > 0 ? 1 : 0;
    }
  }

  // 2) How far is each cell from the coast? (+ on land, - in the sea)
  const sea = new Uint8Array(total);
  for (let i = 0; i < total; i++) sea[i] = land[i] ? 0 : 1;
  const toSea = distanceTransform(sea, N);
  const toLand = distanceTransform(land, N);
  const dist = new Float32Array(total);
  for (let i = 0; i < total; i++) dist[i] = (land[i] ? toSea[i] - 0.5 : -(toLand[i] - 0.5)) * CELL;
  // Smooth the distances so the coastline doesn't look like stairs.
  const tmp = new Float32Array(total);
  for (let pass = 0; pass < 2; pass++) {
    for (let j = 0; j < N; j++) for (let i = 1; i < N - 1; i++) {
      const k = j * N + i;
      tmp[k] = (dist[k - 1] + dist[k] + dist[k + 1]) / 3;
    }
    for (let j = 1; j < N - 1; j++) for (let i = 0; i < N; i++) {
      const k = j * N + i;
      dist[k] = (tmp[k - N] + tmp[k] + tmp[k + N]) / 3;
    }
  }

  // 3) Heights + how "grassy" each spot is + rockiness
  const H = new Float32Array(total);
  const grass = new Float32Array(total);
  const rock = new Float32Array(total);

  for (let j = 0; j < N; j++) {
    const z = -WORLD_HALF + j * CELL;
    for (let i = 0; i < N; i++) {
      const x = -WORLD_HALF + i * CELL;
      const k = j * N + i;
      const d = dist[k];
      const n1 = fbm(x * 0.11, z * 0.11, 3, 5);
      let h, g = 0, r = 0;

      // Wider sandy beach on the west side (Palm Beach)
      const west = smoothstep(-20, -45, x);
      const bw = 4.2 + 7 * west + (n1 - 0.5) * 3;

      if (d < 0) {
        const dd = -d;
        h = -0.1 - 0.17 * dd - 0.0075 * dd * dd;
        h = Math.max(h, -5.5);
      } else if (d < bw) {
        h = 0.04 + 0.62 * (d / bw);
      } else {
        const inland = d - bw;
        h = 0.66 + Math.min(0.4, inland * 0.05) + (n1 - 0.5) * 0.45 * smoothstep(0, 8, inland);
      }
      if (d > 0) g = smoothstep(bw - 0.6, bw + 0.6, d + (n1 - 0.5) * 2.2);

      // Forest plateau with cliffs, reached by a ramp
      let pf = ellipseField(x, z, PLATEAU) + (warp[k] * 0.12);
      const cliff = smoothstep(0.0, 0.075, pf);
      const rdx = RAMP.bx - RAMP.ax, rdz = RAMP.bz - RAMP.az;
      const rl2 = rdx * rdx + rdz * rdz;
      const rt = clamp(((x - RAMP.ax) * rdx + (z - RAMP.az) * rdz) / rl2, 0, 1);
      const rampDist = distToSegment(x, z, RAMP.ax, RAMP.az, RAMP.bx, RAMP.bz);
      const rampMask = 1 - smoothstep(RAMP.width * 0.5, RAMP.width * 0.5 + 5.5, rampDist); // gentle grassy sides
      const rampRise = smoothstep(0, 1, rt);
      const rise = Math.max(cliff, rampRise * rampMask) ;
      // cliffs stay a few metres back from the sea (a beach at their feet),
      // except at the waterfall where they drop straight into the pool
      const nearFall = smoothstep(7, 4, Math.abs(z - WATERFALL.z)) * smoothstep(42, 46, x);
      const coastFade = Math.max(smoothstep(1.5, 4.5, d), nearFall);
      if (d > 0) h += PLATEAU_RISE * rise * coastFade;
      // the plateau top must stay above the pond so the stream never floods the grass
      if (d > 0) h = Math.max(h, (POND_LEVEL + 0.42 + (n1 - 0.5) * 0.2) * smoothstep(0.035, 0.075, pf) * coastFade);
      if (cliff > 0.5) g = Math.max(g, 1);

      // Pond bowl + river channel on top of the plateau
      const pd = Math.sqrt(((x - POND.x) / POND.rx) ** 2 + ((z - POND.z) / POND.rz) ** 2);
      if (pd < 1.35) {
        const bowl = POND.bottom + (h - POND.bottom) * smoothstep(0.45, 1.3, pd);
        if (bowl < h) h = bowl;
        if (pd < 1.12) g = Math.min(g, smoothstep(0.95, 1.12, pd));
      }
      const rd = distToPolyline(x, z, RIVER.pts) + (n1 - 0.5) * 1.4;
      if (rd < RIVER.width * 1.4 && cliff > 0.3) {
        const bed = RIVER.bottom + (h - RIVER.bottom) * smoothstep(RIVER.width * 0.4, RIVER.width * 0.95, rd);
        if (bed < h) h = bed;
        if (rd < RIVER.width) g = Math.min(g, smoothstep(RIVER.width * 0.65, RIVER.width, rd));
      }

      // Lighthouse point: a raised rocky headland
      const lp = ellipseField(x, z, LIGHTHOUSE_POINT);
      if (lp > -0.2 && d > 0) {
        const lift = LIGHTHOUSE_POINT.rise * smoothstep(-0.05, 0.4, lp) * smoothstep(0, 3, d);
        h += lift;
        g = Math.max(g, smoothstep(0.12, 0.3, lp + (n1 - 0.5) * 0.3));
      }

      H[k] = h;
      grass[k] = g;
      rock[k] = r;
    }
  }

  const terrain = {
    N, CELL, H, grass, rock, dist, land,
    // Smoothly interpolated ground height at any (x, z)
    heightAt(x, z) {
      const fx = clamp((x + WORLD_HALF) / CELL, 0, N - 1.001);
      const fz = clamp((z + WORLD_HALF) / CELL, 0, N - 1.001);
      const i = fx | 0, j = fz | 0;
      const tx = fx - i, tz = fz - j;
      const k = j * N + i;
      const a = H[k], b = H[k + 1], c = H[k + N], e = H[k + N + 1];
      return (a + (b - a) * tx) * (1 - tz) + (c + (e - c) * tx) * tz;
    },
    sampleGrid(arr, x, z) {
      const fx = clamp((x + WORLD_HALF) / CELL, 0, N - 1.001);
      const fz = clamp((z + WORLD_HALF) / CELL, 0, N - 1.001);
      const i = fx | 0, j = fz | 0;
      const tx = fx - i, tz = fz - j;
      const k = j * N + i;
      const a = arr[k], b = arr[k + 1], c = arr[k + N], e = arr[k + N + 1];
      return (a + (b - a) * tx) * (1 - tz) + (c + (e - c) * tx) * tz;
    },
    distAt(x, z) {
      return terrain.sampleGrid(dist, x, z);
    },
    // Ground slope (rise over run) — cliffs are steep.
    slopeAt(x, z) {
      const e = 0.5;
      const dx = terrain.heightAt(x + e, z) - terrain.heightAt(x - e, z);
      const dz = terrain.heightAt(x, z + e) - terrain.heightAt(x, z - e);
      return Math.hypot(dx, dz) / (2 * e);
    },
    // Is (x,z) inside the pond / river on the plateau?
    inPond(x, z) {
      return terrain.heightAt(x, z) < POND_LEVEL - 0.05 && terrain.heightAt(x, z) > 2.2 &&
        ellipseField(x, z, PLATEAU) > -0.05;
    },
  };
  return terrain;
}
