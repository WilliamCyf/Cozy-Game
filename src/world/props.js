// Everything that stands on the island: trees, houses, docks, rocks, flowers…
// Each builder adds shapes to the merged world mesh, and also records:
//   shadows    - shapes painted onto the ground as shadows
//   colliders  - places you can't walk through
//   surfaces   - raised floors you CAN walk on (docks, bridge)
import * as THREE from 'three';
import { box, cylinder, blob, palmFrond, grassTuft, flowerPetals, spikyCone, prism, ring, M, hex, shade, mix3 } from '../render/geo.js';
import { mulberry32, clamp, TAU } from '../util/math.js';
import * as L from './layout.js';

const C = {
  woodL: hex('#dcae7c'), woodM: hex('#c08b5c'), woodD: hex('#8d5d3b'), woodX: hex('#a87348'),
  plankA: hex('#d6a676'), plankB: hex('#c79563'), plankC: hex('#e2b98d'),
  roofA: hex('#b5654a'), roofB: hex('#c4775a'), roofC: hex('#e8b487'),
  wall: hex('#b9734f'), wallD: hex('#9c5e3f'), trim: hex('#7a4a30'),
  door: hex('#4f84b6'), glass: hex('#5aa0d0'),
  stone: hex('#cdd1d6'), stoneD: hex('#a7adb6'), stoneW: hex('#eef0ee'),
  trunk: hex('#a8784e'), trunkD: hex('#8b5e3b'),
  frond: hex('#76c43f'), frondD: hex('#5aa833'), frondL: hex('#93d653'),
  pine: hex('#3f8f47'), pineD: hex('#2e7740'), pineL: hex('#58a653'),
  leaf: hex('#5fb048'), leafD: hex('#4a9a3c'),
  bush: hex('#4e9f3e'), bushD: hex('#3e8a35'),
  grass: hex('#86c64a'), grassD: hex('#6aae3c'),
  coconut: hex('#7a5232'),
  rope: hex('#e6cf9a'), sack: hex('#eadcb8'),
  red: hex('#e0574a'), white: hex('#fbf6ec'), yellow: hex('#f5cf4a'), blue: hex('#5d8fd8'),
  crystal: hex('#7fd8ff'), lamp: hex('#ffd77a'), metal: hex('#5b5f66'),
};
export const COLORS = C;

export function createPropContext(terrain, builder) {
  return { terrain, B: builder, shadows: [], colliders: [], surfaces: [], lights: [], perches: [], palms: [], rand: mulberry32(1234) };
}

const ground = (ctx, x, z) => ctx.terrain.heightAt(x, z);
const shiftX = (h) => h * L.SHADOW_SHIFT[0];
const shiftZ = (h) => h * L.SHADOW_SHIFT[1];
const UP = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion(), _d = new THREE.Vector3();

// Matrix that stands a shape (built along +y) on point a, pointing at point b.
function between(a, b, scaleXZ = 1) {
  _d.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = _d.length();
  _q.setFromUnitVectors(UP, _d.normalize());
  return { m: new THREE.Matrix4().compose(new THREE.Vector3(a[0], a[1], a[2]), _q, new THREE.Vector3(scaleXZ, 1, scaleXZ)), len };
}

// ---------------------------------------------------------------- trees
export function palm(ctx, x, z, seed, opts = {}) {
  const r = mulberry32(seed * 7919 + 13);
  const by = ground(ctx, x, z) - 0.15;
  const height = (opts.height || 5.0) + r() * 1.6;
  // lean towards the sea, like real palms
  const e = 1.5;
  let lx = ctx.terrain.distAt(x - e, z) - ctx.terrain.distAt(x + e, z);
  let lz = ctx.terrain.distAt(x, z - e) - ctx.terrain.distAt(x, z + e);
  const ll = Math.hypot(lx, lz) || 1;
  lx = lx / ll + (r() - 0.5) * 0.6;
  lz = lz / ll + (r() - 0.5) * 0.6;
  const lean = 1.0 + r() * 1.4;
  const SEG = 7;
  const pts = [];
  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG;
    pts.push([x + lx * lean * t * t, by + height * t, z + lz * lean * t * t]);
  }
  const swayFn = (wy) => clamp((wy - by) / height, 0, 1) ** 1.6 * 1.3;
  const B = ctx.B.at(x, z);
  for (let i = 0; i < SEG; i++) {
    const rb = 0.3 - i * 0.017, rt = rb - 0.07;
    const { m, len } = between(pts[i], pts[i + 1]);
    B.add(cylinder(rt, rb, len * 1.04, 7, { top: false }), m, i % 2 ? C.trunk : C.trunkD, { sway: swayFn, recv: 1 });
  }
  const T = pts[SEG];
  const fronds = 8 + Math.floor(r() * 2);
  const leaf = [];
  for (let i = 0; i < fronds; i++) {
    const yaw = (i / fronds) * TAU + r() * 0.5;
    const len = 2.7 + r() * 0.9;
    const prim = palmFrond(len, 0.8 + r() * 0.2, 1.0 + r() * 0.8, seed * 31 + i);
    const pitch = -0.15 + r() * 0.3;
    const col = i % 3 === 0 ? C.frondL : i % 3 === 1 ? C.frond : C.frondD;
    const m = M(T[0], T[1] + 0.05, T[2], yaw, pitch);
    B.add(prim, m, col, { sway: swayFn, recv: 0 });
    // shadow outline of this frond (spine + jagged leaflets), shifted by height
    const tipDir = [Math.sin(yaw), Math.cos(yaw)];
    const side = [Math.cos(yaw), -Math.sin(yaw)];
    const left = [], right = [];
    for (let s = 0; s <= 12; s++) {
      const t = s / 12;
      const along = t * len;
      const hy = T[1] - t * t * 1.4;
      const w = (0.85 * Math.sin(Math.min(1, t * 1.15) * Math.PI)) * (s % 2 ? 1 : 0.35);
      const cx = T[0] + tipDir[0] * along, cz = T[2] + tipDir[1] * along;
      const hh = hy - by;
      left.push([cx + side[0] * w + shiftX(hh), cz + side[1] * w + shiftZ(hh)]);
      right.push([cx - side[0] * w + shiftX(hh), cz - side[1] * w + shiftZ(hh)]);
    }
    leaf.push({ t: 'p', pts: [...left, ...right.reverse()], a: 0.9 });
  }
  // coconuts are drawn separately (they disappear when shaken down)
  const coco = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + r();
    coco.push([T[0] + Math.cos(a) * 0.26, T[1] - 0.18, T[2] + Math.sin(a) * 0.26]);
  }
  ctx.shadows.push(...leaf);
  ctx.shadows.push({ t: 'l', w: 0.45, a: 0.85, pts: pts.map((p) => [p[0] + shiftX(p[1] - by), p[2] + shiftZ(p[1] - by)]) });
  ctx.colliders.push({ t: 'c', x, z, r: 0.45 });
  const palmInfo = { x, z, top: T, id: ctx.palms.length, coco, sway: swayFn(T[1]) };
  ctx.palms.push(palmInfo);
  return palmInfo;
}

export function pine(ctx, x, z, seed) {
  const r = mulberry32(seed * 104729 + 7);
  const by = ground(ctx, x, z) - 0.1;
  const s = 0.85 + r() * 0.45;
  const B = ctx.B.at(x, z);
  B.add(cylinder(0.2 * s, 0.3 * s, 1.8 * s, 6), M(x, by, z), C.trunkD, { recv: 1 });
  const layers = 4;
  const swayFn = (wy) => clamp((wy - by) / (7 * s), 0, 1) * 0.5;
  for (let k = 0; k < layers; k++) {
    const rad = (2.3 - k * 0.48) * s;
    const h = (2.3 - k * 0.2) * s;
    const y = by + (1.2 + k * 1.15) * s;
    const col = k % 2 ? C.pine : (k === layers - 1 ? C.pineL : C.pineD);
    B.add(spikyCone(rad, h, 8, 0.7, seed * 13 + k), M(x, y, z, r() * TAU), col, { sway: swayFn, recv: 0 });
  }
  const hh = 3.5 * s;
  ctx.shadows.push({ t: 'c', x: x + shiftX(hh), z: z + shiftZ(hh), r: 1.9 * s, a: 0.95 });
  ctx.shadows.push({ t: 'c', x: x + shiftX(hh * 1.6), z: z + shiftZ(hh * 1.6), r: 1.2 * s, a: 0.95 });
  ctx.colliders.push({ t: 'c', x, z, r: 0.6 });
}

export function roundTree(ctx, x, z, seed) {
  const r = mulberry32(seed * 3571 + 3);
  const by = ground(ctx, x, z) - 0.1;
  const B = ctx.B.at(x, z);
  const s = 0.9 + r() * 0.3;
  B.add(cylinder(0.22 * s, 0.34 * s, 2.6 * s, 6), M(x, by, z), C.trunk, { recv: 1 });
  const swayFn = (wy) => clamp((wy - by) / (5 * s), 0, 1) * 0.45;
  const parts = [[0, 3.6, 0, 1.6], [0.9, 3.2, 0.4, 1.15], [-0.8, 3.3, -0.3, 1.2], [0.2, 4.4, -0.2, 1.1]];
  parts.forEach(([dx, dy, dz, rr], i) => {
    B.add(blob(rr * s, 1, 0.12, seed + i), M(x + dx * s, by + dy * s, z + dz * s), i % 2 ? C.leaf : C.leafD, { sway: swayFn, recv: 0 });
  });
  const hh = 3.6 * s;
  ctx.shadows.push({ t: 'e', x: x + shiftX(hh), z: z + shiftZ(hh), rx: 2.2 * s, rz: 1.9 * s, a: 0.95 });
  ctx.colliders.push({ t: 'c', x, z, r: 0.6 });
}

export function bush(ctx, x, z, seed, color = C.bush, size = 1) {
  const by = ground(ctx, x, z);
  const B = ctx.B.at(x, z);
  B.add(blob(1.0 * size, 1, 0.14, seed, 0.78), M(x, by + 0.55 * size, z), color, { sway: 0.15, recv: 0.4 });
  B.add(blob(0.65 * size, 1, 0.14, seed + 9, 0.8), M(x + 0.55 * size, by + 0.42 * size, z + 0.35 * size), shade(color, 1.08), { sway: 0.15, recv: 0.4 });
  ctx.shadows.push({ t: 'e', x: x + shiftX(0.7 * size), z: z + shiftZ(0.7 * size), rx: 1.15 * size, rz: 1.0 * size, a: 0.85 });
  ctx.colliders.push({ t: 'c', x, z, r: 1.0 * size });
}

export function rock(ctx, x, z, size, seed) {
  const by = ground(ctx, x, z);
  const B = ctx.B.at(x, z);
  const r = mulberry32(seed);
  B.add(blob(size, 1, 0.22, seed, 0.62), M(x, by + size * 0.15, z, r() * TAU), mix3(C.stone, C.stoneD, r() * 0.4), { recv: 0.6 });
  if (r() > 0.4) {
    B.add(blob(size * 0.5, 1, 0.2, seed + 3, 0.7), M(x + size * 0.8, by, z + size * 0.4, r() * TAU), C.stoneD, { recv: 0.6 });
  }
  ctx.shadows.push({ t: 'e', x: x + shiftX(size * 0.5), z: z + shiftZ(size * 0.5), rx: size * 1.05, rz: size * 0.9, a: 0.8 });
  if (by > -0.3) ctx.colliders.push({ t: 'c', x, z, r: size * 0.85 });
}

// ---------------------------------------------------------------- ground cover
export function scatterGroundCover(ctx, blockers) {
  const { terrain } = ctx;
  const r = mulberry32(777);
  const blocked = (x, z, pad) => {
    for (const c of blockers) {
      if (c.t === 'c' && Math.hypot(x - c.x, z - c.z) < c.r + pad) return true;
      if (c.t === 'r' && x > c.x0 - pad && x < c.x1 + pad && z > c.z0 - pad && z < c.z1 + pad) return true;
    }
    return false;
  };
  const onPath = (x, z) => {
    for (const p of L.PATHS) {
      for (let s = 0; s < p.pts.length - 1; s++) {
        const [ax, az] = p.pts[s], [bx, bz] = p.pts[s + 1];
        const dx = bx - ax, dz = bz - az;
        const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1);
        if (Math.hypot(ax + dx * t - x, az + dz * t - z) < p.w * 0.5 + 0.4) return true;
      }
    }
    return false;
  };
  const grassAt = (x, z) => terrain.sampleGrid(terrain.grass, x, z);
  // grass tufts
  let tufts = 0;
  for (let i = 0; i < 9000 && tufts < 1700; i++) {
    const x = -70 + r() * 145, z = -55 + r() * 95;
    const g = grassAt(x, z);
    if (g < 0.8 || terrain.slopeAt(x, z) > 0.45) continue;
    if (onPath(x, z) || blocked(x, z, 0.3)) continue;
    const h = terrain.heightAt(x, z);
    if (h < 0.5 || (h > 2.5 && h < 4.3)) continue;
    const s = 0.7 + r() * 0.7;
    const col = r() > 0.5 ? C.grass : C.grassD;
    ctx.B.at(x, z).add(grassTuft(0.42 * s, 3 + Math.floor(r() * 3), i), M(x, h - 0.02, z, r() * TAU), col, { sway: (wy) => clamp((wy - h) * 2, 0, 1) * 0.6, recv: 1, outline: false });
    tufts++;
  }
  // beach grass on sand edges
  for (let i = 0; i < 2500; i++) {
    const x = -70 + r() * 145, z = -55 + r() * 95;
    const d = terrain.distAt(x, z), g = grassAt(x, z);
    if (d < 2 || g > 0.5 || g < 0.05 || onPath(x, z) || blocked(x, z, 0.3)) continue;
    const h = terrain.heightAt(x, z);
    ctx.B.at(x, z).add(grassTuft(0.5, 5, i + 9000), M(x, h - 0.02, z, r() * TAU), hex('#9cc760'), { sway: (wy) => clamp((wy - h) * 2, 0, 1) * 0.6, recv: 1, outline: false });
  }
  // flower patches
  const flowerCols = [C.white, C.white, C.white, hex('#ffd6e8'), hex('#fff1a8'), hex('#cbb6ff'), hex('#ffb3c7')];
  for (let pidx = 0; pidx < 70; pidx++) {
    const cx = -60 + r() * 115, cz = -45 + r() * 80;
    if (grassAt(cx, cz) < 0.9) continue;
    const col = flowerCols[Math.floor(r() * flowerCols.length)];
    const n = 5 + Math.floor(r() * 12);
    for (let k = 0; k < n; k++) {
      const x = cx + (r() - 0.5) * 4, z = cz + (r() - 0.5) * 4;
      if (grassAt(x, z) < 0.85 || onPath(x, z) || blocked(x, z, 0.2)) continue;
      const h = terrain.heightAt(x, z);
      const s = 0.8 + r() * 0.5;
      const B = ctx.B.at(x, z);
      B.add(flowerPetals(0.15 * s), M(x, h + 0.1, z, r() * TAU, (r() - 0.5) * 0.4), col, { recv: 1, outline: false, sway: 0.25 });
      B.add(box(0.06, 0.04, 0.06), M(x, h + 0.13, z), C.yellow, { recv: 1, outline: false, sway: 0.25 });
    }
  }
}

// ---------------------------------------------------------------- docks
function plankFloor(ctx, x0, x1, z0, z1, y, seed, alongX = true) {
  const r = mulberry32(seed);
  const cols = [C.plankA, C.plankB, C.plankC, C.plankA, C.woodX];
  const step = 0.5;
  if (alongX) {
    for (let z = z0; z < z1 - 0.01; z += step) {
      // each row is made of 1-2 boards of random length
      let x = x0;
      while (x < x1 - 0.01) {
        const len = Math.min(x1 - x, 2.5 + r() * 5);
        const cx = x + len / 2, cz = z + step / 2;
        ctx.B.at(cx, cz).add(box(len - 0.04, 0.14, step - 0.05), M(cx, y - 0.07, cz, 0, 0, (r() - 0.5) * 0.01), cols[Math.floor(r() * cols.length)], { recv: 1, outline: false });
        x += len;
      }
    }
  } else {
    for (let x = x0; x < x1 - 0.01; x += step) {
      let z = z0;
      while (z < z1 - 0.01) {
        const len = Math.min(z1 - z, 2.5 + r() * 5);
        const cx = x + step / 2, cz = z + len / 2;
        ctx.B.at(cx, cz).add(box(step - 0.05, 0.14, len - 0.04), M(cx, y - 0.07, cz), cols[Math.floor(r() * cols.length)], { recv: 1, outline: false });
        z += len;
      }
    }
  }
  // under-beam so the floor looks thick, plus outline
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  ctx.B.at(cx, cz).add(box(x1 - x0, 0.3, z1 - z0), M(cx, y - 0.29, cz), C.woodD, { recv: 0.5 });
}

function post(ctx, x, z, topY, r = 0.17, cap = true) {
  const by = Math.min(ground(ctx, x, z), -0.2) - 1.5;
  const B = ctx.B.at(x, z);
  B.add(cylinder(r, r * 1.05, topY - by, 7), M(x, by, z), C.woodD, { recv: 1 });
  if (cap) B.add(cylinder(r * 0.6, r * 1.02, 0.12, 7), M(x, topY, z), C.woodM, { recv: 1 });
}

export function cottage(ctx) {
  const D = L.COTTAGE.deck, y = D.y;
  plankFloor(ctx, D.x0, D.x1, D.z0, D.z1, y, 41, true);
  ctx.surfaces.push({ x0: D.x0, x1: D.x1, z0: D.z0, z1: D.z1, y, kind: 'wood' });
  ctx.shadows.push({ t: 'p', a: 0.75, pts: [[D.x0 + 0.4, D.z1], [D.x1 + 0.4, D.z1], [D.x1 + 0.4, D.z0 + 0.4], [D.x1, D.z0 + 0.4], [D.x1, D.z1 + 0.5], [D.x0 + 0.4, D.z1 + 0.5]] });
  // posts around the edge (some stick up as little bollards)
  for (let x = D.x0 + 0.2; x <= D.x1 - 0.1; x += 3.2) {
    post(ctx, x, D.z1 - 0.15, y + 0.42);
    ctx.colliders.push({ t: 'c', x, z: D.z1 - 0.15, r: 0.2 });
  }
  for (let z = D.z0 + 3; z <= D.z1 - 0.2; z += 3.4) {
    post(ctx, D.x0 + 0.15, z, y + 0.42);
    post(ctx, D.x1 - 0.15, z, y + 0.42);
  }

  // the house
  const { x: hx, z: hz, w, d } = L.COTTAGE;
  const B = ctx.B.at(hx, hz);
  const wallH = 3.1;
  B.add(box(w, wallH, d), M(hx, y + wallH / 2, hz), C.wall, { recv: 0.5 });
  // horizontal boards on the front
  for (let k = 0; k < 6; k++) {
    B.add(box(w + 0.04, 0.06, 0.04), M(hx, y + 0.35 + k * 0.5, hz + d / 2 + 0.01), C.wallD, { recv: 0.5, outline: false });
  }
  // corner posts
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    B.add(box(0.28, wallH + 0.05, 0.28), M(hx + sx * (w / 2), y + wallH / 2, hz + sz * (d / 2)), C.trim, { recv: 0.5 });
  }
  // gable + roof (ridge runs north-south so the pointy end faces the camera)
  const roofH = 2.0, over = 0.55;
  B.add(prism(w, roofH, d), M(hx, y + wallH, hz), C.wall, { recv: 0.3 });
  const halfW = w / 2 + over;
  const drop = halfW * (roofH / (w / 2));
  const slopeLen = Math.hypot(halfW, drop);
  const ang = Math.atan2(roofH, w / 2);
  const roofCols = [C.roofA, C.roofA, C.roofB, C.roofC, C.roofA, C.roofB];
  const rr = mulberry32(5);
  const plankW = 0.62;
  for (const side of [-1, 1]) {
    for (let zz = -d / 2 - over; zz < d / 2 + over - 0.01; zz += plankW) {
      const cx = hx + side * (halfW / 2) - side * Math.sin(ang) * 0.1;
      const cy = y + wallH + roofH - drop / 2 + Math.cos(ang) * 0.1;
      const col = roofCols[Math.floor(rr() * roofCols.length)];
      B.add(box(slopeLen, 0.18, plankW - 0.04), M(cx, cy, hz + zz + plankW / 2, 0, 0, -side * ang), col, { recv: 0 });
    }
  }
  B.add(box(0.35, 0.3, d + over * 2 + 0.1), M(hx, y + wallH + roofH + 0.12, hz), C.roofC, { recv: 0 });
  // door + round window + lamp
  B.add(box(1.25, 2.1, 0.14), M(hx - 1.2, y + 1.05, hz + d / 2 + 0.05), C.door, { recv: 0.6 });
  B.add(box(1.5, 0.16, 0.18), M(hx - 1.2, y + 2.15, hz + d / 2 + 0.06), C.trim, { recv: 0.6 });
  B.add(box(0.12, 0.12, 0.08), M(hx - 0.75, y + 1.05, hz + d / 2 + 0.14), C.metal, { recv: 0.6, outline: false });
  B.add(cylinder(0.48, 0.48, 0.12, 12), M(hx, y + wallH + 0.75, hz + d / 2 + 0.02, 0, Math.PI / 2), C.trim, { recv: 0.3 });
  B.add(cylinder(0.36, 0.36, 0.14, 12), M(hx, y + wallH + 0.75, hz + d / 2 + 0.04, 0, Math.PI / 2), C.glass, { recv: 0.3, glow: 0.7 });
  B.add(box(1.4, 1.1, 0.14), M(hx + 2.0, y + 1.7, hz + d / 2 + 0.05), C.glass, { recv: 0.4, glow: 0.8 });
  B.add(box(1.6, 0.14, 0.22), M(hx + 2.0, y + 1.1, hz + d / 2 + 0.08), C.trim, { recv: 0.4 });
  lanternBox(ctx, hx - 0.25, y + 2.1, hz + d / 2 + 0.25);
  // chimney
  B.add(box(0.7, 1.6, 0.7), M(hx + 1.8, y + wallH + 1.8, hz - 1.2), hex('#8f8a86'), { recv: 0 });
  B.add(box(0.85, 0.2, 0.85), M(hx + 1.8, y + wallH + 2.65, hz - 1.2), hex('#6d6764'), { recv: 0 });
  // lean-to porch roof on the east side
  for (let zz = -d / 2; zz < d / 2 + 2.6; zz += 0.6) {
    B.add(box(3.4, 0.14, 0.56), M(hx + w / 2 + 1.6, y + 2.75, hz + zz + 0.3, 0, 0, -0.2), rr() > 0.75 ? C.roofC : C.plankB, { recv: 0 });
  }
  for (const zz of [hz - d / 2 + 0.3, hz + d / 2 + 2.3]) {
    B.add(box(0.2, 2.5, 0.2), M(hx + w / 2 + 3.1, y + 1.25, zz), C.woodD, { recv: 0.5 });
  }
  ctx.colliders.push({ t: 'c', x: hx + w / 2 + 3.1, z: hz - d / 2 + 0.3, r: 0.25 }, { t: 'c', x: hx + w / 2 + 3.1, z: hz + d / 2 + 2.3, r: 0.25 });
  // house shadow (the roof is tall, so it casts a long shadow)
  const sh = (hgt) => [shiftX(hgt), shiftZ(hgt)];
  const [s1x, s1z] = sh(wallH + 0.2), [s2x, s2z] = sh(wallH + roofH);
  ctx.shadows.push({ t: 'p', a: 1, pts: [
    [hx - w / 2 - over, hz - d / 2 - over], [hx - w / 2 - over + s1x, hz - d / 2 - over + s1z],
    [hx + s2x, hz - d / 2 - over + s2z], [hx + w / 2 + over + s1x, hz - d / 2 - over + s1z],
    [hx + w / 2 + over + s1x, hz + d / 2 + over + s1z], [hx + s2x, hz + d / 2 + over + s2z],
    [hx - w / 2 - over + s1x, hz + d / 2 + over + s1z], [hx - w / 2 - over, hz + d / 2 + over],
  ] });
  ctx.shadows.push({ t: 'p', a: 0.85, pts: [[hx + w / 2, hz - d / 2], [hx + w / 2 + 3.4 + shiftX(2.7), hz - d / 2 + shiftZ(2.7)], [hx + w / 2 + 3.4 + shiftX(2.7), hz + d / 2 + 2.6 + shiftZ(2.7)], [hx + w / 2, hz + d / 2 + 2.6]] });
  ctx.colliders.push({ t: 'r', x0: hx - w / 2 - 0.15, x1: hx + w / 2 + 0.15, z0: hz - d / 2 - 0.15, z1: hz + d / 2 + 0.15 });

  // deck clutter: sacks, rope, bench, barrel, fishing net
  const sx = hx - w / 2 + 0.2, szz = hz + d / 2 + 0.8;
  for (const [dx, dz, s] of [[0, 0, 1], [0.7, 0.25, 0.9], [0.25, 0.8, 0.85]]) {
    B.add(blob(0.45 * s, 1, 0.08, 3 + dx * 10, 0.85), M(sx + dx, y + 0.38 * s, szz + dz), C.sack, { recv: 1 });
  }
  ctx.colliders.push({ t: 'c', x: sx + 0.35, z: szz + 0.35, r: 0.8 });
  B.add(ring(0.42, 0.08, 14, 5), M(hx - 0.5, y + 0.08, hz + d / 2 + 4.6), C.rope, { recv: 1 });
  B.add(ring(0.28, 0.07, 12, 5), M(hx - 0.5, y + 0.18, hz + d / 2 + 4.6), C.rope, { recv: 1 });
  B.add(box(1.8, 0.12, 0.5), M(hx + 0.6, y + 0.5, hz + d / 2 + 0.55), C.woodM, { recv: 1 });
  B.add(box(0.12, 0.45, 0.4), M(hx - 0.2, y + 0.22, hz + d / 2 + 0.55), C.woodD, { recv: 1 });
  B.add(box(0.12, 0.45, 0.4), M(hx + 1.4, y + 0.22, hz + d / 2 + 0.55), C.woodD, { recv: 1 });
  ctx.colliders.push({ t: 'r', x0: hx - 0.4, x1: hx + 1.6, z0: hz + d / 2 + 0.25, z1: hz + d / 2 + 0.85 });
  // fishing net draped over the front edge
  for (let k = 0; k < 8; k++) {
    B.add(box(0.04, 0.04, 0.9), M(D.x1 - 4.2 + k * 0.45, y - 0.15, D.z1 + 0.15, 0, 0.9), C.rope, { recv: 1, outline: false });
  }
  B.add(box(3.6, 0.04, 0.04), M(D.x1 - 2.6, y - 0.03, D.z1 + 0.02), C.rope, { recv: 1, outline: false });
  B.add(box(3.6, 0.04, 0.04), M(D.x1 - 2.6, y - 0.4, D.z1 + 0.32), C.rope, { recv: 1, outline: false });
  // little stack of crates on the east of the deck
  B.add(box(0.9, 0.8, 0.9), M(hx + w / 2 + 1.5, y + 0.4, hz + 2.6, 0.2), C.woodL, { recv: 1 });
  B.add(box(0.7, 0.6, 0.7), M(hx + w / 2 + 1.55, y + 1.1, hz + 2.6, 0.5), C.plankB, { recv: 1 });
  ctx.colliders.push({ t: 'c', x: hx + w / 2 + 1.5, z: hz + 2.6, r: 0.7 });
  ctx.lights.push([hx - 0.25, y + 2.1, hz + d / 2 + 0.3, 1.0]);
}

export function lanternBox(ctx, x, y, z) {
  const B = ctx.B.at(x, z);
  B.add(box(0.26, 0.34, 0.26), M(x, y, z), C.lamp, { recv: 0, glow: 1 });
  B.add(box(0.34, 0.06, 0.34), M(x, y + 0.2, z), C.metal, { recv: 0 });
  B.add(box(0.3, 0.05, 0.3), M(x, y - 0.19, z), C.metal, { recv: 0 });
}

export function lanternPost(ctx, x, z, y0 = null) {
  const by = y0 ?? ground(ctx, x, z);
  const B = ctx.B.at(x, z);
  B.add(cylinder(0.08, 0.1, 2.0, 6), M(x, by, z), C.woodD, { recv: 1 });
  B.add(box(0.5, 0.06, 0.08), M(x + 0.18, by + 2.0, z), C.woodD, { recv: 1 });
  lanternBox(ctx, x + 0.38, by + 1.78, z);
  ctx.lights.push([x + 0.38, by + 1.78, z, 1.0]);
  ctx.colliders.push({ t: 'c', x, z, r: 0.25 });
  ctx.shadows.push({ t: 'l', w: 0.15, a: 0.7, pts: [[x, z], [x + shiftX(2), z + shiftZ(2)]] });
}

export function pier(ctx) {
  const P = L.PIER, y = P.y;
  const x0 = P.x - P.w / 2, x1 = P.x + P.w / 2;
  plankFloor(ctx, x0, x1, P.z0, P.end.z0, y, 71, true);
  plankFloor(ctx, P.end.x0, P.end.x1, P.end.z0, P.end.z1, y, 72, true);
  ctx.surfaces.push({ x0, x1, z0: P.z0, z1: P.end.z0 + 0.1, y, kind: 'wood' });
  ctx.surfaces.push({ x0: P.end.x0, x1: P.end.x1, z0: P.end.z0, z1: P.end.z1, y, kind: 'wood' });
  for (let z = P.z0 + 4; z < P.end.z0; z += 4.5) {
    post(ctx, x0 - 0.05, z, y + 0.5);
    post(ctx, x1 + 0.05, z, y + 0.5);
    ctx.perches.push([x1 + 0.05, y + 0.62, z]);
  }
  for (const [px, pz] of [[P.end.x0 + 0.1, P.end.z0 + 0.1], [P.end.x1 - 0.1, P.end.z0 + 0.1], [P.end.x0 + 0.1, P.end.z1 - 0.1], [P.end.x1 - 0.1, P.end.z1 - 0.1]]) {
    post(ctx, px, pz, y + 0.55, 0.2);
    ctx.perches.push([px, y + 0.7, pz]);
    ctx.colliders.push({ t: 'c', x: px, z: pz, r: 0.25 });
  }
  ctx.shadows.push({ t: 'p', a: 0.75, pts: [[x1, P.z0 + 4], [x1 + 0.45, P.z0 + 4.5], [x1 + 0.45, P.end.z0 + 0.4], [x1, P.end.z0]] });
  ctx.shadows.push({ t: 'p', a: 0.75, pts: [[P.end.x0, P.end.z1], [P.end.x1, P.end.z1], [P.end.x1 + 0.45, P.end.z1 + 0.5], [P.end.x1 + 0.45, P.end.z0 + 0.5], [P.end.x1, P.end.z0]] });
  const B = ctx.B.at(P.x, P.end.z0);
  // lobster trap + crate + lanterns at the end
  B.add(box(1.0, 0.5, 0.7), M(P.end.x0 + 1.2, y + 0.25, P.end.z0 + 1.2), C.woodL, { recv: 1 });
  for (let k = 0; k < 4; k++) B.add(box(1.02, 0.04, 0.04), M(P.end.x0 + 1.2, y + 0.12 + k * 0.12, P.end.z0 + 1.56), C.woodD, { recv: 1, outline: false });
  ctx.colliders.push({ t: 'c', x: P.end.x0 + 1.2, z: P.end.z0 + 1.2, r: 0.65 });
  B.add(box(0.9, 0.8, 0.9), M(P.end.x1 - 1.4, y + 0.4, P.end.z1 - 1.5, 0.3), C.woodM, { recv: 1 });
  ctx.colliders.push({ t: 'c', x: P.end.x1 - 1.4, z: P.end.z1 - 1.5, r: 0.7 });
  lanternPost(ctx, P.end.x0 + 0.5, P.end.z1 - 0.5, y);
  lanternPost(ctx, P.end.x1 - 0.9, P.end.z0 + 0.4, y);
  // bench to sit and fish
  bench(ctx, P.x, y, P.z0 + 14, Math.PI / 2, true);
}

export function bench(ctx, x, y, z, rot = 0, onDeck = false) {
  const by = onDeck ? y : ground(ctx, x, z);
  const B = ctx.B.at(x, z);
  const c = Math.cos(rot), s = Math.sin(rot);
  B.add(box(1.8, 0.1, 0.5), M(x, by + 0.48, z, rot), C.woodM, { recv: 1 });
  for (const k of [-0.7, 0.7]) B.add(box(0.12, 0.46, 0.42), M(x + c * k, by + 0.23, z - s * k, rot), C.woodD, { recv: 1 });
  ctx.colliders.push({ t: 'c', x: x + c * 0.5, z: z - s * 0.5, r: 0.4 }, { t: 'c', x: x - c * 0.5, z: z + s * 0.5, r: 0.4 });
}

export function boatMesh(builder) {
  // builds a rowboat into a separate builder (it bobs on the water)
  const B = builder;
  const hull = C.woodM, dark = C.woodD, inner = C.plankC;
  B.add(box(1.5, 0.25, 4.2), M(0, -0.05, 0), dark, { recv: 0 });
  for (const sx of [-1, 1]) {
    B.add(box(0.14, 0.7, 4.3), M(sx * 0.8, 0.25, 0, 0, 0, sx * 0.3), hull, { recv: 0 });
  }
  B.add(box(1.75, 0.7, 0.14), M(0, 0.25, -2.12, 0, 0.25), hull, { recv: 0 });
  B.add(prism(1.62, 0.9, 0.62), M(0, -0.05, 2.1, 0, Math.PI / 2), hull, { recv: 0 });
  B.add(box(1.3, 0.06, 3.8), M(0, 0.08, 0), inner, { recv: 0, outline: false });
  for (const zz of [-1.1, 0.2, 1.3]) B.add(box(1.6, 0.08, 0.4), M(0, 0.42, zz), C.woodL, { recv: 0 });
  // oars
  B.add(box(0.08, 0.06, 2.6), M(0.45, 0.5, 0.1, 0.1), C.woodL, { recv: 0 });
  B.add(box(0.2, 0.04, 0.5), M(0.5, 0.5, 1.35, 0.1), C.woodL, { recv: 0 });
}

export function bridge(ctx, base, repairB, brokenB) {
  const Bd = L.BRIDGE, y = Bd.y;
  const z0 = Bd.z - Bd.w / 2, z1 = Bd.z + Bd.w / 2;
  const r = mulberry32(99);
  // board strips across the bridge (planks run north-south)
  const addPlanks = (target, xa, xb) => {
    for (let x = xa; x < xb - 0.01; x += 0.55) {
      const col = [C.plankA, C.plankB, C.woodX, C.plankC][Math.floor(r() * 4)];
      target.add(box(0.5, 0.13, Bd.w), M(x + 0.27, y - 0.06, Bd.z, (r() - 0.5) * 0.04), col, { recv: 1 });
    }
  };
  addPlanks(base.at(Bd.x0 + 3, Bd.z), Bd.x0, Bd.gap0);
  addPlanks(base.at(Bd.x1 - 3, Bd.z), Bd.gap1, Bd.x1);
  addPlanks(repairB, Bd.gap0, Bd.gap1);
  // posts + rope rails
  for (let x = Bd.x0 + 0.3; x <= Bd.x1; x += 3.5) {
    for (const z of [z0 - 0.05, z1 + 0.05]) {
      const target = x > Bd.gap0 && x < Bd.gap1 ? repairB : null;
      if (target) {
        target.add(cylinder(0.14, 0.15, y + 2.3, 7), M(x, -1.5, z), C.woodD, { recv: 1 });
      } else {
        post(ctx, x, z, y + 0.85, 0.15);
        ctx.perches.push([x, y + 0.98, z]);
      }
    }
  }
  for (const z of [z0 - 0.05, z1 + 0.05]) {
    base.at(Bd.x0 + 3, Bd.z).add(box(Bd.gap0 - Bd.x0, 0.06, 0.06), M((Bd.x0 + Bd.gap0) / 2, y + 0.7, z), C.rope, { recv: 1, outline: false });
    base.at(Bd.x1 - 3, Bd.z).add(box(Bd.x1 - Bd.gap1, 0.06, 0.06), M((Bd.x1 + Bd.gap1) / 2, y + 0.7, z), C.rope, { recv: 1, outline: false });
    repairB.add(box(Bd.gap1 - Bd.gap0, 0.06, 0.06), M((Bd.gap0 + Bd.gap1) / 2, y + 0.7, z), C.rope, { recv: 1, outline: false });
  }
  // broken bits floating in the gap
  const debris = [[41.5, 15.1, 0.5, 0.2], [43.2, 17.6, -0.4, 0.05], [45.6, 14.4, 1.1, 0.1], [44.2, 12.8, 0.2, -0.1], [46.8, 16.8, -1.2, 0.05]];
  for (const [x, z, rot, tilt] of debris) {
    brokenB.add(box(0.5, 0.12, 2.4), M(x, 0.02, z, rot, tilt), C.plankB, { recv: 0 });
  }
  brokenB.add(cylinder(0.14, 0.15, 2.4, 7), M(42.6, -1.6, z0, 0, 0.25), C.woodD, { recv: 0 });
  brokenB.add(cylinder(0.14, 0.15, 1.9, 7), M(45.9, -1.6, z1, 0, -0.3), C.woodD, { recv: 0 });
  ctx.surfaces.push({ x0: Bd.x0, x1: Bd.gap0, z0, z1, y, kind: 'wood' });
  ctx.surfaces.push({ x0: Bd.gap1, x1: Bd.x1, z0, z1, y, kind: 'wood' });
  ctx.shadows.push({ t: 'p', a: 0.6, pts: [[Bd.x0 + 2, z1], [Bd.gap0, z1], [Bd.gap0 + 0.4, z1 + 0.5], [Bd.x0 + 2.4, z1 + 0.5]] });
  ctx.shadows.push({ t: 'p', a: 0.6, pts: [[Bd.gap1, z1], [Bd.x1 - 2, z1], [Bd.x1 - 1.6, z1 + 0.5], [Bd.gap1 + 0.4, z1 + 0.5]] });
  return { gapSurface: { x0: Bd.gap0 - 0.2, x1: Bd.gap1 + 0.2, z0, z1, y, kind: 'wood' } };
}

// ---------------------------------------------------------------- buildings & landmarks
export function lighthouse(ctx, crystalB) {
  const { x, z } = L.LIGHTHOUSE;
  const by = ground(ctx, x, z) - 0.2;
  const B = ctx.B.at(x, z);
  B.add(cylinder(2.3, 2.6, 0.6, 12), M(x, by, z), C.stone, { recv: 1 });
  B.add(cylinder(1.8, 2.0, 0.5, 12), M(x, by + 0.6, z), C.stoneW, { recv: 1 });
  B.add(cylinder(0.95, 1.35, 4.8, 10), M(x, by + 1.1, z), C.stoneW, { recv: 0.5 });
  for (const k of [1.6, 3.2]) B.add(cylinder(1.3 - k * 0.07, 1.36 - k * 0.07, 0.25, 10), M(x, by + 1.1 + k, z), C.blue, { recv: 0.5 });
  B.add(cylinder(1.25, 1.1, 0.3, 10), M(x, by + 5.9, z), C.stone, { recv: 0 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    B.add(box(0.14, 1.4, 0.14), M(x + Math.cos(a) * 0.95, by + 6.85, z + Math.sin(a) * 0.95), C.stoneW, { recv: 0 });
  }
  B.add(cylinder(0, 1.35, 1.0, 10), M(x, by + 7.55, z), C.blue, { recv: 0 });
  // the crystal is separate (it lights up when the family restores the lighthouse)
  crystalB.add(blob(0.55, 0, 0, 1, 1.7), M(0, 0, 0), C.crystal, { recv: 0, glow: 2 });
  ctx.shadows.push({ t: 'l', w: 2.3, a: 1, pts: [[x, z], [x + shiftX(7), z + shiftZ(7)]] });
  ctx.shadows.push({ t: 'c', x, z, r: 2.4, a: 0.35 });
  ctx.colliders.push({ t: 'c', x, z, r: 2.3 });
  return { x, y: by + 6.9, z };
}

export function shopStall(ctx) {
  const { x, z, rot } = L.SHOP;
  const by = ground(ctx, x, z);
  const B = ctx.B.at(x, z);
  const c = Math.cos(rot), s = Math.sin(rot);
  const P = (lx, lz) => [x + c * lx + s * lz, z - s * lx + c * lz];
  // counter
  const [cx, cz] = P(0, 0.4);
  B.add(box(3.4, 1.0, 1.0), M(cx, by + 0.5, cz, rot), C.woodM, { recv: 1 });
  B.add(box(3.6, 0.12, 1.2), M(cx, by + 1.04, cz, rot), C.woodL, { recv: 1 });
  const [fx, fz] = P(0, 0.92);
  B.add(box(3.42, 0.3, 0.06), M(fx, by + 0.7, fz, rot), C.red, { recv: 1, outline: false });
  // posts + striped awning
  for (const [lx, lz] of [[-1.7, 0.95], [1.7, 0.95], [-1.7, -0.9], [1.7, -0.9]]) {
    const [px, pz] = P(lx, lz);
    B.add(box(0.16, 2.8, 0.16), M(px, by + 1.4, pz, rot), C.woodD, { recv: 1 });
  }
  for (let k = 0; k < 8; k++) {
    const lx = -1.9 + k * 0.475 + 0.24;
    const [ax, az] = P(lx, 0.05);
    B.add(box(0.475, 0.08, 2.5), M(ax, by + 2.85, az, rot, 0.28), k % 2 ? C.white : C.red, { recv: 0 });
  }
  // goods on the counter
  const goods = [[-1.1, C.red], [-0.4, hex('#f2a33a')], [0.3, hex('#7ccf5a')], [1.0, hex('#f5d35a')]];
  for (const [lx, col] of goods) {
    const [gx, gz] = P(lx, 0.45);
    B.add(box(0.5, 0.25, 0.45), M(gx, by + 1.22, gz, rot), C.woodL, { recv: 0.5 });
    B.add(blob(0.2, 0, 0.1, lx * 10), M(gx, by + 1.42, gz), col, { recv: 0.3 });
  }
  // sign board
  const [sx2, sz2] = P(0, 1.0);
  B.add(box(1.6, 0.5, 0.08), M(sx2, by + 3.25, sz2, rot), C.woodL, { recv: 0 });
  ctx.shadows.push({ t: 'p', a: 0.9, pts: [P(-2, -1.3), P(2, -1.3), P(2, 1.3), P(-2, 1.3)].map(([px, pz]) => [px + shiftX(2.8), pz + shiftZ(2.8)]) });
  ctx.colliders.push({ t: 'c', x: P(-1, 0.4)[0], z: P(-1, 0.4)[1], r: 0.75 }, { t: 'c', x: P(0, 0.4)[0], z: P(0, 0.4)[1], r: 0.75 }, { t: 'c', x: P(1, 0.4)[0], z: P(1, 0.4)[1], r: 0.75 });
  for (const [lx, lz] of [[-1.7, -0.9], [1.7, -0.9]]) ctx.colliders.push({ t: 'c', x: P(lx, lz)[0], z: P(lx, lz)[1], r: 0.25 });
  return { keeper: P(0, -0.35), front: P(0, 1.9), y: by };
}

export function noticeBoard(ctx) {
  const { x, z, rot } = L.BOARD;
  const by = ground(ctx, x, z);
  const B = ctx.B.at(x, z);
  const c = Math.cos(rot), s = Math.sin(rot);
  for (const k of [-1, 1]) B.add(box(0.18, 2.4, 0.18), M(x + c * k, by + 1.2, z - s * k, rot), C.woodD, { recv: 1 });
  B.add(box(2.4, 1.4, 0.12), M(x, by + 1.6, z, rot), C.woodL, { recv: 0.5 });
  B.add(box(2.7, 0.12, 0.5), M(x, by + 2.45, z, rot, 0.25), C.roofA, { recv: 0 });
  const papers = [[-0.7, 1.8, C.white], [0.1, 1.85, hex('#fff1a8')], [0.75, 1.65, hex('#ffd6e8')], [-0.4, 1.3, hex('#d8f0ff')], [0.5, 1.25, C.white]];
  for (const [lx, ly, col] of papers) {
    B.add(box(0.5, 0.45, 0.03), M(x + c * lx + s * 0.08, by + ly, z - s * lx + c * 0.08, rot + (lx * 0.1)), col, { recv: 0.5, outline: false });
  }
  ctx.colliders.push({ t: 'r', x0: x - 1.3, x1: x + 1.3, z0: z - 0.3, z1: z + 0.3 });
  ctx.shadows.push({ t: 'l', w: 0.6, a: 0.8, pts: [[x - 1.2 + shiftX(2.3), z + shiftZ(2.3)], [x + 1.2 + shiftX(2.3), z + 0.3 + shiftZ(2.3)]] });
  return { front: [x + s * 1.4, z + c * 1.4] };
}

export function marketCrate(ctx) {
  const { x, z } = L.CRATE;
  const y = L.COTTAGE.deck.y;
  const B = ctx.B.at(x, z);
  B.add(box(1.3, 0.9, 1.0), M(x, y + 0.45, z), C.woodL, { recv: 1 });
  for (const k of [-0.3, 0, 0.3]) B.add(box(1.32, 0.06, 1.02), M(x, y + 0.45 + k, z), C.woodD, { recv: 1, outline: false });
  B.add(box(1.4, 0.1, 1.1), M(x, y + 0.95, z, 0, -0.12), C.woodM, { recv: 1 });
  B.add(cylinder(0.22, 0.22, 0.06, 10), M(x, y + 0.5, z + 0.52, 0, Math.PI / 2), C.yellow, { recv: 0.5, outline: false });
  ctx.colliders.push({ t: 'c', x, z, r: 0.8 });
}

export function mailbox(ctx) {
  const { x, z } = L.MAILBOX;
  const by = ground(ctx, x, z);
  const B = ctx.B.at(x, z);
  B.add(box(0.14, 1.1, 0.14), M(x, by + 0.55, z), C.woodD, { recv: 1 });
  B.add(box(0.45, 0.4, 0.65), M(x, by + 1.25, z), C.blue, { recv: 0.5 });
  B.add(cylinder(0.225, 0.225, 0.65, 8, { top: true, bottom: true }), M(x, by + 1.45, z - 0.325, 0, Math.PI / 2), C.blue, { recv: 0.5 });
  ctx.colliders.push({ t: 'c', x, z, r: 0.35 });
}

export function campfire(ctx) {
  const { x, z } = L.CAMPFIRE;
  const by = ground(ctx, x, z);
  const B = ctx.B.at(x, z);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU;
    B.add(blob(0.28, 0, 0.2, i + 50, 0.7), M(x + Math.cos(a) * 0.85, by + 0.1, z + Math.sin(a) * 0.85), i % 2 ? C.stone : C.stoneD, { recv: 1 });
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + 0.4;
    const { m } = between([x + Math.cos(a) * 0.7, by - 0.05, z + Math.sin(a) * 0.7], [x - Math.cos(a) * 0.1, by + 0.55, z - Math.sin(a) * 0.1]);
    B.add(cylinder(0.1, 0.12, 0.95, 6), m, C.woodD, { recv: 1 });
  }
  // cooking pot on a tripod
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 0.3;
    const { m } = between([x + Math.cos(a) * 0.9, by, z + Math.sin(a) * 0.9], [x, by + 1.9, z]);
    B.add(cylinder(0.04, 0.05, 2.0, 5), m, C.woodD, { recv: 1, outline: false });
  }
  B.add(cylinder(0.42, 0.32, 0.5, 10), M(x, by + 0.75, z), C.metal, { recv: 0.5 });
  // log seats
  for (const [a, rot] of [[0.6, 0.6], [2.3, 2.3], [4.2, 4.2]]) {
    const lx = x + Math.cos(a) * 2.4, lz = z + Math.sin(a) * 2.4;
    B.add(cylinder(0.32, 0.32, 1.6, 8, { top: true, bottom: true }), M(lx, by + 0.3, lz, -rot + Math.PI / 2, 0, Math.PI / 2).multiply(new THREE.Matrix4().makeTranslation(0, -0.8, 0)), C.trunk, { recv: 1 });
    ctx.colliders.push({ t: 'c', x: lx, z: lz, r: 0.6 });
  }
  ctx.colliders.push({ t: 'c', x, z, r: 1.0 });
  ctx.lights.push([x, by + 0.6, z, 2.0]);
  return { x, y: by, z };
}

export function gardenFrames(ctx, plots) {
  for (const p of plots) {
    const by = ground(ctx, p.x, p.z);
    const B = ctx.B.at(p.x, p.z);
    const s = L.GARDEN.plot;
    for (const [dx, dz, w, d] of [[0, -s / 2, s + 0.2, 0.16], [0, s / 2, s + 0.2, 0.16], [-s / 2, 0, 0.16, s], [s / 2, 0, 0.16, s]]) {
      B.add(box(w, 0.22, d), M(p.x + dx, by + 0.08, p.z + dz), C.woodM, { recv: 1 });
    }
  }
}

export function scarecrow(ctx, x, z) {
  const by = ground(ctx, x, z);
  const B = ctx.B.at(x, z);
  B.add(box(0.12, 2.2, 0.12), M(x, by + 1.1, z), C.woodD, { recv: 1 });
  B.add(box(1.6, 0.1, 0.1), M(x, by + 1.6, z), C.woodD, { recv: 1 });
  B.add(box(0.7, 0.8, 0.4), M(x, by + 1.5, z), hex('#7aa6d8'), { recv: 1 });
  B.add(blob(0.28, 1, 0.05, 3), M(x, by + 2.15, z), C.sack, { recv: 0.5 });
  B.add(cylinder(0.05, 0.6, 0.25, 10), M(x, by + 2.3, z), hex('#e2b765'), { recv: 0 });
  ctx.colliders.push({ t: 'c', x, z, r: 0.35 });
}

export function signpost(ctx, x, z, rot) {
  const by = ground(ctx, x, z);
  const B = ctx.B.at(x, z);
  B.add(box(0.14, 1.6, 0.14), M(x, by + 0.8, z), C.woodD, { recv: 1 });
  B.add(box(1.0, 0.28, 0.06), M(x, by + 1.35, z, rot), C.woodL, { recv: 1 });
  B.add(box(0.9, 0.24, 0.06), M(x, by + 1.0, z, rot + 1.4), C.woodL, { recv: 1 });
  ctx.colliders.push({ t: 'c', x, z, r: 0.25 });
}

// Waterfall water sheet + rocks around it
export function waterfallGeometry(ctx, lipX) {
  const W = L.WATERFALL;
  const xs = lipX, top = W.top + 0.05, bottom = -0.05;
  const w = W.width * 1.25;
  const g = new THREE.BufferGeometry();
  const pos = [], uv = [], idx = [];
  const ROWS = 10;
  for (let i = 0; i <= ROWS; i++) {
    const t = i / ROWS;
    const y = top + (bottom - top) * t;
    const x = xs + 0.3 + Math.sin(t * Math.PI * 0.5) * 2.2 + t * 0.3;
    for (const s of [-1, 1]) {
      pos.push(x, y, W.z + s * w / 2 * (1 + t * 0.25));
      uv.push(s < 0 ? 0 : 1, 1 - t);
    }
  }
  for (let i = 0; i < ROWS; i++) {
    const a = i * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  for (const [dx, dz, s] of [[0.2, -3.0, 1.3], [0.4, 3.1, 1.3], [3.6, -3.6, 1.0], [4.0, 3.6, 0.9], [1.4, -4.0, 1.0], [5.2, 1.2, 0.6]]) {
    const x = xs + dx, z = W.z + dz;
    const B = ctx.B.at(x, z);
    const yy = dx < 1 ? 2.8 : 0.0;
    B.add(blob(s, 1, 0.25, dx * 10 + dz, 0.9), M(x, yy, z), mix3(C.stone, C.stoneD, 0.4), { recv: 0.5 });
  }
  return g;
}

// Chunky boulders along the forest cliffs so the plateau clearly looks raised.
export function cliffRocks(ctx, lipX) {
  const { terrain } = ctx;
  const r = mulberry32(8080);
  const Pl = L.PLATEAU;
  const base = terrain.heightAt(Pl.x - Pl.rx - 4, Pl.z + 6);
  void base;
  const steps = 120;
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * TAU;
    const ca = Math.cos(a), sa = Math.sin(a);
    // walk outwards from the middle of the plateau until we find the steep part
    let found = null;
    for (let t = 0.6; t < 1.4; t += 0.01) {
      const x = Pl.x + ca * Pl.rx * t, z = Pl.z + sa * Pl.rz * t;
      if (terrain.slopeAt(x, z) > 1.4) { found = [x, z]; break; }
    }
    if (!found) continue;
    const [x, z] = found;
    // keep the ramp, the waterfall and the coast-side free
    const rampD = Math.hypot(x - (L.RAMP.ax + L.RAMP.bx) / 2, z - (L.RAMP.az + L.RAMP.bz) / 2);
    if (distToSegLocal(x, z, L.RAMP.ax, L.RAMP.az, L.RAMP.bx, L.RAMP.bz) < L.RAMP.width * 0.5 + 1.8 && rampD < 12) continue;
    if (Math.abs(z - L.WATERFALL.z) < 3.2 && x > lipX - 3) continue;
    if (i % 2 && r() > 0.7) continue;
    const top = terrain.heightAt(x - ca * 1.2, z - sa * 1.2);
    const low = terrain.heightAt(x + ca * 1.6, z + sa * 1.6);
    const h = Math.max(1, top - Math.max(low, -0.5));
    const B = ctx.B.at(x, z);
    const s = 0.9 + r() * 0.5;
    const col = mix3(C.stone, C.stoneD, 0.2 + r() * 0.5);
    B.add(blob(1.0 * s, 1, 0.2, i * 13 + 1, (h * 0.55) / s), M(x + ca * 0.5, Math.max(low, -0.5) + h * 0.42, z + sa * 0.5, r() * TAU), col, { recv: 0.5 });
    if (r() > 0.35) {
      B.add(blob(0.7 * s, 1, 0.2, i * 13 + 2, 0.9), M(x + ca * 1.1 + (r() - 0.5), Math.max(low, -0.5) + 0.2, z + sa * 1.1 + (r() - 0.5), r() * TAU), mix3(C.stone, C.stoneD, 0.5), { recv: 0.6 });
    }
    if (r() > 0.6) {
      // a mossy cap on top of the cliff edge
      B.add(blob(0.55 * s, 1, 0.15, i * 13 + 3, 0.6), M(x - ca * 0.2, top + 0.05, z - sa * 0.2), C.leafD, { recv: 0.6 });
    }
  }
}
// Boulders along a stretch of coast (the lighthouse headland)
export function coastRocks(ctx, e, seed) {
  const r = mulberry32(seed);
  for (let i = 0; i < 70; i++) {
    const a = (i / 70) * TAU;
    let found = null;
    for (let t = 0.3; t < 2.2; t += 0.02) {
      const x = e.x + Math.cos(a) * e.rx * t, z = e.z + Math.sin(a) * e.rz * t;
      if (ctx.terrain.distAt(x, z) < 0.6) { found = [x, z]; break; }
    }
    if (!found || r() > 0.65) continue;
    const [x, z] = found;
    const s = 0.6 + r() * 0.8;
    const h = ctx.terrain.heightAt(x, z);
    ctx.B.at(x, z).add(blob(s, 1, 0.22, i * 7 + seed, 0.75), M(x, h + s * 0.2, z, r() * TAU), mix3(C.stone, C.stoneD, r() * 0.6), { recv: 0.6 });
    if (h > -0.2) ctx.colliders.push({ t: 'c', x, z, r: s * 0.8 });
    ctx.shadows.push({ t: 'e', x: x + shiftX(s * 0.6), z: z + shiftZ(s * 0.6), rx: s, rz: s * 0.85, a: 0.7 });
  }
}

function distToSegLocal(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const t = clamp(((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz), 0, 1);
  return Math.hypot(ax + dx * t - px, az + dz * t - pz);
}

// One coloured slice of a beach umbrella (visible from above and below)
function canopySlice(r, h, a0, a1) {
  const top = [0, h, 0], p0 = [Math.cos(a0) * r, 0, Math.sin(a0) * r], p1 = [Math.cos(a1) * r, 0, Math.sin(a1) * r];
  const ux = p1[0] - top[0], uy = p1[1] - top[1], uz = p1[2] - top[2];
  const vx = p0[0] - top[0], vy = p0[1] - top[1], vz = p0[2] - top[2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz) || 1;
  nx /= l; ny /= l; nz /= l;
  if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
  const pos = new Float32Array([...top, ...p1, ...p0, ...top, ...p0, ...p1]);
  const nor = new Float32Array([nx, ny, nz, nx, ny, nz, nx, ny, nz, -nx, -ny, -nz, -nx, -ny, -nz, -nx, -ny, -nz]);
  return { pos, nor, sn: nor.slice() };
}

// Beach umbrella, towels and sandcastles
export function beachDecor(ctx) {
  const umbrella = (x, z, rot, cols) => {
    const by = ground(ctx, x, z);
    const B = ctx.B.at(x, z);
    B.add(cylinder(0.05, 0.05, 2.4, 6), M(x, by, z, 0, 0.12), C.white, { recv: 1 });
    for (let i = 0; i < 8; i++) {
      const a0 = (i / 8) * TAU + rot, a1 = ((i + 1) / 8) * TAU + rot;
      B.add(canopySlice(1.55, 0.55, a0, a1), M(x + 0.29, by + 2.25, z), cols[i % 2], { recv: 0, sway: 0.08 });
    }
    ctx.shadows.push({ t: 'c', x: x + shiftX(2.3) + 0.3, z: z + shiftZ(2.3), r: 1.5, a: 0.85 });
  };
  const towel = (x, z, rot, a, b) => {
    const by = ground(ctx, x, z);
    const B = ctx.B.at(x, z);
    for (let k = 0; k < 5; k++) B.add(box(0.95, 0.03, 0.36), M(x + Math.sin(rot) * (k - 2) * 0.36, by + 0.02, z + Math.cos(rot) * (k - 2) * 0.36, rot), k % 2 ? a : b, { recv: 1, outline: false });
  };
  const castle = (x, z) => {
    const by = ground(ctx, x, z);
    const B = ctx.B.at(x, z);
    const sand = hex('#e8d29c');
    B.add(cylinder(0.5, 0.6, 0.45, 8), M(x, by - 0.02, z), sand, { recv: 1 });
    for (const [dx, dz] of [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]]) B.add(cylinder(0.2, 0.24, 0.65, 6), M(x + dx, by, z + dz), sand, { recv: 1 });
    B.add(cylinder(0.28, 0.32, 0.4, 8), M(x, by + 0.43, z), sand, { recv: 1 });
    B.add(box(0.02, 0.35, 0.02), M(x, by + 1.0, z), C.woodD, { recv: 1, outline: false });
    B.add(prism(0.25, 0.18, 0.02), M(x + 0.12, by + 1.1, z, 0, 0, -Math.PI / 2), C.red, { recv: 0, outline: false, sway: 0.4 });
    ctx.colliders.push({ t: 'c', x, z, r: 0.75 });
  };
  umbrella(-56.5, 8, 0.3, [C.red, C.white]);
  towel(-54.9, 9.6, 0.5, hex('#5d8fd8'), C.white);
  towel(-57.9, 10.4, -0.4, hex('#f5cf4a'), hex('#e8574a'));
  ctx.colliders.push({ t: 'c', x: -56.5, z: 8, r: 0.3 });
  umbrella(59.5, 21.5, 1.1, [hex('#3fb5a8'), C.white]);
  castle(-53, 15);
  castle(64.5, 11.5);
  castle(-9, 32.3);
}

export function pondDecor(ctx) {
  const r = mulberry32(404);
  // lily pads
  for (let i = 0; i < 14; i++) {
    const a = r() * TAU, d = 0.3 + r() * 0.6;
    const x = L.POND.x + Math.cos(a) * L.POND.rx * d * 0.85, z = L.POND.z + Math.sin(a) * L.POND.rz * d * 0.85;
    if (ctx.terrain.heightAt(x, z) > L.POND_LEVEL - 0.3) continue;
    const B = ctx.B.at(x, z);
    const pts = [];
    for (let k = 0; k <= 10; k++) {
      const aa = 0.5 + (k / 10) * (TAU - 0.9);
      pts.push([Math.cos(aa) * 0.5, Math.sin(aa) * 0.5]);
    }
    pts.unshift([0, 0]);
    B.add(flatPolyPrim(pts), M(x, L.POND_LEVEL + 0.02, z, r() * TAU, 0, 0, 0.8 + r() * 0.6), hex('#5fb84a'), { recv: 0, outline: false });
    if (r() > 0.6) B.add(flowerPetals(0.14, 6), M(x + 0.1, L.POND_LEVEL + 0.08, z), hex('#ffb3c7'), { recv: 0, outline: false });
  }
  // reeds around the edge
  for (let i = 0; i < 40; i++) {
    const a = r() * TAU;
    const x = L.POND.x + Math.cos(a) * (L.POND.rx + 0.3 + r() * 0.8), z = L.POND.z + Math.sin(a) * (L.POND.rz + 0.3 + r() * 0.8);
    const h = ctx.terrain.heightAt(x, z);
    if (h < L.POND_LEVEL - 0.4) continue;
    const B = ctx.B.at(x, z);
    B.add(grassTuft(1.0, 3, i + 500), M(x, h - 0.05, z), hex('#6fa83c'), { recv: 1, outline: false, sway: (wy) => clamp((wy - h), 0, 1) * 0.5 });
    if (r() > 0.5) B.add(cylinder(0.05, 0.05, 0.25, 5), M(x + 0.05, h + 0.85, z), hex('#7a4f2f'), { recv: 1, outline: false, sway: 0.5 });
  }
}

function flatPolyPrim(pts) {
  const pos = [], nor = [];
  for (let i = 1; i < pts.length - 1; i++) {
    // both windings so it is visible from either side
    pos.push(pts[0][0], 0, pts[0][1], pts[i + 1][0], 0, pts[i + 1][1], pts[i][0], 0, pts[i][1]);
    pos.push(pts[0][0], 0, pts[0][1], pts[i][0], 0, pts[i][1], pts[i + 1][0], 0, pts[i + 1][1]);
    nor.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0);
  }
  const p = new Float32Array(pos), n = new Float32Array(nor);
  return { pos: p, nor: n, sn: n.slice() };
}

export function coralAndSeaweed(ctx) {
  const r = mulberry32(2024);
  const coralCols = [hex('#f48fb1'), hex('#a78bfa'), hex('#fcd34d'), hex('#fb923c'), hex('#7c9cf5'), hex('#f9a8d4'), hex('#6ee7b7')];
  for (const [cx, cz] of L.CORAL_SPOTS) {
    const n = 5 + Math.floor(r() * 6);
    for (let i = 0; i < n; i++) {
      const x = cx + (r() - 0.5) * 6, z = cz + (r() - 0.5) * 6;
      const h = ctx.terrain.heightAt(x, z);
      if (h > -0.6) continue;
      const B = ctx.B.at(x, z);
      const col = coralCols[Math.floor(r() * coralCols.length)];
      const kind = r();
      if (kind < 0.4) {
        // branching coral: a few little sticks
        for (let k = 0; k < 4; k++) {
          const a = r() * TAU;
          B.add(cylinder(0.07, 0.12, 0.7 + r() * 0.6, 5), M(x, h, z, 0, Math.cos(a) * 0.5, Math.sin(a) * 0.5), col, { recv: 0, outline: false });
        }
      } else if (kind < 0.75) {
        B.add(blob(0.45 + r() * 0.4, 1, 0.3, i * 7 + cx, 0.6), M(x, h + 0.1, z), col, { recv: 0, outline: false });
      } else {
        B.add(blob(0.8 + r() * 0.5, 1, 0.25, i * 3 + cz, 0.45), M(x, h, z), mix3(C.stone, hex('#8fbcb8'), 0.5), { recv: 0, outline: false });
        B.add(blob(0.3, 0, 0.3, i), M(x + 0.3, h + 0.35, z), col, { recv: 0, outline: false });
      }
    }
  }
  // seaweed
  for (let i = 0; i < 400; i++) {
    const x = -75 + r() * 155, z = -60 + r() * 130;
    const h = ctx.terrain.heightAt(x, z);
    if (h > -0.7 || h < -3.5) continue;
    ctx.B.at(x, z).add(grassTuft(0.9 + r() * 0.6, 4, i + 3000), M(x, h, z, r() * TAU), r() > 0.5 ? hex('#3fae6a') : hex('#5cc46a'), { recv: 0, outline: false, sway: (wy) => clamp((wy - h), 0, 1.5) * 0.8 });
  }
}

export function fallenLogs(builder) {
  const { x, z, rot } = L.LOGS_BLOCK;
  // built at origin; positioned by the caller
  builder.add(cylinder(0.42, 0.45, 5.2, 9, { top: true, bottom: true }), M(0, 0.4, 0, rot, 0, Math.PI / 2).multiply(new THREE.Matrix4().makeTranslation(0, -2.6, 0)), C.trunk, { recv: 0 });
  builder.add(cylinder(0.36, 0.38, 4.6, 9, { top: true, bottom: true }), M(0.3, 1.05, 0.4, rot + 0.25, 0, Math.PI / 2).multiply(new THREE.Matrix4().makeTranslation(0, -2.3, 0)), C.trunkD, { recv: 0 });
  builder.add(blob(0.5, 1, 0.2, 5), M(-1.2, 0.4, 1.2), C.leafD, { recv: 0 });
  builder.add(blob(0.4, 1, 0.2, 6), M(1.6, 0.4, -1.0), C.leaf, { recv: 0 });
  return { x, z };
}

export function picnicSet(builder) {
  // a blanket + table + bunting (appears when the family finishes the picnic project)
  const blanket = [hex('#e8574a'), C.white];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    builder.add(box(0.7, 0.03, 0.7), M(-1.2 + i * 0.7, 0.03, -1.2 + j * 0.7), blanket[(i + j) % 2], { recv: 1, outline: false });
  }
  builder.add(box(0.8, 0.5, 0.6), M(0.2, 0.25, 0.1), C.woodL, { recv: 1 });
  builder.add(cylinder(0.04, 0.04, 0.8, 6), M(0.2, 0.5, -0.2, 0, 0, Math.PI / 2).multiply(new THREE.Matrix4().makeTranslation(0, -0.4, 0)), C.woodD, { recv: 1 });
  // table
  builder.add(box(2.6, 0.12, 1.2), M(3.2, 0.9, 0), C.woodM, { recv: 1 });
  for (const [dx, dz] of [[-1.1, -0.45], [1.1, -0.45], [-1.1, 0.45], [1.1, 0.45]]) builder.add(box(0.12, 0.9, 0.12), M(3.2 + dx, 0.45, dz), C.woodD, { recv: 1 });
  for (const dz of [-1, 1]) builder.add(box(2.6, 0.1, 0.4), M(3.2, 0.5, dz), C.woodL, { recv: 1 });
  // bunting
  const flagCols = [hex('#e8574a'), hex('#f5cf4a'), hex('#5d8fd8'), hex('#7ccf5a'), hex('#f9a8d4')];
  for (const px of [-2.5, 5.5]) builder.add(box(0.12, 2.6, 0.12), M(px, 1.3, -1.6), C.woodD, { recv: 1 });
  for (let i = 0; i < 12; i++) {
    const t = (i + 0.5) / 12;
    const fx = -2.5 + t * 8, fy = 2.5 - Math.sin(t * Math.PI) * 0.5;
    builder.add(prism(0.4, 0.45, 0.02), M(fx, fy - 0.45, -1.6, 0, 0, Math.PI), flagCols[i % flagCols.length], { recv: 0, outline: false, sway: 0.4 });
  }
}

