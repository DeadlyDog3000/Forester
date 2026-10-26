#!/usr/bin/env python3
"""The scanned stones, made stones of the north: each one's colour texture turned from its red-brown to a weathered grey.

    python3 reckoning/tools/rock_tone.py

The woods' boulder (rock_b) is Poly Haven's Namaqualand Boulder 02, a South African sandstone, and the smaller stone
(rock_c) Rock 07: both a warm red-brown that, half sunk in the grass of a Baltic spruce wood, read as chopped wood. This
keeps each texture's light and dark (its grain, cracks and pits) and draws most of its colour out, to the cold grey of
granite with a faint green of lichen, in the .glb itself. Once done, the image is named "..._grey" and left alone.

Rock 07 also came glossy (its roughness about 0.3, wet-looking in any light) and with dark, reddish painted vertex
colours (its occlusion, about 0.4) that sank it to near black: its roughness is raised to a dry stone's, and its vertex
colours kept only as a light shading, grey.
"""
import io
import json
import pathlib

import numpy as np
from PIL import Image

from plant_alpha import read_glb, write_glb

MODELS = pathlib.Path(__file__).resolve().parent.parent / "models"
ROCKS = ["rock_b", "rock_c"]
GREY = np.array([0.96, 0.98, 0.94], np.float32)   # (the grey: a touch cool, a touch of lichen green)


def main():
    manifest = json.loads((MODELS / "manifest.json").read_text())
    for key in ROCKS:
        path = MODELS / manifest[key]
        j, binary = read_glb(path)
        views = [binary[v.get("byteOffset", 0):v.get("byteOffset", 0) + v["byteLength"]] for v in j["bufferViews"]]
        mat = j["materials"][0]
        img = j["images"][j["textures"][mat["pbrMetallicRoughness"]["baseColorTexture"]["index"]]["source"]]
        if img.get("name", "").endswith("_grey"):
            print(key, "already grey"); continue
        c = np.asarray(Image.open(io.BytesIO(views[img["bufferView"]])).convert("RGB")).astype(np.float32)
        lum = (c * [0.299, 0.587, 0.114]).sum(axis=2, keepdims=True)
        out = lum * GREY + (c - lum) * 0.22
        out = out * (100 / max(1, out.mean()))   # (about the mean light of the old brown)
        buf = io.BytesIO(); Image.fromarray(out.clip(0, 255).astype(np.uint8)).save(buf, "JPEG", quality=90)
        views[img["bufferView"]] = buf.getvalue(); img["mimeType"] = "image/jpeg"; img["name"] = img.get("name", key) + "_grey"
        # (the dry stone: no polish on it)
        mr = mat["pbrMetallicRoughness"].get("metallicRoughnessTexture")
        if mr:
            ai = j["images"][j["textures"][mr["index"]]["source"]]
            a = np.asarray(Image.open(io.BytesIO(views[ai["bufferView"]])).convert("RGB")).astype(np.float32)
            if a[..., 1].mean() < 150:
                a[..., 1] = 140 + a[..., 1] * 0.45
                buf = io.BytesIO(); Image.fromarray(a.clip(0, 255).astype(np.uint8)).save(buf, "JPEG", quality=90)
                views[ai["bufferView"]] = buf.getvalue()
        # (the painted shading: grey, and only light)
        for prim in j["meshes"][0]["primitives"]:
            ci = prim["attributes"].get("COLOR_0")
            if ci is None: continue
            acc = j["accessors"][ci]; bv = bytearray(views[acc["bufferView"]]); off = acc.get("byteOffset", 0)
            nc = {"VEC3": 3, "VEC4": 4}[acc["type"]]
            if acc["componentType"] != 5126 or j["bufferViews"][acc["bufferView"]].get("byteStride", nc * 4) != nc * 4: continue
            v = np.frombuffer(bytes(bv[off:off + acc["count"] * nc * 4]), np.float32).reshape(-1, nc).copy()
            l = v[:, :3] @ np.array([0.299, 0.587, 0.114], np.float32)
            v[:, :3] = (0.62 + 0.38 * np.clip(l / max(1e-3, l.max()), 0, 1))[:, None]
            bv[off:off + v.nbytes] = v.tobytes(); views[acc["bufferView"]] = bytes(bv)
        write_glb(path, j, views)
        print(f"{key}: {path.name} {path.stat().st_size // 1024} KB, mean", out.reshape(-1, 3).mean(0).round())


if __name__ == "__main__":
    main()
