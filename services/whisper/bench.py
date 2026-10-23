"""
Benchmark the worker's own code path against the transcripts already stored.

  python bench.py run --model small --out small.json --posts 6326,6104 --stage <uuid>
  python bench.py combine small.json medium.json turbo.json > report.md

`run` transcribes each post through engine.transcribe exactly as a job would
and records wall time, real-time factor and detected language. `combine`
scores every run against the stored transcript (Deepgram or Scribe) and, when
a large-v3-turbo run is present, against that too — with no human reference
to hand, agreement with two independent engines is the honest measure.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tempfile
import time
import unicodedata

import requests

SUPABASE_URL = "https://aigxuutjaqsywioxjefr.supabase.co"
CDN = "https://dehubcdn.ams3.cdn.digitaloceanspaces.com/"
CHAR_LANGS = {"ja", "zh", "th", "ko"}


def publishable_key() -> str:
    key = os.environ.get("SUPABASE_PUBLISHABLE_KEY")
    if key:
        return key
    here = os.path.dirname(os.path.abspath(__file__))
    with open(os.path.join(here, "..", "..", "src", "integrations", "supabase", "client.ts")) as f:
        m = re.search(r'"(eyJ[^"]+)"', f.read())
    if not m:
        raise SystemExit("no publishable key")
    return m.group(1)


def stored(kind: str, refs: list[str]) -> dict[str, dict]:
    key = publishable_key()
    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/transcripts",
        params={
            "select": "source_kind,source_ref,provider,source_lang,full_text,segments,duration_seconds",
            "source_kind": f"eq.{kind}",
            "source_ref": f"in.({','.join(refs)})",
        },
        headers={"apikey": key, "Authorization": f"Bearer {key}"},
        timeout=30,
    )
    r.raise_for_status()
    return {row["source_ref"]: row for row in r.json()}


def stage_recording(ref: str) -> str:
    key = publishable_key()
    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/audio_spaces",
        params={"select": "recording_url", "id": f"eq.{ref}"},
        headers={"apikey": key, "Authorization": f"Bearer {key}"},
        timeout=30,
    )
    r.raise_for_status()
    return r.json()[0]["recording_url"]


def run(args) -> None:
    import engine
    from handler import download

    posts = [p for p in (args.posts or "").split(",") if p]
    stages = [s for s in (args.stage or "").split(",") if s]
    refs = {**{("video", p): None for p in posts}, **{("stage", s): None for s in stages}}
    references = {**stored("video", posts), **(stored("stage", stages) if stages else {})}

    t_load = time.time()
    engine.whisper()
    load_s = round(time.time() - t_load, 1)

    rows = []
    for kind, ref in refs:
        url = stage_recording(ref) if kind == "stage" else f"{CDN}videos/{ref}.mp4"
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "media")
            download(url, path)
            audio = engine.load_audio(path)
        diarize = kind == "stage" and args.diarize
        t0 = time.time()
        words, meta = engine.recognize(audio, vad=not args.no_vad)
        t_asr = time.time() - t0
        t_diar = 0.0
        speakers = None
        if diarize and words:
            t1 = time.time()
            turns = engine.diarize(audio)
            t_diar = time.time() - t1
            engine.assign_speakers(words, turns)
            speakers = len({t[2] for t in turns})
        segments = engine.build_segments(words)
        audio_s = len(audio) / engine.SR
        ref_row = references.get(ref) or {}
        row = {
            "kind": kind,
            "ref": ref,
            "config": args.label or args.model,
            "audio_s": round(audio_s, 1),
            "asr_s": round(t_asr, 1),
            "diarize_s": round(t_diar, 1),
            "rtf": round((t_asr + t_diar) / audio_s, 3) if audio_s else None,
            "language": meta["language"],
            "language_probability": meta["languageProbability"],
            "text": " ".join(s["text"] for s in segments),
            "segments": [{k: v for k, v in s.items() if k != "words"} for s in segments],
            "speakers": speakers,
            "reference_provider": ref_row.get("provider"),
            "reference_lang": ref_row.get("source_lang"),
            "reference_text": ref_row.get("full_text") or "",
            "reference_segments": ref_row.get("segments") or [],
        }
        print(json.dumps({k: row[k] for k in ("ref", "config", "audio_s", "asr_s", "diarize_s", "rtf", "language", "reference_lang", "speakers")}), flush=True)
        rows.append(row)

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump({"config": args.label or args.model, "model": args.model, "load_s": load_s, "cpus": os.cpu_count(), "rows": rows}, f, ensure_ascii=False)


# ───────────────────────────── scoring ───────────────────────────────────


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFKC", text or "").casefold()
    text = "".join(" " if unicodedata.category(c).startswith(("P", "S")) else c for c in text)
    return " ".join(text.split())


def tokens(text: str, lang: str | None) -> list[str]:
    norm = normalize(text)
    if (lang or "").split("-")[0] in CHAR_LANGS:
        return [c for c in norm if not c.isspace()]
    return norm.split()


def edit_rate(hyp: list[str], ref: list[str]) -> float | None:
    if not ref:
        return None
    prev = list(range(len(hyp) + 1))
    for i, r in enumerate(ref, 1):
        cur = [i] + [0] * len(hyp)
        for j, h in enumerate(hyp, 1):
            cur[j] = min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (r != h))
        prev = cur
    return round(prev[-1] / len(ref), 3)


def speaker_agreement(segments: list[dict], reference: list[dict]) -> float | None:
    """Share of reference speech time whose speaker maps to the same whisper
    speaker, after mapping each whisper label to the reference label it
    overlaps most."""
    if not segments or not reference:
        return None
    step = 0.25
    end = max(float(s.get("end", 0)) for s in reference)

    def at(segs, t):
        for s in segs:
            if float(s["start"]) <= t < float(s["end"]):
                return s.get("speaker")
        return None

    pairs = []
    t = 0.0
    while t < end:
        r = at(reference, t)
        if r is not None:
            pairs.append((at(segments, t), r))
        t += step
    if not pairs:
        return None
    counts: dict = {}
    for h, r in pairs:
        counts.setdefault(h, {}).setdefault(r, 0)
        counts[h][r] += 1
    mapping = {h: max(rs, key=rs.get) for h, rs in counts.items()}
    return round(sum(1 for h, r in pairs if h is not None and mapping[h] == r) / len(pairs), 3)


def combine(paths: list[str]) -> None:
    runs = [json.load(open(p, encoding="utf-8")) for p in paths]
    referee = next((r for r in runs if "turbo" in r["config"]), None)
    referee_rows = {(x["kind"], x["ref"]): x for x in referee["rows"]} if referee else {}

    print("| config | cpus | load s | audio min | wall min | RTF (lower is faster) | x real time | lang agrees | median WER vs stored | median WER vs turbo | stored vs turbo |")
    print("|---|---|---|---|---|---|---|---|---|---|---|")
    detail = []
    for run_ in runs:
        rows = [x for x in run_["rows"] if x["kind"] == "video"]
        audio = sum(x["audio_s"] for x in rows)
        wall = sum(x["asr_s"] + x["diarize_s"] for x in rows)
        agree = sum(1 for x in rows if (x["reference_lang"] or "").split("-")[0] == (x["language"] or "").split("-")[0])
        w_stored, w_turbo, s_turbo = [], [], []
        for x in rows:
            lang = x["reference_lang"] or x["language"]
            ws = edit_rate(tokens(x["text"], lang), tokens(x["reference_text"], lang))
            ref = referee_rows.get((x["kind"], x["ref"]))
            wt = edit_rate(tokens(x["text"], lang), tokens(ref["text"], lang)) if ref and ref is not x else None
            st = edit_rate(tokens(x["reference_text"], lang), tokens(ref["text"], lang)) if ref else None
            if ws is not None:
                w_stored.append(ws)
            if wt is not None:
                w_turbo.append(wt)
            if st is not None:
                s_turbo.append(st)
            detail.append((x["ref"], x["reference_lang"], x["reference_provider"], run_["config"], x["language"], x["language_probability"], x["audio_s"], round(x["asr_s"] / x["audio_s"], 3) if x["audio_s"] else None, ws, wt, st))

        def med(v):
            v = sorted(v)
            return v[len(v) // 2] if v else None

        print(f"| {run_['config']} | {run_['cpus']} | {run_['load_s']} | {audio / 60:.1f} | {wall / 60:.1f} | {wall / audio:.3f} | {audio / wall:.1f} | {agree}/{len(rows)} | {med(w_stored)} | {med(w_turbo)} | {med(s_turbo)} |")

    print()
    print("| post | stored lang | stored by | config | whisper lang | p | audio s | RTF | WER vs stored | WER vs turbo | stored vs turbo |")
    print("|---|---|---|---|---|---|---|---|---|---|---|")
    for d in sorted(detail, key=lambda d: (d[0], d[3])):
        print("| " + " | ".join("" if v is None else str(v) for v in d) + " |")

    for run_ in runs:
        for x in run_["rows"]:
            if x["kind"] != "stage":
                continue
            lang = x["reference_lang"] or x["language"]
            ws = edit_rate(tokens(x["text"], lang), tokens(x["reference_text"], lang))
            agree = speaker_agreement(x["segments"], x["reference_segments"])
            ref_speakers = len({s.get("speaker") for s in x["reference_segments"]})
            print()
            print(f"Stage {x['ref']} ({run_['config']}): {x['audio_s'] / 60:.1f} min audio, ASR {x['asr_s']} s, diarization {x['diarize_s']} s, "
                  f"speakers {x['speakers']} (Scribe {ref_speakers}), speaker agreement with Scribe {agree}, WER vs Scribe {ws}")


def main() -> None:
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("run")
    r.add_argument("--model", required=True)
    r.add_argument("--label")
    r.add_argument("--out", required=True)
    r.add_argument("--posts")
    r.add_argument("--stage")
    r.add_argument("--diarize", action="store_true")
    r.add_argument("--no-vad", action="store_true")
    c = sub.add_parser("combine")
    c.add_argument("paths", nargs="+")
    args = p.parse_args()
    if args.cmd == "run":
        os.environ["WHISPER_MODEL"] = args.model
        run(args)
    else:
        combine(args.paths)


if __name__ == "__main__":
    sys.exit(main())
