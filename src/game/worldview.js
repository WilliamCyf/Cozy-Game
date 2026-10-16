// Draws the parts of the island that CHANGE: shells on the beach, fruit on bushes, crops,
// the bridge once it's fixed, the glowing lighthouse… It only redraws when the ledger
// changes (not every frame), which keeps the phone's work tiny.
import * as THREE from 'three';
import { MeshBuilder, box, cylinder, blob, spikyCone, flowerPetals, grassTuft, M, hex, shade } from '../render/geo.js';
import { CROPS } from './data.js';
import { DIG_SPOT } from './spawns.js';
import * as L from '../world/layout.js';
import { U } from '../render/materials.js';

const ITEM_KINDS = ['shell', 'starfish', 'coral', 'driftwood', 'seaglass', 'mushroom', 'flower', 'coconut'];

function itemGeometry(kind) {
  const b = new MeshBuilder();
  const o = { recv: 1, outline: false };
  switch (kind) {
    case 'shell':
      b.add(spikyCone(0.26, 0.12, 6, 0.85, 3), M(0, 0.02, 0, 0, 0, 0, 1, 1, 0.75), hex('#ffd2c4'), o);
      b.add(box(0.1, 0.06, 0.08), M(0, 0.03, -0.17), hex('#f2b2a0'), o);
      break;
    case 'starfish':
      b.add(spikyCone(0.3, 0.08, 5, 0.35, 4), M(0, 0.03, 0), hex('#f5935a'), o);
      break;
    case 'coral':
      for (let k = 0; k < 4; k++) b.add(cylinder(0.035, 0.05, 0.3, 5), M(0, 0, 0, k * 1.6, 0.5, 0.3), hex('#f48fb1'), o);
      break;
    case 'driftwood':
      b.add(cylinder(0.09, 0.11, 1.1, 6, { top: true, bottom: true }), M(0, 0.1, 0, 0.3, 0, Math.PI / 2).multiply(new THREE.Matrix4().makeTranslation(0, -0.55, 0)), hex('#b8a48c'), o);
      b.add(cylinder(0.04, 0.06, 0.4, 5), M(0.15, 0.1, 0.05, 1.2, 0, 1.0), hex('#a8937b'), o);
      break;
    case 'seaglass':
      b.add(blob(0.14, 0, 0, 1, 1.3), M(0, 0.12, 0), hex('#7fe0e8'), { ...o, glow: 1 });
      b.add(blob(0.1, 0, 0, 2, 1.2), M(0.12, 0.08, 0.06), hex('#9cf0c8'), { ...o, glow: 1 });
      break;
    case 'mushroom':
      b.add(cylinder(0.06, 0.07, 0.22, 6), M(0, 0, 0), hex('#f6efe0'), o);
      b.add(blob(0.18, 1, 0, 3, 0.6), M(0, 0.24, 0), hex('#e8574a'), o);
      for (const [dx, dz] of [[0.08, 0.05], [-0.07, 0.07], [0, -0.09]]) b.add(blob(0.035, 0, 0, 4), M(dx, 0.32, dz), hex('#ffffff'), o);
      break;
    case 'flower':
      for (const [dx, dz, c] of [[0, 0, '#ff9ec4'], [0.22, 0.1, '#ffd6e8'], [-0.15, 0.18, '#ffb3c7']]) {
        b.add(box(0.03, 0.3, 0.03), M(dx, 0.15, dz), hex('#5fae45'), o);
        b.add(flowerPetals(0.13, 5), M(dx, 0.31, dz), hex(c), { ...o, sway: 0.2 });
        b.add(blob(0.04, 0, 0, 5), M(dx, 0.33, dz), hex('#f5cf4a'), o);
      }
      break;
    case 'coconut':
      b.add(blob(0.22, 1, 0.08, 6), M(0, 0.18, 0), hex('#7a5232'), o);
      break;
    default:
  }
  return b.toGeometry();
}

function cropGeometry(crop, stage) {
  const c = CROPS[crop];
  const b = new MeshBuilder();
  const leaf = hex(c.leaf), prod = hex(c.color);
  const o = { recv: 1, outline: false };
  const spots = [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]];
  for (const [x, z] of spots) {
    if (stage === 0) {
      b.add(blob(0.1, 0, 0, 1, 0.5), M(x - 0.06, 0.06, z), leaf, o);
      b.add(blob(0.1, 0, 0, 2, 0.5), M(x + 0.06, 0.08, z), shade(leaf, 1.1), o);
      continue;
    }
    const s = stage === 1 ? 0.55 : 1;
    const sway = { ...o, sway: 0.25 };
    if (crop === 'corn' || crop === 'sunflower') {
      const h = (stage === 1 ? 0.6 : stage === 2 ? 1.2 : 1.5);
      b.add(cylinder(0.04, 0.06, h, 5), M(x, 0, z), leaf, sway);
      for (let k = 0; k < 3; k++) b.add(grassTuft(0.5 * s, 2, k + x * 10), M(x, h * (0.3 + k * 0.2), z, k * 2), shade(leaf, 1.1), sway);
      if (stage === 3) {
        if (crop === 'corn') { b.add(cylinder(0.07, 0.08, 0.35, 6), M(x + 0.08, h * 0.55, z, 0, 0, -0.4), prod, sway); }
        else {
          b.add(cylinder(0.26, 0.26, 0.06, 12, { top: true, bottom: true }), M(x, h, z + 0.05, 0, 1.1), prod, sway);
          b.add(cylinder(0.12, 0.12, 0.08, 10, { top: true }), M(x, h + 0.02, z + 0.09, 0, 1.1), hex('#7a4f2f'), sway);
        }
      }
    } else if (crop === 'pumpkin') {
      b.add(blob(0.3 * s, 1, 0.15, 7, 0.4), M(x, 0.08, z), leaf, sway);
      if (stage === 3) {
        b.add(blob(0.32, 1, 0.04, 8, 0.72), M(x, 0.22, z), prod, o);
        b.add(cylinder(0.03, 0.04, 0.12, 5), M(x, 0.42, z), hex('#6b8f3a'), o);
      }
    } else if (crop === 'tomato') {
      b.add(box(0.03, 0.9 * s + 0.2, 0.03), M(x + 0.12, 0.45 * s, z), hex('#c49a6c'), o);
      b.add(blob(0.24 * s, 1, 0.2, 9, 1.3), M(x, 0.35 * s, z), leaf, sway);
      if (stage === 3) for (const [dx, dy] of [[0.12, 0.35], [-0.1, 0.5], [0.05, 0.62]]) b.add(blob(0.08, 1, 0, 10), M(x + dx, dy, z + 0.12), prod, sway);
    } else {
      // carrot, strawberry, potato: low leafy plants
      b.add(grassTuft(0.42 * s, 5, 11 + x * 7), M(x, 0, z), leaf, sway);
      b.add(blob(0.16 * s, 1, 0.2, 12, 0.6), M(x, 0.08 * s, z), shade(leaf, 0.9), sway);
      if (stage === 3) {
        if (crop === 'carrot') b.add(cylinder(0.09, 0.0, 0.12, 6), M(x, 0.02, z, 0, Math.PI), prod, o), b.add(cylinder(0.1, 0.09, 0.06, 6), M(x, 0.0, z), prod, o);
        if (crop === 'strawberry') for (const [dx, dz] of [[0.15, 0.08], [-0.12, 0.12], [0.02, -0.15]]) b.add(blob(0.07, 1, 0, 13, 1.2), M(x + dx, 0.07, z + dz), prod, o);
        if (crop === 'potato') for (const [dx, dz] of [[0.16, 0.1], [-0.14, -0.08]]) b.add(blob(0.09, 1, 0.2, 14, 0.8), M(x + dx, 0.04, z + dz), prod, o);
      }
    }
  }
  return b.toGeometry();
}

export class WorldView {
  constructor(world, session, fx) {
    this.world = world;
    this.session = session;
    this.fx = fx;
    const scene = world.root;
    this.mat = world.propMat;
    const _m = new THREE.Matrix4();
    this._m = _m;

    // ground items: one instanced mesh per kind
    this.itemMeshes = {};
    for (const k of ITEM_KINDS) {
      const mesh = new THREE.InstancedMesh(itemGeometry(k), this.mat, 24);
      mesh.count = 0;
      mesh.frustumCulled = false;
      scene.add(mesh);
      this.itemMeshes[k] = mesh;
    }
    // fruit on bushes
    const fruitGeo = { orange: new MeshBuilder(), berry: new MeshBuilder() };
    fruitGeo.orange.add(blob(0.17, 1, 0, 1), M(0, 0, 0), hex('#f5932a'), { recv: 0.3, outline: false, sway: 0.15 });
    for (const [dx, dy, dz] of [[0, 0, 0], [0.09, 0.05, 0.05], [-0.07, 0.06, 0.06], [0.02, 0.12, -0.04]]) fruitGeo.berry.add(blob(0.07, 1, 0, 2), M(dx, dy, dz), hex('#5a6fd8'), { recv: 0.3, outline: false, sway: 0.15 });
    this.fruit = {};
    for (const k of ['orange', 'berry']) {
      const mesh = new THREE.InstancedMesh(fruitGeo[k].toGeometry(), this.mat, 30);
      mesh.count = 0;
      mesh.frustumCulled = false;
      scene.add(mesh);
      this.fruit[k] = mesh;
    }
    this.fruitSpots = world.bushes.map((b, i) => {
      const y = world.terrain.heightAt(b.x, b.z);
      const s = b.kind === 'berry' ? 0.85 : 1;
      return [0, 1, 2].map((k) => {
        const a = k * 2.1 + i;
        return [b.x + Math.cos(a) * 0.75 * s, y + (0.75 + (k % 2) * 0.35) * s, b.z + Math.sin(a) * 0.65 * s + 0.2];
      });
    });
    // coconuts up in the palms
    const cocoB = new MeshBuilder();
    cocoB.add(blob(0.22, 0, 0.1, 3), M(0, 0, 0), hex('#7a5232'), { recv: 0, outline: false, sway: 1.3 });
    this.coconuts = new THREE.InstancedMesh(cocoB.toGeometry(), this.mat, world.palms.length * 3);
    this.coconuts.frustumCulled = false;
    scene.add(this.coconuts);

    // garden: soil patches (colour shows if watered) + crops
    const soilB = new MeshBuilder();
    soilB.add(box(L.GARDEN.plot - 0.1, 0.14, L.GARDEN.plot - 0.1), M(0, 0.04, 0), [1, 1, 1], { recv: 1, outline: false });
    this.soil = new THREE.InstancedMesh(soilB.toGeometry(), this.mat, world.plots.length);
    this.soil.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(world.plots.length * 3), 3);
    this.soil.frustumCulled = false;
    scene.add(this.soil);
    this.cropCache = new Map();
    this.cropMeshes = world.plots.map((p) => {
      const m = new THREE.Mesh(new THREE.BufferGeometry(), this.mat);
      m.position.set(p.x, world.terrain.heightAt(p.x, p.z) + 0.06, p.z);
      m.visible = false;
      m.frustumCulled = false;
      scene.add(m);
      return m;
    });

    // treasure X on Turtle Islet + mailbox flag
    const xB = new MeshBuilder();
    xB.add(box(1.0, 0.04, 0.18), M(0, 0.02, 0, 0.785), hex('#c9473d'), { recv: 1, outline: false });
    xB.add(box(1.0, 0.04, 0.18), M(0, 0.02, 0, -0.785), hex('#c9473d'), { recv: 1, outline: false });
    this.digMark = new THREE.Mesh(xB.toGeometry(), this.mat);
    this.digMark.position.set(DIG_SPOT.x, world.terrain.heightAt(DIG_SPOT.x, DIG_SPOT.z) + 0.02, DIG_SPOT.z);
    scene.add(this.digMark);
    const flagB = new MeshBuilder();
    flagB.add(box(0.04, 0.4, 0.04), M(0.25, 0.2, 0), hex('#5b5f66'), { recv: 0.5, outline: false });
    flagB.add(box(0.03, 0.18, 0.26), M(0.25, 0.32, 0.13), hex('#e8574a'), { recv: 0.5, outline: false });
    this.mailFlag = new THREE.Mesh(flagB.toGeometry(), this.mat);
    this.mailFlag.position.set(L.MAILBOX.x, world.terrain.heightAt(L.MAILBOX.x, L.MAILBOX.z) + 1.2, L.MAILBOX.z);
    scene.add(this.mailFlag);

    // lighthouse beam (only when restored, at night)
    const beamGeo = new THREE.ConeGeometry(4, 26, 16, 1, true).translate(0, -13, 0).rotateZ(Math.PI / 2);
    this.beam = new THREE.Mesh(beamGeo, new THREE.ShaderMaterial({
      uniforms: { uGlow: U.uGlow },
      vertexShader: 'varying float vX; void main(){ vX = position.x; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform float uGlow; varying float vX; void main(){ float a = (1.0 - clamp(vX / 26.0, 0.0, 1.0)) * 0.16 * uGlow; gl_FragColor = vec4(vec3(1.0, 0.95, 0.75) * a, 1.0); }',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    this.beam.position.set(world.lighthouse.x, world.lighthouse.y, world.lighthouse.z);
    this.beam.visible = false;
    this.beam.renderOrder = 31;
    scene.add(this.beam);

    this.sparkleT = 0;
    this.projDone = {};
    this.fireworkT = 0;
    this.refreshAll();
    session.on('ops', (ops) => this.onOps(ops));
    session.on('state', () => this.refreshAll());
  }

  onOps(ops) {
    const touched = new Set();
    for (const op of ops) touched.add(op[1][0]);
    if (touched.has('items')) this.refreshItems();
    if (touched.has('bushes')) this.refreshFruit();
    if (touched.has('palms')) this.refreshCoconuts();
    if (touched.has('plots')) this.refreshPlots();
    if (touched.has('projects')) this.refreshProjects();
    if (touched.has('treasure') || touched.has('day') || touched.has('mail')) this.refreshMarks();
  }

  refreshAll() {
    if (!this.session.state) return;
    this.refreshItems();
    this.refreshFruit();
    this.refreshCoconuts();
    this.refreshPlots();
    this.refreshProjects();
    this.refreshMarks();
  }

  refreshItems() {
    const counts = {};
    const m = this._m, q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1);
    for (const k of ITEM_KINDS) counts[k] = 0;
    for (const it of Object.values(this.session.state.items)) {
      const mesh = this.itemMeshes[it.k];
      if (!mesh || counts[it.k] >= 24) continue;
      e.set(0, ((it.r || 0) * Math.PI) / 180, 0);
      q.setFromEuler(e);
      p.set(it.x, this.world.walk.groundY(it.x, it.z), it.z);
      m.compose(p, q, s);
      mesh.setMatrixAt(counts[it.k]++, m);
    }
    for (const k of ITEM_KINDS) {
      const mesh = this.itemMeshes[k];
      mesh.count = counts[k];
      mesh.visible = counts[k] > 0;
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  refreshFruit() {
    const counts = { orange: 0, berry: 0 };
    const m = this._m;
    this.world.bushes.forEach((b, i) => {
      const n = this.session.state.bushes[i]?.fruit ?? 0;
      for (let k = 0; k < n; k++) {
        const [x, y, z] = this.fruitSpots[i][k];
        m.makeTranslation(x, y, z);
        this.fruit[b.kind].setMatrixAt(counts[b.kind]++, m);
      }
    });
    for (const k of ['orange', 'berry']) {
      this.fruit[k].count = counts[k];
      this.fruit[k].visible = counts[k] > 0;
      this.fruit[k].instanceMatrix.needsUpdate = true;
    }
  }

  refreshCoconuts() {
    let n = 0;
    this.world.palms.forEach((p, i) => {
      if (!this.session.state.palms[i]?.ready) return;
      for (const [x, y, z] of p.coco) { this._m.makeTranslation(x, y, z); this.coconuts.setMatrixAt(n++, this._m); }
    });
    this.coconuts.count = n;
    this.coconuts.instanceMatrix.needsUpdate = true;
  }

  plotOpen(i) {
    return !this.world.plots[i].extra || this.session.state.projects.garden?.done;
  }

  refreshPlots() {
    const col = new THREE.Color();
    const st = this.session.state;
    let n = 0;
    this.world.plots.forEach((p, i) => {
      const s = st.plots[i];
      const open = this.plotOpen(i);
      if (open) {
        this._m.makeTranslation(p.x, this.world.terrain.heightAt(p.x, p.z), p.z);
        this.soil.setMatrixAt(n, this._m);
        if (!s?.crop) col.set('#b98a5e');
        else if (s.water || st.weather === 'rain' || s.stage >= 3) col.set('#6e4a32');
        else col.set('#a5764c');
        this.soil.setColorAt(n, col);
        n++;
      }
      const mesh = this.cropMeshes[i];
      if (!open || !s?.crop) { mesh.visible = false; return; }
      const key = s.crop + ':' + s.stage;
      let g = this.cropCache.get(key);
      if (!g) this.cropCache.set(key, (g = cropGeometry(s.crop, s.stage)));
      mesh.geometry = g;
      mesh.visible = true;
    });
    this.soil.count = n;
    this.soil.instanceMatrix.needsUpdate = true;
    if (this.soil.instanceColor) this.soil.instanceColor.needsUpdate = true;
  }

  refreshProjects() {
    const pr = this.session.state.projects;
    const d = this.world.dyn;
    const bridge = !!pr.bridge?.done;
    d.bridgeRepair.visible = bridge;
    d.bridgeBroken.visible = !bridge;
    if (bridge !== this.projDone.bridge) {
      if (bridge) this.world.walk.addSurface('bridgeGap', d.bridgeGap);
      else this.world.walk.removeSurface('bridgeGap');
    }
    const path = !!pr.path?.done;
    d.logs.visible = !path;
    if (path !== this.projDone.path) {
      if (path) this.world.walk.removeBlocker('logs');
      else this.world.walk.addBlocker('logs', { t: 'c', x: L.LOGS_BLOCK.x, z: L.LOGS_BLOCK.z, r: 3.4 });
    }
    d.picnic.visible = !!pr.picnic?.done;
    d.gardenExpansion.visible = !!pr.garden?.done;
    const lh = !!pr.lighthouse?.done;
    const glowData = d.glows.geometry.attributes.aData;
    glowData.setW(d.lhIndex, lh ? 1 : 0);
    glowData.needsUpdate = true;
    this.lighthouseOn = lh;
    this.festival = !!pr.festival?.done;
    this.projDone = { bridge, path, picnic: d.picnic.visible, lh };
    this.refreshPlots();
    this.refreshMarks();
  }

  refreshMarks() {
    const st = this.session.state;
    this.digMark.visible = !!st.projects.bridge?.done && (st.treasure?.day || 0) < st.day;
    this.mailFlag.visible = (st.mail?.day || 0) < st.day;
  }

  update(dt, time, night, nearX, nearZ) {
    // the lighthouse crystal slowly spins; at night its beam sweeps the sea
    const d = this.world.dyn;
    d.crystal.rotation.y += dt * 0.6;
    d.crystal.position.y = this.world.lighthouse.y + Math.sin(time * 1.5) * 0.08;
    this.beam.visible = this.lighthouseOn && night > 0.05;
    if (this.beam.visible) this.beam.rotation.y += dt * 0.5;
    // gentle boat bob
    d.boat.position.y = 0.12 + Math.sin(time * 1.3) * 0.05;
    d.boat.rotation.z = Math.sin(time * 0.9) * 0.03;
    // little sparkles so kids can spot things to pick up
    this.sparkleT -= dt;
    if (this.sparkleT <= 0) {
      this.sparkleT = 0.9;
      let best = null, bd = 18 * 18;
      for (const it of Object.values(this.session.state.items)) {
        const dd = (it.x - nearX) ** 2 + (it.z - nearZ) ** 2;
        if (dd < bd && Math.random() < 0.5) { bd = dd; best = it; }
      }
      if (best) this.fx.sparkle(best.x, this.world.walk.groundY(best.x, best.z) - 0.3, best.z, 2, [1, 1, 0.8]);
      this.world.plots.forEach((p, i) => {
        const s = this.session.state.plots[i];
        if (s?.crop && s.stage >= 3 && Math.random() < 0.3) this.fx.sparkle(p.x, this.world.terrain.heightAt(p.x, p.z), p.z, 2);
      });
    }
    // Lantern Festival: fireworks every night!
    if (this.festival && night > 0.6) {
      this.fireworkT -= dt;
      if (this.fireworkT <= 0) {
        this.fireworkT = 1.2 + Math.random() * 1.6;
        const cols = [[[1, 0.45, 0.5], [1, 0.85, 0.4]], [[0.5, 0.8, 1], [0.8, 0.6, 1]], [[0.5, 1, 0.6], [1, 1, 0.6]]][Math.floor(Math.random() * 3)];
        this.fx.burst(nearX + (Math.random() - 0.5) * 24, 14 + Math.random() * 5, nearZ - 12 - Math.random() * 10, cols);
        this.onFirework?.();
      }
    }
  }
}
