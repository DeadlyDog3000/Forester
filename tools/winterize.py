#!/usr/bin/env python3
"""Put every building sprite under snow, for the winter half of the year.

Feeds each finished 32x32 building sprite back to Nano Banana with
art/prompts/winterize.txt as a redraw instruction, then pixelates the result
back down to a matching 32x32 sprite. The counterpart of burnify.py, and it
works the same way: the reference is upscaled nearest-neighbour first, because
a bare 32x32 image is too small for the model to read a silhouette off.

Usage:
    python3 tools/winterize.py            # every building missing a winter coat
    python3 tools/winterize.py forge well # only these
    python3 tools/winterize.py --force    # redo even if the output exists
"""
import pathlib
import subprocess
import sys
import tempfile

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
BLDG = ROOT / "assets" / "sprites" / "buildings"
PROMPT = ROOT / "art" / "prompts" / "winterize.txt"
RAW = ROOT / "art" / "raw"
REF_SIZE = 512

# key -> source sprite. The snowed output is always <key>_w_32.png.
TARGETS = {
    "quarry":  "quarry_32.png",
    "mine":    "mine_32.png",
    "sawmill": "sawmill_32.png",
    "smelter": "smelter_32.png",
}


def winterize(key, src_name, force=False):
    src = BLDG / src_name
    dst = BLDG / f"{key}_w_32.png"
    if not src.exists():
        return f"SKIP {key}: no source {src_name}"
    if dst.exists() and not force:
        return f"HAVE {key}: {dst.name}"

    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        ref = pathlib.Path(tmp.name)
    Image.open(src).convert("RGBA").resize((REF_SIZE, REF_SIZE), Image.NEAREST).save(ref)

    RAW.mkdir(parents=True, exist_ok=True)
    raw = RAW / f"{key}_w_raw.png"
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
         "--size", "32", "--colors", "6", "--transparent"],
        check=True, capture_output=True, text=True)
    return f"OK   {key}: {dst.name}"


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    force = "--force" in sys.argv
    keys = args or list(TARGETS)
    for k in keys:
        if k not in TARGETS:
            print(f"?    {k}: not a known building", flush=True)
            continue
        print(winterize(k, TARGETS[k], force), flush=True)
