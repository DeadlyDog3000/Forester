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
    for line in (ROOT / ".env").read_text().splitlines():
        if line.startswith("GEMINI_API_KEY="):
            return line.split("=", 1)[1].strip()
    sys.exit("GEMINI_API_KEY not found in .env")


def generate(prompt, out_path, ref=None, model=DEFAULT_MODEL):
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

    req = urllib.request.Request(
        ENDPOINT.format(model=model),
        data=json.dumps({"contents": [{"parts": parts}]}).encode(),
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


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("prompt_file")
    ap.add_argument("output")
    ap.add_argument("--ref")
    ap.add_argument("--model", default=DEFAULT_MODEL)
    args = ap.parse_args()

    prompt = pathlib.Path(args.prompt_file).read_text()
    print("wrote", generate(prompt, args.output, args.ref, args.model))
