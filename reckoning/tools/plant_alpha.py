#!/usr/bin/env python3
"""The scanned plants' leaves, cut out of their cards: each plant's colour texture given its alpha.

    python3 reckoning/tools/plant_alpha.py

Poly Haven's glTF downloads carry a plant's colour as a JPEG, with no alpha, and its cut-out as a separate map
(<asset>_alpha_1k.png) — so the built models (nature_ph.py) drew every frond as a solid green card: the ferns stood like
dark agaves. This lays each alpha map into the model's colour image (as a PNG with alpha), in the .glb itself.

The alpha maps are fetched once into tools/blender/assets/ph_alpha/<asset>/ (not kept in the repository):
    https://dl.polyhaven.org/file/ph-assets/Models/png/1k/<asset>/<asset>_alpha_1k.png
"""
import io
import json
import pathlib
import struct

from PIL import Image

HERE = pathlib.Path(__file__).resolve().parent
ALPHA = HERE / "blender" / "assets" / "ph_alpha"
MODELS = HERE.parent / "models"
PLANTS = {"fern": "fern_02", "nettle": "nettle_plant"}


def read_glb(path):
    b = path.read_bytes()
    n = struct.unpack("<I", b[12:16])[0]
    j = json.loads(b[20:20 + n])
    # (a model packed by tools/packmodels.mjs keeps its geometry compressed, which this can't edit: work on the export)
    if "EXT_meshopt_compression" in j.get("extensionsUsed", []):
        raise SystemExit(f"{path.name} is packed (tools/packmodels.mjs): run this on the model as exported from Blender, then pack it again")
    m = struct.unpack("<I", b[20 + n:24 + n])[0]
    return j, b[28 + n:28 + n + m]


def write_glb(path, j, views):
    # (each view's bytes laid end to end again, four-byte aligned, their offsets made good)
    out = bytearray()
    for v, data in zip(j["bufferViews"], views):
        while len(out) % 4: out.append(0)
        v["byteOffset"] = len(out); v["byteLength"] = len(data); out += data
    while len(out) % 4: out.append(0)
    j["buffers"][0]["byteLength"] = len(out)
    js = json.dumps(j, separators=(",", ":")).encode()
    js += b" " * (-len(js) % 4)
    body = struct.pack("<I4s", len(js), b"JSON") + js + struct.pack("<I4s", len(out), b"BIN\0") + bytes(out)
    path.write_bytes(struct.pack("<4sII", b"glTF", 2, 12 + len(body)) + body)


def main():
    manifest = json.loads((MODELS / "manifest.json").read_text())
    for key, asset in PLANTS.items():
        src = ALPHA / asset / f"{asset}_alpha_1k.png"
        if not src.exists():
            print("no alpha map for", key, "— fetch", src.name); continue
        path = MODELS / manifest[key]
        j, binary = read_glb(path)
        views = [binary[v.get("byteOffset", 0):v.get("byteOffset", 0) + v["byteLength"]] for v in j["bufferViews"]]
        mat = j["materials"][0]
        ti = mat["pbrMetallicRoughness"]["baseColorTexture"]["index"]
        ii = j["textures"][ti]["source"]
        img = j["images"][ii]
        col = Image.open(io.BytesIO(views[img["bufferView"]])).convert("RGB")
        a = Image.open(src).convert("L").resize(col.size, Image.LANCZOS)
        rgba = col.copy(); rgba.putalpha(a)
        buf = io.BytesIO(); rgba.save(buf, "PNG", optimize=True)
        views[img["bufferView"]] = buf.getvalue(); img["mimeType"] = "image/png"
        mat["alphaMode"] = "MASK"; mat["alphaCutoff"] = 0.45
        write_glb(path, j, views)
        kept = sum(a.histogram()[116:]) / (a.size[0] * a.size[1])
        print(f"{key}: {path.name} {path.stat().st_size // 1024} KB, {kept:.0%} of the card kept")


if __name__ == "__main__":
    main()
