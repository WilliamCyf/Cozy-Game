// Shaders (small programs that run on the phone's graphics chip).
// Lighting is mostly computed per *corner* (vertex) instead of per *pixel* — far cheaper,
// which keeps the phone cool, and it suits the soft cartoon look.
import * as THREE from 'three';
import { WORLD_HALF, SEA_LEVEL } from '../world/layout.js';
import { HEIGHT_MIN, HEIGHT_RANGE } from './textures.js';

// One shared set of "knobs" every material reads. Changing one value updates the whole world.
export const U = {
  uTime: { value: 0 },
  uSunDir: { value: new THREE.Vector3(-0.42, 1, -0.5).normalize() },
  uSunColor: { value: new THREE.Color(0.5, 0.47, 0.42) },
  uSkyColor: { value: new THREE.Color(0.55, 0.58, 0.63) },
  uGroundColor: { value: new THREE.Color(0.42, 0.4, 0.38) },
  uShadowColor: { value: new THREE.Color(0.55, 0.6, 0.78) },
  uNight: { value: 0 },
  uWind: { value: 1 },
  uRain: { value: 0 },
  uCloud: { value: 0.25 },
  uMask: { value: null },
  uNoise: { value: null },
  uCaustic: { value: null },
  uHalf: { value: WORLD_HALF },
  uOutline: { value: 0.045 },
  uOutlineColor: { value: new THREE.Color(0.23, 0.17, 0.14) },
  uWaterShallow: { value: new THREE.Color('#8ff0dc') },
  uWaterMid: { value: new THREE.Color('#3ad1cf') },
  uWaterDeep: { value: new THREE.Color('#20b2c6') },
  uGlow: { value: 0 }, // how much lanterns glow (night)
  uPointScale: { value: 400 }, // converts world sizes to screen pixels for sprites
};

const COMMON = /* glsl */ `
uniform float uTime;
uniform vec3 uSunDir, uSunColor, uSkyColor, uGroundColor, uShadowColor;
uniform float uNight, uWind, uRain, uCloud, uHalf, uGlow;
uniform sampler2D uMask, uNoise, uCaustic;
vec2 maskUV(vec2 w) { return (w + uHalf) / (2.0 * uHalf); }
float cloudShade(vec2 w) {
  return texture2D(uNoise, w * 0.0045 + vec2(uTime * 0.0035, uTime * 0.0021)).b * uCloud;
}
vec3 hemi(vec3 n) { return mix(uGroundColor, uSkyColor, n.y * 0.5 + 0.5); }
float toon(float ndl) { return smoothstep(-0.05, 0.45, ndl) * 0.75 + max(ndl, 0.0) * 0.25; }
vec2 swayOffset(vec2 p, float w) {
  float s = sin(uTime * 1.5 + p.x * 0.37 + p.y * 0.23) + 0.45 * sin(uTime * 2.6 + p.x * 0.8 - p.y * 0.5);
  return vec2(s * 0.07, s * 0.045) * w * uWind;
}
`;

// ---------- Props (trees, houses, docks…) ----------
const PROP_VS = /* glsl */ `
${COMMON}
attribute vec3 aColor;
attribute vec3 aAux; // x: sway amount, y: receives painted shadow, z: glows at night
varying vec3 vColor;
void main() {
  #ifdef USE_INSTANCING
    mat4 m = modelMatrix * instanceMatrix;
  #else
    mat4 m = modelMatrix;
  #endif
  vec4 wp = m * vec4(position, 1.0);
  if (aAux.x > 0.0) wp.xz += swayOffset(wp.xz, aAux.x);
  vec3 n = normalize(mat3(m) * normal);
  float sh = texture2D(uMask, maskUV(wp.xz)).b * aAux.y;
  float lit = toon(dot(n, uSunDir)) * (1.0 - sh * 0.72) * (1.0 - cloudShade(wp.xz));
  vec3 c = aColor;
  #ifdef USE_INSTANCING_COLOR
    c *= instanceColor;
  #endif
  vec3 col = c * (hemi(n) + uSunColor * lit);
  // things that light up at night: windows & lanterns glow warm, crystals keep their colour
  vec3 glowCol = aAux.z > 1.5 ? c * 1.35 + vec3(0.1) : vec3(1.0, 0.8, 0.42) * 1.15;
  col = mix(col, glowCol, min(aAux.z, 1.0) * uGlow);
  vColor = col;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const FLAT_FS = /* glsl */ `
varying vec3 vColor;
void main() { gl_FragColor = vec4(vColor, 1.0); }`;

export function makePropMaterial() {
  return new THREE.ShaderMaterial({ uniforms: U, vertexShader: PROP_VS, fragmentShader: FLAT_FS });
}

// ---------- Outlines (the dark cartoon edge around things) ----------
// Trick: draw the object again, a tiny bit bigger, inside-out and dark.
const OUTLINE_VS = /* glsl */ `
${COMMON}
uniform float uOutline;
attribute vec3 aOutN;
attribute float aSway;
void main() {
  #ifdef USE_INSTANCING
    mat4 m = modelMatrix * instanceMatrix;
  #else
    mat4 m = modelMatrix;
  #endif
  vec4 wp = m * vec4(position + aOutN * uOutline, 1.0);
  if (aSway > 0.0) wp.xz += swayOffset(wp.xz, aSway);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const OUTLINE_FS = /* glsl */ `
uniform vec3 uOutlineColor;
uniform float uNight;
void main() { gl_FragColor = vec4(uOutlineColor * (1.0 - uNight * 0.4), 1.0); }`;

export function makeOutlineMaterial() {
  return new THREE.ShaderMaterial({ uniforms: U, vertexShader: OUTLINE_VS, fragmentShader: OUTLINE_FS, side: THREE.BackSide });
}

// ---------- Ground ----------
const TERRAIN_VS = /* glsl */ `
${COMMON}
attribute float aRock;
varying vec2 vW;
varying float vH, vSlope, vDiff, vRock;
varying vec3 vHemi;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec3 n = normalize(normal);
  vW = wp.xz;
  vH = wp.y;
  vSlope = 1.0 - n.y;
  vRock = aRock;
  vDiff = toon(dot(n, uSunDir));
  vHemi = hemi(n);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const TERRAIN_FS = /* glsl */ `
${COMMON}
varying vec2 vW;
varying float vH, vSlope, vDiff, vRock;
varying vec3 vHemi;
void main() {
  vec4 m = texture2D(uMask, maskUV(vW));
  float n = texture2D(uNoise, vW * 0.045).r;
  float g2 = texture2D(uNoise, vW * 0.21).g;
  float speck = texture2D(uNoise, vW * 0.9).g;

  vec3 dry = vec3(0.95, 0.88, 0.69);
  vec3 wet = vec3(0.86, 0.77, 0.56);
  vec3 sand = mix(wet, dry, smoothstep(0.02, 0.45, vH));
  sand *= 0.96 + 0.08 * speck;
  vec3 seabed = mix(vec3(0.9, 0.84, 0.64), vec3(0.72, 0.74, 0.6), smoothstep(-0.5, -4.0, vH));
  sand = mix(seabed, sand, smoothstep(-0.25, 0.02, vH));

  float gv = m.r + (n - 0.5) * 0.3 + (g2 - 0.5) * 0.12;
  float g = smoothstep(0.47, 0.53, gv);
  vec3 grass = mix(vec3(0.55, 0.77, 0.31), vec3(0.64, 0.83, 0.37), smoothstep(0.2, 0.8, n + (g2 - 0.5) * 0.5));
  grass *= 0.96 + 0.08 * speck;
  float rim = g * (1.0 - smoothstep(0.53, 0.6, gv));
  grass *= 1.0 - rim * 0.1;
  vec3 col = mix(sand, grass, g);

  float p = smoothstep(0.42, 0.58, m.g + (g2 - 0.5) * 0.25);
  vec3 dirt = mix(vec3(0.82, 0.68, 0.48), vec3(0.87, 0.75, 0.55), speck);
  col = mix(col, dirt, p);

  // cliffs: grey rock with horizontal layers, darker lines at the top and bottom edge
  float rockAmt = smoothstep(0.24, 0.38, vSlope);
  vec3 rockCol = mix(vec3(0.66, 0.68, 0.72), vec3(0.76, 0.77, 0.8), smoothstep(0.35, 0.65, n));
  float strata = step(0.5, fract(vH * 0.85 + n * 0.35));
  rockCol *= mix(1.0, 0.9 + 0.1 * strata, smoothstep(0.3, 0.5, vSlope));
  rockCol = mix(rockCol, rockCol * vec3(0.8, 0.95, 0.75), smoothstep(0.55, 0.75, n) * 0.5);
  col = mix(col, rockCol, rockAmt);
  float lip = smoothstep(0.12, 0.2, vSlope) * (1.0 - smoothstep(0.2, 0.3, vSlope));
  col *= 1.0 - lip * 0.28;

  float sh = smoothstep(0.32, 0.6, m.b + (g2 - 0.5) * 0.1);
  float lit = vDiff * (1.0 - sh * 0.72) * (1.0 - cloudShade(vW));
  vec3 light = vHemi + uSunColor * lit;
  light = mix(light, light * uShadowColor * 1.15, sh * 0.4);
  gl_FragColor = vec4(col * light, 1.0);
}`;

export function makeTerrainMaterial() {
  return new THREE.ShaderMaterial({ uniforms: U, vertexShader: TERRAIN_VS, fragmentShader: TERRAIN_FS });
}

// ---------- Water ----------
const WATER_VS = /* glsl */ `
varying vec2 vW;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const WATER_FS = /* glsl */ `
${COMMON}
uniform float uLevel, uFlow;
uniform vec3 uWaterShallow, uWaterMid, uWaterDeep;
varying vec2 vW;
void main() {
  vec4 m = texture2D(uMask, maskUV(vW));
  float h = m.a * ${HEIGHT_RANGE.toFixed(1)} + ${HEIGHT_MIN.toFixed(1)};
  float depth = uLevel - h;
  #ifdef CLIP_DRY
    if (depth < -0.03) discard; // small ponds: never paint water over dry ground
  #endif
  float t = uTime;
  vec2 flow = vec2(uFlow * t * 0.35, 0.0);

  float wave = sin(t * 0.85 + vW.x * 0.06 + vW.y * 0.045);
  float lace = texture2D(uNoise, vW * 0.19 + vec2(t * 0.012, -t * 0.009) - flow).a;
  float lace2 = texture2D(uNoise, vW * 0.47 - vec2(t * 0.018, t * 0.011) - flow).g;
  float l = lace * 0.62 + lace2 * 0.38;

  float d = clamp(depth, 0.0, 6.0);
  vec3 col = mix(uWaterShallow, uWaterMid, smoothstep(0.05, 1.3, d));
  col = mix(col, uWaterDeep, smoothstep(1.3, 4.5, d));
  float big = texture2D(uNoise, vW * 0.018 + vec2(t * 0.004, t * 0.003)).r;
  col *= 0.93 + 0.14 * big;
  float alpha = mix(0.3, 0.93, smoothstep(0.0, 2.6, d));

  // caustics: bright wobbly web of light on the shallow sea floor
  vec2 cuv = vW * 0.085;
  float c1 = texture2D(uCaustic, cuv + vec2(t * 0.011, t * 0.006) - flow * 0.2).r;
  float c2 = texture2D(uCaustic, cuv * 1.37 + vec2(-t * 0.008, t * 0.01) - flow * 0.2).r;
  float caus = min(c1, c2) * 1.4 + c1 * c2 * 0.6;
  float sunAmt = 1.0 - uNight * 0.85;
  col += caus * 0.42 * (1.0 - smoothstep(0.2, 3.2, d)) * sunAmt;

  // shoreline foam: a lacy white band that slides up and down the beach
  float edge = 0.2 + 0.1 * wave;
  float foam1 = 1.0 - smoothstep(edge - 0.08, edge + 0.08, depth + (l - 0.5) * 0.4);
  float holes = smoothstep(0.32, 0.46, l + (1.0 - smoothstep(0.0, edge, depth)) * 0.35);
  float bandPos = 0.5 + 0.18 * wave;
  float band = 1.0 - smoothstep(0.0, 0.11 + 0.06 * l, abs(depth - bandPos));
  float foam2 = band * smoothstep(0.48, 0.62, l);
  float foam = max(foam1 * holes, foam2 * 0.75);
  foam *= step(-0.02, depth);

  // sun glints: little wavy highlights in a few patches (not everywhere)
  float cluster = smoothstep(0.6, 0.8, texture2D(uNoise, vW * 0.011 + vec2(t * 0.002, -t * 0.001)).r);
  float s1 = texture2D(uNoise, vW * 0.16 + vec2(t * 0.02, t * 0.006)).g;
  float s2 = texture2D(uNoise, vW * 0.21 - vec2(t * 0.009, t * 0.018)).a;
  float spark = smoothstep(0.62, 0.7, s1 * 0.55 + s2 * 0.55) * cluster * (0.35 + 0.45 * sunAmt) * smoothstep(0.4, 1.6, d) * (1.0 - uRain);

  // rain drop rings: small, few and gentle
  if (uRain > 0.01) {
    vec2 cell = floor(vW * 1.3);
    vec2 f = fract(vW * 1.3) - 0.5;
    float rnd = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
    float ph = fract(t * 0.8 + rnd);
    float r = length(f - (vec2(rnd, fract(rnd * 7.13)) - 0.5) * 0.4);
    float ring = (1.0 - smoothstep(0.0, 0.035, abs(r - ph * 0.3))) * (1.0 - ph) * step(0.55, fract(rnd * 3.7));
    col += ring * 0.16 * uRain;
  }

  float sh = smoothstep(0.3, 0.62, m.b);
  float cl = cloudShade(vW);
  vec3 light = mix(vec3(1.0), uShadowColor, sh * 0.55) * (1.0 - cl * 0.6);
  vec3 dayTint = (uSkyColor + uSunColor) * 0.85;
  col = col * light * dayTint;
  col = mix(col, vec3(1.0) * (0.55 + 0.45 * sunAmt) * dayTint * 1.1, foam);
  col += spark * dayTint;
  alpha = max(alpha, foam * 0.95);
  alpha = max(alpha, sh * 0.25 + alpha);
  gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
}`;

export function makeWaterMaterial(level = SEA_LEVEL, flow = 0, clipDry = false) {
  return new THREE.ShaderMaterial({
    defines: clipDry ? { CLIP_DRY: 1 } : {},
    uniforms: { ...U, uLevel: { value: level }, uFlow: { value: flow } },
    vertexShader: WATER_VS,
    fragmentShader: WATER_FS,
    transparent: true,
    depthWrite: false,
  });
}

// ---------- Waterfall ----------
const FALL_VS = /* glsl */ `
varying vec2 vUv;
varying float vY;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vY = wp.y;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const FALL_FS = /* glsl */ `
${COMMON}
varying vec2 vUv;
varying float vY;
void main() {
  float t = uTime;
  float s = texture2D(uNoise, vec2(vUv.x * 1.3, vUv.y * 0.35 + t * 0.55)).g;
  float s2 = texture2D(uNoise, vec2(vUv.x * 2.7 + 0.3, vUv.y * 0.6 + t * 0.9)).a;
  float streak = smoothstep(0.42, 0.62, s * 0.6 + s2 * 0.5);
  vec3 col = mix(vec3(0.35, 0.78, 0.82), vec3(0.95, 1.0, 1.0), streak);
  float foamTop = smoothstep(0.85, 1.0, vUv.y);
  float foamBottom = 1.0 - smoothstep(0.0, 0.25, vUv.y);
  col = mix(col, vec3(1.0), max(foamTop, foamBottom) * 0.8);
  float a = 0.82 + 0.18 * streak;
  a *= smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
  vec3 dayTint = (uSkyColor + uSunColor) * 0.9;
  gl_FragColor = vec4(col * dayTint, a);
}`;
export function makeWaterfallMaterial() {
  return new THREE.ShaderMaterial({ uniforms: U, vertexShader: FALL_VS, fragmentShader: FALL_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide });
}

// ---------- Fish shadows swimming under the surface ----------
const FISH_VS = /* glsl */ `
uniform float uTime;
attribute float aPhase;
varying float vA;
void main() {
  vec3 p = position;
  float wig = sin(uTime * 9.0 + aPhase * 6.28) * 0.18 * smoothstep(0.0, -0.5, p.z) ;
  p.x += wig * (-p.z);
  vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0);
  vA = 1.0;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const FISH_FS = /* glsl */ `
uniform float uNight;
varying float vA;
void main() { gl_FragColor = vec4(0.05, 0.22, 0.3, 0.42 * (1.0 - uNight * 0.4)); }`;
export function makeFishShadowMaterial() {
  return new THREE.ShaderMaterial({ uniforms: U, vertexShader: FISH_VS, fragmentShader: FISH_FS, transparent: true, depthWrite: false });
}

// ---------- Soft blob shadow under characters ----------
const BLOB_VS = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  #ifdef USE_INSTANCING
    vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  #else
    vec4 wp = modelMatrix * vec4(position, 1.0);
  #endif
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const BLOB_FS = /* glsl */ `
uniform float uNight;
varying vec2 vUv;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float a = (1.0 - smoothstep(0.35, 1.0, d)) * 0.32 * (1.0 - uNight * 0.5);
  gl_FragColor = vec4(0.12, 0.14, 0.22, a);
}`;
export function makeBlobMaterial() {
  return new THREE.ShaderMaterial({ uniforms: U, vertexShader: BLOB_VS, fragmentShader: BLOB_FS, transparent: true, depthWrite: false });
}

// ---------- Glow sprites (lanterns, fireflies, sparkles) ----------
export function makeGlowMaterial(map) {
  return new THREE.ShaderMaterial({
    uniforms: { ...U, uMap: { value: map } },
    vertexShader: /* glsl */ `
      uniform float uTime, uGlow, uPointScale;
      attribute vec4 aData; // x size, y phase, z kind (0 lantern,1 firefly), w intensity
      varying float vI;
      varying vec3 vC;
      void main() {
        vec3 p = position;
        float k = aData.z;
        float ph = aData.y;
        float vis;
        if (k > 1.5) { // big soft pool of lantern light
          vis = uGlow * 0.55;
          vC = vec3(1.0, 0.66, 0.32);
        } else if (k > 0.5) { // firefly: drift around
          p.x += sin(uTime * 0.7 + ph * 13.0) * 1.2;
          p.z += cos(uTime * 0.55 + ph * 7.0) * 1.2;
          p.y += sin(uTime * 1.3 + ph * 5.0) * 0.4;
          vis = uGlow * (0.5 + 0.5 * sin(uTime * 2.5 + ph * 20.0));
          vC = vec3(0.85, 1.0, 0.45);
        } else {
          vis = uGlow * (0.9 + 0.1 * sin(uTime * 3.0 + ph * 10.0));
          vC = vec3(1.0, 0.78, 0.42);
        }
        vI = vis * aData.w;
        vec4 mv = viewMatrix * modelMatrix * vec4(p, 1.0);
        gl_PointSize = aData.x * vis * uPointScale / -mv.z;
        // lantern glows: slide the sprite a little towards the camera (same size on screen)
        // so it never dips into the ground, which would cut a hard straight edge into it
        if (k > 1.5 || k < 0.5) {
          float len = length(mv.xyz);
          mv.xyz *= 1.0 - min(aData.x * vis * 0.5 + 1.5, len * 0.5) / len;
        }
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      varying float vI;
      varying vec3 vC;
      void main() {
        vec2 uv = vec2(gl_PointCoord.x * 0.25, 1.0 - gl_PointCoord.y * 0.25); // first cell of the atlas (soft dot)
        float a = texture2D(uMap, uv).a;
        gl_FragColor = vec4(vC * a * vI, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

// ---------- Butterflies: animated completely on the graphics chip (no work for the CPU) ----------
export function makeButterflyMaterial(map) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uNight: U.uNight, uRain: U.uRain, uPointScale: U.uPointScale, uMap: { value: map } },
    vertexShader: /* glsl */ `
      uniform float uTime, uNight, uRain, uPointScale;
      attribute vec4 aB; // x phase, y wander radius, z colour, w size
      varying vec3 vC;
      varying float vA, vFlap;
      void main() {
        vec3 p = position;
        float t = uTime * 0.3 + aB.x * 10.0;
        p.x += sin(t) * aB.y + sin(t * 2.3) * 0.5;
        p.z += cos(t * 0.8) * aB.y + cos(t * 1.7) * 0.4;
        p.y += 0.5 + sin(uTime * 2.2 + aB.x * 7.0) * 0.3;
        vFlap = 0.25 + 0.75 * abs(sin(uTime * 11.0 + aB.x * 20.0));
        vA = (1.0 - smoothstep(0.25, 0.55, uNight)) * (1.0 - uRain);
        float c = aB.z;
        vC = c < 0.25 ? vec3(1.0, 0.75, 0.85) : c < 0.5 ? vec3(1.0, 0.93, 0.55) : c < 0.75 ? vec3(0.7, 0.85, 1.0) : vec3(1.0, 1.0, 1.0);
        vec4 mv = viewMatrix * modelMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = vA > 0.01 ? aB.w * uPointScale / -mv.z : 0.0;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      varying vec3 vC;
      varying float vA, vFlap;
      void main() {
        // squeeze the picture sideways = wings folding
        float u = 0.5 + (gl_PointCoord.x - 0.5) / vFlap;
        if (u < 0.0 || u > 1.0) discard;
        float a = texture2D(uMap, vec2(u * 0.25, 1.0 - (2.0 + gl_PointCoord.y) * 0.25)).a * vA;
        if (a < 0.05) discard;
        gl_FragColor = vec4(vC * (0.85 + 0.15 * vFlap), a);
      }`,
    transparent: true,
    depthWrite: false,
  });
}
