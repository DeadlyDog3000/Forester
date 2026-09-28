#!/usr/bin/env python3
"""Record the cast of Forester: Reckoning with Gemini's speech models.

    node reckoning/tools/voice_lines.mjs > reckoning/voice/lines.json
    python3 reckoning/tools/voice_gen.py            # records what is missing
    python3 reckoning/tools/voice_gen.py --redo KEY  # records one line again

Each line is acted from a direction: who the character is, and how the scene
they are in feels. Lines already recorded are skipped, so a changed line only
costs its own recording. Real actors' takes can replace any file in voice/ —
keep the same name.
"""
import argparse
import base64
import json
import pathlib
import ssl
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

HERE = pathlib.Path(__file__).resolve().parent.parent          # reckoning/
ROOT = HERE.parent                                              # the repo, with .env
VOICE = HERE / "voice"
MODEL = "gemini-3.8-flash-tts"
ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{m}:generateContent"

# who they are, and which voice plays them. The model takes its direction as
# short tags in square brackets; anything longer, it reads out loud.
CAST = {
    "Father": ("Charon", "middle-aged merchant, warm, deep, dry humour"),
    "Brother": ("Puck", "fourteen-year-old boy, earnest"),
    "Sister": ("Leda", "fourteen-year-old girl, sharp, steady"),
    "Jakob": ("Algenib", "old dockworker, gravelly, gruff but fond"),
    "The magistrate": ("Alnilam", "official, cold, reading a formal order"),
    "Watchman": ("Fenrir", "rough city guard, blunt"),
    "Frau Albers": ("Sulafat", "chatty old woman, calling across the street"),
    "A dock hand": ("Umbriel", "dock labourer, startled then friendly"),
    "Narrator (brother)": ("Enceladus", "grown man remembering, low, intimate, unhurried"),
    "Narrator (sister)": ("Achernar", "grown woman remembering, low, intimate, unhurried"),
}

# how each chapter feels
MOOD = {
    0: "",
    1: "relaxed, easy",
    2: "frightened, hushed",
    3: "grieving, shaken",
    4: "whispering, breathless",
    5: "weary, subdued",
    6: "warm, hopeful",
}

def api_key():
    for line in (ROOT / ".env").read_text().splitlines():
        if line.startswith("GEMINI_API_KEY="):
            return line.split("=", 1)[1].strip()
    sys.exit("GEMINI_API_KEY not found in .env")


def ssl_ctx():
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context(cafile="/etc/ssl/cert.pem")


def direction(line):
    voice, who = CAST[line["speaker"]]
    text = line["text"]
    tags = [who]
    if text.startswith("(quietly)"):
        text = text[len("(quietly)"):].strip()
        tags.append("quietly, to themself")
    # the narrator tells it afterwards, so the scene's fear is further off
    mood = MOOD[line["chapter"]]
    if line["speaker"].startswith("Narrator"):
        mood = {"frightened, hushed": "sombre", "whispering, breathless": "tense", "grieving, shaken": "sorrowful"}.get(mood, mood)
    if mood:
        tags.append(mood)
    if line["kind"] == "bark":
        tags.append("in passing")
    tags.append("natural, not theatrical")
    return voice, f"[{', '.join(tags)}] {text}"


def record(line, key, ctx):
    voice, prompt = direction(line)
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": voice}}},
        },
    }
    req = urllib.request.Request(
        ENDPOINT.format(m=MODEL), data=json.dumps(payload).encode(),
        headers={"x-goog-api-key": key, "Content-Type": "application/json"})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=180, context=ctx) as r:
                body = json.load(r)
            break
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 503) and attempt < 4:
                time.sleep(8 * (attempt + 1)); continue
            raise
    part = body["candidates"][0]["content"]["parts"][0]["inlineData"]
    audio = base64.b64decode(part["data"])
    mime = part.get("mimeType", "")
    if "wav" in mime:
        fmt = []
    else:       # raw PCM, its rate in the mime type
        rate = next((int(b.split("=")[1]) for b in mime.split(";") if b.strip().startswith("rate=")), 24000)
        fmt = ["-f", "s16le", "-ar", str(rate), "-ac", "1"]
    out = VOICE / f"{line['key']}.mp3"
    with tempfile.NamedTemporaryFile(suffix=".wav" if not fmt else ".pcm") as f:
        f.write(audio); f.flush()
        # trim the dead air either end, level it, and keep it small
        subprocess.run([
            "ffmpeg", "-y", "-loglevel", "error", *fmt, "-i", f.name,
            "-af", "silenceremove=start_periods=1:start_threshold=-50dB,areverse,"
                   "silenceremove=start_periods=1:start_threshold=-50dB,areverse,"
                   "loudnorm=I=-18:TP=-2,apad=pad_dur=0.15",
            "-ac", "1", "-b:a", "64k", str(out)], check=True)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--redo", nargs="*", default=[])
    ap.add_argument("--limit", type=int, default=0)
    a = ap.parse_args()
    lines = json.loads((VOICE / "lines.json").read_text())
    key, ctx = api_key(), ssl_ctx()
    todo = [l for l in lines if l["key"] in a.redo or not (VOICE / f"{l['key']}.mp3").exists()]
    if a.limit:
        todo = todo[:a.limit]
    for i, l in enumerate(todo, 1):
        try:
            record(l, key, ctx)
            print(f"[{i}/{len(todo)}] {l['speaker']}: {l['text'][:60]}")
        except Exception as e:
            print(f"[{i}/{len(todo)}] FAILED {l['key']} {l['speaker']}: {e}", file=sys.stderr)
    # the game only asks for recordings that exist
    have = sorted(p.stem for p in VOICE.glob("*.mp3"))
    (VOICE / "index.json").write_text(json.dumps(have))
    print(f"{len(have)} recordings")


if __name__ == "__main__":
    main()
