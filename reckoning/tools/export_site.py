#!/usr/bin/env python3
# ===========================================================================
#  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
# ===========================================================================
"""Copy the game into the DeadlyDog Productions website.

The game in this repository borrows the first Forester's sound engine and a
few of its sprites through ../ paths. The website has no Forester beside it,
so this copies those files in next to the game and rewrites the paths.

    python3 reckoning/tools/export_site.py ../deadlydog-productions

writes ../deadlydog-productions/reckoning/, replacing whatever was there.
"""
import re, shutil, sys
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]          # reckoning/
REPO = HERE.parent                                  # the Forester repository
site = Path(sys.argv[1] if len(sys.argv) > 1 else "../deadlydog-productions").resolve()
out = site / "reckoning"
if not (site / "index.html").exists():
    sys.exit(f"{site} does not look like the website (no index.html)")

if out.exists():
    shutil.rmtree(out)
out.mkdir()
for d in ["js", "lib", "models"]:
    shutil.copytree(HERE / d, out / d)
shutil.copy(HERE / "style.css", out)
shutil.copy(HERE / "LICENSE", out)
shutil.copy(REPO / "sfx.js", out)
art = out / "art"; art.mkdir()
for f in ["assets/sprites/ui/cut4_clearing.png", "assets/sprites/characters/brother_walk_0.png", "assets/sprites/characters/sister_walk_0.png"]:
    shutil.copy(REPO / f, art)

html = (HERE / "index.html").read_text()
html = html.replace("../sfx.js", "sfx.js")
html = html.replace("../assets/sprites/characters/", "art/")
html = html.replace('href="../art/thumb_a.png"', 'href="../deadlydog.png"')
(out / "index.html").write_text(html)
css = (out / "style.css").read_text().replace("../assets/sprites/ui/cut4_clearing.png", "art/cut4_clearing.png")
(out / "style.css").write_text(css)

left = [p for p in out.rglob("*") if p.suffix in (".html", ".css") and re.search(r"\.\./(assets|art|sfx)", p.read_text())]
if left:
    sys.exit(f"paths still point outside the game: {left}")
print(f"wrote {out}")
