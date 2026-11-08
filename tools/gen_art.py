#!/usr/bin/env python3
"""Generate Forester game art with Nano Banana (Gemini image models).

Usage:
    python3 tools/gen_art.py <prompt-file> <output.png> [--ref image.png] [--model NAME]

Reads GEMINI_API_KEY from .env at the repo root.
"""
import argparse
import base64
import json
import mimetypes
import pathlib
import ssl
import sys
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
DEFAULT_MODEL = "gemini-3.1-flash-image"
ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"


def api_key():
    # (the .env at the repo root; in a worktree without one, the main checkout's)
    env = ROOT / ".env"
    if not env.exists():
        env = pathlib.Path.home() / "Forester" / ".env"
    for line in env.read_text().splitlines():
        if line.startswith("GEMINI_API_KEY="):
            return line.split("=", 1)[1].strip()
    sys.exit("GEMINI_API_KEY not found in .env")


def generate(prompt, out_path, ref=None, model=DEFAULT_MODEL, aspect="1:1"):
    parts = [{"text": prompt}]
    if ref:
        ref_path = pathlib.Path(ref)
        mime = mimetypes.guess_type(ref_path.name)[0] or "image/png"
        parts.insert(0, {
            "inline_data": {
                "mime_type": mime,
                "data": base64.b64encode(ref_path.read_bytes()).decode(),
            }
        })

    payload = {
        "contents": [{"parts": parts}],
        "generationConfig": {"imageConfig": {"aspectRatio": aspect}},
    }
    req = urllib.request.Request(
        ENDPOINT.format(model=model),
        data=json.dumps(payload).encode(),
        headers={"x-goog-api-key": api_key(), "Content-Type": "application/json"},
    )

    # python.org builds ship without a CA bundle; fall back to the system one.
    try:
        import certifi
        ctx = ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        ctx = ssl.create_default_context(cafile="/etc/ssl/cert.pem")

    with urllib.request.urlopen(req, timeout=180, context=ctx) as resp:
        body = json.load(resp)

    for part in body["candidates"][0]["content"]["parts"]:
        blob = part.get("inlineData") or part.get("inline_data")
        if blob:
            out = pathlib.Path(out_path)
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_bytes(base64.b64decode(blob["data"]))
            return out
        if part.get("text"):
            print("model said:", part["text"][:500], file=sys.stderr)
    sys.exit("No image returned")


def _ctx():
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context(cafile="/etc/ssl/cert.pem")


def tts_models():
    """the Gemini models that speak (for --voice)"""
    req = urllib.request.Request("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", headers={"x-goog-api-key": api_key()})
    with urllib.request.urlopen(req, timeout=60, context=_ctx()) as resp:
        return [m["name"].split("/")[-1] for m in json.load(resp).get("models", []) if "tts" in m["name"]]


def speak(text, out_path, voice="Fenrir", model="gemini-2.5-flash-preview-tts"):
    """a voice saying (or shouting) text, as the prompt asks, to a 24 kHz mono WAV"""
    import wave
    payload = {"contents": [{"parts": [{"text": text}]}],
               "generationConfig": {"responseModalities": ["AUDIO"],
                                    "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": voice}}}}}
    req = urllib.request.Request(ENDPOINT.format(model=model), data=json.dumps(payload).encode(),
                                 headers={"x-goog-api-key": api_key(), "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=180, context=_ctx()) as resp:
        body = json.load(resp)
    for part in body["candidates"][0]["content"]["parts"]:
        blob = part.get("inlineData") or part.get("inline_data")
        if blob:
            pcm = base64.b64decode(blob["data"])
            rate = 24000
            for bit in (blob.get("mimeType") or blob.get("mime_type") or "").split(";"):
                if bit.strip().startswith("rate="): rate = int(bit.split("=")[1])
            out = pathlib.Path(out_path); out.parent.mkdir(parents=True, exist_ok=True)
            with wave.open(str(out), "wb") as w:
                w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate); w.writeframes(pcm)
            return out
    sys.exit("No audio returned")


if __name__ == "__main__":
    # (a voice instead of a picture: --voice NAME --say "the prompt, with the words to speak" out.wav)
    if "--list-voices" in sys.argv:
        print(tts_models()); sys.exit()
    if "--voice" in sys.argv:
        vp = argparse.ArgumentParser()
        vp.add_argument("output"); vp.add_argument("--voice"); vp.add_argument("--say", required=True)
        vp.add_argument("--model", default="gemini-2.5-flash-preview-tts")
        va = vp.parse_args()
        print("wrote", speak(va.say, va.output, va.voice, va.model)); sys.exit()
    ap = argparse.ArgumentParser()
    ap.add_argument("prompt_file")
    ap.add_argument("output")
    ap.add_argument("--ref")
    ap.add_argument("--model", default=DEFAULT_MODEL)
    ap.add_argument("--aspect", default="1:1")
    args = ap.parse_args()

    prompt = pathlib.Path(args.prompt_file).read_text()
    print("wrote", generate(prompt, args.output, args.ref, args.model, args.aspect))
