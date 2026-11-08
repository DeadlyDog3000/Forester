"""The shouted orders of a battle, made with Gemini's speech (tools/gen_art.py --voice, the key never printed): each
order in four men's voices, hoarse and at the top of their lungs, as an officer or a sergeant gave it over the guns in
1683. Each is trimmed of silence, levelled, and written as art/voice/order_<key>_NN.ogg, with art/voice/orders.json
saying how many of each there are (the game plays them: js/audio.js, AUDIO.order).

    python3 reckoning/tools/gen_orders.py            (all of them; ones already made are kept)
    python3 reckoning/tools/gen_orders.py --redo     (all made again)
"""
import json, pathlib, subprocess, sys, tempfile

HERE = pathlib.Path(__file__).resolve().parent
GAME = HERE.parent
REPO = GAME.parent
OUT = GAME / "art" / "voice"
ORDERS = {
    "ready": "Make ready!", "present": "Present!", "volley": "Fire!",
    "fire": "Fire at will!", "holdfire": "Hold your fire!",
    "charge": "Charge!", "advance": "Forward!", "hold": "Halt!", "fallback": "Fall back!",
    "follow": "On me! Fall in!", "cover": "Get down!", "target": "Bring him down!", "guns": "Gunners, fire!",
    "line": "Form line!", "column": "Form column!", "square": "Form square!", "loose": "Spread out!",
}
VOICES = ["Fenrir", "Orus", "Algenib", "Alnilam"]
MODEL = "gemini-2.5-flash-preview-tts"
STYLE = ("Shout this as a battle-hardened infantry officer of 1683 bellowing a word of command to his company across a "
         "smoky battlefield, over the noise of muskets and drums: as loud as a man can, hoarse and raw, the voice cracking "
         "with the strain, almost a scream, urgent and fierce. Only the words of command, nothing before or after them: ")


def main():
    redo = "--redo" in sys.argv
    counts = {}
    for key, words in ORDERS.items():
        n = 0
        for i, voice in enumerate(VOICES):
            dest = OUT / f"order_{key}_{i:02d}.ogg"
            if dest.exists() and not redo:
                n += 1; continue
            with tempfile.TemporaryDirectory() as td:
                raw = pathlib.Path(td) / "raw.wav"
                r = subprocess.run([sys.executable, str(REPO / "tools" / "gen_art.py"), str(raw), "--voice", voice, "--model", MODEL, "--say", STYLE + words], capture_output=True, text=True)
                if r.returncode or not raw.exists():
                    print(f"{key} {voice}: failed — {(r.stderr or r.stdout).strip().splitlines()[-1:]}"); continue
                # (trimmed of the silence before and after, the rumble taken off, levelled, and a touch of grit — a
                #  voice pushed to its limit — then Opus, as the cries are)
                subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(raw), "-af",
                                "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.03,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.08,areverse,"
                                "highpass=f=110,acompressor=threshold=-18dB:ratio=4:attack=5:release=80,loudnorm=I=-14:TP=-1.5:LRA=7",
                                "-ar", "48000", "-ac", "1", "-c:a", "libopus", "-b:a", "64k", str(dest)], check=True)
            n += 1; print("made", dest.name)
        counts[key] = n
    # (the list the game reads: only orders with every one of their voices made in a row from 00)
    have = {k: sum(1 for i in range(len(VOICES)) if (OUT / f"order_{k}_{i:02d}.ogg").exists()) for k in ORDERS}
    (OUT / "orders.json").write_text(json.dumps({k: v for k, v in have.items() if v}, indent=1))
    print("orders.json:", have)


if __name__ == "__main__":
    main()
