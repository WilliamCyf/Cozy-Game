// Little visual effects: splashes, sparkles, hearts, footstep puffs, floating "+1 🐚" labels.
// All particles share ONE pool drawn in ONE draw call; when nothing is happening it costs ~nothing.
import * as THREE from 'three';
import { U } from '../render/materials.js';

const MAX = 420;
const SPRITE = { dot: 0, heart: 1, star: 2, ring: 3, leaf: 4, note: 5, rain: 6, puff: 7 };

// default colours, made once (a default written inside the brackets would make a new list on every call)
const GOLD = [1, 0.95, 0.6], LEAF = [0.45, 0.75, 0.3];

export class FX {
  constructor(scene, atlas, camera, uiRoot) {
    this.camera = camera;
    this.uiRoot = uiRoot;
    this.pos = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 4);
    this.size = new Float32Array(MAX);
    this.spr = new Float32Array(MAX);
    this.vel = new Float32Array(MAX * 3);
    this.life = new Float32Array(MAX);
    this.maxLife = new Float32Array(MAX);
    this.grav = new Float32Array(MAX);
    this.baseSize = new Float32Array(MAX);
    this.grow = new Float32Array(MAX);
    this.next = 0;
    this.alive = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aCol', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSpr', new THREE.BufferAttribute(this.spr, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, MAX);
    this.geo = g;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: atlas }, uScale: U.uPointScale, uNight: U.uNight },
      vertexShader: /* glsl */ `
        uniform float uScale;
        attribute vec4 aCol;
        attribute float aSize, aSpr;
        varying vec4 vCol;
        varying float vSpr;
        void main() {
          vCol = aCol;
          vSpr = aSpr;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = aSize > 0.0 ? aSize * uScale / -mv.z : 0.0;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        varying vec4 vCol;
        varying float vSpr;
        void main() {
          // the sprite sheet is stored upside-down on the GPU, so flip the row
          vec2 cell = vec2(mod(vSpr, 4.0), floor(vSpr / 4.0));
          vec2 uv = vec2((cell.x + gl_PointCoord.x) * 0.25, 1.0 - (cell.y + gl_PointCoord.y) * 0.25);
          float a = texture2D(uMap, uv).a * vCol.a;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vCol.rgb, a);
        }`,
      transparent: true,
      depthWrite: false,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 40;
    scene.add(this.points);
    this.labels = [];
    this._v = new THREE.Vector3();
  }

  spawn(x, y, z, vx, vy, vz, life, size, sprite, r, g, b, a = 1, grav = 0, grow = 0) {
    const i = this.next;
    this.next = (this.next + 1) % MAX;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = life; this.maxLife[i] = life;
    this.baseSize[i] = size; this.size[i] = size;
    this.spr[i] = sprite;
    this.col[i * 4] = r; this.col[i * 4 + 1] = g; this.col[i * 4 + 2] = b; this.col[i * 4 + 3] = a;
    this.grav[i] = grav;
    this.grow[i] = grow;
    this.alive = Math.max(this.alive, 1);
  }

  // ---- ready-made effects
  splash(x, y, z, big = 1) {
    for (let i = 0; i < 10 * big; i++) {
      const a = Math.random() * Math.PI * 2, s = (0.8 + Math.random() * 1.6) * big;
      this.spawn(x, y + 0.05, z, Math.cos(a) * s, 2.5 + Math.random() * 2.5 * big, Math.sin(a) * s, 0.7, 0.16 + Math.random() * 0.1, SPRITE.dot, 0.95, 1, 1, 0.95, 9);
    }
    this.ripple(x, y, z, big);
  }
  ripple(x, y, z, big = 1) {
    this.spawn(x, y + 0.02, z, 0, 0, 0, 1.0, 0.4 * big, SPRITE.ring, 1, 1, 1, 0.8, 0, 2.2 * big);
  }
  step(x, y, z, wet, wood) {
    if (wood) return;
    if (wet) {
      for (let i = 0; i < 3; i++) this.spawn(x + (Math.random() - 0.5) * 0.3, y + 0.05, z + (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 1.2, 1.8 + Math.random(), (Math.random() - 0.5) * 1.2, 0.45, 0.12, SPRITE.dot, 0.95, 1, 1, 0.9, 9);
      this.spawn(x, y + 0.02, z, 0, 0, 0, 0.7, 0.3, SPRITE.ring, 1, 1, 1, 0.6, 0, 1.4);
    } else {
      this.spawn(x, y + 0.08, z, (Math.random() - 0.5) * 0.4, 0.4, (Math.random() - 0.5) * 0.4, 0.55, 0.35, SPRITE.puff, 0.96, 0.92, 0.82, 0.45, 0, 0.6);
    }
  }
  sparkle(x, y, z, n = 10, color = GOLD) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 0.6 + Math.random() * 1.2;
      this.spawn(x, y + 0.4 + Math.random() * 0.6, z, Math.cos(a) * s, 1 + Math.random() * 1.5, Math.sin(a) * s, 0.9 + Math.random() * 0.4, 0.28 + Math.random() * 0.15, SPRITE.star, color[0], color[1], color[2], 1, 1.5);
    }
  }
  hearts(x, y, z, n = 5) {
    for (let i = 0; i < n; i++) {
      this.spawn(x + (Math.random() - 0.5) * 0.6, y + 1.6 + Math.random() * 0.3, z + (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, 1.0 + Math.random() * 0.6, (Math.random() - 0.5) * 0.6, 1.4, 0.36, SPRITE.heart, 1, 0.42, 0.55, 1, -0.3);
    }
  }
  notes(x, y, z, n = 3) {
    for (let i = 0; i < n; i++) {
      this.spawn(x + (Math.random() - 0.5) * 0.5, y + 1.8, z + (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.8, 0.9, (Math.random() - 0.5) * 0.8, 1.3, 0.38, SPRITE.note, 0.55, 0.45, 0.9, 1, -0.2);
    }
  }
  leaves(x, y, z, n = 8, color = LEAF) {
    for (let i = 0; i < n; i++) {
      this.spawn(x + (Math.random() - 0.5) * 2, y, z + (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 1.5, 0.3 + Math.random(), (Math.random() - 0.5) * 1.5, 1.6, 0.3, SPRITE.leaf, color[0], color[1], color[2], 1, 1.2);
    }
  }
  water(x, y, z) {
    for (let i = 0; i < 14; i++) {
      this.spawn(x + (Math.random() - 0.5) * 1.4, y + 1.0, z + (Math.random() - 0.5) * 1.4, 0, -1 - Math.random(), 0, 0.5, 0.12, SPRITE.dot, 0.6, 0.85, 1, 0.9, 6);
    }
  }
  burst(x, y, z, colors) {
    // firework burst
    const n = 46;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, e = (Math.random() - 0.3) * 1.4;
      const s = 6 + Math.random() * 2;
      const c = colors[i % colors.length];
      this.spawn(x, y, z, Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s + 1, Math.sin(a) * Math.cos(e) * s, 1.6, 0.5, SPRITE.star, c[0], c[1], c[2], 1, 3);
    }
  }
  rain(cx, cz, amount, dt) {
    // time-based (same shower whatever the frame rate)
    this.rainAcc = (this.rainAcc || 0) + amount * 190 * dt;
    const n = Math.floor(this.rainAcc);
    this.rainAcc -= n;
    for (let i = 0; i < n; i++) {
      this.spawn(cx + (Math.random() - 0.5) * 34, 14, cz + (Math.random() - 0.5) * 44 + 6, -1.5, -24, 0, 0.58, 1.5, SPRITE.rain, 0.9, 0.95, 1, 0.6, 0);
    }
  }

  // Floating text/emoji like "+1 🐚" (HTML, so emoji look perfect)
  label(x, y, z, text, cls = '') {
    if (this.labels.length > 10) this.labels.shift().el.remove();
    const el = document.createElement('div');
    el.className = 'fx-label ' + cls;
    el.textContent = text;
    this.uiRoot.appendChild(el);
    const item = { el, x, y, z, t: 0 };
    this.labels.push(item);
    this.placeLabel(item);
  }
  placeLabel(item) {
    this._v.set(item.x, item.y + item.t * 1.2, item.z).project(this.camera);
    const sx = (this._v.x * 0.5 + 0.5) * window.innerWidth, sy = (-this._v.y * 0.5 + 0.5) * window.innerHeight;
    item.el.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) translate(-50%, -50%)`;
    item.el.style.opacity = String(Math.min(1, (1.5 - item.t) * 2));
  }

  update(dt) {
    if (this.alive) {
      let any = 0;
      for (let i = 0; i < MAX; i++) {
        if (this.life[i] <= 0) { if (this.size[i] !== 0) this.size[i] = 0; continue; }
        any++;
        this.life[i] -= dt;
        const k = i * 3;
        this.vel[k + 1] -= this.grav[i] * dt;
        this.pos[k] += this.vel[k] * dt;
        this.pos[k + 1] += this.vel[k + 1] * dt;
        this.pos[k + 2] += this.vel[k + 2] * dt;
        const t = 1 - this.life[i] / this.maxLife[i];
        this.size[i] = this.life[i] > 0 ? this.baseSize[i] * (1 + this.grow[i] * t) : 0;
        if (this.spr[i] !== SPRITE.rain) this.col[i * 4 + 3] = Math.min(this.col[i * 4 + 3], (1 - t) * 1.6);
      }
      this.alive = any;
      const g = this.geo.attributes;
      g.position.needsUpdate = true;
      g.aSize.needsUpdate = true;
      g.aCol.needsUpdate = true;
      g.aSpr.needsUpdate = true;
    }
    for (let i = this.labels.length - 1; i >= 0; i--) {
      const it = this.labels[i];
      it.t += dt;
      if (it.t > 1.5) { it.el.remove(); this.labels.splice(i, 1); continue; }
      this.placeLabel(it);
    }
  }
}
