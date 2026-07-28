#!/usr/bin/env python3
"""Burn down every structure sprite that a raider's torch can reach.

Feeds each finished 32x32 building sprite back to Nano Banana with
art/prompts/burnify.txt as a redraw instruction, then pixelates the result
back down to a matching 32x32, 5-colour sprite.

The reference is upscaled nearest-neighbour before it is sent: a bare 32x32
image is too small for the model to read the silhouette off reliably, and the
whole point of a --ref redraw is that the ruin keeps the original's footprint.

Usage:
    python3 tools/burnify.py            # every structure that is missing one
    python3 tools/burnify.py forge well # only these
    python3 tools/burnify.py --force    # redo even if the output exists
"""
import pathlib
import subprocess
import sys
import tempfile

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
BLDG = ROOT / "assets" / "sprites" / "buildings"
PROMPT = ROOT / "art" / "prompts" / "burnify.txt"
RAW = ROOT / "art" / "raw"
REF_SIZE = 512

# key -> source sprite. The burnt output is always burned_<key>_32.png.
# Cabins already have a ruin (burned_house_32.png), and moat/ditch are
# earthworks — a trench of water does not burn.
TARGETS = {
    "recruit":     "recruitment_center_32.png",
    "market":      "market_32.png",
    "watchtower":  "watchtower_32.png",
    "bakery":      "bakery_32.png",
    "well":        "well_32.png",
    "forge":       "forge_32.png",
    "townhall":    "townhall_32.png",
    "farm":        "farm_32.png",
    "wall":        "wall_32.png",
    "wallv":       "wall_v_32.png",
    "gate":        "gate_32.png",
    "gatev":       "gatev_32.png",
    "stonewall":   "stonewall_32.png",
    "stonewallv":  "stonewallv_32.png",
    "stonegate":   "stonegate_32.png",
    "stonegatev":  "stonegatev_32.png",
}


def burn(key, src_name, force=False):
    src = BLDG / src_name
    dst = BLDG / f"burned_{key}_32.png"
    if not src.exists():
        return f"SKIP {key}: no source {src_name}"
    if dst.exists() and not force:
        return f"HAVE {key}: {dst.name}"

    # upscale the reference so the model can actually see the pixel blocks
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        ref = pathlib.Path(tmp.name)
    Image.open(src).convert("RGBA").resize((REF_SIZE, REF_SIZE), Image.NEAREST).save(ref)

    RAW.mkdir(parents=True, exist_ok=True)
    raw = RAW / f"burned_{key}_raw.png"
    try:
        subprocess.run(
            [sys.executable, str(ROOT / "tools" / "gen_art.py"),
             str(PROMPT), str(raw), "--ref", str(ref)],
            check=True, capture_output=True, text=True, timeout=300)
    except subprocess.CalledProcessError as e:
        return f"FAIL {key}: {(e.stderr or e.stdout or '').strip()[:200]}"
    except subprocess.TimeoutExpired:
        return f"FAIL {key}: timed out"
    finally:
        ref.unlink(missing_ok=True)

    subprocess.run(
        [sys.executable, str(ROOT / "tools" / "pixelate.py"), str(raw), str(dst),
         "--size", "32", "--colors", "5", "--transparent"],
        check=True, capture_output=True, text=True)
    return f"OK   {key}: {dst.name}"


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    force = "--force" in sys.argv
    keys = args or list(TARGETS)
    for k in keys:
        if k not in TARGETS:
            print(f"?    {k}: not a known structure", flush=True)
            continue
        print(burn(k, TARGETS[k], force), flush=True)
