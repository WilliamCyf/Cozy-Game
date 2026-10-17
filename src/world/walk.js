// The walking map: a grid that says, for every half-metre square, whether you can walk there.
//   0 = blocked (deep water, cliffs, walls)  1 = ground  2 = shallow water  3 = wooden floor
import * as L from './layout.js';
import { distToSegment } from '../util/math.js';

const PLAYER_R = 0.32; // how "wide" a person is
export const FLAG = { BLOCKED: 0, GROUND: 1, SHALLOW: 2, WOOD: 3 };

function ellipseField(x, z, e) {
  return 1 - Math.sqrt(((x - e.x) / e.rx) ** 2 + ((z - e.z) / e.rz) ** 2);
}
function nearRiver(x, z) {
  const p = L.RIVER.pts;
  for (let i = 0; i < p.length - 1; i++) if (distToSegment(x, z, p[i][0], p[i][1], p[i + 1][0], p[i + 1][1]) < L.RIVER.width) return true;
  return false;
}

export function buildWalkGrid(terrain, ctx) {
  const { N, CELL, H } = terrain;
  const flags = new Uint8Array(N * N);
  const surfY = new Float32Array(N * N);
  const staticColliders = ctx.colliders.slice();
  const staticSurfaces = ctx.surfaces.slice();
  const dynBlockers = new Map();
  const dynSurfaces = new Map();

  const toI = (x) => Math.round((x + L.WORLD_HALF) / CELL);
  const clampI = (i) => (i < 0 ? 0 : i >= N ? N - 1 : i);

  function waterLevelAt(x, z, h = terrain.heightAt(x, z)) {
    if (h > 2.0 && ellipseField(x, z, L.PLATEAU) > -0.03) return L.POND_LEVEL;
    return L.SEA_LEVEL;
  }

  function baseCell(i, j) {
    const k = j * N + i;
    const x = -L.WORLD_HALF + i * CELL, z = -L.WORLD_HALF + j * CELL;
    if (i < 2 || j < 2 || i > N - 3 || j > N - 3) { flags[k] = 0; return; }
    const h = H[k];
    const depth = waterLevelAt(x, z, h) - h;
    const dx = (H[k + 1] - H[k - 1]) / (2 * CELL), dz = (H[k + N] - H[k - N]) / (2 * CELL);
    const slope = Math.hypot(dx, dz);
    // the forest ramp: you walk up on the dirt path, not up its grassy sides
    const rampD = distToSegment(x, z, L.RAMP.ax, L.RAMP.az, L.RAMP.bx, L.RAMP.bz);
    const rampSide = rampD > L.RAMP.width * 0.5 + 0.4 && rampD < L.RAMP.width * 0.5 + 7 && h > 1.15 && h < 4.3;
    if (depth > 0.32 || slope > 0.85 || rampSide) flags[k] = 0;
    else if (depth > -0.03) flags[k] = 2;
    else flags[k] = 1;
    surfY[k] = 0;
  }

  function stampSurface(s, i0, i1, j0, j1) {
    const a = clampI(Math.max(i0, Math.ceil((s.x0 + L.WORLD_HALF) / CELL))), b = clampI(Math.min(i1, Math.floor((s.x1 + L.WORLD_HALF) / CELL)));
    const c = clampI(Math.max(j0, Math.ceil((s.z0 + L.WORLD_HALF) / CELL))), d = clampI(Math.min(j1, Math.floor((s.z1 + L.WORLD_HALF) / CELL)));
    for (let j = c; j <= d; j++) for (let i = a; i <= b; i++) {
      const k = j * N + i;
      flags[k] = 3;
      surfY[k] = s.y;
    }
  }

  function stampCollider(col, i0, i1, j0, j1) {
    if (col.t === 'c') {
      const r = col.r + PLAYER_R;
      const a = clampI(Math.max(i0, toI(col.x - r))), b = clampI(Math.min(i1, toI(col.x + r)));
      const c = clampI(Math.max(j0, toI(col.z - r))), d = clampI(Math.min(j1, toI(col.z + r)));
      for (let j = c; j <= d; j++) for (let i = a; i <= b; i++) {
        const x = -L.WORLD_HALF + i * CELL, z = -L.WORLD_HALF + j * CELL;
        if ((x - col.x) ** 2 + (z - col.z) ** 2 <= r * r) flags[j * N + i] = 0;
      }
    } else {
      const a = clampI(Math.max(i0, toI(col.x0 - PLAYER_R))), b = clampI(Math.min(i1, toI(col.x1 + PLAYER_R)));
      const c = clampI(Math.max(j0, toI(col.z0 - PLAYER_R))), d = clampI(Math.min(j1, toI(col.z1 + PLAYER_R)));
      for (let j = c; j <= d; j++) for (let i = a; i <= b; i++) flags[j * N + i] = 0;
    }
  }

  const overlaps = (o, x0, x1, z0, z1) => {
    if (o.t === 'c') return o.x + o.r + 1 > x0 && o.x - o.r - 1 < x1 && o.z + o.r + 1 > z0 && o.z - o.r - 1 < z1;
    return o.x1 + 1 > x0 && o.x0 - 1 < x1 && o.z1 + 1 > z0 && o.z0 - 1 < z1;
  };

  // Recompute a rectangle of the map (used at start and when something changes,
  // e.g. the bridge gets repaired).
  function rebuild(x0, z0, x1, z1) {
    const i0 = clampI(toI(x0)), i1 = clampI(toI(x1)), j0 = clampI(toI(z0)), j1 = clampI(toI(z1));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) baseCell(i, j);
    for (const s of staticSurfaces) if (overlaps({ t: 'r', ...s }, x0, x1, z0, z1)) stampSurface(s, i0, i1, j0, j1);
    for (const s of dynSurfaces.values()) if (overlaps({ t: 'r', ...s }, x0, x1, z0, z1)) stampSurface(s, i0, i1, j0, j1);
    for (const c of staticColliders) if (overlaps(c, x0, x1, z0, z1)) stampCollider(c, i0, i1, j0, j1);
    for (const c of dynBlockers.values()) if (overlaps(c, x0, x1, z0, z1)) stampCollider(c, i0, i1, j0, j1);
  }
  rebuild(-L.WORLD_HALF, -L.WORLD_HALF, L.WORLD_HALF, L.WORLD_HALF);

  const bbox = (o) => (o.t === 'c' ? [o.x - o.r - 1, o.z - o.r - 1, o.x + o.r + 1, o.z + o.r + 1] : [o.x0 - 1, o.z0 - 1, o.x1 + 1, o.z1 + 1]);
  const idx = (x, z) => clampI(toI(z)) * N + clampI(toI(x));

  const walk = {
    flags, N,
    flag(x, z) { return flags[idx(x, z)]; },
    canWalk(x, z) { return flags[idx(x, z)] !== 0; },
    isWood(x, z) { return flags[idx(x, z)] === 3; },
    groundY(x, z) {
      const k = idx(x, z);
      return flags[k] === 3 ? surfY[k] : terrain.heightAt(x, z);
    },
    waterLevelAt,
    // Is there fishable water at (x, z)? Returns the water depth, or 0 if not water.
    // Up on the forest hill only the pond and the river count: the hill's rocky slopes are below
    // the pond's water level too, but they are rock, not water.
    waterDepth(x, z) {
      const k = idx(x, z);
      if (flags[k] === 3) return 0;
      const h = terrain.heightAt(x, z);
      const lvl = waterLevelAt(x, z, h);
      if (lvl === L.POND_LEVEL && ellipseField(x, z, L.POND) < -0.15 && !nearRiver(x, z)) return 0;
      return Math.max(0, lvl - h);
    },
    addBlocker(name, col) {
      dynBlockers.set(name, col);
      const [a, b, c, d] = bbox(col);
      rebuild(a, b, c, d);
    },
    removeBlocker(name) {
      const col = dynBlockers.get(name);
      if (!col) return;
      dynBlockers.delete(name);
      const [a, b, c, d] = bbox(col);
      rebuild(a, b, c, d);
    },
    addSurface(name, rect) {
      if (!rect) return;
      dynSurfaces.set(name, rect);
      rebuild(rect.x0 - 1, rect.z0 - 1, rect.x1 + 1, rect.z1 + 1);
    },
    removeSurface(name) {
      const rect = dynSurfaces.get(name);
      if (!rect) return;
      dynSurfaces.delete(name);
      rebuild(rect.x0 - 1, rect.z0 - 1, rect.x1 + 1, rect.z1 + 1);
    },
    // Find the nearest walkable spot (used when spawning or if something goes wrong)
    nearestWalkable(x, z, maxR = 12) {
      if (walk.canWalk(x, z) && walk.flag(x, z) !== 2) return [x, z];
      for (let r = 0.5; r <= maxR; r += 0.5) {
        for (let a = 0; a < 16; a++) {
          const ang = (a / 16) * Math.PI * 2;
          const px = x + Math.cos(ang) * r, pz = z + Math.sin(ang) * r;
          if (walk.canWalk(px, pz) && walk.flag(px, pz) !== 2) return [px, pz];
        }
      }
      return [L.SPAWN.x, L.SPAWN.z];
    },
  };
  return walk;
}
