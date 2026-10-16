// Puts the whole island together: ground, sea, props, shadows and the walking map.
import * as THREE from 'three';
import { generateTerrain } from './terrain.js';
import * as L from './layout.js';
import * as P from './props.js';
import { ChunkedBuilder, MeshBuilder, M, box, hex } from '../render/geo.js';
import { makeMaskTexture, makeNoiseTexture, makeCausticTexture, makeParticleAtlas } from '../render/textures.js';
import {
  U, makePropMaterial, makeOutlineMaterial, makeTerrainMaterial, makeWaterMaterial, makeWaterfallMaterial, makeGlowMaterial,
} from '../render/materials.js';
import { buildWalkGrid } from './walk.js';
import { smoothstep, mulberry32, distToPolyline, distToSegment } from '../util/math.js';

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

// Make the ground flat under buildings and docks.
function flatten(terrain, x0, z0, x1, z1, target, feather, mode) {
  const { N, CELL, H } = terrain;
  const i0 = Math.max(0, Math.floor((x0 - feather + L.WORLD_HALF) / CELL)), i1 = Math.min(N - 1, Math.ceil((x1 + feather + L.WORLD_HALF) / CELL));
  const j0 = Math.max(0, Math.floor((z0 - feather + L.WORLD_HALF) / CELL)), j1 = Math.min(N - 1, Math.ceil((z1 + feather + L.WORLD_HALF) / CELL));
  for (let j = j0; j <= j1; j++) {
    const z = -L.WORLD_HALF + j * CELL;
    for (let i = i0; i <= i1; i++) {
      const x = -L.WORLD_HALF + i * CELL;
      const dx = Math.max(x0 - x, x - x1, 0), dz = Math.max(z0 - z, z - z1, 0);
      // never flatten the ramp up to the forest (it would leave a step too steep to climb)
      const rampD = distToSegment(x, z, L.RAMP.ax, L.RAMP.az, L.RAMP.bx, L.RAMP.bz);
      const w = (1 - smoothstep(0, feather, Math.hypot(dx, dz))) * smoothstep(L.RAMP.width * 0.5 + 0.8, L.RAMP.width * 0.5 + 3, rampD);
      if (w <= 0) continue;
      const k = j * N + i;
      // 'max' only lowers ground that is too high; 'set' pulls it to the target either way
      if (mode === 'max' && H[k] > target) H[k] += (target - H[k]) * w;
      if (mode === 'set') H[k] += (target - H[k]) * w;
    }
  }
}

function terrainMeshes(terrain, material) {
  const meshes = [];
  const CH = 44, n = Math.ceil(L.WORLD_SIZE / CH);
  for (let cj = 0; cj < n; cj++) for (let ci = 0; ci < n; ci++) {
    const x0 = -L.WORLD_HALF + ci * CH, z0 = -L.WORLD_HALF + cj * CH;
    // deep-sea squares only need a few triangles
    let maxH = -99, maxSlope = 0;
    for (let z = z0; z <= z0 + CH; z += 1) for (let x = x0; x <= x0 + CH; x += 1) {
      maxH = Math.max(maxH, terrain.heightAt(x, z));
      if (maxH > 1.5) maxSlope = Math.max(maxSlope, terrain.slopeAt(x, z));
    }
    // finer triangles where there are cliffs, very few out in the deep sea
    const step = maxH < -5 ? CH / 2 : maxH < -3.5 ? 4 : maxSlope > 1.2 ? 0.5 : 1;
    const cnt = Math.round(CH / step) + 1;
    const pos = new Float32Array(cnt * cnt * 3), nor = new Float32Array(cnt * cnt * 3), rock = new Float32Array(cnt * cnt);
    const idx = [];
    for (let j = 0; j < cnt; j++) for (let i = 0; i < cnt; i++) {
      const x = x0 + i * step, z = z0 + j * step;
      const k = j * cnt + i;
      const h = terrain.heightAt(x, z);
      pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
      const e = 0.6;
      const nx = terrain.heightAt(x - e, z) - terrain.heightAt(x + e, z);
      const nz = terrain.heightAt(x, z - e) - terrain.heightAt(x, z + e);
      const l = Math.hypot(nx, 2 * e, nz);
      nor[k * 3] = nx / l; nor[k * 3 + 1] = (2 * e) / l; nor[k * 3 + 2] = nz / l;
      rock[k] = terrain.sampleGrid(terrain.rock, x, z);
      if (i < cnt - 1 && j < cnt - 1) {
        const a = k, b = k + 1, c = k + cnt, d = k + cnt + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('aRock', new THREE.BufferAttribute(rock, 1));
    g.setIndex(idx);
    g.computeBoundingSphere();
    meshes.push(new THREE.Mesh(g, material));
  }
  return meshes;
}

// Water surface on top of the forest plateau (pond + stream)
function pondWaterGeometry(terrain) {
  const pos = [], idx = [];
  let v = 0;
  const y = L.POND_LEVEL;
  const nearWater = (x, z) => {
    const pd = Math.hypot((x - L.POND.x) / L.POND.rx, (z - L.POND.z) / L.POND.rz);
    return pd < 1.35 || distToPolyline(x, z, L.RIVER.pts) < L.RIVER.width * 1.5;
  };
  for (let z = L.PLATEAU.z - L.PLATEAU.rz; z < L.PLATEAU.z + L.PLATEAU.rz; z += 1) {
    for (let x = L.PLATEAU.x - L.PLATEAU.rx; x < L.PLATEAU.x + L.PLATEAU.rx + 3; x += 1) {
      const hs = [terrain.heightAt(x, z), terrain.heightAt(x + 1, z), terrain.heightAt(x, z + 1), terrain.heightAt(x + 1, z + 1)];
      const lo = Math.min(...hs), hi = Math.max(...hs);
      // only flat-ish cells in the pond/stream basin (never on the cliff edge)
      if (lo < 2.9 || lo > y + 0.05 || hi - lo > 1.1 || !nearWater(x + 0.5, z + 0.5)) continue;
      pos.push(x, y, z, x + 1, y, z, x, y, z + 1, x + 1, y, z + 1);
      idx.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
      v += 4;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

export async function buildWorld(scene, onProgress = () => {}) {
  onProgress(0.05, 'Shaping the island…');
  await nextFrame();
  const terrain = generateTerrain();

  // flat spots for buildings and docks
  const D = L.COTTAGE.deck;
  flatten(terrain, D.x0, D.z0, D.x1, D.z1, 0.5, 2.5, 'max');
  flatten(terrain, L.PIER.x - 2, L.PIER.z0, L.PIER.x + 2, L.PIER.z0 + 6, 0.55, 2, 'max');
  flatten(terrain, L.BRIDGE.x0, L.BRIDGE.z - 2, L.BRIDGE.x0 + 4, L.BRIDGE.z + 2, 0.6, 2, 'max');
  flatten(terrain, L.BRIDGE.x1 - 4, L.BRIDGE.z - 2, L.BRIDGE.x1, L.BRIDGE.z + 2, 0.6, 2, 'max');
  const G = L.GARDEN;
  const gw = G.cols * G.plot + (G.cols - 1) * G.gap;
  const gRows = G.rows + G.extraRows;
  const gz0 = G.z - G.plot / 2 - 1, gz1 = G.z - G.plot / 2 + gRows * (G.plot + G.gap) + 0.5;
  flatten(terrain, G.x - gw / 2 - 1, gz0, G.x + gw / 2 + 1, gz1, 0.82, 3, 'set');
  flatten(terrain, L.SHOP.x - 3, L.SHOP.z - 2.5, L.SHOP.x + 3, L.SHOP.z + 3, 0.85, 3, 'set');
  flatten(terrain, L.CAMPFIRE.x - 3.5, L.CAMPFIRE.z - 3.5, L.CAMPFIRE.x + 3.5, L.CAMPFIRE.z + 3.5, 0.9, 3, 'set');
  flatten(terrain, L.PICNIC.x - 3, L.PICNIC.z - 2.5, L.PICNIC.x + 7, L.PICNIC.z + 2, 0.9, 3, 'set');
  flatten(terrain, L.BOARD.x - 1.6, L.BOARD.z - 1, L.BOARD.x + 1.6, L.BOARD.z + 1.5, 0.75, 2, 'set');

  onProgress(0.25, 'Planting palm trees…');
  await nextFrame();
  const chunks = new ChunkedBuilder(L.WORLD_HALF, 44);
  const ctx = P.createPropContext(terrain, chunks);

  for (let i = 0; i < L.PALMS.length; i++) P.palm(ctx, L.PALMS[i][0], L.PALMS[i][1], i + 1);
  L.PINES.forEach(([x, z], i) => P.pine(ctx, x, z, i + 1));
  L.ROUND_TREES.forEach(([x, z], i) => P.roundTree(ctx, x, z, i + 1));
  L.ROCKS.forEach(([x, z, s], i) => P.rock(ctx, x, z, s, i + 1));
  const bushes = [];
  L.ORANGE_BUSHES.forEach(([x, z], i) => { P.bush(ctx, x, z, 100 + i, P.COLORS.bush); bushes.push({ x, z, kind: 'orange', id: bushes.length }); });
  L.BERRY_BUSHES.forEach(([x, z], i) => { P.bush(ctx, x, z, 200 + i, hex('#3f8d4a'), 0.85); bushes.push({ x, z, kind: 'berry', id: bushes.length }); });
  // a few plain decorative bushes
  [[-30, -6], [2, -26], [-36, 12], [22, 9], [-4, 7], [34, 22]].forEach(([x, z], i) => P.bush(ctx, x, z, 300 + i, P.COLORS.leafD, 0.8 + (i % 3) * 0.15));

  P.cottage(ctx);
  P.pier(ctx);
  const shop = P.shopStall(ctx);
  const board = P.noticeBoard(ctx);
  P.marketCrate(ctx);
  P.mailbox(ctx);
  const fire = P.campfire(ctx);
  P.scarecrow(ctx, L.GARDEN.x + 6.4, L.GARDEN.z + 1.2);
  P.signpost(ctx, -3, 2, 0.4);
  P.signpost(ctx, 3, -6.5, -0.6);
  P.bench(ctx, -3, 0, -9, 0.3);
  P.bench(ctx, -38, 0, -30, 0.9);
  P.bench(ctx, 30, 0, 23, -0.4);

  // plots for the garden (positions only; soil + crops are dynamic)
  const plots = [];
  for (let r = 0; r < G.rows + G.extraRows; r++) for (let c = 0; c < G.cols; c++) {
    plots.push({
      id: plots.length,
      x: G.x - gw / 2 + G.plot / 2 + c * (G.plot + G.gap),
      z: G.z + r * (G.plot + G.gap),
      extra: r >= G.rows,
    });
  }
  P.gardenFrames(ctx, plots.filter((p) => !p.extra));

  // Lantern posts along the paths
  const lanternSpots = [[2.5, 21], [-3.5, 9], [-8, -1.5], [12, 16.5], [22, 18], [6, -9], [-16, -12.5], [-28, -25], [17, -20.5], [31, 14], [53, 13.5], [-34, 2.2], [-37, -33]];
  for (const [x, z] of lanternSpots) P.lanternPost(ctx, x, z);

  // Lighthouse (crystal is a separate glowing mesh)
  const crystalB = new MeshBuilder();
  const lh = P.lighthouse(ctx, crystalB);

  // Bridge (repaired part + floating debris are separate so they can be swapped)
  const repairB = new MeshBuilder(), brokenB = new MeshBuilder();
  const bridgeInfo = P.bridge(ctx, chunks, repairB, brokenB);

  // little footbridge over the stream on the plateau
  for (let k = 0; k < 9; k++) {
    chunks.at(40, -27).add(box(1.8, 0.12, 0.48), M(40, L.POND_LEVEL + 0.45, -29.6 + k * 0.55), k % 2 ? P.COLORS.plankA : P.COLORS.plankB, { recv: 1 });
  }
  ctx.surfaces.push({ x0: 39, x1: 41, z0: -29.9, z1: -24.8, y: L.POND_LEVEL + 0.5, kind: 'wood' });

  // waterfall lip: walk along the stream until the ground drops away
  let lipX = 45;
  for (let x = 42; x < 56; x += 0.1) {
    if (terrain.heightAt(x, L.WATERFALL.z) < 3.2) { lipX = x - 0.4; break; }
  }
  const fallGeo = P.waterfallGeometry(ctx, lipX);

  P.cliffRocks(ctx, lipX);
  P.coastRocks(ctx, { x: L.LIGHTHOUSE_POINT.x, z: L.LIGHTHOUSE_POINT.z, rx: L.LIGHTHOUSE_POINT.rx * 0.8, rz: L.LIGHTHOUSE_POINT.rz * 0.8 }, 61);
  P.pondDecor(ctx);
  P.coralAndSeaweed(ctx);

  onProgress(0.45, 'Sprinkling flowers…');
  await nextFrame();
  P.scatterGroundCover(ctx, [...ctx.colliders, ...ctx.surfaces.map((s) => ({ t: 'r', ...s })), ...plots.map((p) => ({ t: 'c', x: p.x, z: p.z, r: 1.8 })),
    { t: 'c', x: L.CAMPFIRE.x, z: L.CAMPFIRE.z, r: 3.5 }, { t: 'c', x: L.PICNIC.x + 2, z: L.PICNIC.z, r: 4.5 }, { t: 'c', x: L.LOGS_BLOCK.x, z: L.LOGS_BLOCK.z, r: 3 }]);

  onProgress(0.6, 'Painting the shadows…');
  await nextFrame();
  const mask = makeMaskTexture(terrain, ctx.shadows);
  U.uMask.value = mask.tex;
  U.uNoise.value = makeNoiseTexture();
  U.uCaustic.value = makeCausticTexture();
  const atlas = makeParticleAtlas();

  onProgress(0.75, 'Filling the sea…');
  await nextFrame();
  const propMat = makePropMaterial();
  const outlineMat = makeOutlineMaterial();
  const terrainMat = makeTerrainMaterial();
  const root = new THREE.Group();
  scene.add(root);
  for (const m of terrainMeshes(terrain, terrainMat)) root.add(m);
  const propMeshes = chunks.build(propMat, outlineMat);
  for (const m of propMeshes) root.add(m);

  const sea = new THREE.Mesh(new THREE.PlaneGeometry(700, 700).rotateX(-Math.PI / 2), makeWaterMaterial(L.SEA_LEVEL, 0));
  sea.renderOrder = 10;
  sea.frustumCulled = false;
  root.add(sea);
  const pond = new THREE.Mesh(pondWaterGeometry(terrain), makeWaterMaterial(L.POND_LEVEL, 0, true));
  pond.renderOrder = 11;
  root.add(pond);
  const fall = new THREE.Mesh(fallGeo, makeWaterfallMaterial());
  fall.renderOrder = 12;
  root.add(fall);

  // Separate (changeable) pieces
  const mk = (b) => {
    const g = new THREE.Group();
    for (const m of b.build(propMat, outlineMat)) g.add(m);
    return g;
  };
  const crystal = mk(crystalB);
  crystal.position.set(lh.x, lh.y, lh.z);
  root.add(crystal);
  const bridgeRepair = mk(repairB);
  const bridgeBroken = mk(brokenB);
  root.add(bridgeRepair, bridgeBroken);
  const boatB = new MeshBuilder();
  P.boatMesh(boatB);
  const boat = mk(boatB);
  boat.position.set(L.BOAT.x, 0.12, L.BOAT.z);
  boat.rotation.y = L.BOAT.rot;
  root.add(boat);
  const logsB = new MeshBuilder();
  P.fallenLogs(logsB);
  const logs = mk(logsB);
  logs.position.set(L.LOGS_BLOCK.x, terrain.heightAt(L.LOGS_BLOCK.x, L.LOGS_BLOCK.z), L.LOGS_BLOCK.z);
  root.add(logs);
  const picnicB = new MeshBuilder();
  P.picnicSet(picnicB);
  const picnic = mk(picnicB);
  picnic.position.set(L.PICNIC.x, terrain.heightAt(L.PICNIC.x, L.PICNIC.z), L.PICNIC.z);
  root.add(picnic);
  const expansionB = new MeshBuilder();
  for (const p of plots.filter((q) => q.extra)) {
    const by = terrain.heightAt(p.x, p.z);
    const s = L.GARDEN.plot;
    for (const [dx, dz, w, d] of [[0, -s / 2, s + 0.2, 0.16], [0, s / 2, s + 0.2, 0.16], [-s / 2, 0, 0.16, s], [s / 2, 0, 0.16, s]]) {
      expansionB.add(box(w, 0.22, d), M(p.x + dx, by + 0.08, p.z + dz), P.COLORS.woodM, { recv: 1 });
    }
  }
  const gardenExpansion = mk(expansionB);
  root.add(gardenExpansion);

  // Night-time glows: lanterns + fireflies
  const glowPts = [], glowData = [];
  for (const [x, y, z, s] of ctx.lights) {
    glowPts.push(x, y, z); glowData.push(2.2 * s, Math.random(), 0, 1); // the bright little flame
    glowPts.push(x, y - 1.2, z); glowData.push(7.5 * s, Math.random(), 2, 0.5); // a soft pool of warm light
  }
  const rr = mulberry32(55);
  for (let i = 0; i < 90; i++) {
    let x, z, ok = false;
    for (let t = 0; t < 20 && !ok; t++) {
      x = -55 + rr() * 105; z = -45 + rr() * 75;
      ok = terrain.sampleGrid(terrain.grass, x, z) > 0.8;
    }
    glowPts.push(x, terrain.heightAt(x, z) + 0.6 + rr() * 1.2, z);
    glowData.push(0.5, rr(), 1, 1);
  }
  const lhIndex = glowPts.length / 3;
  glowPts.push(lh.x, lh.y, lh.z);
  glowData.push(9, 0.3, 0, 0); // lighthouse glow (intensity set when restored)
  const glowGeo = new THREE.BufferGeometry();
  glowGeo.setAttribute('position', new THREE.Float32BufferAttribute(glowPts, 3));
  glowGeo.setAttribute('aData', new THREE.Float32BufferAttribute(glowData, 4));
  const glows = new THREE.Points(glowGeo, makeGlowMaterial(atlas));
  glows.frustumCulled = false;
  glows.renderOrder = 30;
  root.add(glows);

  onProgress(0.88, 'Drawing the footpaths…');
  await nextFrame();
  const walk = buildWalkGrid(terrain, ctx);
  walk.addBlocker('logs', { t: 'c', x: L.LOGS_BLOCK.x, z: L.LOGS_BLOCK.z, r: 3.4 });
  walk.addSurface('bridgeGap', null);

  const world = {
    scene, root, terrain, mask, walk, atlas, propMat, outlineMat,
    plots, bushes, palms: ctx.palms, perches: ctx.perches, shop, board, fire, lighthouse: lh,
    lipX, sea, pond, fall,
    dyn: { crystal, bridgeRepair, bridgeBroken, boat, logs, picnic, gardenExpansion, glows, lhIndex, bridgeGap: bridgeInfo.gapSurface },
    setOutlines(on) {
      root.traverse((o) => { if (o.userData.outline) o.visible = on; });
    },
    stats: { propVerts: propMeshes.reduce((s, m) => s + m.geometry.attributes.position.count, 0) },
  };
  return world;
}

