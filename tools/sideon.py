#!/usr/bin/env python3
"""Draw every rotatable building a second time, seen from its side.

A building in Forester is a flat head-on elevation, so turning one a quarter
turn is not a transform you can do in code — the roof would end up on its side.
It needs a second sprite: the same building looked at from its narrow end.

Feeds each finished 32x32 front sprite back to Nano Banana with
art/prompts/sideon.txt as a redraw instruction, then pixelates the result back
down to a matching 32x32 sprite. The same shape as burnify.py and winterize.py,
and for the same reason: the reference is upscaled nearest-neighbour first,
because a bare 32x32 image is too small for the model to read a silhouette off.

Usage:
    python3 tools/sideon.py             # every building missing a side view
    python3 tools/sideon.py forge jail  # only these
    python3 tools/sideon.py --force     # redo even if the output exists
"""
import pathlib
import subprocess
import sys
import tempfile

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
BLDG = ROOT / "assets" / "sprites" / "buildings"
PROMPT = ROOT / "art" / "prompts" / "sideon.txt"
RAW = ROOT / "art" / "raw"
REF_SIZE = 512

# key -> source sprite. The side view is always <key>v_32.png.
#
# Left out on purpose: the well and the watchtower are round or square towers
# with no front to turn away from; the mine and the quarry are workings cut into
# the ground rather than buildings standing on it; walls and gates already have
# their own hand-drawn end-on sprites, which are a different thing entirely (a
# wall seen end-on is seen from ABOVE, not from the side).
TARGETS = {
    "cabin":    "log_cabin_32.png",
    "market":   "market_32.png",
    "bakery":   "bakery_32.png",
    "forge":    "forge_32.png",
    "townhall": "townhall_32.png",
    "jail":     "jail_32.png",
    "hospital": "hospital_32.png",
    "recruit":  "recruitment_center_32.png",
    "sawmill":  "sawmill_32.png",
    "smelter":  "smelter_32.png",
}


def sideways(key, src_name, force=False):
    src = BLDG / src_name
    dst = BLDG / f"{key}v_32.png"
    if not src.exists():
        return f"SKIP {key}: no source {src_name}"
    if dst.exists() and not force:
        return f"HAVE {key}: {dst.name}"

    # upscale the reference so the model can actually see the pixel blocks
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        ref = pathlib.Path(tmp.name)
    Image.open(src).convert("RGBA").resize((REF_SIZE, REF_SIZE), Image.NEAREST).save(ref)

    RAW.mkdir(parents=True, exist_ok=True)
    raw = RAW / f"{key}v_raw.png"
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
            print(f"?    {k}: not a known building", flush=True)
            continue
        print(sideways(k, TARGETS[k], force), flush=True)
