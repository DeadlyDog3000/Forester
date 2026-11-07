// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================
// THE PEOPLE AS SEEN FROM FAR OFF: for every rigged person in models/, a copy of about a third of the facets
// (<name>_far.glb), made with gltfpack's simplifier (meshoptimizer, MIT), on the same skeleton and with the same pieces
// by the same names. A man of a battle's ranks or a town's crowd, made one piece (mergeRig in js/models.js), is drawn
// with it past fifteen yards. The game loads them after the start, as it needs them (manifest.json's "_far").
//
//   node reckoning/tools/farmodels.mjs              every person in the manifest's "_far"
//   node reckoning/tools/farmodels.mjs musketeer    just these
//
// Run it after a person's model changes. gltfpack: GLTFPACK=/path/to/cli.js, or npx fetches it.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "models");
// (packed as packmodels.mjs packs, and simplified: -si the share of facets kept. Not -sp, which may open the seams to
//  get there: the coat-tails came apart in cracks)
const ARGS = ["-cc", "-noq", "-kn", "-km", "-ke", "-kv", "-si", "0.33"];

const gltfJson = file => { const b = fs.readFileSync(file); return JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString("utf8")); };
// (gltfpack drops the meshes' names, which the game finds a person's pieces by: given back from the model, node by node)
function restoreMeshNames(src, out) {
  const a = gltfJson(src), b = fs.readFileSync(out), n = b.readUInt32LE(12), j = JSON.parse(b.subarray(20, 20 + n).toString("utf8"));
  const was = {}; for (const nd of a.nodes || []) if (nd.name != null && nd.mesh != null && a.meshes[nd.mesh].name != null) was[nd.name] = a.meshes[nd.mesh].name;
  for (const nd of j.nodes || []) if (nd.mesh != null && was[nd.name] != null) j.meshes[nd.mesh].name = was[nd.name];
  let txt = Buffer.from(JSON.stringify(j), "utf8"); const pad = (4 - txt.length % 4) % 4; txt = Buffer.concat([txt, Buffer.alloc(pad, 0x20)]);
  const head = Buffer.alloc(20); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(20 + txt.length + (b.length - 20 - n), 8); head.writeUInt32LE(txt.length, 12); head.writeUInt32LE(0x4e4f534a, 16);
  fs.writeFileSync(out, Buffer.concat([head, txt, b.subarray(20 + n)]));
}
const facets = file => { const j = gltfJson(file); let t = 0; for (const m of j.meshes || []) for (const p of m.primitives) t += p.indices != null ? j.accessors[p.indices].count / 3 : 0; return Math.round(t); };

const named = process.argv.slice(2);
const list = named.length ? named : JSON.parse(fs.readFileSync(path.join(DIR, "manifest.json"), "utf8"))._far || [];
const cmd = process.env.GLTFPACK ? [process.execPath, [process.env.GLTFPACK]] : ["npx", ["--yes", "gltfpack@1.3.0"]];
for (const k of list) {
  const src = path.join(DIR, k + ".glb"), out = path.join(DIR, k + "_far.glb");
  if (!fs.existsSync(src)) { console.error("  no " + k + ".glb"); continue; }
  execFileSync(cmd[0], [...cmd[1], "-i", src, "-o", out, ...ARGS], { stdio: ["ignore", "ignore", "inherit"] });
  restoreMeshNames(src, out);
  console.log(`  ${k}: ${facets(src)} -> ${facets(out)} facets, ${(fs.statSync(out).size / 1e3).toFixed(0)} kB`);
}
