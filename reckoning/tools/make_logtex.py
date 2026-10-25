#!/usr/bin/env python3
"""The logs' textures, from photographs (CC0): the bark round their sides and the sawn ends.

    python3 reckoning/tools/make_logtex.py

  log_bark.jpg, log_bark_n.jpg, log_bark_r.jpg   Poly Haven's Pine Bark (polyhaven.com/a/pine_bark): its colour,
                                                 its normal map (OpenGL) and its roughness, 1024 / 1024 / 512
  log_end_a.jpg, log_end_a_n.jpg                 ambientCG's Tree End 002 and 003 (ambientcg.com): a sawn round
  log_end_b.jpg, log_end_b_n.jpg                 with its ring of bark, cut out by its own opacity, stretched to
                                                 fill the square (a cylinder's cap takes the circle inscribed in its
                                                 texture), the corners outside it the bark's dark; 512

The sources are fetched once into tools/blender/assets/ph_tex/pine_bark and tools/blender/assets/acg/treeend
(not kept in the repository).
"""
import pathlib

import numpy as np
from PIL import Image

HERE = pathlib.Path(__file__).resolve().parent
BARK = HERE / "blender" / "assets" / "ph_tex" / "pine_bark"
ENDS = HERE / "blender" / "assets" / "acg" / "treeend"
OUT = HERE.parent / "art" / "tex"


def end(asset, name, size=512):
    src = ENDS / asset
    col = Image.open(src / f"{asset}_1K-JPG_Color.jpg").convert("RGB")
    nor = Image.open(src / f"{asset}_1K-JPG_NormalGL.jpg").convert("RGB")
    op = np.asarray(Image.open(src / f"{asset}_1K-JPG_Opacity.jpg").convert("L")) > 127
    ys, xs = np.nonzero(op)
    box = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
    c = np.asarray(col.crop(box).resize((size, size), Image.LANCZOS)).astype(np.float32)
    n = np.asarray(nor.crop(box).resize((size, size), Image.LANCZOS)).astype(np.float32)
    m = np.asarray(Image.fromarray(op[box[1]:box[3], box[0]:box[2]].astype(np.uint8) * 255).resize((size, size), Image.LANCZOS)).astype(np.float32)[..., None] / 255
    # (outside the round: the bark's own dark, and a flat normal)
    rim = c[(m[..., 0] > 0.5) & (m[..., 0] < 0.9)].mean(axis=0) * 0.6
    c = c * m + rim * (1 - m)
    n = n * m + np.array([128, 128, 255], np.float32) * (1 - m)
    Image.fromarray(c.clip(0, 255).astype(np.uint8)).save(OUT / f"log_end_{name}.jpg", quality=88)
    Image.fromarray(n.clip(0, 255).astype(np.uint8)).save(OUT / f"log_end_{name}_n.jpg", quality=90)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    # (its fox-orange flakes toned down a little, toward the grey-brown of a spruce's or an old pine's lower trunk)
    b = np.asarray(Image.open(BARK / "Diffuse.jpg").convert("RGB").resize((1024, 1024), Image.LANCZOS)).astype(np.float32)
    grey = b.mean(axis=2, keepdims=True)
    Image.fromarray((grey + (b - grey) * 0.7).clip(0, 255).astype(np.uint8)).save(OUT / "log_bark.jpg", quality=86)
    Image.open(BARK / "nor_gl.jpg").convert("RGB").resize((1024, 1024), Image.LANCZOS).save(OUT / "log_bark_n.jpg", quality=90)
    Image.open(BARK / "Rough.jpg").convert("L").resize((512, 512), Image.LANCZOS).save(OUT / "log_bark_r.jpg", quality=86)
    end("TreeEnd002", "a")
    end("TreeEnd003", "b")
    for f in sorted(OUT.glob("log_*")):
        print(f.name, f.stat().st_size // 1024, "KB")


if __name__ == "__main__":
    main()
