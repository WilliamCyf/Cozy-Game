// A little chibi islander (straw hat, round head, stubby arms & legs).
// Whole character = ONE draw call: every body part is tagged with a "bone" number,
// and the graphics chip moves each part using that bone's matrix (a tiny skeleton).
import * as THREE from 'three';
import { box, cylinder, blob, ring, M, hex, shade, flowerPetals, spikyCone } from '../render/geo.js';
import { U } from '../render/materials.js';
import { damp, clamp } from '../util/math.js';

export const BONE = { BODY: 0, HEAD: 1, ARM_L: 2, ARM_R: 3, LEG_L: 4, LEG_R: 5, ROD: 6, TOOL: 7 };
const PIVOT = [
  [0, 0.42, 0], // body (hips)
  [0, 0.92, 0], // head (neck)
  [-0.29, 0.86, 0], // left shoulder
  [0.29, 0.86, 0], // right shoulder
  [-0.11, 0.45, 0], // left hip
  [0.11, 0.45, 0], // right hip
  [0.3, 0.5, 0.12], // rod handle (right hand)
  [-0.3, 0.5, 0.12], // tool (left hand)
];
export const ROD_TIP_LOCAL = new THREE.Vector3(0.3, 0.5 + 1.75 * Math.sin(0.5), 0.12 + 1.75 * Math.cos(0.5));

export const SKIN_TONES = ['#ffe0c4', '#f6c9a2', '#e2a77a', '#b97e55', '#8a5a3c'];
export const SHIRT_COLORS = ['#e8574a', '#f39c3d', '#f5cf4a', '#7cc95a', '#3fb5a8', '#5d8fd8', '#9b7be0', '#f58fb5'];
export const ACCENT_COLORS = ['#3aa39a', '#e8574a', '#5d8fd8', '#f5cf4a', '#9b7be0', '#f58fb5', '#7cc95a', '#ffffff'];
export const HAIR_COLORS = ['#3b2a20', '#6b4426', '#b5733a', '#e8c17a', '#2a2a33', '#c8553d'];
export const HATS = [
  { id: 'straw', name: 'Straw Hat', price: 0 },
  { id: 'sunhat', name: 'Flower Sun Hat', price: 0 },
  { id: 'cap', name: 'Comfy Cap', price: 0 },
  { id: 'beanie', name: 'Pom Beanie', price: 0 },
  { id: 'bunny', name: 'Bunny Ears', price: 120 },
  { id: 'cat', name: 'Kitty Ears', price: 120 },
  { id: 'frog', name: 'Froggy Hat', price: 180 },
  { id: 'chef', name: 'Chef Hat', price: 150 },
  { id: 'pirate', name: 'Pirate Hat', price: 250 },
  { id: 'flowers', name: 'Flower Crown', price: 200 },
  { id: 'crown', name: 'Golden Crown', price: 600 },
];

const STRAW = hex('#e8c27a'), STRAW_D = hex('#d1a65c');
const PANTS = hex('#6d4c3a'), SHOE = hex('#4a3426'), BASKET = hex('#c99a5b');

function buildParts(look) {
  const parts = []; // [prim, matrix, color, bone]
  const add = (prim, m, color, bone) => parts.push([prim, m, color, bone]);
  const skin = hex(look.skin || SKIN_TONES[1]);
  const shirt = hex(look.shirt || SHIRT_COLORS[0]);
  const accent = hex(look.accent || ACCENT_COLORS[0]);
  const hair = hex(look.hair || HAIR_COLORS[0]);

  // legs + shoes
  for (const [sx, bone] of [[-0.11, BONE.LEG_L], [0.11, BONE.LEG_R]]) {
    add(cylinder(0.075, 0.085, 0.36, 7), M(sx, 0.08, 0), PANTS, bone);
    add(blob(0.1, 1, 0, 1, 0.7), M(sx, 0.06, 0.04, 0, 0, 0, 1, 1, 1.35), SHOE, bone);
  }
  // body: shirt + belt + little basket backpack
  add(cylinder(0.22, 0.27, 0.48, 10), M(0, 0.42, 0), shirt, BONE.BODY);
  add(cylinder(0.225, 0.225, 0.05, 10, { top: false }), M(0, 0.47, 0), shade(shirt, 0.75), BONE.BODY);
  add(blob(0.23, 1, 0, 2, 0.6), M(0, 0.9, 0), shirt, BONE.BODY);
  add(box(0.36, 0.34, 0.2), M(0, 0.68, -0.27), BASKET, BONE.BODY);
  add(box(0.38, 0.05, 0.22), M(0, 0.86, -0.27), shade(BASKET, 0.8), BONE.BODY);
  // arms + hands
  for (const [sx, bone] of [[-0.29, BONE.ARM_L], [0.29, BONE.ARM_R]]) {
    add(cylinder(0.075, 0.068, 0.32, 7), M(sx, 0.86, 0, 0, 0, Math.PI), shirt, bone);
    add(blob(0.075, 1, 0, 3), M(sx, 0.5, 0.0), skin, bone);
  }
  // head + face
  add(blob(0.29, 2, 0, 4), M(0, 1.2, 0), skin, BONE.HEAD);
  add(blob(0.3, 1, 0, 5, 0.85), M(0, 1.27, -0.05), hair, BONE.HEAD);
  for (const sx of [-0.1, 0.1]) {
    add(blob(0.042, 1, 0, 6, 1.3), M(sx, 1.2, 0.26), hex('#2b1d16'), BONE.HEAD);
    add(blob(0.045, 0, 0, 7, 0.5), M(sx * 1.55, 1.12, 0.235), hex('#ff9e9e'), BONE.HEAD);
  }
  // hat
  hat(look.hat || 'straw', accent, add);

  // fishing rod (hidden unless fishing): along local +z, tilted up 0.5 rad
  const rodM = M(0.3, 0.5, 0.12, 0, -0.5);
  add(cylinder(0.022, 0.03, 1.75, 5), rodM.clone().multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)), hex('#8a5a3a'), BONE.ROD);
  add(cylinder(0.05, 0.05, 0.12, 8, { top: true, bottom: true }), M(0.36, 0.52, 0.2, 0, 0, Math.PI / 2), hex('#d9d9d9'), BONE.ROD);
  // watering can (hidden unless watering)
  add(cylinder(0.12, 0.13, 0.22, 9, { bottom: true }), M(-0.3, 0.42, 0.18), hex('#6fb6e8'), BONE.TOOL);
  add(cylinder(0.025, 0.035, 0.3, 6), M(-0.3, 0.5, 0.25, 0, 1.0), hex('#6fb6e8'), BONE.TOOL);
  return parts;
}

function hat(style, accent, add) {
  const H = BONE.HEAD;
  switch (style) {
    case 'sunhat':
      add(cylinder(0.62, 0.66, 0.04, 16, { bottom: true }), M(0, 1.38, 0), hex('#f7b4c6'), H);
      add(cylinder(0.24, 0.27, 0.2, 12), M(0, 1.4, 0), hex('#f7b4c6'), H);
      add(cylinder(0.275, 0.275, 0.07, 12, { top: false }), M(0, 1.42, 0), accent, H);
      add(flowerPetals(0.16, 5), M(0.26, 1.5, 0.12, 0.4, 0, 1.2), hex('#ffffff'), H);
      add(blob(0.05, 0, 0, 1), M(0.3, 1.5, 0.12), hex('#f5cf4a'), H);
      break;
    case 'cap':
      add(blob(0.31, 1, 0, 8, 0.6), M(0, 1.38, 0), accent, H);
      add(cylinder(0.22, 0.22, 0.03, 10, { bottom: true }), M(0, 1.33, 0.25, 0, 0, 0, 1, 1, 0.9), shade(accent, 0.85), H);
      add(blob(0.05, 0, 0, 2), M(0, 1.57, 0), shade(accent, 1.15), H);
      break;
    case 'beanie':
      add(blob(0.32, 1, 0, 9, 0.75), M(0, 1.35, 0), accent, H);
      add(cylinder(0.32, 0.32, 0.1, 12, { top: false }), M(0, 1.24, 0), shade(accent, 0.8), H);
      add(blob(0.11, 1, 0.1, 3), M(0, 1.62, 0), hex('#ffffff'), H);
      break;
    case 'bunny':
      add(cylinder(0.3, 0.3, 0.05, 12), M(0, 1.42, 0), accent, H);
      for (const sx of [-0.12, 0.12]) {
        add(blob(0.09, 1, 0, 4, 2.6), M(sx, 1.72, 0, 0, 0, -sx * 0.8), hex('#ffffff'), H);
        add(blob(0.05, 1, 0, 5, 2.4), M(sx, 1.72, 0.05, 0, 0, -sx * 0.8), hex('#ffc2d4'), H);
      }
      break;
    case 'cat':
      add(cylinder(0.3, 0.3, 0.05, 12), M(0, 1.42, 0), accent, H);
      for (const sx of [-0.15, 0.15]) add(cylinder(0, 0.1, 0.2, 4), M(sx, 1.44, 0, 0.78, 0, -sx * 1.2), hex('#3b3b44'), H);
      break;
    case 'frog':
      add(blob(0.33, 1, 0, 10, 0.7), M(0, 1.36, 0), hex('#7cc95a'), H);
      for (const sx of [-0.15, 0.15]) {
        add(blob(0.1, 1, 0, 6), M(sx, 1.58, 0.12), hex('#ffffff'), H);
        add(blob(0.05, 1, 0, 7), M(sx, 1.6, 0.2), hex('#222222'), H);
      }
      break;
    case 'chef':
      add(cylinder(0.27, 0.25, 0.3, 12), M(0, 1.36, 0), hex('#ffffff'), H);
      add(blob(0.34, 1, 0, 11, 0.7), M(0, 1.72, 0), hex('#ffffff'), H);
      break;
    case 'pirate':
      add(cylinder(0.5, 0.55, 0.05, 3, { bottom: true }), M(0, 1.38, 0, Math.PI / 6), hex('#2b2b33'), H);
      add(blob(0.3, 1, 0, 12, 0.75), M(0, 1.45, 0), hex('#2b2b33'), H);
      add(box(0.12, 0.1, 0.02), M(0, 1.52, 0.29), hex('#ffffff'), H);
      break;
    case 'flowers':
      add(ring(0.28, 0.04, 12, 4), M(0, 1.42, 0), hex('#6fbf3f'), H);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        add(flowerPetals(0.09, 5), M(Math.cos(a) * 0.28, 1.47, Math.sin(a) * 0.28), hex(['#ffffff', '#ffd6e8', '#fff1a8', '#cbb6ff'][i % 4]), H);
      }
      break;
    case 'crown':
      add(spikyCone(0.28, 0.25, 5, 0.9, 3), M(0, 1.4, 0, 0, 0, 0, 1, 1, 1), hex('#f5cf4a'), H);
      add(cylinder(0.27, 0.27, 0.1, 10), M(0, 1.38, 0), hex('#f2b53a'), H);
      add(blob(0.05, 0, 0, 8), M(0, 1.45, 0.27), hex('#e8574a'), H);
      break;
    default: // straw hat like the reference pictures
      add(cylinder(0.56, 0.62, 0.05, 18, { bottom: true }), M(0, 1.37, 0), STRAW, H);
      add(cylinder(0.25, 0.28, 0.2, 14), M(0, 1.41, 0), STRAW_D, H);
      add(cylinder(0.255, 0.255, 0.04, 14, { top: true }), M(0, 1.61, 0), STRAW, H);
      add(cylinder(0.287, 0.287, 0.065, 14, { top: false }), M(0, 1.43, 0), accent, H);
  }
}

// Turn the list of parts into geometry with a "bone" number on every corner.
function buildGeometry(parts) {
  const pos = [], nor = [], col = [], bone = [], opos = [], onor = [], obone = [];
  const m3 = new THREE.Matrix3(), v = new THREE.Vector3();
  for (const [prim, m, c, b] of parts) {
    m3.getNormalMatrix(m);
    const e = m.elements;
    for (let i = 0; i < prim.pos.length; i += 3) {
      const x = prim.pos[i], y = prim.pos[i + 1], z = prim.pos[i + 2];
      const wx = e[0] * x + e[4] * y + e[8] * z + e[12];
      const wy = e[1] * x + e[5] * y + e[9] * z + e[13];
      const wz = e[2] * x + e[6] * y + e[10] * z + e[14];
      pos.push(wx, wy, wz);
      v.set(prim.nor[i], prim.nor[i + 1], prim.nor[i + 2]).applyMatrix3(m3).normalize();
      nor.push(v.x, v.y, v.z);
      col.push(c[0], c[1], c[2]);
      bone.push(b);
      if (b !== BONE.ROD) {
        opos.push(wx, wy, wz);
        v.set(prim.sn[i], prim.sn[i + 1], prim.sn[i + 2]).applyMatrix3(m3).normalize();
        onor.push(v.x, v.y, v.z);
        obone.push(b);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('aColor', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aBone', new THREE.Float32BufferAttribute(bone, 1));
  const og = new THREE.BufferGeometry();
  og.setAttribute('position', new THREE.Float32BufferAttribute(opos, 3));
  og.setAttribute('aOutN', new THREE.Float32BufferAttribute(onor, 3));
  og.setAttribute('aBone', new THREE.Float32BufferAttribute(obone, 1));
  return [g, og];
}

const CHAR_COMMON = /* glsl */ `
uniform float uTime;
uniform vec3 uSunDir, uSunColor, uSkyColor, uGroundColor;
uniform float uNight, uCloud, uHalf;
uniform sampler2D uNoise;
uniform mat4 uBones[8];
attribute float aBone;
mat4 boneMatrix() { return uBones[int(aBone + 0.5)]; }
`;
const CHAR_VS = /* glsl */ `
${CHAR_COMMON}
uniform float uShade, uFlash;
attribute vec3 aColor;
varying vec3 vColor;
void main() {
  mat4 b = boneMatrix();
  vec4 wp = b * vec4(position, 1.0);
  vec3 n = normalize(mat3(b) * normal);
  float ndl = dot(n, uSunDir);
  float lit = (smoothstep(-0.05, 0.45, ndl) * 0.75 + max(ndl, 0.0) * 0.25) * (1.0 - uShade * 0.7);
  vec3 hemi = mix(uGroundColor, uSkyColor, n.y * 0.5 + 0.5);
  vec3 c = aColor * (hemi + uSunColor * lit);
  // soft rim so characters stay readable at night
  vec3 viewDir = normalize(cameraPosition - wp.xyz);
  float rim = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);
  c += rim * (0.06 + uNight * 0.18) * vec3(1.0, 0.95, 0.85);
  vColor = mix(c, vec3(1.0), uFlash);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const CHAR_OUT_VS = /* glsl */ `
${CHAR_COMMON}
attribute vec3 aOutN;
void main() {
  mat4 b = boneMatrix();
  vec4 wp = b * vec4(position + aOutN * 0.028, 1.0);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const FLAT_FS = /* glsl */ `varying vec3 vColor; void main() { gl_FragColor = vec4(vColor, 1.0); }`;
// "x-ray" silhouette: only drawn where something (a roof, a tree) is in front of the character
const GHOST_VS = /* glsl */ `
${CHAR_COMMON}
void main() { gl_Position = projectionMatrix * viewMatrix * (boneMatrix() * vec4(position, 1.0)); }`;
const GHOST_FS = /* glsl */ `uniform vec3 uGhost; void main() { gl_FragColor = vec4(uGhost, 0.5); }`;
const OUT_FS = /* glsl */ `uniform vec3 uOutlineColor; uniform float uNight; void main() { gl_FragColor = vec4(uOutlineColor * (1.0 - uNight * 0.4), 1.0); }`;

const _m = new THREE.Matrix4(), _r = new THREE.Matrix4(), _t = new THREE.Matrix4(), _e = new THREE.Euler(), _q = new THREE.Quaternion();
const _one = new THREE.Vector3(1, 1, 1), _zero = new THREE.Vector3(0.0001, 0.0001, 0.0001), _p = new THREE.Vector3(), _sc = new THREE.Vector3();

// Poses: how far each joint is bent. The animator blends smoothly between them.
function emptyPose() {
  return {
    bodyY: 0, bodyPitch: 0, bodyRoll: 0, bodyYaw: 0,
    headPitch: 0, headYaw: 0, headRoll: 0,
    armLP: 0, armLR: 0, armRP: 0, armRR: 0,
    legLP: 0, legRP: 0,
    rodPitch: 0, rod: 0, tool: 0,
  };
}

export class Character {
  constructor(look, scene) {
    this.look = { ...look };
    this.uniforms = {
      ...U,
      uBones: { value: Array.from({ length: 8 }, () => new THREE.Matrix4()) },
      uShade: { value: 0 },
      uFlash: { value: 0 },
      uGhost: { value: new THREE.Color(look.accent || ACCENT_COLORS[0]) },
    };
    const parts = buildParts(look);
    const [g, og] = buildGeometry(parts);
    this.mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: CHAR_VS, fragmentShader: FLAT_FS }));
    this.outline = new THREE.Mesh(og, new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: CHAR_OUT_VS, fragmentShader: OUT_FS, side: THREE.BackSide }));
    this.ghost = new THREE.Mesh(g, new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: GHOST_VS, fragmentShader: GHOST_FS,
      depthFunc: THREE.GreaterDepth, depthWrite: false, transparent: false,
      blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    }));
    this.mesh.frustumCulled = this.outline.frustumCulled = this.ghost.frustumCulled = false;
    this.ghost.renderOrder = 1;
    this.mesh.renderOrder = 2;
    this.outline.renderOrder = 2;
    scene.add(this.mesh, this.outline, this.ghost);
    this.scene = scene;
    // where the character is
    this.x = 0; this.y = 0; this.z = 0; this.heading = 0;
    this.speed = 0; // metres per second (drives the walk cycle)
    this.anim = 'idle';
    this.animT = 0;
    this.phase = 0;
    this.pose = emptyPose();
    this.target = emptyPose();
    this.rootM = new THREE.Matrix4();
  }

  setLook(look) {
    this.look = { ...look };
    const [g, og] = buildGeometry(buildParts(look));
    this.mesh.geometry.dispose();
    this.outline.geometry.dispose();
    this.mesh.geometry = g;
    this.ghost.geometry = g;
    this.outline.geometry = og;
    this.uniforms.uGhost.value.set(look.accent || ACCENT_COLORS[0]);
  }

  setVisible(v) { this.mesh.visible = this.outline.visible = this.ghost.visible = v; }
  setOutline(v) { this.outline.visible = v && this.mesh.visible; }

  play(anim) {
    if (this.anim !== anim) { this.anim = anim; this.animT = 0; }
  }

  // Work out the target pose for this moment of the current animation.
  computeTarget(dt) {
    const T = this.target, t = (this.animT += dt);
    for (const k in T) T[k] = 0;
    const sp = this.speed;
    const moving = sp > 0.25 && (this.anim === 'idle' || this.anim === 'walk');
    if (moving) {
      this.phase += dt * (5 + sp * 1.6);
      const s = Math.sin(this.phase), amp = clamp(sp / 4.5, 0.35, 1.1);
      T.legLP = s * 0.8 * amp; T.legRP = -s * 0.8 * amp;
      T.armLP = -s * 0.7 * amp; T.armRP = s * 0.7 * amp;
      T.armLR = 0.12; T.armRR = -0.12;
      T.bodyY = Math.abs(Math.cos(this.phase)) * 0.06 * amp;
      T.bodyPitch = 0.08 * amp;
      T.bodyRoll = s * 0.05;
      T.headPitch = -0.04;
      return;
    }
    switch (this.anim) {
      case 'sit':
        T.bodyY = -0.3; T.legLP = -1.45; T.legRP = -1.45; T.armLP = -0.4; T.armRP = -0.4; T.armLR = 0.2; T.armRR = -0.2;
        T.headPitch = 0.05 + Math.sin(t * 1.2) * 0.04;
        break;
      case 'fish': // holding the rod, waiting
        T.armRP = -0.9; T.armLP = -0.75; T.armLR = -0.35; T.rod = 1; T.rodPitch = 0.15 + Math.sin(t * 1.4) * 0.03;
        T.bodyY = Math.sin(t * 2) * 0.01; T.headPitch = 0.12;
        if (this.sitting) { T.bodyY = -0.3; T.legLP = -1.45; T.legRP = -1.45; }
        break;
      case 'cast': {
        const k = Math.min(1, t / 0.45);
        T.rod = 1;
        T.armRP = k < 0.4 ? -2.4 : -2.4 + (k - 0.4) / 0.6 * 1.6;
        T.armLP = -0.6; T.rodPitch = k < 0.4 ? -1.2 : -1.2 + (k - 0.4) / 0.6 * 1.4;
        T.bodyPitch = k < 0.4 ? -0.12 : 0.12;
        break;
      }
      case 'charge': // winding up a cast
        T.rod = 1; T.armRP = -2.3 - Math.sin(t * 8) * 0.06; T.armLP = -0.6; T.rodPitch = -1.15; T.bodyPitch = -0.12;
        break;
      case 'reel':
        T.rod = 1; T.armRP = -1.0 + Math.sin(t * 14) * 0.08; T.armLP = -1.0 + Math.cos(t * 14) * 0.15; T.armLR = -0.3;
        T.rodPitch = 0.45 + Math.sin(t * 9) * 0.12; T.bodyPitch = -0.15; T.legLP = 0.2; T.legRP = -0.2;
        if (this.sitting) { T.bodyY = -0.3; T.legLP = -1.45; T.legRP = -1.45; }
        break;
      case 'cheer': {
        const hop = Math.max(0, Math.sin(t * 9));
        T.bodyY = hop * 0.25; T.armLP = -2.8; T.armRP = -2.8; T.armLR = 0.3; T.armRR = -0.3; T.headPitch = -0.2;
        T.legLP = hop * -0.3; T.legRP = hop * -0.3;
        break;
      }
      case 'wave':
        T.armRP = -2.6; T.armRR = -0.4 + Math.sin(t * 12) * 0.45; T.headRoll = Math.sin(t * 6) * 0.1; T.bodyRoll = 0.05;
        break;
      case 'dance': {
        const s = Math.sin(t * 7);
        T.bodyYaw = s * 0.5; T.bodyY = Math.abs(Math.cos(t * 7)) * 0.12; T.armLP = -1.4 + s * 0.6; T.armRP = -1.4 - s * 0.6;
        T.armLR = 0.6; T.armRR = -0.6; T.legLP = s * 0.4; T.legRP = -s * 0.4; T.headRoll = s * 0.2;
        break;
      }
      case 'heart':
        T.armLP = -1.3; T.armRP = -1.3; T.armLR = -0.8; T.armRR = 0.8; T.headRoll = Math.sin(t * 3) * 0.15; T.bodyY = Math.abs(Math.sin(t * 4)) * 0.05;
        break;
      case 'shake': { // shaking a tree / bush
        const s = Math.sin(t * 26);
        T.armLP = -1.5 + s * 0.15; T.armRP = -1.5 - s * 0.15; T.bodyPitch = 0.1 + s * 0.04; T.bodyRoll = s * 0.06;
        break;
      }
      case 'water':
        T.tool = 1; T.armLP = -1.0; T.bodyPitch = 0.08; T.headPitch = 0.25; T.armRP = -0.2;
        break;
      case 'pick':
      case 'plant': {
        const k = Math.sin(Math.min(1, t / 0.5) * Math.PI);
        T.bodyPitch = 0.55 * k; T.armLP = -1.1 * k; T.armRP = -1.1 * k; T.headPitch = 0.3 * k; T.bodyY = -0.08 * k;
        T.legLP = -0.3 * k; T.legRP = 0.2 * k;
        break;
      }
      case 'cook': {
        const s = Math.sin(t * 6);
        T.armRP = -1.2; T.armRR = s * 0.5; T.armLP = -0.6; T.headPitch = 0.2;
        break;
      }
      case 'sleep':
        T.bodyY = -0.3; T.legLP = -1.45; T.legRP = -1.45; T.headPitch = 0.45; T.headRoll = 0.2;
        T.armLP = -0.4; T.armRP = -0.4;
        break;
      default: // idle: gentle breathing, occasional look around
        T.bodyY = Math.sin(t * 2.2) * 0.012;
        T.armLR = 0.08 + Math.sin(t * 2.2) * 0.02; T.armRR = -0.08 - Math.sin(t * 2.2) * 0.02;
        T.headYaw = Math.sin(t * 0.35) * 0.35 * Math.max(0, Math.sin(t * 0.17));
    }
  }

  update(dt) {
    this.computeTarget(dt);
    const P = this.pose, T = this.target;
    const rate = 14;
    for (const k in P) P[k] = damp(P[k], T[k], k === 'rod' || k === 'tool' ? 30 : rate, dt);
    const bones = this.uniforms.uBones.value;
    // root: position + heading
    this.rootM.makeRotationY(this.heading).setPosition(this.x, this.y, this.z);
    // body
    const body = bones[BONE.BODY];
    boneMat(body, this.rootM, PIVOT[0], P.bodyPitch, P.bodyYaw, P.bodyRoll, 0, P.bodyY, 0, 1);
    boneMat(bones[BONE.HEAD], body, PIVOT[1], P.headPitch, P.headYaw, P.headRoll, 0, 0, 0, 1);
    boneMat(bones[BONE.ARM_L], body, PIVOT[2], P.armLP, 0, P.armLR, 0, 0, 0, 1);
    boneMat(bones[BONE.ARM_R], body, PIVOT[3], P.armRP, 0, P.armRR, 0, 0, 0, 1);
    // legs hang from the root (not the bouncing body) so feet stay on the ground
    _m.copy(this.rootM);
    if (P.bodyY < -0.05) _m.multiply(_t.makeTranslation(0, P.bodyY, 0));
    boneMat(bones[BONE.LEG_L], _m, PIVOT[4], P.legLP, 0, 0, 0, 0, 0, 1);
    boneMat(bones[BONE.LEG_R], _m, PIVOT[5], P.legRP, 0, 0, 0, 0, 0, 1);
    // the rod follows the right hand
    rodMat(bones[BONE.ROD], bones[BONE.ARM_R], P.rodPitch - P.armRP * 0.85, P.rod);
    rodMat(bones[BONE.TOOL], bones[BONE.ARM_L], 0, P.tool, PIVOT[7]);
    this.uniforms.uFlash.value = Math.max(0, this.uniforms.uFlash.value - dt * 3);
  }

  // World position of the rod tip (where the fishing line starts)
  rodTip(out) {
    return out.copy(ROD_TIP_LOCAL).applyMatrix4(this.uniforms.uBones.value[BONE.ROD]);
  }
  headPos(out) {
    return out.set(0, 1.85, 0).applyMatrix4(this.uniforms.uBones.value[BONE.BODY]);
  }

  dispose() {
    this.scene.remove(this.mesh, this.outline, this.ghost);
    this.mesh.geometry.dispose();
    this.outline.geometry.dispose();
    this.mesh.material.dispose();
    this.outline.material.dispose();
    this.ghost.material.dispose();
  }
}

// bone = parent * T(pivot + offset) * R(pitch, yaw, roll) * T(-pivot)
function boneMat(out, parent, pivot, pitch, yaw, roll, ox, oy, oz) { // eslint-disable-line max-params
  _e.set(pitch, yaw, roll, 'YXZ');
  _q.setFromEuler(_e);
  _r.compose(_p.set(pivot[0] + ox, pivot[1] + oy, pivot[2] + oz), _q, _one);
  _t.makeTranslation(-pivot[0], -pivot[1], -pivot[2]);
  out.multiplyMatrices(parent, _r).multiply(_t);
}

// The rod / watering can: shrink to nothing when hidden.
function rodMat(out, armMat, extraPitch, vis, pivot = PIVOT[6]) {
  _e.set(extraPitch, 0, 0, 'YXZ');
  _q.setFromEuler(_e);
  _r.compose(_p.set(pivot[0], pivot[1], pivot[2]), _q, vis > 0.05 ? _sc.setScalar(vis) : _zero);
  _t.makeTranslation(-pivot[0], -pivot[1], -pivot[2]);
  out.multiplyMatrices(armMat, _r).multiply(_t);
}
