"""Live clip job checks; the end-to-end grab and render run only where ffmpeg is installed."""
import os
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import live_clips

MASTER = """#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360
360p/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=4000000,RESOLUTION=1920x1080
1080p/index.m3u8
"""

MEDIA = """#EXTM3U
#EXT-X-TARGETDURATION:2
#EXT-X-MEDIA-SEQUENCE:100
#EXT-X-MAP:URI="init.mp4"
#EXTINF:2.000,
seg100.m4s
#EXTINF:2.000,
seg101.m4s
#EXTINF:2.000,
https://other.cdn/seg102.m4s
"""


class Response:
    def __init__(self, body: bytes, status: int = 200):
        self.body, self.status_code, self.ok = body, status, status < 400
        self.text = body.decode(errors="ignore")

    def raise_for_status(self):
        if not self.ok:
            raise live_clips.requests.HTTPError(str(self.status_code))

    def iter_content(self, _n):
        yield self.body

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class PlaylistTests(unittest.TestCase):
    def test_master_picks_highest_bandwidth(self):
        self.assertEqual(live_clips.parse_master(MASTER, "https://cdn/hls/x/index.m3u8"), "https://cdn/hls/x/1080p/index.m3u8")

    def test_media_playlist_is_not_a_master(self):
        self.assertIsNone(live_clips.parse_master(MEDIA, "https://cdn/x.m3u8"))

    def test_media_resolves_init_and_segments(self):
        init, segs = live_clips.parse_media(MEDIA, "https://cdn/hls/x/1080p/index.m3u8")
        self.assertEqual(init, "https://cdn/hls/x/1080p/init.mp4")
        self.assertEqual([s[1] for s in segs][-1], "https://other.cdn/seg102.m4s")
        self.assertEqual(sum(s[0] for s in segs), 6.0)

    def test_tail_takes_newest_segments_covering_the_window(self):
        segs = [(2.0, f"s{i}") for i in range(10)]
        self.assertEqual([s[1] for s in live_clips.tail(segs, 5)], ["s7", "s8", "s9"])
        self.assertEqual(len(live_clips.tail(segs, 100)), 10)


class JobTests(unittest.TestCase):
    base = {"clipId": "c", "jobId": "j", "callbackUrl": "https://cb"}

    def test_valid_grab_and_render(self):
        self.assertTrue(live_clips.valid({**self.base, "kind": "grab", "hlsUrl": "https://h", "uploadUrl": "https://u", "path": "p"}))
        uploads = {k: {"url": "https://u", "path": k} for k in ("video", "poster", "card")}
        self.assertTrue(live_clips.valid({**self.base, "kind": "render", "sourceUrl": "https://s", "ass": "x", "uploads": uploads}))
        self.assertFalse(live_clips.valid({**self.base, "kind": "render", "sourceUrl": "https://s", "ass": "x", "uploads": {"video": uploads["video"]}}))
        self.assertFalse(live_clips.valid({**self.base, "kind": "other"}))

    def test_insecure_source_fails_and_reports(self):
        job = {**self.base, "kind": "grab", "hlsUrl": "http://insecure", "uploadUrl": "https://u", "path": "p", "secret": "s"}
        with patch.object(live_clips, "report") as report:
            result = live_clips.handler(job)
        self.assertFalse(result["ok"])
        self.assertEqual(report.call_args.args[1]["ok"], False)

    def test_render_refuses_out_of_range_windows(self):
        job = {**self.base, "kind": "render", "sourceUrl": "https://s", "ass": "x", "start": 0, "end": 120,
               "uploads": {k: {"url": "https://u", "path": k} for k in ("video", "poster", "card")}}
        with patch.object(live_clips, "report"):
            self.assertIn("out of range", live_clips.handler(job)["error"])


@unittest.skipUnless(shutil.which("ffmpeg"), "ffmpeg not installed")
class EndToEndTests(unittest.TestCase):
    """A real HLS stream made with ffmpeg, served through a mocked requests.get."""

    def setUp(self):
        self.dir = tempfile.mkdtemp()
        subprocess.run([
            "ffmpeg", "-v", "error", "-f", "lavfi", "-i", "testsrc=size=640x360:rate=30", "-f", "lavfi", "-i", "sine=frequency=440",
            "-t", "12", "-c:v", "libx264", "-g", "60", "-c:a", "aac", "-f", "hls", "-hls_time", "2", "-hls_list_size", "0",
            os.path.join(self.dir, "index.m3u8"),
        ], check=True)
        self.puts = {}

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def get(self, url, **_kw):
        name = url.rsplit("/", 1)[-1]
        with open(os.path.join(self.dir, name), "rb") as f:
            return Response(f.read())

    def put(self, url, data=None, **_kw):
        self.puts[url] = data
        return Response(b"")

    def test_grab_then_render(self):
        with patch.object(live_clips.requests, "get", self.get), patch.object(live_clips.requests, "put", self.put), \
                tempfile.TemporaryDirectory() as tmp:
            grabbed = live_clips.grab({"hlsUrl": "https://cdn/live/index.m3u8", "maxSeconds": 8, "uploadUrl": "https://up/source", "path": "s.mp4"}, tmp)
            self.assertTrue(grabbed["ok"])
            self.assertGreaterEqual(grabbed["durationSeconds"], 7)
            source = os.path.join(tmp, "source.mp4")

            uploads = {k: {"url": f"https://up/{k}", "path": k} for k in ("video", "poster", "card")}
            ass = "[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
            # render() takes an https URL; point ffmpeg at the local file instead.
            real_render_cmd = live_clips.clips.render_cmd
            with patch.object(live_clips.clips, "render_cmd", lambda _s, *a: real_render_cmd(source, *a)), \
                    patch.object(live_clips, "card_cmd", lambda _s, at, out: CARD(source, at, out)), \
                    tempfile.TemporaryDirectory() as work:
                result = live_clips.render({"sourceUrl": "https://cdn/source.mp4", "start": 1, "end": 6, "ass": ass, "uploads": uploads}, work)
            self.assertTrue(result["ok"])
            self.assertEqual(set(self.puts), {"https://up/source", "https://up/video", "https://up/poster", "https://up/card"})
            self.assertTrue(self.puts["https://up/poster"][:2] == b"\xff\xd8")


CARD = live_clips.card_cmd

if __name__ == "__main__":
    unittest.main()
