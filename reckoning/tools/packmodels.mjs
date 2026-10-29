// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================
// PACKS THE MODELS SMALLER: every .glb in models/ (and models/town/) that isn't packed yet goes through gltfpack
// (meshoptimizer, MIT), which stores the same geometry and animation in about a third to a half of the space. The game
// unpacks them as it loads (lib/libs/meshopt_decoder.module.js, set on the loader in js/models.js).
//
//   node reckoning/tools/packmodels.mjs            pack every model not yet packed
//   node reckoning/tools/packmodels.mjs bear.glb   just these
//
// Run it after exporting a model from Blender. It skips files already packed, so it is safe to run again.
// Lossless choices: -noq keeps every number a full float (no rounding of positions, and no extra nodes that quantizing
// adds), -kn/-km/-ke/-kv keep named nodes, materials, extras and every vertex attribute, so code that looks up a bone,
// a node or a material by name finds it as before. -af 0, -ac and -ar/-at/-as at their finest keep the animation keys and tracks as exported (no resampling,
// no dropping of tracks that hold still). Mesh names, which gltfpack drops, and each material's see-through
// settings, which it may change, are put back from the export.
// gltfpack comes from npm (npx fetches it the first time); GLTFPACK=/path/to/cli.js uses a copy already on disk.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "models");
const ARGS = ["-cc", "-noq", "-kn", "-km", "-ke", "-kv", "-af", "0", "-ac", "-ar", "16", "-at", "24", "-as", "24"];

// a .glb's own description of itself (its JSON chunk): to see whether it's packed already, and to give names back
function gltfJson(file) {
  const b = fs.readFileSync(file);
  if (b.readUInt32LE(0) !== 0x46546c67) throw new Error("not a .glb");
  return JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString("utf8"));
}
const packed = file => (gltfJson(file).extensionsUsed || []).includes("EXT_meshopt_compression");

// gltfpack keeps named nodes but not the names of their meshes, and three.js names a mesh of several materials after
// its mesh ("brother_body_1", "_2"…), which the game looks parts up by (a hat, an arm, the skin). Give them back:
// each packed node's mesh takes the name its node's mesh had in the export.
function restoreMeshNames(src, out) {
  const a = gltfJson(src), b = fs.readFileSync(out), n = b.readUInt32LE(12), j = JSON.parse(b.subarray(20, 20 + n).toString("utf8"));
  const was = {}; for (const nd of a.nodes || []) if (nd.name != null && nd.mesh != null && a.meshes[nd.mesh].name != null) was[nd.name] = a.meshes[nd.mesh].name;
  let changed = 0;
  for (const nd of j.nodes || []) if (nd.mesh != null && was[nd.name] != null && j.meshes[nd.mesh].name !== was[nd.name]) { j.meshes[nd.mesh].name = was[nd.name]; changed++; }
  // and how each material lets light through: gltfpack makes a material opaque when it judges its picture has no
  // see-through parts, which turned the lantern's glass solid and the sails' cut-outs to cloth. As exported, by name.
  const mat = {}; for (const m of a.materials || []) if (m.name != null) mat[m.name] = m;
  for (const m of j.materials || []) {
    const o = mat[m.name]; if (!o) continue;
    for (const k of ["alphaMode", "alphaCutoff", "doubleSided"]) if (JSON.stringify(m[k]) !== JSON.stringify(o[k])) { if (o[k] === undefined) delete m[k]; else m[k] = o[k]; changed++; }
  }
  if (!changed) return;
  let txt = Buffer.from(JSON.stringify(j), "utf8"); const pad = (4 - txt.length % 4) % 4; txt = Buffer.concat([txt, Buffer.alloc(pad, 0x20)]);
  const head = Buffer.alloc(20); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(20 + txt.length + (b.length - 20 - n), 8); head.writeUInt32LE(txt.length, 12); head.writeUInt32LE(0x4e4f534a, 16);
  fs.writeFileSync(out, Buffer.concat([head, txt, b.subarray(20 + n)]));
}

function pack(src, out) {
  const cmd = process.env.GLTFPACK ? [process.execPath, [process.env.GLTFPACK]] : ["npx", ["--yes", "gltfpack@1.3.0"]];
  execFileSync(cmd[0], [...cmd[1], "-i", src, "-o", out, ...ARGS], { stdio: ["ignore", "ignore", "inherit"] });
}

const named = process.argv.slice(2);
const files = named.length ? named.map(f => path.resolve(DIR, f))
  : [DIR, path.join(DIR, "town")].flatMap(d => fs.existsSync(d) ? fs.readdirSync(d).filter(f => f.endsWith(".glb")).map(f => path.join(d, f)) : []);

let before = 0, after = 0, done = 0;
for (const f of files) {
  if (packed(f)) continue;
  const tmp = f + ".packing.glb", was = fs.statSync(f).size;
  try { pack(f, tmp); restoreMeshNames(f, tmp); } catch (e) { console.error("  could not pack " + path.relative(DIR, f) + ": " + e.message); fs.rmSync(tmp, { force: true }); continue; }
  const now = fs.statSync(tmp).size;
  if (now >= was) { fs.rmSync(tmp); console.log("  " + path.relative(DIR, f) + ": no smaller packed, left as it is"); continue; }
  fs.renameSync(tmp, f);
  before += was; after += now; done++;
  console.log("  " + path.relative(DIR, f) + ": " + (was / 1e6).toFixed(2) + " MB -> " + (now / 1e6).toFixed(2) + " MB");
}
console.log(done ? `Packed ${done} model${done === 1 ? "" : "s"}: ${(before / 1e6).toFixed(1)} MB -> ${(after / 1e6).toFixed(1)} MB.` : "Nothing to pack: every model is packed already.");
