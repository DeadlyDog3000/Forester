# Forester

**A pixel-art colony-survival game about a family rebuilding after losing everything.**
By DeadlyDog Productions. Free to play in a browser, no account, no install:

### ▶ [Play it](https://deadlydog3000.github.io/Forester/)

Hamburg, 1683. Your father is executed for "malicious affairs", your name is
taken with him, and you and your sister run through the marsh gate before they
can take you too. Deep in the woods you find a clearing, and in it a burned
cabin. Everything after that is yours.

---

## What the game is

A colony sim that cares more about people than about production lines. Everyone
in it has a temperament, a creed, a trade they are getting better at, opinions
about the others, and a memory. They fall out. They grieve. They freeze if you
have not built a roof.

Around your clearing is the whole of Europe on the same map — zoom out far
enough and the ground gives way to the continent, with its crowns going to war,
seizing each other's land, and eventually noticing you. You can chart it, trade
with it, put agents in its cities and march on them.

- **The colony** — fell, build, farm, bake, forge, mine, smelt, wall the town
- **The people** — recruit wanderers at the gate by talking them round, appoint
  mayors to run daughter towns, keep them fed, housed, paid and at peace
- **Faith and law** — proclaim a creed or don't, set taxes, write edicts, and
  live with what that does to the people who disagree
- **The world** — a live Europe of a hundred-odd cities, trade pacts you have to
  negotiate and then keep, scouts, spies, war parties and sieges
- **The end** — a reckoning you can call whenever the ambitions are in hand

Six save slots, and a colony can be written out to a file you keep.

## Running it yourself

There is no build step and there are no dependencies. It is HTML, CSS and
JavaScript, served as files.

```
python3 -m http.server 8181
```

Then open `http://localhost:8181`. That is the whole of it.

It does have to be *served*, not opened as a `file://` — the game recolours
sprites at load (this is how a regiment gets its coat colour) by reading pixels
back out of a canvas, and a canvas that has had a `file://` image drawn into it
refuses to be read. Any static server will do.

## How it is put together

| | |
|---|---|
| `index.html` | every panel and screen in the game |
| `game.js` | the whole game — world, simulation, render, UI, saves |
| `sfx.js` | sound and music, synthesised at runtime; no audio files |
| `forester-ui.css` | one stylesheet, with its design tokens at the top |
| `assets/sprites/` | the finished sprites the game loads |
| `art/prompts/` | the prompt each piece of art was generated from |
| `tools/` | the art pipeline, and a few dev helpers |

A few things worth knowing before changing it:

- **The world is generated, not stored.** Terrain comes out of a seeded chunk
  generator; saves keep only the *differences* — which trees you felled, what
  you built. That is why a save is 60KB and not 6MB.
- **Sound is synthesised.** There is not one audio file in the repository.
  Every axe, bell, musket and bar of music is Web Audio, built at runtime.
- **Art is generated through `tools/`.** `gen_art.py` sends a prompt from
  `art/prompts/` to Gemini; `pixelate.py` crushes the result down to a true
  low-resolution sprite with a locked palette. `winterize.py`, `burnify.py` and
  `sideon.py` redraw an existing sprite under snow, on fire, or seen end-on.
  `icons.py` draws the UI icons as pixel grids and emits them as SVG.
  These need a `GEMINI_API_KEY` in a `.env` at the repo root, which is not in
  the repository and should not be.
- **Saves live in `localStorage`,** which browsers delete. The game can write a
  colony out to a file and read it back; that is the only copy a browser cannot
  throw away.

## Status

**v0.9 — beta.** Feature-complete and stable; what it wants now is other people
playing it. The in-game update log (WHAT HAS CHANGED, on the front door) is the
running history and is kept beside the code that it describes.

Faults and thoughts: open an issue on this repository.

## Licence

All rights reserved — free to play, free to read, not free to republish or
sell. See [LICENSE](LICENSE); permission is not hard to get, just ask.
