// Low-poly shape library + a "builder" that glues many shapes into one mesh.
// Fewer meshes = fewer draw calls = a cooler, smoother phone.
import * as THREE from 'three';
import { mulberry32 } from '../util/math.js';

// A "prim" is a list of triangles: pos (xyz per corner), nor (lighting normal),
// sn (smooth normal used to push the cartoon outline outwards).
function finishPrim(pos, nor) {
  const p = new Float32Array(pos), n = new Float32Array(nor);
  return { pos: p, nor: n, sn: smoothNormals(p, n) };
}

// Average the normals of corners that share the same position.
export function smoothNormals(pos, nor) {
  const map = new Map();
  const key = (i) => `${Math.round(pos[i] * 200)},${Math.round(pos[i + 1] * 200)},${Math.round(pos[i + 2] * 200)}`;
  for (let i = 0; i < pos.length; i += 3) {
    const k = key(i);
    let acc = map.get(k);
    if (!acc) map.set(k, (acc = [0, 0, 0]));
    acc[0] += nor[i]; acc[1] += nor[i + 1]; acc[2] += nor[i + 2];
  }
  const out = new Float32Array(pos.length);
  for (let i = 0; i < pos.length; i += 3) {
    const a = map.get(key(i));
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    out[i] = a[0] / l; out[i + 1] = a[1] / l; out[i + 2] = a[2] / l;
  }
  return out;
}

function pushTri(pos, nor, a, b, c, flatNormal = null) {
  pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  let n = flatNormal;
  if (!n) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    n = [nx / l, ny / l, nz / l];
  }
  nor.push(n[0], n[1], n[2], n[0], n[1], n[2], n[0], n[1], n[2]);
}
const quad = (pos, nor, a, b, c, d, n) => { pushTri(pos, nor, a, b, c, n); pushTri(pos, nor, a, c, d, n); };

// Box centred on the origin
export function box(w, h, d) {
  const x = w / 2, y = h / 2, z = d / 2;
  const pos = [], nor = [];
  quad(pos, nor, [-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z], [0, 0, 1]);
  quad(pos, nor, [x, -y, -z], [-x, -y, -z], [-x, y, -z], [x, y, -z], [0, 0, -1]);
  quad(pos, nor, [x, -y, z], [x, -y, -z], [x, y, -z], [x, y, z], [1, 0, 0]);
  quad(pos, nor, [-x, -y, -z], [-x, -y, z], [-x, y, z], [-x, y, -z], [-1, 0, 0]);
  quad(pos, nor, [-x, y, z], [x, y, z], [x, y, -z], [-x, y, -z], [0, 1, 0]);
  quad(pos, nor, [-x, -y, -z], [x, -y, -z], [x, -y, z], [-x, -y, z], [0, -1, 0]);
  return finishPrim(pos, nor);
}

// Cylinder / cone standing on y=0, up to y=h
export function cylinder(rTop, rBot, h, seg = 8, { top = true, bottom = false, smooth = true } = {}) {
  const pos = [], nor = [];
  const slope = (rBot - rTop) / h;
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
    const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    const b0 = [c0 * rBot, 0, s0 * rBot], b1 = [c1 * rBot, 0, s1 * rBot];
    const t0 = [c0 * rTop, h, s0 * rTop], t1 = [c1 * rTop, h, s1 * rTop];
    if (smooth) {
      const n0 = new THREE.Vector3(c0, slope, s0).normalize(), n1 = new THREE.Vector3(c1, slope, s1).normalize();
      pos.push(...b0, ...t1, ...b1, ...b0, ...t0, ...t1);
      nor.push(n0.x, n0.y, n0.z, n1.x, n1.y, n1.z, n1.x, n1.y, n1.z, n0.x, n0.y, n0.z, n0.x, n0.y, n0.z, n1.x, n1.y, n1.z);
    } else {
      pushTri(pos, nor, b0, t1, b1);
      pushTri(pos, nor, b0, t0, t1);
    }
    if (top && rTop > 0.0001) pushTri(pos, nor, [0, h, 0], t1, t0, [0, 1, 0]);
    if (bottom) pushTri(pos, nor, [0, 0, 0], b0, b1, [0, -1, 0]);
  }
  return finishPrim(pos, nor);
}

// Star-shaped cone (spiky pine tree layer), base at y=0
export function spikyCone(r, h, points = 7, inner = 0.72, seed = 1) {
  const pos = [], nor = [];
  const rand = mulberry32(seed);
  const n = points * 2;
  const ring = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand() * 0.15;
    const rr = (i % 2 === 0 ? r : r * inner) * (0.9 + rand() * 0.2);
    ring.push([Math.cos(a) * rr, (i % 2 === 0 ? -0.12 : 0.05) * h, Math.sin(a) * rr]);
  }
  const tip = [0, h, 0], mid = [0, 0.08 * h, 0];
  for (let i = 0; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % n];
    pushTri(pos, nor, a, tip, b);
    pushTri(pos, nor, b, mid, a);
  }
  return finishPrim(pos, nor);
}

// Triangular prism (house gable): triangle in x/y (width w, height h) extruded along z
export function prism(w, h, d) {
  const x = w / 2, z = d / 2;
  const pos = [], nor = [];
  const a = [-x, 0, z], b = [x, 0, z], c = [0, h, z];
  const a2 = [-x, 0, -z], b2 = [x, 0, -z], c2 = [0, h, -z];
  pushTri(pos, nor, a, b, c);
  pushTri(pos, nor, b2, a2, c2);
  quad(pos, nor, b, b2, c2, c);
  quad(pos, nor, a2, a, c, c2);
  quad(pos, nor, a2, b2, b, a);
  return finishPrim(pos, nor);
}

// Low-poly ball. jitter > 0 makes it lumpy (rocks, bushes).
export function blob(r, detail = 1, jitter = 0, seed = 1, squashY = 1) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const src = g.attributes.position.array;
  const rand = mulberry32(seed);
  const disp = new Map();
  const pos = [], nor = [];
  const P = (i) => {
    const k = `${src[i].toFixed(3)},${src[i + 1].toFixed(3)},${src[i + 2].toFixed(3)}`;
    let s = disp.get(k);
    if (s === undefined) { s = 1 + (rand() - 0.5) * 2 * jitter; disp.set(k, s); }
    return [src[i] * r * s, src[i + 1] * r * s * squashY, src[i + 2] * r * s];
  };
  for (let i = 0; i < src.length; i += 9) pushTri(pos, nor, P(i), P(i + 3), P(i + 6));
  g.dispose();
  return finishPrim(pos, nor);
}

// Palm frond: a drooping spine with jagged leaflets on both sides (double sided).
export function palmFrond(len = 3, width = 0.75, droop = 1.2, seed = 1) {
  const pos = [], nor = [];
  const rand = mulberry32(seed);
  const SEG = 7;
  const spine = [];
  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG;
    spine.push([0, Math.sin(t * Math.PI * 0.55) * 0.5 - t * t * droop, t * len]);
  }
  const up = [0, 1, 0];
  for (let i = 0; i < SEG; i++) {
    const a = spine[i], b = spine[i + 1];
    const t = (i + 0.5) / SEG;
    const w = width * Math.sin(Math.min(1, t * 1.2) * Math.PI) * (0.8 + 0.4 * rand());
    for (const side of [-1, 1]) {
      const tip = [side * w, (a[1] + b[1]) / 2 - 0.12 * t, (a[2] + b[2]) / 2 + 0.25];
      const tri = side > 0 ? [a, b, tip] : [b, a, tip];
      pushTri(pos, nor, tri[0], tri[1], tri[2], up);
      pushTri(pos, nor, tri[1], tri[0], tri[2], [0, -1, 0]);
    }
  }
  const p = new Float32Array(pos), n = new Float32Array(nor);
  return { pos: p, nor: n, sn: n.slice() };
}

// Little clump of grass blades
export function grassTuft(h = 0.45, blades = 4, seed = 1) {
  const pos = [], nor = [];
  const rand = mulberry32(seed);
  for (let i = 0; i < blades; i++) {
    const a = rand() * Math.PI * 2, r = 0.05 + rand() * 0.12;
    const bx = Math.cos(a) * r, bz = Math.sin(a) * r;
    const lean = 0.12 + rand() * 0.15;
    const hh = h * (0.6 + rand() * 0.6);
    const w = 0.06;
    const px = -Math.sin(a) * w, pz = Math.cos(a) * w;
    const tip = [bx + Math.cos(a) * lean, hh, bz + Math.sin(a) * lean];
    const n = [Math.cos(a) * 0.3, 0.9, Math.sin(a) * 0.3];
    pushTri(pos, nor, [bx - px, 0, bz - pz], [bx + px, 0, bz + pz], tip, n);
    pushTri(pos, nor, [bx + px, 0, bz + pz], [bx - px, 0, bz - pz], tip, n);
  }
  const p = new Float32Array(pos), nn = new Float32Array(nor);
  return { pos: p, nor: nn, sn: nn.slice() };
}

// Flat 5-petal flower (petals + centre are separate prims so they can be coloured)
export function flowerPetals(r = 0.16, petals = 5) {
  const pos = [], nor = [];
  const up = [0, 1, 0];
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * Math.PI * 2;
    const a0 = a - 0.42, a1 = a + 0.42;
    pushTri(pos, nor, [0, 0, 0], [Math.cos(a1) * r * 0.8, 0.02, Math.sin(a1) * r * 0.8], [Math.cos(a0) * r * 0.8, 0.02, Math.sin(a0) * r * 0.8], up);
    pushTri(pos, nor, [Math.cos(a0) * r * 0.8, 0.02, Math.sin(a0) * r * 0.8], [Math.cos(a1) * r * 0.8, 0.02, Math.sin(a1) * r * 0.8], [Math.cos(a) * r, 0.03, Math.sin(a) * r], up);
  }
  const p = new Float32Array(pos), n = new Float32Array(nor);
  return { pos: p, nor: n, sn: n.slice() };
}

// A flat polygon lying on the ground (y=0), double sided.
export function flatPoly(pts) {
  const pos = [], nor = [];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = [pts[0][0], 0, pts[0][1]], b = [pts[i][0], 0, pts[i][1]], c = [pts[i + 1][0], 0, pts[i + 1][1]];
    pushTri(pos, nor, a, c, b, [0, 1, 0]);
    pushTri(pos, nor, a, b, c, [0, 1, 0]);
  }
  const p = new Float32Array(pos), n = new Float32Array(nor);
  return { pos: p, nor: n, sn: n.slice() };
}

// Torus-ish ring (rope coil, lifebuoy) lying flat
export function ring(R = 0.4, r = 0.08, seg = 12, side = 5) {
  const g = new THREE.TorusGeometry(R, r, side, seg);
  g.rotateX(-Math.PI / 2);
  const ng = g.toNonIndexed();
  ng.computeVertexNormals();
  const pos = Array.from(ng.attributes.position.array), nor = Array.from(ng.attributes.normal.array);
  g.dispose(); ng.dispose();
  return finishPrim(pos, nor);
}

export function fromGeometry(geometry) {
  const ng = geometry.index ? geometry.toNonIndexed() : geometry;
  if (!ng.attributes.normal) ng.computeVertexNormals();
  return finishPrim(Array.from(ng.attributes.position.array), Array.from(ng.attributes.normal.array));
}

const _m3 = new THREE.Matrix3();
const _v = new THREE.Vector3();

// Collects many shapes into one big mesh (+ a matching outline mesh).
export class MeshBuilder {
  constructor() {
    this.p = []; this.n = []; this.c = []; this.a = [];
    this.op = []; this.on = []; this.os = [];
  }
  get count() { return this.p.length / 3; }
  /**
   * prim  - shape from the library above
   * m     - THREE.Matrix4 placing it in the world
   * color - [r,g,b] (0..1) or a function (localPos) => [r,g,b]
   * opts  - sway: number | (worldY)=>number, recv: receives painted shadows, glow, outline
   */
  add(prim, m, color, opts = {}) {
    const { recv = 1, glow = 0, outline = true } = opts;
    let sway = opts.sway || 0;
    _m3.getNormalMatrix(m);
    const e = m.elements;
    const P = prim.pos, Nn = prim.nor, S = prim.sn;
    const colorFn = typeof color === 'function' ? color : null;
    const swayFn = typeof sway === 'function' ? sway : null;
    for (let i = 0; i < P.length; i += 3) {
      const x = P[i], y = P[i + 1], z = P[i + 2];
      const wx = e[0] * x + e[4] * y + e[8] * z + e[12];
      const wy = e[1] * x + e[5] * y + e[9] * z + e[13];
      const wz = e[2] * x + e[6] * y + e[10] * z + e[14];
      this.p.push(wx, wy, wz);
      _v.set(Nn[i], Nn[i + 1], Nn[i + 2]).applyMatrix3(_m3).normalize();
      this.n.push(_v.x, _v.y, _v.z);
      const col = colorFn ? colorFn(x, y, z, wy) : color;
      this.c.push(col[0], col[1], col[2]);
      const sw = swayFn ? swayFn(wy, y) : sway;
      this.a.push(sw, recv, glow);
      if (outline) {
        _v.set(S[i], S[i + 1], S[i + 2]).applyMatrix3(_m3).normalize();
        this.op.push(wx, wy, wz);
        this.on.push(_v.x, _v.y, _v.z);
        this.os.push(sw);
      }
    }
  }
  // Just the geometry (used for things drawn many times, like shells on the beach)
  toGeometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('aColor', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('aAux', new THREE.Float32BufferAttribute(this.a, 3));
    g.computeBoundingSphere();
    return g;
  }
  build(material, outlineMaterial) {
    const out = [];
    if (this.p.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
      g.setAttribute('aColor', new THREE.Float32BufferAttribute(this.c, 3));
      g.setAttribute('aAux', new THREE.Float32BufferAttribute(this.a, 3));
      g.computeBoundingSphere();
      g.computeBoundingBox();
      out.push(new THREE.Mesh(g, material));
    }
    if (outlineMaterial && this.op.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.op, 3));
      g.setAttribute('aOutN', new THREE.Float32BufferAttribute(this.on, 3));
      g.setAttribute('aSway', new THREE.Float32BufferAttribute(this.os, 1));
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, outlineMaterial);
      mesh.userData.outline = true;
      out.push(mesh);
    }
    return out;
  }
}

// Splits the world into squares; each square becomes its own mesh so the phone can
// skip drawing squares that are off-screen ("frustum culling").
export class ChunkedBuilder {
  constructor(half, chunkSize) {
    this.half = half;
    this.size = chunkSize;
    this.n = Math.ceil((half * 2) / chunkSize);
    this.builders = new Map();
  }
  at(x, z) {
    const i = Math.max(0, Math.min(this.n - 1, Math.floor((x + this.half) / this.size)));
    const j = Math.max(0, Math.min(this.n - 1, Math.floor((z + this.half) / this.size)));
    const k = j * this.n + i;
    let b = this.builders.get(k);
    if (!b) this.builders.set(k, (b = new MeshBuilder()));
    return b;
  }
  build(material, outlineMaterial) {
    const out = [];
    for (const b of this.builders.values()) out.push(...b.build(material, outlineMaterial));
    return out;
  }
}

// Handy matrix maker: position, rotation (y, then x, then z) and scale.
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
export function M(x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  _e.set(rx, ry, rz, 'YXZ');
  _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
}

export const hex = (h) => {
  const c = new THREE.Color(h);
  return [c.r, c.g, c.b];
};
export const shade = (c, f) => [c[0] * f, c[1] * f, c[2] * f];
export const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
