// Where little treasures can wash up or grow: shells on beaches, mushrooms in the forest…
import { mulberry32 } from '../util/math.js';
import * as L from '../world/layout.js';

export const SPAWN_RULES = {
  beach: { max: 12, every: 14, kinds: [['shell', 5], ['starfish', 2], ['coral', 1.2], ['driftwood', 4], ['seaglass', 0.45]] },
  forest: { max: 5, every: 30, kinds: [['mushroom', 1]] },
  meadow: { max: 10, every: 18, kinds: [['flower', 1]] },
  islet: { max: 6, every: 25, kinds: [['shell', 3], ['starfish', 2], ['coral', 2], ['seaglass', 0.7], ['driftwood', 1]] },
};

export function computeSpawnPoints(terrain, walk) {
  const r = mulberry32(31337);
  const out = { beach: [], forest: [], meadow: [], islet: [] };
  const isletD = (x, z) => Math.hypot(x - L.ISLET_CENTER.x, z - L.ISLET_CENTER.z);
  for (let i = 0; i < 6000; i++) {
    const x = -68 + r() * 145, z = -55 + r() * 100;
    const f = walk.flag(x, z);
    if (f !== 1) continue;
    const h = terrain.heightAt(x, z), g = terrain.sampleGrid(terrain.grass, x, z), d = terrain.distAt(x, z);
    const onIslet = isletD(x, z) < 12;
    if (h > 0.06 && h < 0.6 && g < 0.15 && d > 0.6 && d < 6) {
      (onIslet ? out.islet : out.beach).push([+x.toFixed(2), +z.toFixed(2)]);
    } else if (h > 4.3 && g > 0.8 && Math.hypot((x - L.PLATEAU.x) / L.PLATEAU.rx, (z - L.PLATEAU.z) / L.PLATEAU.rz) < 0.9) {
      out.forest.push([+x.toFixed(2), +z.toFixed(2)]);
    } else if (h > 0.6 && h < 2.6 && g > 0.9 && !onIslet) {
      out.meadow.push([+x.toFixed(2), +z.toFixed(2)]);
    }
  }
  // keep a sensible number and spread them out
  const thin = (arr, n, minD) => {
    const keep = [];
    for (const p of arr) {
      if (keep.length >= n) break;
      if (keep.every((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) > minD)) keep.push(p);
    }
    return keep;
  };
  out.beach = thin(out.beach, 70, 3);
  out.forest = thin(out.forest, 20, 3);
  out.meadow = thin(out.meadow, 45, 3.5);
  out.islet = thin(out.islet, 14, 2.5);
  return out;
}

export const DIG_SPOT = { x: 65.2, z: 18.4 };
