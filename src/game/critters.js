// Island animals: fish shadows, crabs, seagulls, Mochi the cat and Captain Shelly the turtle.
// Fish, crabs and gulls are just decoration (each phone runs its own).
// Mochi is the family pet, so the HOST decides where Mochi goes and shares it.
import * as THREE from 'three';
import { MeshBuilder, blob, box, cylinder, spikyCone, M, hex } from '../render/geo.js';
import { makeFishShadowMaterial } from '../render/materials.js';
import { mulberry32, damp, dampAngle, clamp, TAU } from '../util/math.js';
import * as L from '../world/layout.js';

const FISH_N = 56, CRAB_N = 9, GULL_N = 6;

function fishShadowGeometry() {
  const g = new THREE.BufferGeometry();
  // a simple fish outline lying flat; z+ = head
  const pts = [[0, 0.5], [0.16, 0.25], [0.18, 0], [0.12, -0.25], [0.03, -0.42], [0.2, -0.62], [0, -0.55], [-0.2, -0.62], [-0.03, -0.42], [-0.12, -0.25], [-0.18, 0], [-0.16, 0.25]];
  const pos = [], idx = [];
  pos.push(0, 0, 0);
  for (const [x, z] of pts) pos.push(x, 0, z);
  for (let i = 1; i <= pts.length; i++) idx.push(0, (i % pts.length) + 1, i);
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

export class Critters {
  constructor(ctx) {
    this.ctx = ctx; // {scene, world, session, fx, audio, blobs}
    const { world, scene } = ctx;
    const r = mulberry32(4242);
    this.rand = r;
    const walk = world.walk;

    // ---- fish shadows
    const fg = fishShadowGeometry();
    const phases = new Float32Array(FISH_N);
    for (let i = 0; i < FISH_N; i++) phases[i] = r();
    fg.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
    this.fishMesh = new THREE.InstancedMesh(fg, makeFishShadowMaterial(), FISH_N);
    this.fishMesh.frustumCulled = false;
    this.fishMesh.renderOrder = 9;
    scene.add(this.fishMesh);
    this.fish = [];
    const pickWater = (cx, cz, rad, pond) => {
      for (let t = 0; t < 40; t++) {
        const x = cx + (r() - 0.5) * rad * 2, z = cz + (r() - 0.5) * rad * 2;
        const lvl = walk.waterLevelAt(x, z);
        const d = walk.waterDepth(x, z);
        if ((pond ? lvl === L.POND_LEVEL : lvl === 0) && d > (pond ? 0.35 : 0.7) && d < 5) return [x, z];
      }
      return null;
    };
    this.pickWater = pickWater;
    const homes = [
      [0, 40, 14, 9], [24, 50, 12, 9], [-30, 30, 12, 6], [-64, 6, 10, 6], [-50, -45, 10, 5], [10, -48, 10, 5],
      [62, 16, 15, 8], [56, -24, 6, 3], [40, 30, 10, 5], [L.POND.x, L.POND.z, 6, 6, true],
    ];
    for (const [hx, hz, rad, count, pond] of homes) {
      for (let i = 0; i < count && this.fish.length < FISH_N; i++) {
        const p = pickWater(hx, hz, rad, pond);
        if (!p) continue;
        this.fish.push({ x: p[0], z: p[1], h: r() * TAU, sp: 0.6 + r() * 0.6, tx: p[0], tz: p[1], hx, hz, rad, pond: !!pond, s: (pond ? 0.7 : 0.75) + r() * 0.6, wait: r() * 3, mode: 'swim' });
      }
    }
    this.fishMesh.count = this.fish.length;
    this.lure = null;

    // ---- crabs
    const cb = new MeshBuilder();
    const red = hex('#e2553f'), dark = hex('#b8402e');
    cb.add(blob(0.2, 1, 0.05, 1, 0.55), M(0, 0.12, 0, 0, 0, 0, 1.3, 1, 1), red, { recv: 1, outline: false });
    for (const sx of [-1, 1]) {
      cb.add(blob(0.09, 1, 0, 2, 0.8), M(sx * 0.3, 0.12, 0.12), red, { recv: 1, outline: false });
      for (let k = 0; k < 3; k++) cb.add(box(0.2, 0.03, 0.03), M(sx * 0.27, 0.06, -0.08 + k * 0.08, 0, 0, sx * 0.5), dark, { recv: 1, outline: false });
      cb.add(box(0.025, 0.08, 0.025), M(sx * 0.07, 0.24, 0.12), dark, { recv: 1, outline: false });
      cb.add(blob(0.03, 0, 0, 3), M(sx * 0.07, 0.29, 0.12), hex('#222222'), { recv: 1, outline: false });
    }
    this.crabMesh = new THREE.InstancedMesh(cb.toGeometry(), world.propMatInst, CRAB_N);
    this.crabMesh.frustumCulled = false;
    scene.add(this.crabMesh);
    this.crabs = [];
    const beachPts = ctx.spawns.beach.concat(ctx.spawns.islet);
    for (let i = 0; i < CRAB_N && beachPts.length; i++) {
      const p = beachPts[Math.floor(r() * beachPts.length)];
      this.crabs.push({ x: p[0], z: p[1], hx: p[0], hz: p[1], h: r() * TAU, tx: p[0], tz: p[1], wait: r() * 3, run: 0, bob: 0 });
    }
    this.crabMesh.count = this.crabs.length;

    // ---- seagulls
    const gb = new MeshBuilder(), wb = new MeshBuilder();
    gb.add(blob(0.2, 1, 0, 4, 0.8), M(0, 0.32, 0, 0, 0, 0, 0.85, 1, 1.3), hex('#f7f7f2'), { recv: 0.5, outline: false });
    gb.add(blob(0.13, 1, 0, 5), M(0, 0.48, 0.2), hex('#ffffff'), { recv: 0.5, outline: false });
    gb.add(cylinder(0, 0.04, 0.14, 5), M(0, 0.47, 0.32, 0, Math.PI / 2), hex('#f5b942'), { recv: 0.5, outline: false });
    gb.add(box(0.02, 0.16, 0.02), M(0.05, 0.08, 0), hex('#f0943a'), { recv: 0.5, outline: false });
    gb.add(box(0.02, 0.16, 0.02), M(-0.05, 0.08, 0), hex('#f0943a'), { recv: 0.5, outline: false });
    gb.add(box(0.12, 0.04, 0.2), M(0, 0.32, -0.25), hex('#9aa3ad'), { recv: 0.5, outline: false });
    wb.add(box(0.5, 0.03, 0.22), M(0.27, 0, 0), hex('#c5ccd4'), { recv: 0.5, outline: false });
    wb.add(box(0.5, 0.03, 0.22), M(-0.27, 0, 0), hex('#c5ccd4'), { recv: 0.5, outline: false });
    this.gullMesh = new THREE.InstancedMesh(gb.toGeometry(), world.propMatInst, GULL_N);
    this.wingMesh = new THREE.InstancedMesh(wb.toGeometry(), world.propMatInst, GULL_N * 2);
    this.gullMesh.frustumCulled = this.wingMesh.frustumCulled = false;
    scene.add(this.gullMesh, this.wingMesh);
    this.perches = world.perches.concat([[-46, world.terrain.heightAt(-46, -42) + 1.3, -42], [-26, world.terrain.heightAt(-26, 27) + 0.8, 27], [53, world.terrain.heightAt(53, -32) + 1.2, -32]]);
    this.gulls = [];
    for (let i = 0; i < GULL_N; i++) {
      const p = this.perches[(i * 5) % this.perches.length];
      this.gulls.push({ x: p[0], y: p[1], z: p[2], h: r() * TAU, perch: (i * 5) % this.perches.length, fly: 0, flap: 0, cx: 0, cz: 0, ang: 0 });
    }
    this.gullMesh.count = GULL_N;
    this.wingMesh.count = GULL_N * 2;

    // ---- Mochi the cat (one mesh, bobbing)
    const cat = new MeshBuilder();
    const fur = hex('#f2a35e'), cream = hex('#fff1dc');
    cat.add(blob(0.24, 1, 0, 6, 0.75), M(0, 0.28, 0, 0, 0, 0, 0.85, 1, 1.35), fur, { recv: 1 });
    cat.add(blob(0.2, 1, 0, 7), M(0, 0.48, 0.3), fur, { recv: 1 });
    cat.add(blob(0.12, 1, 0, 8, 0.7), M(0, 0.42, 0.42), cream, { recv: 1 });
    for (const sx of [-1, 1]) {
      cat.add(spikyCone(0.08, 0.14, 2, 0.95, 9), M(sx * 0.11, 0.62, 0.28), fur, { recv: 1 });
      cat.add(blob(0.03, 0, 0, 10, 1.3), M(sx * 0.08, 0.5, 0.48), hex('#2b1d16'), { recv: 1, outline: false });
      for (const zz of [-0.18, 0.18]) cat.add(cylinder(0.05, 0.05, 0.16, 6), M(sx * 0.1, 0.02, zz), zz > 0 ? cream : fur, { recv: 1 });
    }
    cat.add(cylinder(0.04, 0.06, 0.45, 6), M(0, 0.32, -0.32, 0, -0.9), fur, { recv: 1 });
    const catGroup = new THREE.Group();
    for (const m of cat.build(world.propMat, world.outlineMat)) catGroup.add(m);
    world.root.add(catGroup); // (inside the island group, so Battery saver can switch its outline off)
    this.cat = { obj: catGroup, x: L.COTTAGE.x + 5, z: L.COTTAGE.z - 5.5, h: 0, tx: 0, tz: 0, anim: 0, follow: null, followT: 0, wait: 2, rx: 0, rz: 0, rh: 0, ranim: 0, seen: false };
    this.cat.tx = this.cat.x; this.cat.tz = this.cat.z;

    // ---- Captain Shelly the turtle (shopkeeper)
    const tb = new MeshBuilder();
    const skin = hex('#8fcf7a');
    tb.add(blob(0.55, 1, 0.05, 11, 0.62), M(0, 0.55, 0), hex('#8a6a3e'), { recv: 0.5 });
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; tb.add(blob(0.16, 0, 0, 12, 0.3), M(Math.cos(a) * 0.32, 0.82, Math.sin(a) * 0.32), hex('#b08a52'), { recv: 0.5, outline: false }); }
    tb.add(blob(0.24, 1, 0, 13), M(0, 0.95, 0.42), skin, { recv: 0.5 });
    tb.add(cylinder(0.2, 0.22, 0.12, 10), M(0, 1.15, 0.42), hex('#ffffff'), { recv: 0 });
    tb.add(cylinder(0.24, 0.24, 0.03, 10, { bottom: true }), M(0, 1.15, 0.47), hex('#2b3a66'), { recv: 0 });
    for (const sx of [-1, 1]) {
      tb.add(blob(0.035, 0, 0, 14, 1.3), M(sx * 0.09, 1.0, 0.63), hex('#2b1d16'), { recv: 0.5, outline: false });
      tb.add(blob(0.13, 1, 0, 15, 0.5), M(sx * 0.42, 0.62, 0.35), skin, { recv: 0.5 });
    }
    const turtle = new THREE.Group();
    for (const m of tb.build(world.propMat, world.outlineMat)) turtle.add(m);
    const [kx, kz] = world.shop.keeper;
    turtle.position.set(kx, world.shop.y + 0.05, kz);
    turtle.rotation.y = L.SHOP.rot;
    world.root.add(turtle);
    this.turtle = turtle;
    this.turtleBase = turtle.position.y;

    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
  }

  // A fish swims up to look at your bobber
  attract(x, z, level, eta) {
    let best = null, bd = 14 * 14;
    const pond = level === L.POND_LEVEL;
    for (const f of this.fish) {
      if (f.pond !== pond || f.mode === 'lure') continue;
      const d = (f.x - x) ** 2 + (f.z - z) ** 2;
      if (d < bd) { bd = d; best = f; }
    }
    if (!best) return;
    best.mode = 'lure';
    best.tx = x; best.tz = z;
    best.sp = clamp(Math.sqrt(bd) / Math.max(1, eta * 0.8), 0.5, 2.5);
    this.lure = { f: best, x, z };
  }
  release(scatter = false) {
    if (!this.lure) return;
    const f = this.lure.f;
    f.mode = 'swim';
    f.wait = 0;
    f.sp = scatter ? 3 : 1;
    if (scatter) f.x = 9999; // it was caught: respawn somewhere else
    this.lure = null;
  }

  // Host only: decide what Mochi does (state is shared in snapshots)
  hostCat(dt, players) {
    const c = this.cat;
    const walk = this.ctx.world.walk;
    const night = this.ctx.night || 0;
    c.followT -= dt;
    // (plain numbers and a plain loop: this runs every frame, so it makes no new lists)
    let target = false;
    if (c.follow && c.followT > 0) {
      for (let i = 0; i < players.length; i++) {
        const p = players[i];
        if (p.pid !== c.follow) continue;
        c.tx = p.x - Math.sin(p.char.heading) * 1.3; c.tz = p.z - Math.cos(p.char.heading) * 1.3;
        target = true;
        break;
      }
    } else c.follow = null;
    if (!target && night > 0.7) { c.tx = L.CAMPFIRE.x + 1.6; c.tz = L.CAMPFIRE.z + 1.6; target = true; }
    if (!target) {
      c.wait -= dt;
      if (c.wait <= 0 && Math.hypot(c.tx - c.x, c.tz - c.z) < 0.3) {
        c.wait = 3 + Math.random() * 6;
        for (let t = 0; t < 10; t++) {
          const nx = L.COTTAGE.x + (Math.random() - 0.5) * 22, nz = L.COTTAGE.z - 8 + (Math.random() - 0.5) * 14;
          if (walk.canWalk(nx, nz) && walk.flag(nx, nz) !== 2) { c.tx = nx; c.tz = nz; break; }
        }
      }
    }
    const dx = c.tx - c.x, dz = c.tz - c.z, d = Math.hypot(dx, dz);
    if (d > 0.35) {
      const sp = Math.min(d * 2, c.follow ? 4.6 : 1.6);
      const nx = c.x + (dx / d) * sp * dt, nz = c.z + (dz / d) * sp * dt;
      if (walk.canWalk(nx, nz)) { c.x = nx; c.z = nz; } else { c.tx = c.x; c.tz = c.z; }
      c.h = dampAngle(c.h, Math.atan2(dx, dz), 8, dt);
      c.anim = 1;
    } else c.anim = night > 0.7 ? 2 : 0;
  }
  catState() { const c = this.cat; return [+c.x.toFixed(2), +c.z.toFixed(2), +c.h.toFixed(2), c.anim]; }
  setRemoteCat(s) {
    if (!s) return;
    const c = this.cat;
    c.rx = s[0]; c.rz = s[1]; c.rh = s[2]; c.ranim = s[3];
    if (!c.seen) { c.x = s[0]; c.z = s[1]; c.h = s[2]; c.seen = true; }
  }
  petCat(pid) {
    const c = this.cat;
    c.follow = pid;
    c.followT = 25;
    this.ctx.fx.hearts(c.x, this.ctx.world.walk.groundY(c.x, c.z) - 0.8, c.z, 4);
    this.ctx.audio?.meow();
  }

  update(dt, time, focusX, focusZ, players, isHost) {
    const walk = this.ctx.world.walk;
    const m = this._m, q = this._q, e = this._e, p = this._p, s = this._s;
    // fish
    for (let i = 0; i < this.fish.length; i++) {
      const f = this.fish[i];
      if (f.x > 9000) {
        const np = this.pickWater(f.hx, f.hz, f.rad, f.pond);
        if (np) { f.x = np[0]; f.z = np[1]; f.tx = np[0]; f.tz = np[1]; }
      }
      const far = Math.abs(f.x - focusX) > 40 || Math.abs(f.z - focusZ) > 40;
      if (!far) {
        const dx = f.tx - f.x, dz = f.tz - f.z, d = Math.hypot(dx, dz);
        if (f.mode === 'lure') {
          if (d > 0.6) { f.x += (dx / d) * f.sp * dt; f.z += (dz / d) * f.sp * dt; f.h = dampAngle(f.h, Math.atan2(dx, dz), 5, dt); }
          else f.h += dt * 0.8;
        } else if (d < 0.4) {
          f.wait -= dt;
          if (f.wait <= 0) {
            f.wait = 0.5 + Math.random() * 2.5;
            f.sp = 0.5 + Math.random() * 0.8;
            const np = this.pickWater(f.hx, f.hz, f.rad, f.pond);
            if (np) { f.tx = np[0]; f.tz = np[1]; }
          }
        } else {
          f.x += (dx / d) * f.sp * dt;
          f.z += (dz / d) * f.sp * dt;
          f.h = dampAngle(f.h, Math.atan2(dx, dz), 4, dt);
        }
        // shy of people wading nearby
        for (const pl of players) {
          const ddx = f.x - pl.x, ddz = f.z - pl.z;
          if (f.mode !== 'lure' && ddx * ddx + ddz * ddz < 6) { f.tx = f.x + ddx * 3; f.tz = f.z + ddz * 3; f.sp = 2.6; }
        }
      }
      const lvl = f.pond ? L.POND_LEVEL : 0;
      e.set(0, f.h, 0);
      q.setFromEuler(e);
      m.compose(p.set(f.x, lvl - 0.12, f.z), q, s.setScalar(f.s));
      this.fishMesh.setMatrixAt(i, m);
    }
    this.fishMesh.instanceMatrix.needsUpdate = true;

    // crabs
    const blobs = this.ctx.blobs;
    for (let i = 0; i < this.crabs.length; i++) {
      const c = this.crabs[i];
      const far = Math.abs(c.x - focusX) > 35 || Math.abs(c.z - focusZ) > 35;
      if (!far) {
        let scared = false;
        for (const pl of players) {
          const dx = c.x - pl.x, dz = c.z - pl.z, dd = dx * dx + dz * dz;
          if (dd < 6.5) {
            scared = true;
            const d = Math.sqrt(dd) || 1;
            c.tx = c.x + (dx / d) * 3; c.tz = c.z + (dz / d) * 3;
          }
        }
        const dx = c.tx - c.x, dz = c.tz - c.z, d = Math.hypot(dx, dz);
        if (d > 0.15) {
          const sp = scared ? 3.2 : 1.1;
          const nx = c.x + (dx / d) * sp * dt, nz = c.z + (dz / d) * sp * dt;
          if (walk.canWalk(nx, nz) && walk.flag(nx, nz) !== 3) { c.x = nx; c.z = nz; } else { c.tx = c.x; c.tz = c.z; }
          // crabs walk sideways!
          c.h = dampAngle(c.h, Math.atan2(dx, dz) + Math.PI / 2, 6, dt);
          c.bob += dt * 22;
        } else {
          c.wait -= dt;
          if (c.wait <= 0) {
            c.wait = 1 + Math.random() * 4;
            const a = Math.random() * TAU, rr = 1 + Math.random() * 4;
            const nx = c.hx + Math.cos(a) * rr, nz = c.hz + Math.sin(a) * rr;
            if (walk.canWalk(nx, nz)) { c.tx = nx; c.tz = nz; }
          }
        }
      }
      const y = walk.groundY(c.x, c.z);
      e.set(0, c.h, Math.sin(c.bob) * 0.08);
      q.setFromEuler(e);
      m.compose(p.set(c.x, y + Math.abs(Math.sin(c.bob)) * 0.03, c.z), q, s.setScalar(1));
      this.crabMesh.setMatrixAt(i, m);
      if (!far) blobs.add(c.x, y, c.z, 0.7);
    }
    this.crabMesh.instanceMatrix.needsUpdate = true;

    // seagulls
    for (let i = 0; i < this.gulls.length; i++) {
      const g = this.gulls[i];
      if (g.fly > 0) {
        g.fly -= dt;
        g.ang += dt * 0.7;
        const per = this.perches[g.perch];
        const k = clamp(1 - g.fly / 7, 0, 1); // late in the flight, head to the new perch
        const cx = g.cx + Math.cos(g.ang) * 6, cz = g.cz + Math.sin(g.ang) * 6;
        const tx = k > 0.7 ? per[0] : cx, tz = k > 0.7 ? per[2] : cz, ty = k > 0.7 ? per[1] : 7;
        const ox = g.x, oz = g.z;
        g.x = damp(g.x, tx, 1.5, dt); g.z = damp(g.z, tz, 1.5, dt); g.y = damp(g.y, ty, 1.5, dt);
        g.h = Math.atan2(g.x - ox, g.z - oz) || g.h;
        g.flap += dt * (k > 0.85 ? 12 : 8);
        if (g.fly <= 0) { g.x = per[0]; g.y = per[1]; g.z = per[2]; g.flap = 0; }
      } else {
        for (const pl of players) {
          if ((g.x - pl.x) ** 2 + (g.z - pl.z) ** 2 < 10) {
            g.fly = 9;
            g.cx = g.x; g.cz = g.z; g.ang = Math.random() * TAU;
            g.perch = (g.perch + 3 + Math.floor(Math.random() * 5)) % this.perches.length;
            this.ctx.audio?.gull(g.x, g.z);
            break;
          }
        }
        g.h += Math.sin(time * 0.5 + i) * dt * 0.3;
      }
      e.set(0, g.h, 0);
      q.setFromEuler(e);
      m.compose(p.set(g.x, g.y, g.z), q, s.setScalar(1));
      this.gullMesh.setMatrixAt(i, m);
      const flap = g.fly > 0 ? Math.sin(g.flap) * 0.7 : 0.0;
      for (let side = 0; side < 2; side++) {
        e.set(0, g.h, (side ? 1 : -1) * flap, 'YXZ');
        q.setFromEuler(e);
        m.compose(p.set(g.x, g.y + 0.36, g.z), q, s.set(side ? 1 : -1, 1, 1).multiplyScalar(g.fly > 0 ? 1 : 0.6));
        this.wingMesh.setMatrixAt(i * 2 + side, m);
      }
      if (g.fly <= 0) blobs.add(g.x, g.y - 0.02, g.z, 0.6);
    }
    this.gullMesh.instanceMatrix.needsUpdate = true;
    this.wingMesh.instanceMatrix.needsUpdate = true;

    // Mochi
    const c = this.cat;
    if (isHost) this.hostCat(dt, players);
    else if (c.seen) {
      c.x = damp(c.x, c.rx, 8, dt); c.z = damp(c.z, c.rz, 8, dt); c.h = dampAngle(c.h, c.rh, 8, dt); c.anim = c.ranim;
    }
    const cy = walk.groundY(c.x, c.z);
    c.obj.position.set(c.x, cy + (c.anim === 1 ? Math.abs(Math.sin(time * 12)) * 0.05 : 0), c.z);
    c.obj.rotation.set(0, c.h, 0);
    c.obj.scale.set(1, c.anim === 2 ? 0.75 + Math.sin(time * 1.5) * 0.02 : 1 + Math.sin(time * 3) * 0.015, 1);
    blobs.add(c.x, cy, c.z, 0.9);
    if (c.anim === 2 && Math.random() < dt * 0.4) this.ctx.fx.notes(c.x, cy - 1.2, c.z, 1);
    // Captain Shelly bobs happily
    this.turtle.position.y = this.turtleBase + Math.sin(time * 2) * 0.03;
    this.turtle.rotation.z = Math.sin(time * 1.3) * 0.04;
  }
}
