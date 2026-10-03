// Loads the Blender-built GLBs (public/models, see tools/build_assets.py) and converts them to the attribute layout
// the lit shader in gfx.js expects (aCol/aEm/aNrm/aJ/aPv). Any model that fails to load is simply absent from MODELS,
// and gfx.js falls back to its procedural geometry, so the game never depends on a file being present.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

export const MODEL_NAMES = [
  'hero_warden', 'hero_wren', 'hero_monk', 'hero_ash', 'boss_drake', 'boss_ashen_warden', 'enemy_spitter', 'enemy_bulwark', 'enemy_blastbug', 'enemy_gloommoth', 'enemy_matron',
  'enemy_creeper', 'enemy_skitter', 'enemy_brute', 'enemy_wraith', 'enemy_ember_eater',
  'tree_pine_a', 'tree_pine_b', 'tree_round', 'tree_dead', 'rock_a', 'rock_b', 'stump', 'fence', 'mushroom',
  'lamp', 'banner', 'pillar', 'gem', 'chest', 'camp',
];
export const MODELS = {};

function toFloat(attr, n) {
  const out = new Float32Array(attr.count * n);
  for (let i = 0; i < attr.count; i++) {
    out[i * n] = attr.getX(i);
    if (n > 1) out[i * n + 1] = attr.getY(i);
    if (n > 2) out[i * n + 2] = attr.getZ(i);
  }
  return out;
}

function convert(root) {
  let src = null;
  root.updateMatrixWorld(true);
  root.traverse((o) => { if (!src && o.isMesh) src = o; });
  if (!src) return null;
  const s = src.geometry, n = s.attributes.position.count, g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(toFloat(s.attributes.position, 3), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(toFloat(s.attributes.normal, 3), 3));
  if (s.index) g.setIndex(new THREE.BufferAttribute(Uint32Array.from(s.index.array), 1));
  // bake the node transform (quantization offset/scale) into positions and normals
  g.applyMatrix4(src.matrixWorld);
  g.setAttribute('aNrm', g.attributes.normal); g.deleteAttribute('normal');
  const c = s.attributes.color;
  g.setAttribute('aCol', c ? new THREE.BufferAttribute(toFloat(c, 3), 3) : new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  g.setAttribute('aEm', s.attributes._em ? new THREE.BufferAttribute(toFloat(s.attributes._em, 1), 1) : new THREE.BufferAttribute(new Float32Array(n), 1));
  g.setAttribute('aJ', s.attributes._joint ? new THREE.BufferAttribute(toFloat(s.attributes._joint, 1), 1) : new THREE.BufferAttribute(new Float32Array(n), 1));
  const pv = s.attributes._pivot ? toFloat(s.attributes._pivot, 3) : new Float32Array(n * 3);
  if (s.attributes._pivot && !(s.attributes._pivot.array instanceof Float32Array)) for (let i = 0; i < pv.length; i++) pv[i] *= 0.001; // packed as millimetres
  g.setAttribute('aPv', new THREE.BufferAttribute(pv, 3));
  g.computeBoundingSphere();
  return g;
}

// Resolves when every model has loaded or failed; never rejects. timeoutMs guards against a stalled network.
export function loadModels(base = './models/', timeoutMs = 10000) {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const one = (name) => new Promise((res) => {
    loader.load(base + name + '.glb', (gltf) => {
      try { const g = convert(gltf.scene); if (g) MODELS[name] = g; } catch (e) { console.warn('model convert failed', name, e); }
      res();
    }, undefined, (e) => { console.warn('model load failed, using procedural fallback:', name, e && e.message); res(); });
  });
  const all = Promise.all(MODEL_NAMES.map(one));
  return Promise.race([all, new Promise((res) => setTimeout(res, timeoutMs))]);
}

// Fresh copy for each InstancedMesh (makeInst adds per-instance attributes to the geometry).
export const model = (name) => (MODELS[name] ? MODELS[name].clone() : null);
