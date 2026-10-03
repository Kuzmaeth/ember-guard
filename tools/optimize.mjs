// Optimizes raw Blender exports: assets/models/*.glb -> public/models/*.glb
// weld + dedup + prune, quantize POSITION/NORMAL/COLOR_0 (custom _EM/_JOINT/_PIVOT stay float: _PIVOT must stay in
// model space and _JOINT must stay an exact id), then Meshopt compression. Usage: node tools/optimize.mjs [name ...]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, prune, weld, quantize, reorder } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'assets', 'models'), DST = path.join(ROOT, 'public', 'models');
fs.mkdirSync(DST, { recursive: true });
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

const only = process.argv.slice(2);
const files = fs.readdirSync(SRC).filter((f) => f.endsWith('.glb') && (!only.length || only.includes(f.replace('.glb', ''))));
const rows = [];
for (const f of files) {
  const doc = await io.read(path.join(SRC, f));
  await doc.transform(
    weld(), dedup(), prune(),
    reorder({ encoder: MeshoptEncoder }),
    quantize({ pattern: /^(POSITION|NORMAL|COLOR_0)$/, quantizePosition: 14, quantizeNormal: 8, quantizeColor: 8 }),
  );
  // pack custom attributes: _JOINT -> u8 id, _EM -> u8 normalized, _PIVOT -> i16 millimetres (src/models.js divides by 1000)
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) {
    const j = p.getAttribute('_JOINT'), e = p.getAttribute('_EM'), pv = p.getAttribute('_PIVOT');
    if (j) j.setArray(Uint8Array.from(j.getArray(), (v) => Math.round(v)));
    if (e) e.setArray(Uint8Array.from(e.getArray(), (v) => Math.round(Math.min(1, Math.max(0, v)) * 255))).setNormalized(true);
    if (pv) pv.setArray(Int16Array.from(pv.getArray(), (v) => Math.round(v * 1000)));
  }
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  let tris = 0;
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) tris += (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3;
  const out = path.join(DST, f);
  await io.write(out, doc);
  rows.push({ asset: f.replace('.glb', ''), tris, rawKB: +(fs.statSync(path.join(SRC, f)).size / 1024).toFixed(1), kB: +(fs.statSync(out).size / 1024).toFixed(1) });
}
console.table(rows);
const tot = rows.reduce((a, r) => a + r.kB, 0);
console.log('total kB', tot.toFixed(1));
