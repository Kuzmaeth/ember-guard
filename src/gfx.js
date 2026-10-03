// Rendering infrastructure: one lit ShaderMaterial for everything, procedural low-poly geometry,
// instancing helpers, point-sprite particles and the world builder.
import * as THREE from 'three';
import { AREAS } from './data.js';
import { model } from './models.js';

THREE.ColorManagement.enabled = false;

export const U = {
  uFire: { value: new THREE.Vector4(0, 0, 9, 1) },
  uHero: { value: new THREE.Vector4(0, 0, 5, 1) },
  uAmb: { value: new THREE.Color(0.17, 0.22, 0.4) },
  uMoon: { value: new THREE.Color(0.2, 0.32, 0.6) },
  uFog: { value: new THREE.Color(0.025, 0.045, 0.1) },
  uWarm: { value: new THREE.Color(1.0, 0.56, 0.22) },
  uFogD: { value: 0.016 },
  uFlash: { value: 0 },
  uTime: { value: 0 },
  uLamp: { value: [new THREE.Vector2(999, 999), new THREE.Vector2(999, 999), new THREE.Vector2(999, 999), new THREE.Vector2(999, 999)] },
};

const VERT = `
attribute vec3 aCol; attribute float aEm; attribute vec3 aNrm; attribute float aJ; attribute vec3 aPv;
#ifdef TINT
attribute vec3 aTint;
#endif
#ifdef ANIM
attribute vec3 aAnim;
#endif
uniform float uTime;
#ifdef GRASS
uniform vec4 uHero;
#endif
varying vec3 vW; varying vec3 vCol; varying float vEm; varying float vDepth; varying vec3 vN;
void main(){
  vec3 pos = position; vec3 nrm = aNrm;
  #ifdef GRASS
  pos *= 1.0 - smoothstep(19.0, 26.0, distance(instanceMatrix[3].xz, uHero.xy));
  #endif
  #ifdef ANIM
  if (aJ > 0.5) {
    float ph = aAnim.x, mv = aAnim.y, id = aAnim.z, a = 0.0; int axis = 0;
    if (aJ < 1.5) { a = sin(ph) * 0.9 * mv; }
    else if (aJ < 2.5) { a = -sin(ph) * 0.9 * mv; }
    else if (aJ < 3.5) { a = -sin(ph) * 0.7 * mv + sin(uTime * 1.7) * 0.05 * id; }
    else if (aJ < 4.5) { a = sin(ph) * 0.45 * mv + sin(uTime * 1.9 + 1.0) * 0.06 * id; }
    else if (aJ < 5.5) { a = sin(ph) * 0.5 * mv + sin(uTime * 3.0 + aPv.z * 5.0) * 0.05 * id; axis = 1; }
    else if (aJ < 6.5) { a = -sin(ph) * 0.5 * mv + sin(uTime * 3.0 + aPv.z * 5.0 + 2.0) * 0.05 * id; axis = 1; }
    else if (aJ < 7.5) { a = sin(uTime * 2.0 + ph * 0.3) * 0.16; axis = 2; }
    else if (aJ < 8.5) { a = sin(ph * 2.0) * 0.07 * mv + sin(uTime * 2.0) * 0.03 * id; }
    else if (aJ > 9.5) { a = (0.18 + sin(uTime * 3.4 + ph * 0.15) * 0.42) * sign(aPv.x); axis = 2; }
    else { a = 0.14 + sin(ph + aPv.x * 3.0) * 0.2 * mv + sin(uTime * 3.0 + aPv.y) * 0.05 * (id + mv); }
    vec3 d = pos - aPv; float c = cos(a), s = sin(a);
    if (axis == 0) { d = vec3(d.x, d.y * c - d.z * s, d.y * s + d.z * c); nrm = vec3(nrm.x, nrm.y * c - nrm.z * s, nrm.y * s + nrm.z * c); }
    else if (axis == 1) { d = vec3(d.x * c + d.z * s, d.y, -d.x * s + d.z * c); nrm = vec3(nrm.x * c + nrm.z * s, nrm.y, -nrm.x * s + nrm.z * c); }
    else { d = vec3(d.x * c - d.y * s, d.x * s + d.y * c, d.z); nrm = vec3(nrm.x * c - nrm.y * s, nrm.x * s + nrm.y * c, nrm.z); }
    pos = aPv + d;
  }
  #endif
  vec4 p = vec4(pos, 1.0);
  mat3 nm = mat3(modelMatrix);
  #ifdef USE_INSTANCING
  p = instanceMatrix * p; nm = nm * mat3(instanceMatrix);
  #endif
  vec4 wp = modelMatrix * p;
  #ifdef GRASS
  float sw = position.y * position.y * 0.22;
  wp.xz += vec2(sin(uTime * 1.9 + wp.x * 0.35 + wp.z * 0.27), cos(uTime * 1.5 + wp.z * 0.31 - wp.x * 0.2)) * sw;
  #endif
  vW = wp.xyz; vN = nm * nrm;
  vCol = aCol;
  #ifdef TINT
  vCol *= aTint;
  #endif
  vEm = aEm;
  vec4 mv4 = viewMatrix * wp;
  vDepth = -mv4.z;
  gl_Position = projectionMatrix * mv4;
}`;
const FRAG = `
precision highp float;
uniform vec4 uFire; uniform vec4 uHero; uniform vec3 uAmb; uniform vec3 uMoon; uniform vec3 uFog; uniform vec3 uWarm; uniform float uFogD; uniform float uFlash; uniform vec2 uLamp[4];
varying vec3 vW; varying vec3 vCol; varying float vEm; varying float vDepth; varying vec3 vN;
float hash21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
void main(){
  vec3 nf = normalize(cross(dFdx(vW), dFdy(vW)));
  vec3 ns = normalize(vN); if (!gl_FrontFacing) ns = -ns;
  #ifdef RING
  vec3 n = normalize(mix(nf, ns, 0.4));
  #else
  vec3 n = normalize(mix(nf, ns, 0.8));
  #endif
  float R = uFire.z;
  vec2 df = vW.xz - uFire.xy;
  float d = length(df);
  float pool = 1.0 - smoothstep(R * 0.05, R * 1.1, d);
  vec3 toF = vec3(-df.x, 1.6 - vW.y, -df.y);
  float ndlF = max(dot(n, normalize(toF)), 0.0) * 0.8 + 0.2;
  vec3 fireL = uWarm * (pool * pool * 1.6 * ndlF * uFire.w);
  float dh = distance(vW.xz, uHero.xy);
  float hp = 1.0 - smoothstep(0.0, uHero.z, dh);
  vec3 heroL = uWarm * (0.7 * hp * hp * uHero.w);
  for (int i = 0; i < 4; i++) { float ld = 1.0 - smoothstep(0.0, 3.4, distance(vW.xz, uLamp[i])); heroL += uWarm * (0.55 * ld * ld); }
  float ndlM = max(dot(n, normalize(vec3(-0.4, 0.8, 0.3))), 0.0);
  float hg = 0.75 + 0.45 * clamp(vW.y / 3.0, 0.0, 1.0);
  vec3 light = uAmb * hg * (0.75 + 0.25 * n.y) + uMoon * ndlM * 0.8 + fireL + heroL;
  vec3 base = vCol;
  #ifdef RING
  // ground detail: hard-edged tonal patches, pebbles and flecks in world space (crisp, no texture); fine scales fade out when they approach one pixel
  vec2 fw = fwidth(vW.xz);
  float px = max(fw.x, fw.y);
  float h1 = hash21(floor(vW.xz * 1.6)), h2 = hash21(floor(vW.xz * 5.0) + 3.0), h3 = hash21(floor(vW.xz * 14.0) + 9.0), h4 = hash21(floor(vW.xz * 14.0) + 21.0);
  float f2 = 1.0 - smoothstep(0.05, 0.12, px), f3 = 1.0 - smoothstep(0.02, 0.05, px);
  float v = 1.0 + (floor(h1 * 4.0) / 3.0 - 0.5) * 0.26 + (floor(h2 * 3.0) / 2.0 - 0.5) * 0.16 * f2;
  v *= 1.0 - step(0.93, h3) * 0.32 * f3;
  v *= 1.0 + step(0.975, h4) * 0.4 * f3;
  base *= v;
  #endif
  vec3 col = base * light;
  vec3 vd = normalize(cameraPosition - vW);
  float rim = pow(1.0 - max(dot(n, vd), 0.0), 3.0);
  col += (uMoon * 0.55 + fireL * 0.25) * rim * (0.4 + vCol.r + vCol.g + vCol.b);
  #ifdef RING
  float edge = smoothstep(R - 0.5, R, d) * (1.0 - smoothstep(R, R + 0.18, d));
  col += uWarm * edge * 0.2;
  #endif
  col = mix(col, vCol * 1.8, vEm);
  float f = 1.0 - exp(-uFogD * uFogD * vDepth * vDepth);
  col = mix(col, uFog, f);
  col += vec3(uFlash);
  gl_FragColor = vec4(col, 1.0);
}`;

export function makeLit(tint, ring, double, grass) {
  const defs = {};
  if (tint) { defs.TINT = ''; defs.ANIM = ''; }
  if (grass) defs.GRASS = '';
  if (ring) defs.RING = '';
  return new THREE.ShaderMaterial({ uniforms: U, vertexShader: VERT, fragmentShader: FRAG, defines: defs, side: double ? THREE.DoubleSide : THREE.FrontSide });
}

/* ---------- geometry builder ---------- */
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const BOX = new THREE.BoxGeometry(1, 1, 1);
const ICO = new THREE.IcosahedronGeometry(1, 0);
const SPH = new THREE.IcosahedronGeometry(1, 2);
const SPL = new THREE.IcosahedronGeometry(1, 1);
const OCT = new THREE.OctahedronGeometry(1, 0);
const CONE = new THREE.ConeGeometry(0.5, 1, 8);
const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
const dim = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

class GB {
  constructor() { this.pos = []; this.col = []; this.em = []; this.nrm = []; this.jn = []; this.pv = []; }
  add(geo, c, o = {}) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    _e.set(o.rx || 0, o.ry || 0, o.rz || 0); _q.setFromEuler(_e);
    _p.set(o.x || 0, o.y || 0, o.z || 0);
    _s.set(o.sx == null ? 1 : o.sx, o.sy == null ? 1 : o.sy, o.sz == null ? 1 : o.sz);
    _m.compose(_p, _q, _s); g.applyMatrix4(_m);
    const a = g.attributes.position.array, nr = g.attributes.normal.array, n = a.length / 3, em = o.em ? 1 : 0, j = o.j == null ? 0.05 : o.j, jn = o.jn || 0, pv = o.pv || [0, 0, 0];
    let k = 1;
    for (let i = 0; i < n; i++) {
      if (i % 3 === 0) k = 1 + (Math.random() - 0.5) * 2 * j;
      this.pos.push(a[i * 3], a[i * 3 + 1], a[i * 3 + 2]); this.nrm.push(nr[i * 3], nr[i * 3 + 1], nr[i * 3 + 2]);
      this.col.push(c[0] * k, c[1] * k, c[2] * k); this.em.push(em); this.jn.push(jn); this.pv.push(pv[0], pv[1], pv[2]);
    }
    g.dispose();
    return this;
  }
  scale(s) { for (let i = 0; i < this.pos.length; i++) { this.pos[i] *= s; this.pv[i] *= s; } return this; }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('aCol', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aEm', new THREE.Float32BufferAttribute(this.em, 1));
    g.setAttribute('aNrm', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('aJ', new THREE.Float32BufferAttribute(this.jn, 1));
    g.setAttribute('aPv', new THREE.Float32BufferAttribute(this.pv, 3));
    return g;
  }
}

const lathe = (pts, segs, ps, pl) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), segs || 18, ps || 0, pl || Math.PI * 2);
const CAP = new THREE.CapsuleGeometry(1, 1, 4, 10);
const TOR = new THREE.TorusGeometry(1, 0.22, 8, 22);
const capsule = (r, len) => ({ sx: r, sy: (len + 2 * r) / 3, sz: r }); // CapsuleGeometry(1,1) spans 3 units
// Chibi hero built from lathes, capsules and tori: smooth silhouettes, joints driven in the vertex shader.
export const heroGeo = (h) => model(['hero_warden', 'hero_wren', 'hero_monk', 'hero_ash'][h.hat] || 'hero_warden') || heroGeoP(h);
function heroGeoP(h) {
  const b = new GB(), skin = [0.98, 0.76, 0.6], boot = [0.24, 0.14, 0.08], pant = [0.2, 0.17, 0.27], hair = [0.36, 0.2, 0.1];
  const hatc = h.hat === 1 ? [0.16, 0.44, 0.22] : h.hat === 2 ? [0.85, 0.4, 0.1] : h.hat === 3 ? [0.36, 0.2, 0.52] : [0.46, 0.29, 0.14];
  const hp = [0, 1.22, 0];
  for (const sd of [-1, 1]) {
    const J = sd < 0 ? 1 : 2, pv = [sd * 0.15, 0.55, 0];
    b.add(CAP, pant, { x: sd * 0.15, y: 0.33, ...capsule(0.09, 0.26), jn: J, pv, j: 0.02 });
    b.add(SPH, boot, { x: sd * 0.15, y: 0.1, z: 0.05, sx: 0.15, sy: 0.12, sz: 0.21, jn: J, pv, j: 0.02 });
  }
  // coat: bell-shaped lathe
  b.add(lathe([[0.0, 0.44], [0.34, 0.45], [0.37, 0.55], [0.34, 0.78], [0.28, 1.02], [0.2, 1.18], [0.0, 1.22]], 20), h.tunic, { j: 0.02 });
  b.add(lathe([[0.355, 0.45], [0.375, 0.5], [0.37, 0.56], [0.345, 0.56]], 20), dim(h.tunic, 0.7), { j: 0.02 });
  b.add(TOR, [0.34, 0.2, 0.1], { y: 0.66, rx: Math.PI / 2, sx: 0.325, sy: 0.325, sz: 0.2, j: 0.02 });
  b.add(BOX, [1.1, 0.8, 0.3], { y: 0.66, z: 0.34, sx: 0.1, sy: 0.09, sz: 0.04, em: 1, j: 0 });
  // scarf
  b.add(TOR, [0.92, 0.16, 0.14], { y: 1.18, rx: Math.PI / 2, sx: 0.22, sy: 0.22, sz: 0.34, j: 0.03 });
  b.add(CAP, [0.88, 0.15, 0.13], { x: 0.12, y: 0.98, z: -0.24, rx: 0.25, sx: 0.08, sy: 0.12, sz: 0.035, jn: 9, pv: [0.12, 1.18, -0.2], j: 0.02 });
  // head
  b.add(SPH, skin, { y: 1.5, sx: 0.34, sy: 0.33, sz: 0.33, jn: 8, pv: hp, j: 0.01 });
  b.add(SPH, hair, { y: 1.6, z: -0.06, sx: 0.36, sy: 0.27, sz: 0.34, jn: 8, pv: hp, j: 0.02 });
  for (const sd of [-1, 1]) {
    b.add(SPL, [0.12, 0.08, 0.1], { x: sd * 0.12, y: 1.5, z: 0.3, sx: 0.05, sy: 0.07, sz: 0.03, jn: 8, pv: hp, j: 0 });
    b.add(SPL, [1.4, 1.4, 1.4], { x: sd * 0.105, y: 1.525, z: 0.322, sx: 0.017, sy: 0.017, sz: 0.01, em: 1, jn: 8, pv: hp, j: 0 });
    b.add(SPL, [1.0, 0.55, 0.5], { x: sd * 0.2, y: 1.42, z: 0.26, sx: 0.055, sy: 0.035, sz: 0.02, jn: 8, pv: hp, j: 0 });
  }
  b.add(SPL, skin, { y: 1.45, z: 0.33, sx: 0.04, sy: 0.035, sz: 0.03, jn: 8, pv: hp, j: 0 });
  // headwear
  if (h.hat === 2) {
    b.add(lathe([[0.0, 0.66], [0.24, 0.62], [0.39, 0.46], [0.42, 0.22], [0.4, 0.0], [0.36, -0.1]], 20, Math.PI - 2.3, 4.6), hatc, { y: 1.36, jn: 8, pv: hp, j: 0.02 });
    b.add(CONE, hatc, { y: 1.9, z: -0.3, rx: -1.1, sx: 0.26, sy: 0.55, sz: 0.26, jn: 8, pv: hp });
  } else if (h.hat === 3) {
    b.add(lathe([[0.58, 0], [0.55, 0.03], [0.3, 0.07], [0.25, 0.5], [0.1, 0.85], [0, 0.98]], 20), hatc, { y: 1.66, z: -0.04, rx: -0.18, jn: 8, pv: hp, j: 0.02 });
    b.add(TOR, [1.2, 0.8, 0.3], { y: 1.72, rx: Math.PI / 2 - 0.18, sx: 0.27, sy: 0.27, sz: 0.1, em: 1, jn: 8, pv: hp, j: 0 });
  } else if (h.hat === 1) {
    b.add(lathe([[0.44, 0], [0.42, 0.04], [0.3, 0.12], [0.2, 0.4], [0.08, 0.7], [0, 0.78]], 20), hatc, { y: 1.66, z: -0.04, rx: -0.4, jn: 8, pv: hp, j: 0.02 });
    b.add(CONE, [0.95, 0.3, 0.25], { x: 0.22, y: 1.95, z: -0.18, rz: -0.9, rx: -0.3, sx: 0.07, sy: 0.55, sz: 0.04, jn: 8, pv: hp });
  } else {
    b.add(lathe([[0.62, 0], [0.6, 0.03], [0.33, 0.06], [0.31, 0.2], [0.25, 0.36], [0, 0.38]], 22), hatc, { y: 1.68, rx: -0.12, jn: 8, pv: hp, j: 0.02 });
    b.add(TOR, [0.7, 0.18, 0.12], { y: 1.77, rx: Math.PI / 2 - 0.12, sx: 0.315, sy: 0.315, sz: 0.18, jn: 8, pv: hp, j: 0 });
  }
  // cape: open lathe shell behind the body
  const cp = [0, 1.2, -0.12];
  b.add(lathe([[0.24, 1.2], [0.36, 1.0], [0.47, 0.62], [0.55, 0.26]], 16, Math.PI - 1.25, 2.5), h.cloak, { jn: 9, pv: cp, j: 0.03 });
  if (h.hat === 0) {
    b.add(CAP, [0.25, 0.36, 0.22], { y: 1.12, z: -0.42, rz: Math.PI / 2, ...capsule(0.1, 0.42), jn: 9, pv: cp });
    b.add(SPH, [0.42, 0.27, 0.13], { y: 0.86, z: -0.44, sx: 0.24, sy: 0.25, sz: 0.14, jn: 9, pv: cp });
  }
  // arms
  const lp = [-0.32, 1.1, 0], rp = [0.32, 1.1, 0];
  b.add(CAP, h.tunic, { x: -0.38, y: 0.92, rz: 0.25, ...capsule(0.075, 0.28), jn: 3, pv: lp, j: 0.02 });
  b.add(SPL, skin, { x: -0.44, y: 0.72, sx: 0.085, sy: 0.085, sz: 0.085, jn: 3, pv: lp, j: 0 });
  b.add(CAP, h.tunic, { x: 0.36, y: 0.98, z: 0.15, rx: -1.05, ...capsule(0.075, 0.26), jn: 4, pv: rp, j: 0.02 });
  b.add(SPL, skin, { x: 0.37, y: 0.88, z: 0.36, sx: 0.085, sy: 0.085, sz: 0.085, jn: 4, pv: rp, j: 0 });
  // lantern hanging from the hand
  const fr = [0.13, 0.1, 0.12];
  b.add(TOR, fr, { x: 0.37, y: 0.8, z: 0.4, sx: 0.06, sy: 0.06, sz: 0.06, jn: 4, pv: rp, j: 0 });
  b.add(CONE, fr, { x: 0.37, y: 0.72, z: 0.4, sx: 0.26, sy: 0.1, sz: 0.26, jn: 4, pv: rp, j: 0 });
  b.add(CYL, [1.15, 0.8, 0.32], { x: 0.37, y: 0.56, z: 0.4, sx: 0.17, sy: 0.24, sz: 0.17, em: 1, jn: 4, pv: rp, j: 0 });
  b.add(CYL, fr, { x: 0.37, y: 0.43, z: 0.4, sx: 0.22, sy: 0.04, sz: 0.22, jn: 4, pv: rp, j: 0 });
  return b.build();
}
export const mushGeo = () => new GB().add(CYL, [0.55, 0.55, 0.5], { y: 0.16, sx: 0.12, sy: 0.32, sz: 0.12, j: 0.02 }).add(lathe([[0.3, 0], [0.28, 0.07], [0.2, 0.15], [0, 0.18]], 12), [1, 1, 1], { y: 0.3, em: 1, j: 0.04 }).build();
export const lampGeo = () => new GB().add(CYL, [0.24, 0.15, 0.09], { y: 1.1, sx: 0.18, sy: 2.2, sz: 0.18 }).add(BOX, [0.24, 0.15, 0.09], { x: -0.32, y: 2.2, sx: 0.75, sy: 0.1, sz: 0.1 })
  .add(CONE, [0.13, 0.1, 0.12], { x: -0.55, y: 2.08, sx: 0.3, sy: 0.12, sz: 0.3 }).add(CYL, [1.2, 0.78, 0.3], { x: -0.55, y: 1.9, sx: 0.2, sy: 0.28, sz: 0.2, em: 1, j: 0 }).add(CYL, [0.13, 0.1, 0.12], { x: -0.55, y: 1.74, sx: 0.26, sy: 0.05, sz: 0.26 }).build();

function spider(o) {
  const b = new GB(), bc = o.body, dk = dim(bc, 0.6), s = o.s || 1;
  if (o.ghost) {
    const cp = [0, 1.0, 0];
    b.add(CONE, bc, { y: 0.55, rx: Math.PI, sx: 1.0, sy: 1.2, sz: 1.0, jn: 7, pv: cp, j: 0.08 });
    b.add(SPH, dk, { y: 1.2, sx: 0.4, sy: 0.38, sz: 0.4 });
    for (const sd of [-1, 1]) {
      b.add(SPL, o.eye, { x: sd * 0.14, y: 1.24, z: 0.3, sx: 0.09, sy: 0.12, sz: 0.06, em: 1, j: 0 });
      b.add(CONE, dk, { x: sd * 0.6, y: 0.95, z: 0.25, rz: sd * -1.0, rx: -0.6, sx: 0.14, sy: 0.8, sz: 0.14, jn: 7, pv: cp });
      b.add(CONE, dk, { x: sd * 0.16, y: 1.55, rz: sd * -0.4, sx: 0.12, sy: 0.4, sz: 0.12 });
    }
    if (o.wings) for (const sd of [-1, 1]) b.add(SPH, o.wingCol || dk, { x: sd * 0.78, y: 1.12, z: -0.05, rz: sd * 0.25, sx: 0.62, sy: 0.05, sz: 0.4, jn: 7, pv: cp, j: 0.05 });
    return b.scale(s).build();
  }
  b.add(SPH, bc, { y: 0.58, sx: 0.5, sy: 0.4, sz: 0.62, j: 0.06 });
  b.add(SPH, dk, { y: 0.66, z: 0.52, sx: 0.31, sy: 0.28, sz: 0.3 });
  for (const sd of [-1, 1]) {
    b.add(SPL, o.eye, { x: sd * 0.15, y: 0.74, z: 0.78, sx: 0.1, sy: 0.11, sz: 0.06, em: 1, j: 0 });
    b.add(CONE, dk, { x: sd * 0.18, y: 1.0, z: 0.45, rz: -sd * 0.35, sx: 0.13, sy: 0.42, sz: 0.13 });
  }
  for (let i = 0; i < 4; i++) b.add(CONE, dk, { y: 0.9 - Math.abs(i - 1.5) * 0.05, z: -0.4 + i * 0.24, sx: 0.12, sy: 0.32, sz: 0.12 });
  const ll = o.legLen || 1;
  for (let i = 0; i < 4; i++) for (const sd of [-1, 1]) {
    const z = -0.36 + i * 0.25, J = (i + (sd > 0 ? 1 : 0)) % 2 ? 6 : 5, pv = [sd * 0.3, 0.58, z];
    b.add(CONE, dk, { x: sd * 0.46, y: 0.7, z, rz: -sd * 0.91, sx: 0.1, sy: 0.55, sz: 0.1, jn: J, pv });
    b.add(CONE, dk, { x: sd * (0.62 + 0.14 * ll), y: 0.4 * ll, z, rz: Math.PI + sd * 0.315, sx: 0.09, sy: 0.85 * ll, sz: 0.09, jn: J, pv });
  }
  if (o.horns) { const hc = o.hornCol || [0.85, 0.78, 0.6]; for (const sd of [-1, 1]) { b.add(CONE, hc, { x: sd * 0.26, y: 1.0, z: 0.5, rz: -sd * 0.7, rx: 0.3, sx: 0.14, sy: 0.6, sz: 0.14, em: o.hornEm }); b.add(CONE, hc, { x: sd * 0.4, y: 1.35, z: 0.6, rz: -sd * 1.0, rx: 0.2, sx: 0.09, sy: 0.4, sz: 0.09, em: o.hornEm }); } }
  if (o.sac) b.add(SPL, o.sacCol || [1.2, 0.8, 0.2], { y: 0.78, z: -0.5, sx: o.sacS || 0.26, sy: o.sacS || 0.26, sz: (o.sacS || 0.26) * 1.1, em: 1, j: 0 });
  if (o.plate) { b.add(BOX, o.plateCol || [0.8, 0.72, 0.55], { y: 0.82, z: 0.98, sx: 1.15, sy: 0.75, sz: 0.1, j: 0.04 }); b.add(BOX, dim(o.plateCol || [0.8, 0.72, 0.55], 0.7), { y: 1.28, z: 0.94, sx: 0.8, sy: 0.14, sz: 0.1, j: 0.04 }); }
  if (o.cracks) for (let i = 0; i < 5; i++) b.add(SPL, [1.3, 0.55, 0.12], { x: (i % 2 ? 1 : -1) * 0.22, y: 0.86, z: -0.3 + i * 0.2, sx: 0.08, sy: 0.07, sz: 0.12, em: 1, j: 0 });
  return b.scale(s).build();
}
export const enemyGeo = [
  () => model('enemy_creeper') || spider({ body: [0.15, 0.1, 0.27], eye: [1.4, 0.2, 0.15], s: 1 }),
  () => model('enemy_skitter') || spider({ body: [0.08, 0.2, 0.26], eye: [1.4, 1.2, 0.2], s: 0.72, legLen: 1.3 }),
  () => model('enemy_brute') || spider({ body: [0.27, 0.1, 0.32], eye: [1.4, 0.25, 0.2], s: 1.6, horns: true }),
  () => model('enemy_wraith') || spider({ body: [0.2, 0.14, 0.34], eye: [0.4, 1.4, 1.5], s: 1, ghost: true }),
  () => model('enemy_ember_eater') || spider({ body: [0.24, 0.1, 0.1], eye: [1.5, 0.8, 0.2], s: 2.1, horns: true, hornCol: [1.3, 0.55, 0.1], hornEm: 1, cracks: true }),
  () => model('enemy_spitter') || spider({ body: [0.1, 0.24, 0.2], eye: [0.5, 1.5, 0.35], s: 0.95, legLen: 1.15, sac: true, sacCol: [0.45, 1.3, 0.35], sacS: 0.3 }),
  () => model('enemy_bulwark') || spider({ body: [0.2, 0.2, 0.28], eye: [1.4, 0.5, 0.15], s: 1.7, plate: true, plateCol: [0.62, 0.58, 0.5] }),
  () => model('enemy_blastbug') || spider({ body: [0.3, 0.12, 0.08], eye: [1.5, 1.1, 0.2], s: 0.8, sac: true, sacCol: [1.5, 0.6, 0.1], sacS: 0.38, legLen: 0.9 }),
  () => model('enemy_gloommoth') || spider({ body: [0.1, 0.16, 0.24], eye: [0.9, 0.4, 1.5], s: 0.95, ghost: true, wings: true, wingCol: [0.14, 0.2, 0.34] }),
  () => model('enemy_matron') || spider({ body: [0.2, 0.08, 0.28], eye: [1.4, 0.4, 1.3], s: 2.3, horns: true, hornCol: [0.7, 0.3, 1.2], hornEm: 1, cracks: true, sac: true, sacCol: [0.8, 0.3, 1.3], sacS: 0.42 }),
];

export const bossGeo = (kind) => (kind === 'warden' ? model('boss_ashen_warden') : null) || model('boss_drake') || bossGeoP();
function bossGeoP() {
  const b = new GB(), body = [0.12, 0.1, 0.2], dk = [0.07, 0.06, 0.13], amber = [1.3, 0.55, 0.1];
  b.add(SPH, body, { y: 2.4, sx: 1.2, sy: 1.0, sz: 1.9 });
  b.add(SPH, body, { y: 2.7, z: 1.3, sx: 1.0, sy: 1.0, sz: 1.0 });
  const hp = [0, 3.0, 1.9];
  b.add(CYL, dk, { y: 3.4, z: 2.0, rx: -0.55, sx: 0.8, sy: 1.5, sz: 0.8, jn: 8, pv: hp });
  b.add(SPH, dk, { y: 4.0, z: 2.5, sx: 0.62, sy: 0.55, sz: 0.85, jn: 8, pv: hp });
  b.add(CONE, dk, { y: 3.85, z: 3.25, rx: Math.PI / 2, sx: 0.55, sy: 0.9, sz: 0.55, jn: 8, pv: hp });
  for (const sd of [-1, 1]) {
    b.add(SPL, [1.6, 0.55, 0.15], { x: sd * 0.3, y: 4.15, z: 3.0, sx: 0.13, sy: 0.13, sz: 0.1, em: 1, j: 0, jn: 8, pv: hp });
    b.add(CONE, amber, { x: sd * 0.7, y: 4.9, z: 2.3, rz: sd * -0.5, sx: 0.3, sy: 1.8, sz: 0.3, em: 1, j: 0, jn: 8, pv: hp });
    for (let i = 0; i < 3; i++) b.add(CONE, amber, { x: sd * (1.05 + i * 0.28), y: 5.0 + i * 0.4, z: 2.3 - i * 0.25, rz: sd * (-0.1 - i * 0.2), sx: 0.18, sy: 1.1, sz: 0.18, em: 1, j: 0, jn: 8, pv: hp });
  }
  for (const [x, z] of [[-0.8, 1.2], [0.8, 1.2], [-0.8, -1.2], [0.8, -1.2]]) { const J = (x < 0) === (z > 0) ? 1 : 2, pv = [x, 2.0, z]; b.add(CYL, dk, { x, y: 1.0, z, sx: 0.5, sy: 2.0, sz: 0.5, jn: J, pv }); }
  for (let i = 0; i < 7; i++) b.add(SPL, [1.4, 0.6, 0.12], { x: ((i % 3) - 1) * 0.5, y: 3.0, z: -0.9 + (i >> 1) * 0.7, sx: 0.12, sy: 0.12, sz: 0.2, em: 1, j: 0 });
  return b.scale(0.9).build();
}

export function treeGeo(a) {
  const b = new GB();
  if (a.dead) {
    b.add(CYL, a.trunk, { y: 1.6, sx: 0.3, sy: 3.2, sz: 0.3 });
    b.add(CYL, a.trunk, { x: 0.5, y: 2.6, rz: -0.9, sx: 0.15, sy: 1.6, sz: 0.15 }).add(CYL, a.trunk, { x: -0.45, y: 2.2, rz: 0.9, sx: 0.13, sy: 1.4, sz: 0.13 });
    b.add(CYL, a.trunk, { z: 0.4, y: 2.9, rx: 0.8, sx: 0.1, sy: 1.1, sz: 0.1 });
  } else {
    b.add(CYL, a.trunk, { y: 0.6, sx: 0.34, sy: 1.2, sz: 0.34 });
    for (let k = 0; k < 5; k++) { const r = 1.55 - k * 0.27, v = 0.75 + k * 0.08; b.add(CONE, [v, v, v], { y: 1.5 + k * 0.85, ry: k, sx: r * 2, sy: 1.6, sz: r * 2, j: 0.06 }); }
  }
  return b.build();
}
export const rockGeo = (a) => new GB().add(SPL, a.rock, { sx: 1, sy: 0.7, sz: 0.9, j: 0.1 }).build();
// Grass tuft: 5 solid tapered blades, 3 triangles each (base quad + tip), vertex colours dark base to bright tip.
// Flat-shaded by the lit shader; no alpha. Sway and distance fade happen in the vertex shader (GRASS define).
export const grassGeo = () => {
  const pos = [], col = [], nrm = [], BASE = [0.5, 0.75, 0.8], MID = [0.95, 1.2, 0.85], TIP = [1.7, 1.7, 0.95];
  for (let b = 0; b < 5; b++) {
    const an = b / 5 * 6.2832 + Math.sin(b * 7.3) * 0.3, r = 0.1 + 0.05 * Math.sin(b * 3.1), h = 0.5 + 0.25 * (0.5 + 0.5 * Math.sin(b * 5.7 + 1)), w = 0.2 + 0.05 * Math.sin(b * 2.3), lean = 0.3 + 0.12 * Math.sin(b * 4.1);
    const ca = Math.cos(an), sa = Math.sin(an), ox = ca * r, oz = sa * r;
    // local blade: x = width, y = up, z = outward lean; rotate by `an` around Y so the lean points away from the tuft centre
    const P = (x, y, z) => [ox + x * -sa + z * ca, y, oz + x * ca + z * sa];
    const v = [P(-w / 2, 0, 0), P(w / 2, 0, 0), P(w * 0.3, h * 0.55, lean * h * 0.3), P(-w * 0.3, h * 0.55, lean * h * 0.3), P(w * 0.04, h, lean * h)];
    const c = [BASE, BASE, MID, MID, TIP];
    for (const t of [[0, 1, 2], [0, 2, 3], [3, 2, 4]]) {
      const a = v[t[0]], bb = v[t[1]], cc = v[t[2]], e1 = [bb[0] - a[0], bb[1] - a[1], bb[2] - a[2]], e2 = [cc[0] - a[0], cc[1] - a[1], cc[2] - a[2]];
      let nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0]; const nl = Math.hypot(nx, ny, nz) || 1;
      for (const k of t) { pos.push(...v[k]); col.push(...c[k]); nrm.push(nx / nl, ny / nl, nz / nl); }
    }
  }
  const n = pos.length / 3, g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aCol', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aNrm', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('aEm', new THREE.Float32BufferAttribute(new Float32Array(n), 1));
  g.setAttribute('aJ', new THREE.Float32BufferAttribute(new Float32Array(n), 1));
  g.setAttribute('aPv', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
  return g;
};
export const postGeo = () => new GB().add(BOX, [0.24, 0.15, 0.09], { y: 0.6, sx: 0.2, sy: 1.2, sz: 0.2 }).add(BOX, [0.27, 0.17, 0.1], { y: 0.95, sx: 0.12, sy: 0.12, sz: 1.5 }).build();
export const bannerGeo = () => new GB().add(BOX, [0.22, 0.14, 0.09], { y: 1.5, sx: 0.12, sy: 3, sz: 0.12 }).add(BOX, [0.22, 0.14, 0.09], { y: 2.9, x: 0.35, sx: 0.8, sy: 0.08, sz: 0.08 }).add(BOX, [0.8, 0.14, 0.12], { y: 2.1, x: 0.35, sx: 0.05, sy: 1.5, sz: 0.55 }).build();
export const pillarGeo = () => new GB().add(BOX, [0.3, 0.26, 0.28], { y: 1.4, sx: 0.9, sy: 2.8, sz: 0.9 }).add(BOX, [0.26, 0.22, 0.24], { y: 3.0, x: 0.2, sx: 1.0, sy: 0.5, sz: 1.0, rz: 0.2 }).build();
export function campGeo() {
  const b = new GB(), stone = [0.36, 0.35, 0.4], log = [0.32, 0.18, 0.09];
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; b.add(SPL, stone, { x: Math.cos(a) * 1.35, y: 0.2, z: Math.sin(a) * 1.35, sx: 0.42, sy: 0.3, sz: 0.4, j: 0.12, ry: a }); }
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + 0.3; b.add(CYL, log, { x: Math.cos(a) * 0.4, y: 0.55, z: Math.sin(a) * 0.4, rz: Math.cos(a) * 0.6, rx: -Math.sin(a) * 0.6, sx: 0.2, sy: 1.5, sz: 0.2 }); }
  b.add(CYL, [0.08, 0.04, 0.02], { y: 0.03, sx: 3.0, sy: 0.04, sz: 3.0, j: 0 });
  return b.build();
}
export const gemGeo = () => model('gem') || gemGeoP();
export const chestGeo = () => model('chest') || chestGeoP();
const gemGeoP = () => new GB().add(OCT, [0.8, 0.8, 0.8], { y: 0.35, sx: 0.17, sy: 0.3, sz: 0.17, em: 1, j: 0 }).build();
const chestGeoP = () => new GB().add(BOX, [0.45, 0.25, 0.08], { y: 0.3, sx: 0.8, sy: 0.5, sz: 0.55 }).add(BOX, [1.1, 0.8, 0.25], { y: 0.62, sx: 0.84, sy: 0.22, sz: 0.58, em: 1, j: 0 }).add(BOX, [1.4, 1.1, 0.3], { y: 0.4, z: 0.28, sx: 0.14, sy: 0.2, sz: 0.06, em: 1, j: 0 }).build();
export const boltGeo = () => new GB().add(OCT, [1.2, 1.2, 1.2], { sx: 0.14, sy: 0.14, sz: 0.5, em: 1, j: 0 }).build();
export const arrowGeo = () => new GB().add(CYL, [1.2, 1.2, 1.2], { rx: Math.PI / 2, sx: 0.06, sy: 0.9, sz: 0.06, em: 1, j: 0 }).add(CONE, [1.5, 1.5, 1.5], { z: 0.5, rx: Math.PI / 2, sx: 0.16, sy: 0.25, sz: 0.16, em: 1, j: 0 }).build();
export const orbGeo = () => new GB().add(SPL, [1.2, 1.2, 1.2], { sx: 0.36, sy: 0.36, sz: 0.36, em: 1, j: 0.05 }).build();
export const bombGeo = () => new GB().add(SPL, [0.12, 0.1, 0.14], { sx: 0.3, sy: 0.3, sz: 0.3 }).add(OCT, [1.6, 1.2, 0.3], { y: 0.3, sx: 0.08, sy: 0.12, sz: 0.08, em: 1, j: 0 }).build();
export const enemyShotGeo = () => new GB().add(OCT, [1.4, 0.45, 0.15], { sx: 0.3, sy: 0.3, sz: 0.5, em: 1, j: 0 }).build();

/* ---------- instancing ---------- */
export function makeInst(geo, mat, max, tinted, anim) {
  const mesh = new THREE.InstancedMesh(geo, mat, max);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false; mesh.count = 0;
  let at = null;
  if (tinted) { at = new THREE.InstancedBufferAttribute(new Float32Array(max * 3).fill(1), 3); at.setUsage(THREE.DynamicDrawUsage); geo.setAttribute('aTint', at); }
  let an = null;
  if (anim) { an = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3); an.setUsage(THREE.DynamicDrawUsage); geo.setAttribute('aAnim', an); }
  return { mesh, m: mesh.instanceMatrix.array, t: at && at.array, at, an: an && an.array, ana: an };
}
// Write a Y-rotation + scale matrix straight into the instance buffer (no allocations).
export function wM(a, i, x, y, z, ry, sx, sy, sz) {
  const c = Math.cos(ry), s = Math.sin(ry), o = i * 16;
  a[o] = c * sx; a[o + 1] = 0; a[o + 2] = -s * sx; a[o + 3] = 0;
  a[o + 4] = 0; a[o + 5] = sy; a[o + 6] = 0; a[o + 7] = 0;
  a[o + 8] = s * sz; a[o + 9] = 0; a[o + 10] = c * sz; a[o + 11] = 0;
  a[o + 12] = x; a[o + 13] = y; a[o + 14] = z; a[o + 15] = 1;
}

/* ---------- particles (one Points draw call) ---------- */
const PV = `
attribute vec4 aC; attribute float aS; varying vec4 vC; uniform float uScale;
void main(){ vC = aC; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = clamp(aS * uScale / max(0.1, -mv.z), 0.0, 48.0); gl_Position = projectionMatrix * mv; }`;
const PF = `
varying vec4 vC;
void main(){ float r = length(gl_PointCoord - 0.5) * 2.0; float a = 1.0 - smoothstep(0.0, 1.0, r); a *= a; if (a < 0.01) discard; gl_FragColor = vec4(vC.rgb, a * vC.a); }`;

export class Particles {
  constructor(max) {
    this.max = max;
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 4); this.size = new Float32Array(max);
    this.vel = new Float32Array(max * 3); this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.grav = new Float32Array(max); this.drag = new Float32Array(max); this.s0 = new Float32Array(max); this.grow = new Float32Array(max);
    this.free = new Int32Array(max); this.nf = 0;
    for (let i = max - 1; i >= 0; i--) this.free[this.nf++] = i;
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos); g.setAttribute('aC', this.aCol); g.setAttribute('aS', this.aSize);
    this.uScale = { value: 800 };
    const mat = new THREE.ShaderMaterial({ uniforms: { uScale: this.uScale }, vertexShader: PV, fragmentShader: PF, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.points = new THREE.Points(g, mat); this.points.frustumCulled = false;
    this.hi = 0; this.mult = 1;
  }
  emit(x, y, z, vx, vy, vz, life, size, r, g, b, grav, drag, grow) {
    if (this.nf === 0) return;
    const i = this.free[--this.nf], i3 = i * 3, i4 = i * 4;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    this.life[i] = life; this.maxLife[i] = life; this.s0[i] = size; this.size[i] = size;
    this.col[i4] = r; this.col[i4 + 1] = g; this.col[i4 + 2] = b; this.col[i4 + 3] = 1;
    this.grav[i] = grav || 0; this.drag[i] = drag || 0; this.grow[i] = grow || 0;
    if (i >= this.hi) this.hi = i + 1;
  }
  // Radial burst; count is scaled by the adaptive quality multiplier.
  burst(x, y, z, n, speed, life, size, r, g, b, grav, up) {
    n = Math.ceil(n * this.mult);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.2832, s = speed * (0.35 + Math.random() * 0.65), u = (up || 0.5) * (Math.random() + 0.2);
      this.emit(x, y, z, Math.cos(a) * s, u * speed, Math.sin(a) * s, life * (0.6 + Math.random() * 0.6), size * (0.6 + Math.random() * 0.8), r, g, b, grav == null ? 9 : grav, 1.5, 0);
    }
  }
  update(dt) {
    let hi = 0;
    const p = this.pos, v = this.vel, l = this.life;
    for (let i = 0; i < this.hi; i++) {
      if (l[i] <= 0) continue;
      l[i] -= dt;
      if (l[i] <= 0) { this.col[i * 4 + 3] = 0; this.size[i] = 0; this.free[this.nf++] = i; continue; }
      const i3 = i * 3, dr = 1 - Math.min(1, this.drag[i] * dt);
      v[i3] *= dr; v[i3 + 2] *= dr; v[i3 + 1] = (v[i3 + 1] - this.grav[i] * dt) * dr;
      p[i3] += v[i3] * dt; p[i3 + 1] += v[i3 + 1] * dt; p[i3 + 2] += v[i3 + 2] * dt;
      if (p[i3 + 1] < 0.03 && this.grav[i] > 0) { p[i3 + 1] = 0.03; v[i3 + 1] *= -0.3; }
      const t = l[i] / this.maxLife[i];
      this.col[i * 4 + 3] = Math.min(1, t * 2.2);
      this.size[i] = this.s0[i] * (this.grow[i] > 0 ? 1 + (1 - t) * this.grow[i] : 0.35 + 0.65 * t);
      hi = i + 1;
    }
    this.hi = hi;
    this.aPos.needsUpdate = this.aCol.needsUpdate = this.aSize.needsUpdate = true;
    this.points.geometry.setDrawRange(0, hi);
  }
  clear() { this.life.fill(0); this.size.fill(0); this.col.fill(0); this.nf = 0; for (let i = this.max - 1; i >= 0; i--) this.free[this.nf++] = i; this.hi = 0; }
}

/* ---------- scene, camera, world ---------- */
export const Q = { level: 0, dpr: 1 };export let renderer, scene, camera, parts, world;
export const fx = {};
let baseDpr = 1, post = null;
export const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && window.innerWidth < 900);
export const minQuality = isMobile ? 1 : 0;

const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const hash2 = (x, z) => { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); };
// Terrain height, shared by the ground mesh and everything that stands on it: flat clearing, gentle hills beyond.
export function groundY(x, z) {
  const r = Math.hypot(x, z);
  if (r < 10) return 0;
  return Math.min(1, (r - 10) / 14) * (Math.sin(x * 0.11 + 1.3) * Math.cos(z * 0.09) * 0.55 + Math.sin(x * 0.27 + z * 0.21) * 0.22);
}

function glowQuad(size, r, g, b) {
  const m = new THREE.ShaderMaterial({
    uniforms: { uC: { value: new THREE.Vector4(r, g, b, 1) } }, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
    vertexShader: 'varying vec2 vU; void main(){ vU = uv - 0.5; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec2 vU; uniform vec4 uC; void main(){ float r = length(vU) * 2.0; float a = pow(max(0.0, 1.0 - r), 2.2); gl_FragColor = vec4(uC.rgb, a * uC.a); }',
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), m); mesh.frustumCulled = false; mesh.renderOrder = 5;
  mesh.userData.c = m.uniforms.uC.value; return mesh;
}

/* ---------- shader fire: fbm-noise flame billboards ---------- */
const FLAME_V = 'varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const FLAME_F = `
uniform float uT; uniform float uSeed; uniform float uK; varying vec2 vU;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1.0, 0.0)), f.x), mix(h(i + vec2(0.0, 1.0)), h(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * n2(p); p *= 2.03; a *= 0.5; } return v; }
void main(){
  float y = vU.y;
  float n = fbm(vec2(vU.x * 3.5 + uSeed, y * 2.6 - uT * 2.4));
  float x = (vU.x - 0.5) * 2.0 + (n - 0.5) * 0.7 * y;
  float width = (1.0 - y) * (0.45 + 0.55 * smoothstep(0.0, 0.3, y)) * 0.95;
  float body = width - abs(x) * (0.85 + 0.3 * y);
  float f = smoothstep(0.0, 0.3, body) * (1.0 - smoothstep(0.45, 0.95, y + (n - 0.5) * 0.55)) * smoothstep(0.0, 0.07, y);
  float heat = clamp(body * 1.7 + (1.0 - y) * 0.45, 0.0, 1.0);
  vec3 c = mix(vec3(0.95, 0.2, 0.03), vec3(1.0, 0.6, 0.12), smoothstep(0.15, 0.55, heat));
  c = mix(c, vec3(1.0, 0.93, 0.68), smoothstep(0.7, 1.0, heat));
  gl_FragColor = vec4(c * uK * 1.25, f * 0.9);
}`;
function flamePlane(w, h, seed) {
  const m = new THREE.ShaderMaterial({ uniforms: { uT: { value: 0 }, uSeed: { value: seed }, uK: { value: 1 } }, vertexShader: FLAME_V, fragmentShader: FLAME_F, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const g = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  const mesh = new THREE.Mesh(g, m); mesh.userData.w = w; mesh.userData.h = h; mesh.frustumCulled = false; mesh.renderOrder = 4; return mesh;
}
export function updateFire(t, fr) {
  const fs = 0.4 + 0.75 * fr, yaw = Math.atan2(camera.position.x, camera.position.z);
  for (let i = 0; i < fx.flames.length; i++) {
    const m = fx.flames[i], u = m.material.uniforms, wob = 1 + 0.08 * Math.sin(t * 5.3 + i * 2.1);
    u.uT.value = t; u.uK.value = 0.55 + 0.45 * fr;
    m.scale.set(m.userData.w * fs, m.userData.h * fs * wob, 1); m.position.set(0, 0.25, 0);
    m.rotation.y = yaw + (i === 2 ? 1.0 : i === 3 ? -1.0 : 0); m.visible = fr > 0.01;
  }
}

/* ---------- blob shadows (one instanced draw) ---------- */
function makeShadows(max) {
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    vertexShader: 'varying vec2 vU; void main(){ vU = uv * 2.0 - 1.0; gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec2 vU; void main(){ float r = length(vU); float a = (1.0 - smoothstep(0.25, 1.0, r)) * 0.5; gl_FragColor = vec4(0.0, 0.0, 0.03, a); }',
  });
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), m, max);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; mesh.count = 0; mesh.renderOrder = 1;
  return { mesh, m: mesh.instanceMatrix.array, n: 0 };
}

/* ---------- post: bloom + tone shoulder + grade + vignette ---------- */
const PV2 = 'varying vec2 vU; void main(){ vU = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
function initPost() {
  const ex = renderer.extensions, half = ex.has('EXT_color_buffer_half_float') || ex.has('EXT_color_buffer_float');
  const type = half ? THREE.HalfFloatType : THREE.UnsignedByteType;
  const mk = (depth, samples) => new THREE.WebGLRenderTarget(4, 4, { type, depthBuffer: depth, samples: samples || 0 });
  post = { main: mk(true, isMobile ? 0 : 4), a: mk(false), b: mk(false), cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), scene: new THREE.Scene(), half };
  post.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); post.quad.frustumCulled = false; post.scene.add(post.quad);
  const sh = (u, f) => new THREE.ShaderMaterial({ uniforms: u, vertexShader: PV2, fragmentShader: f, depthTest: false, depthWrite: false });
  post.bright = sh({ tD: { value: null }, uTx: { value: new THREE.Vector2() } }, `uniform sampler2D tD; uniform vec2 uTx; varying vec2 vU;
    vec3 s(vec2 o){ vec3 c = texture2D(tD, vU + o * uTx).rgb; float l = max(c.r, max(c.g, c.b)); return c * smoothstep(0.8, 1.4, l); }
    void main(){ gl_FragColor = vec4((s(vec2(-1.0, -1.0)) + s(vec2(1.0, -1.0)) + s(vec2(-1.0, 1.0)) + s(vec2(1.0, 1.0))) * 0.25, 1.0); }`);
  post.blur = sh({ tD: { value: null }, uDir: { value: new THREE.Vector2() } }, `uniform sampler2D tD; uniform vec2 uDir; varying vec2 vU;
    void main(){ vec3 c = texture2D(tD, vU).rgb * 0.227;
      c += (texture2D(tD, vU + uDir * 1.385).rgb + texture2D(tD, vU - uDir * 1.385).rgb) * 0.316;
      c += (texture2D(tD, vU + uDir * 3.231).rgb + texture2D(tD, vU - uDir * 3.231).rgb) * 0.070;
      gl_FragColor = vec4(c, 1.0); }`);
  post.comp = sh({ tD: { value: null }, tB: { value: null }, uBloom: { value: 1 } }, `uniform sampler2D tD; uniform sampler2D tB; uniform float uBloom; varying vec2 vU;
    void main(){
      vec3 c = texture2D(tD, vU).rgb + texture2D(tB, vU).rgb * uBloom;
      vec3 o = max(c - 0.8, 0.0); c = mix(c, 0.8 + 0.25 * (1.0 - exp(-o / 0.25)), step(0.8, c));
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l), c, 1.14);
      c += vec3(-0.008, 0.006, 0.03) * (1.0 - smoothstep(0.0, 0.45, l));
      c *= mix(vec3(1.0), vec3(1.05, 1.0, 0.93), smoothstep(0.45, 1.0, l));
      vec2 q = vU - 0.5; c *= 1.0 - smoothstep(0.38, 0.95, length(q * vec2(1.15, 1.0))) * 0.55;
      c += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
      gl_FragColor = vec4(c, 1.0);
    }`);
}
function pass(mat, rt) { post.quad.material = mat; renderer.setRenderTarget(rt); renderer.render(post.scene, post.cam); }
// Compile shader programs for the render target the scene is really drawn into (post-processing target in quality 0-2,
// the screen in quality 3): Three.js picks different program variants per target, so compiling for the screen is useless.
export function prewarm() {
  const rt = post && Q.level < 3 ? post.main : null;
  renderer.setRenderTarget(rt); renderer.compile(scene, camera);
  if (post) for (const [m, t] of [[post.bright, post.a], [post.blur, post.b], [post.comp, null]]) { post.quad.material = m; renderer.setRenderTarget(t); renderer.compile(post.scene, post.cam); }
  // One real draw of every mesh (one instance each) into the offscreen target: the GPU driver finishes some shader work
  // only on first draw. Nothing of this reaches the screen; the next frame overwrites the target.
  if (post) {
    const inst = [];
    scene.traverse((o) => { if (o.isInstancedMesh && o.count === 0) { inst.push(o); o.count = 1; } });
    renderer.setRenderTarget(post.main); renderer.render(scene, camera);
    for (const o of inst) o.count = 0;
  }
  renderer.setRenderTarget(null);
}
export function draw() {
  if (import.meta.env.DEV) { renderer.info.autoReset = false; renderer.info.reset(); }
  if (!post || Q.level >= 3) { renderer.setRenderTarget(null); renderer.render(scene, camera); return; }
  const bloom = Q.level < 2;
  renderer.setRenderTarget(post.main); renderer.render(scene, camera);
  if (bloom) {
    const w = post.a.width, h = post.a.height;
    post.bright.uniforms.tD.value = post.main.texture; post.bright.uniforms.uTx.value.set(1 / post.main.width, 1 / post.main.height); pass(post.bright, post.a);
    const b = post.blur.uniforms;
    b.tD.value = post.a.texture; b.uDir.value.set(1 / w, 0); pass(post.blur, post.b);
    b.tD.value = post.b.texture; b.uDir.value.set(0, 1 / h); pass(post.blur, post.a);
    b.tD.value = post.a.texture; b.uDir.value.set(2.2 / w, 0); pass(post.blur, post.b);
    b.tD.value = post.b.texture; b.uDir.value.set(0, 2.2 / h); pass(post.blur, post.a);
  }
  const c = post.comp.uniforms; c.tD.value = post.main.texture; c.tB.value = post.a.texture; c.uBloom.value = bloom ? 0.85 : 0;
  pass(post.comp, null);
}

/* ---------- hero preview: drawn into a scissored rectangle of the main canvas while the hero screen is open ----------
   No second WebGL context. The scene, geometry and material exist only between previewOpen() and previewClose(). */
let prev = null;
const PREV_BG = new THREE.Color(0.035, 0.05, 0.1);
export function previewOpen(el) {
  previewClose();
  const sc = new THREE.Scene(), cam = new THREE.PerspectiveCamera(30, 1, 0.1, 80);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.9, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x010208 }));
  disc.position.set(0, 0.01, 3.4); sc.add(disc);
  prev = { el, sc, cam, disc, mat: makeLit(true, false, true), inst: null, t: 0, locked: false, frame: 0 };
}
export function previewSet(hero, locked) {
  if (!prev) return;
  if (prev.inst) { prev.sc.remove(prev.inst.mesh); prev.inst.mesh.geometry.dispose(); }
  prev.inst = makeInst(heroGeo(hero), prev.mat, 1, true, true);
  prev.inst.mesh.count = 1; prev.sc.add(prev.inst.mesh); prev.locked = locked;
}
export function previewClose() {
  if (!prev) return;
  if (prev.inst) prev.inst.mesh.geometry.dispose();
  prev.disc.geometry.dispose(); prev.disc.material.dispose(); prev.mat.dispose(); prev = null;
}
export const previewActive = () => !!prev;
const BACKDROP = new THREE.Color(0.027, 0.035, 0.08);
export function previewBackdrop() { renderer.setRenderTarget(null); renderer.setClearColor(BACKDROP, 1); renderer.clear(true, true, false); }
export function previewDraw(dt) {
  if (!prev || !prev.inst) return;
  if (document.hidden) return;
  if (Q.level >= 2 && (prev.frame++ & 1)) return; // half rate on slow devices
  const r = prev.el.getBoundingClientRect(), W = innerWidth, H = innerHeight;
  if (r.width < 8 || r.height < 8 || r.bottom < 0 || r.top > H) return;
  prev.t += dt;
  const { cam, inst } = prev;
  cam.aspect = r.width / r.height; cam.position.set(0, 2.7 + Math.max(0, 1 - cam.aspect) * 1.2, 9.9 + Math.max(0, 1 - cam.aspect) * 5); cam.lookAt(0, 1.15, 3.4); cam.updateProjectionMatrix();
  wM(inst.m, 0, 0, 0, 3.4, prev.t * 0.7, 1.4, 1.4, 1.4);
  inst.an[0] = prev.t * 2; inst.an[1] = 0; inst.an[2] = 1; inst.ana.needsUpdate = true;
  const k = prev.locked ? 0.07 : 1.15; inst.t[0] = inst.t[1] = inst.t[2] = k; inst.at.needsUpdate = true; inst.mesh.instanceMatrix.needsUpdate = true;
  renderer.setRenderTarget(null);
  renderer.setScissorTest(true); renderer.setViewport(r.left, H - r.bottom, r.width, r.height); renderer.setScissor(r.left, H - r.bottom, r.width, r.height);
  renderer.setClearColor(PREV_BG, 1); renderer.clear(true, true, false);
  renderer.render(prev.sc, cam);
  renderer.setScissorTest(false); renderer.setViewport(0, 0, W, H);
}

export function initGfx(canvas) {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  baseDpr = Math.min(window.devicePixelRatio || 1, 2);
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(45, 1, 0.5, 170);
  parts = new Particles(1600);
  scene.add(parts.points); parts.points.renderOrder = 6;
  fx.glow = glowQuad(9, 1, 0.45, 0.12); fx.glow2 = glowQuad(3.2, 1, 0.75, 0.35); fx.hglow = glowQuad(2.6, 1, 0.7, 0.3);
  scene.add(fx.glow, fx.glow2, fx.hglow);
  fx.flames = [flamePlane(2.3, 3.4, 0), flamePlane(1.5, 2.5, 7.3), flamePlane(1.4, 2.2, 3.1), flamePlane(1.3, 2.0, 11.7)];
  for (const f of fx.flames) scene.add(f);
  fx.shadow = makeShadows(440); scene.add(fx.shadow.mesh);
  fx.ring = new THREE.Mesh(new THREE.RingGeometry(0.965, 1, 72).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.15, blending: THREE.AdditiveBlending, depthWrite: false }));
  fx.ring.position.y = 0.06; scene.add(fx.ring);
  fx.nova = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff8a3a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  fx.nova.position.y = 0.2; scene.add(fx.nova);
  { const ringG = new THREE.RingGeometry(0.9, 1, 40).rotateX(-Math.PI / 2), fillG = new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2);
    fx.poolRing = new THREE.InstancedMesh(ringG, new THREE.MeshBasicMaterial({ color: 0xff3a1a, transparent: true, opacity: 0.5, depthWrite: false }), 14);
    fx.poolFill = new THREE.InstancedMesh(fillG, new THREE.MeshBasicMaterial({ color: 0xff5a2a, transparent: true, opacity: 0.35, depthWrite: false }), 14);
    for (const m of [fx.poolRing, fx.poolFill]) { m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; m.count = 0; m.renderOrder = 2; scene.add(m); } }
  fx.pulse = new THREE.Mesh(new THREE.RingGeometry(0.88, 1, 80).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })); fx.pulse.position.y = 0.2; scene.add(fx.pulse);
  fx.lpulse = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 72).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xfff0b0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })); fx.lpulse.position.y = 0.22; scene.add(fx.lpulse);
  const tm = new THREE.MeshBasicMaterial({ color: 0xff2a1a, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending });
  fx.teleLine = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), tm); fx.teleLine.position.y = 0.1; fx.teleLine.visible = false; scene.add(fx.teleLine);
  fx.teleRing = new THREE.Mesh(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2), tm.clone()); fx.teleRing.position.y = 0.1; fx.teleRing.visible = false; scene.add(fx.teleRing);
  fx.teleFill = new THREE.Mesh(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff5a2a, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending })); fx.teleFill.position.y = 0.12; fx.teleFill.visible = false; scene.add(fx.teleFill);
  const lg = new THREE.BufferGeometry(); fx.lnPos = new Float32Array(64 * 6); lg.setAttribute('position', new THREE.BufferAttribute(fx.lnPos, 3).setUsage(THREE.DynamicDrawUsage));
  fx.lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x8fdcff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); fx.lines.frustumCulled = false; scene.add(fx.lines);
  try { initPost(); } catch (e) { post = null; }
  setQuality(isMobile ? 1 : 0);
  window.addEventListener('resize', resize);
  resize();
}

export function setQuality(l) {
  Q.level = l; Q.dpr = Math.max(1, [baseDpr, Math.min(baseDpr, 1.5), Math.min(baseDpr, 1.1), 1][l]);
  parts.mult = [1, 0.7, 0.5, 0.3][l];
  if (world) world.grass.mesh.visible = l < 3;
  resize();
}
const _sz = new THREE.Vector2();
export function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setPixelRatio(Q.dpr); renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  parts.uScale.value = (h * Q.dpr * 0.5) / Math.tan(camera.fov * Math.PI / 360);
  if (post) {
    renderer.getDrawingBufferSize(_sz);
    post.main.setSize(_sz.x, _sz.y);
    const qw = Math.max(1, Math.ceil(_sz.x / 4)), qh = Math.max(1, Math.ceil(_sz.y / 4));
    post.a.setSize(qw, qh); post.b.setSize(qw, qh);
  }
}

function rng(seed) { let a = seed; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

export function buildWorld(key) {
  const a = AREAS[key];
  if (world) { scene.remove(world.group); world.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
  const group = new THREE.Group(); world = { group, key, a }; scene.add(group);
  const R = rng(key === 'woods' ? 7 : 31);
  // ground: smooth rolling terrain with soft colour fields and a warm trodden clearing
  const SEG = 110, SZ = 140, st = SZ / SEG, nv = (SEG + 1) * (SEG + 1);
  const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), col = new Float32Array(nv * 3), em = new Float32Array(nv);
  for (let iz = 0; iz <= SEG; iz++) for (let ix = 0; ix <= SEG; ix++) {
    const i = iz * (SEG + 1) + ix, x = -SZ / 2 + ix * st, z = -SZ / 2 + iz * st, e = 0.5;
    pos[i * 3] = x; pos[i * 3 + 1] = groundY(x, z); pos[i * 3 + 2] = z;
    const nx = groundY(x - e, z) - groundY(x + e, z), nz = groundY(x, z - e) - groundY(x, z + e), ny = 2 * e, nl = Math.hypot(nx, ny, nz);
    nrm[i * 3] = nx / nl; nrm[i * 3 + 1] = ny / nl; nrm[i * 3 + 2] = nz / nl;
    const r = Math.hypot(x, z), n1 = 0.5 + 0.5 * Math.sin(x * 0.13 + 2) * Math.cos(z * 0.11), n2 = 0.5 + 0.5 * Math.sin(x * 0.31 + z * 0.23), n3 = hash2(Math.round(x * 3), Math.round(z * 3));
    const g = a.ground, dirtT = (1 - sm(3.6, 7.6 + n2 * 1.6, r)) * 0.95, rimT = sm(26, 40, r);
    for (let c = 0; c < 3; c++) {
      let v = g[0][c] + (g[1][c] - g[0][c]) * n1; v += (g[2][c] - v) * sm(0.45, 0.8, n2) * 0.7;
      v += (a.dirt[c] * (0.85 + 0.3 * n3) - v) * dirtT; v *= 1 - rimT * 0.35;
      col[i * 3 + c] = v * (0.95 + 0.1 * n3);
    }
  }
  const idx = new Uint32Array(SEG * SEG * 6); let q = 0;
  for (let iz = 0; iz < SEG; iz++) for (let ix = 0; ix < SEG; ix++) { const a0 = iz * (SEG + 1) + ix, a1 = a0 + 1, a2 = a0 + SEG + 1, a3 = a2 + 1; idx[q++] = a0; idx[q++] = a2; idx[q++] = a1; idx[q++] = a1; idx[q++] = a2; idx[q++] = a3; }
  const pg = new THREE.BufferGeometry(); pg.setIndex(new THREE.BufferAttribute(idx, 1));
  pg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); pg.setAttribute('aNrm', new THREE.BufferAttribute(nrm, 3)); pg.setAttribute('aCol', new THREE.BufferAttribute(col, 3)); pg.setAttribute('aEm', new THREE.BufferAttribute(em, 1));
  const ground = new THREE.Mesh(pg, makeLit(false, true)); ground.frustumCulled = false; group.add(ground);
  const lit = makeLit(true, false);
  const stat = (geo, count, place) => {
    const o = makeInst(geo, lit, count, true);
    for (let i = 0; i < count; i++) place(o, i);
    o.mesh.count = count; o.mesh.instanceMatrix.needsUpdate = true; o.at.needsUpdate = true; group.add(o.mesh); return o;
  };
  const ring = (rmin, rmax) => { const an = R() * 6.2832, r = rmin + R() * (rmax - rmin); return [Math.cos(an) * r, Math.sin(an) * r]; };
  const tint = (o, i, c) => { o.t[i * 3] = c[0]; o.t[i * 3 + 1] = c[1]; o.t[i * 3 + 2] = c[2]; };
  // Several model variants share one placement sequence: placements are generated once, then split by pick(i).
  const statV = (geos, count, pick, place) => {
    if (geos.length === 1) return [stat(geos[0], count, place)];
    const tmp = { m: new Float32Array(count * 16), t: new Float32Array(count * 3) }, sel = new Uint8Array(count), cnt = geos.map(() => 0);
    for (let i = 0; i < count; i++) { place(tmp, i); sel[i] = pick(i); cnt[sel[i]]++; }
    const outs = geos.map((g, v) => makeInst(g, lit, Math.max(1, cnt[v]), true)), n = geos.map(() => 0);
    for (let i = 0; i < count; i++) { const v = sel[i], o = outs[v], k = n[v]++; o.m.set(tmp.m.subarray(i * 16, i * 16 + 16), k * 16); o.t.set(tmp.t.subarray(i * 3, i * 3 + 3), k * 3); }
    outs.forEach((o, v) => { o.mesh.count = n[v]; o.mesh.instanceMatrix.needsUpdate = true; o.at.needsUpdate = true; group.add(o.mesh); });
    return outs;
  };
  const tc = a.tree;
  // Blender models carry their palette colour, so their tint is brightness only; procedural trees are tinted by area.
  const treeM = a.dead ? [model('tree_dead')] : [model('tree_pine_a'), model('tree_pine_b'), model('tree_round')];
  const treeOk = treeM.every(Boolean), treeG = treeOk ? treeM : [treeGeo(a)];
  statV(treeG, 300, (i) => (treeG.length === 1 ? 0 : i % 7 < 3 ? 0 : i % 7 < 5 ? 1 : 2), (o, i) => {
    const [x, z] = i < 80 ? ring(15, 27) : ring(27, 62), s = (a.dead ? 0.8 : 0.75) + R() * 0.65, c = tc[Math.floor(R() * 3)];
    wM(o.m, i, x, groundY(x, z) - 0.1, z, R() * 6.28, s, s * (0.9 + R() * 0.4), s);
    const v = 0.8 + R() * 0.4;
    tint(o, i, a.dead || treeOk ? [v, v, v] : [c[0] * v * 1.4, c[1] * v * 1.4, c[2] * v * 1.4]);
  });
  const rockM = [model('rock_a'), model('rock_b')], rockOk = rockM.every(Boolean), rockG = rockOk ? rockM : [rockGeo(a)];
  // area stone colour relative to palette STONE, pulled toward grey so moonlight doesn't turn rocks bright blue
  const rk = rockOk ? [0, 1, 2].map((c) => (a.rock[c] / [0.38, 0.4, 0.46][c] + 0.7) * 0.5) : [1, 1, 1];
  statV(rockG, 46, (i) => (rockG.length === 1 ? 0 : i % 3 === 0 ? 1 : 0), (o, i) => { const [x, z] = ring(6, 30), s = 0.25 + R() * 0.55; wM(o.m, i, x, groundY(x, z) + (rockOk ? -0.04 : 0.05), z, R() * 6, s, s, s); const v = 0.8 + R() * 0.4; tint(o, i, [v * rk[0], v * rk[1], v * rk[2]]); });
  // grass: own material (wind sway + distance fade in the vertex shader, double-sided); extra per-instance variety comes from hash2 so the R() sequence, and every later placement, is unchanged
  const grassMat = makeLit(true, false, true, true);
  const grassO = makeInst(grassGeo(), grassMat, 260, true);
  for (let i = 0; i < 260; i++) {
    const [x, z] = ring(4.5, 28), s = 0.8 + R() * 0.9, hv = hash2(i, 17), o = grassO;
    wM(o.m, i, x, groundY(x, z), z, R() * 6, s * (0.85 + hv * 0.3), s * (0.8 + hash2(i, 29) * 0.4), s * (0.85 + hv * 0.3));
    const v = 0.6 + R() * 0.7; tint(o, i, a.dead ? [0.42 * v, 0.24 * v, 0.2 * v] : [0.2 * v, 0.46 * v, 0.2 * v]);
  }
  grassO.mesh.count = 260; grassO.mesh.instanceMatrix.needsUpdate = true; grassO.at.needsUpdate = true; group.add(grassO.mesh);
  world.grass = grassO;
  // Frostmere Marsh hazard: slow puddles (data for the sim, flat decals for the eye)
  world.puddles = null;
  if (a.hazard === 'puddle') {
    const n = 14, pa = new Float32Array(n * 3), pm = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x2f7f9a, transparent: true, opacity: 0.5, depthWrite: false }), n), mm = new THREE.Matrix4();
    for (let k = 0; k < n; k++) { const [x, z] = ring(7, 26), r = 2 + R() * 1.6; pa[k * 3] = x; pa[k * 3 + 1] = z; pa[k * 3 + 2] = r; mm.makeScale(r, 1, r); mm.setPosition(x, groundY(x, z) + 0.06, z); pm.setMatrixAt(k, mm); }
    pm.renderOrder = 1; pm.frustumCulled = false; group.add(pm); world.puddles = pa;
  }
  // glowing mushrooms in clusters: cool accents against the warm fire
  stat(model('mushroom') || mushGeo(), 72, (o, i) => {
    if (i % 6 === 0) { const [cx, cz] = ring(9, 30); o.cx = cx; o.cz = cz; }
    const x = o.cx + (R() - 0.5) * 1.6, z = o.cz + (R() - 0.5) * 1.6, s = 0.35 + R() * 0.45;
    wM(o.m, i, x, groundY(x, z), z, R() * 6, s, s * (0.8 + R() * 0.5), s);
    const k = R(); tint(o, i, a.dead ? [1.2, 0.45 + k * 0.3, 0.15] : k < 0.5 ? [0.3, 0.95, 1.2] : k < 0.8 ? [0.55, 0.5, 1.3] : [0.5, 1.2, 0.5]);
  });
  stat(model('fence') || postGeo(), 22, (o, i) => { const an = i / 22 * 6.2832, r = 27 + R() * 1.5, x = Math.cos(an) * r, z = Math.sin(an) * r; wM(o.m, i, x, groundY(x, z), z, -an + 1.57 + (R() - 0.5) * 0.4, 1, 1 + R() * 0.3, 1); tint(o, i, [1, 1, 1]); });
  if (a.dead) stat(model('pillar') || pillarGeo(), 7, (o, i) => { const [x, z] = ring(19, 26); wM(o.m, i, x, groundY(x, z), z, R() * 6, 1, 0.6 + R() * 0.7, 1); tint(o, i, [1, 1, 1]); });
  stat(model('banner') || bannerGeo(), 3, (o, i) => { const an = 0.7 + i * 2.1, r = 7.5 + i; wM(o.m, i, Math.cos(an) * r, 0, Math.sin(an) * r, an + 1.6, 1, 1, 1); tint(o, i, [1, 1, 1]); });
  world.lamps = [];
  stat(model('lamp') || lampGeo(), 4, (o, i) => { const an = 2.2 + i * 1.57 + (R() - 0.5) * 0.4, r = 10.5 + R() * 2, x = Math.cos(an) * r, z = Math.sin(an) * r; wM(o.m, i, x, 0, z, -an, 1, 1, 1); tint(o, i, [1, 1, 1]); world.lamps.push(x - Math.cos(an) * 0.55, z - Math.sin(an) * 0.55); });
  stat(model('camp') || campGeo(), 1, (o) => { wM(o.m, 0, 0, 0, 0, 0, 1, 1, 1); tint(o, 0, [1, 1, 1]); });
  // stumps: new decoration (Blender-only asset, skipped when the model is missing); placed last so earlier placements are unchanged
  const stumpG = model('stump');
  if (stumpG) stat(stumpG, 18, (o, i) => { const [x, z] = ring(8, 28), s = 0.7 + R() * 0.6; wM(o.m, i, x, groundY(x, z) - 0.03, z, R() * 6.28, s, s * (0.8 + R() * 0.5), s); const v = a.dead ? 0.6 + R() * 0.2 : 0.8 + R() * 0.4; tint(o, i, [v, v, v]); });
  // lamp glows
  if (fx.lampGlow) for (const gq of fx.lampGlow) scene.remove(gq);
  fx.lampGlow = [];
  for (let i = 0; i < world.lamps.length; i += 2) { const gq = glowQuad(2.2, 1, 0.65, 0.25); gq.position.set(world.lamps[i], 1.9, world.lamps[i + 1]); gq.userData.c.w = 0.55; scene.add(gq); fx.lampGlow.push(gq); }
  for (let i = 0; i < 4; i++) U.uLamp.value[i].set(world.lamps[i * 2] || 999, world.lamps[i * 2 + 1] || 999);
  U.uAmb.value.setRGB(...a.amb); U.uMoon.value.setRGB(...a.moon); U.uFog.value.setRGB(...a.fog);
  renderer.setClearColor(new THREE.Color(a.fog[0], a.fog[1], a.fog[2]));
  world.base = { amb: a.amb.slice(), moon: a.moon.slice(), fog: a.fog.slice() };
  return world;
}
