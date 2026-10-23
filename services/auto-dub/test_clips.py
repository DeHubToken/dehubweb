"""Stage clip job checks; the render itself runs only where ffmpeg is installed."""
import os
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import clips

ASS = """[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,DejaVu Sans,70,&H0042C5F5,&H00FFFFFF,&H00101010,&H80000000,-1,0,0,0,100,100,0,0,1,6,2,2,90,90,560,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:02.00,Caption,,0,0,0,,{\\k100}Hello {\\k100}there
"""


def clip(**over):
    return {"clipId": "c1", "jobId": "j1", "start": 0, "end": 12, "uploadUrl": "https://u", "path": "s/c1/j1.mp4", "ass": ASS, **over}


class ClipJobTests(unittest.TestCase):
    def test_valid_clips_drops_bad_windows_and_caps_count(self):
        job = {"clips": [clip(), clip(end=5), clip(start=-1), clip(uploadUrl=""), clip(start="x"), clip(), clip(), clip()]}
        self.assertEqual(len(clips.valid_clips(job)), 3)

    def test_audio_only_graph_draws_background_and_wave(self):
        g = clips.filter_graph(40, video=False, image=False)
        self.assertIn("color=c=", g)
        self.assertIn("showwaves", g)
        self.assertIn("ass=clip.ass", g)
        self.assertIn("tpad=stop_mode=clone:stop_duration=3.0", g)
        self.assertIn("apad=whole_dur=43.000", g)
        self.assertIn("enable='gte(t,40.000)'", g)

    def test_audio_with_image_uses_second_input(self):
        g = clips.filter_graph(30, video=False, image=True)
        self.assertIn("[1:v]split", g)
        cmd = clips.render_cmd("rec", 5, 30, False, "img", "out.mp4")
        self.assertEqual(cmd.count("-i"), 2)
        self.assertEqual(cmd[cmd.index("-t", cmd.index("-map")) + 1], "33.000")

    def test_video_graph_ignores_image(self):
        cmd = clips.render_cmd("rec", 5, 30, True, "img", "out.mp4")
        self.assertEqual(cmd.count("-i"), 1)
        self.assertIn("[0:v]split", cmd[cmd.index("-filter_complex") + 1])

    def test_unreachable_recording_fails_every_clip(self):
        job = {"recordingUrl": "http://insecure", "callbackUrl": "https://cb", "secret": "s", "clips": [clip(), clip(clipId="c2")]}
        with patch.object(clips, "report") as report:
            clips.process(job)
        self.assertEqual([c.args[1]["clipId"] for c in report.call_args_list], ["c1", "c2"])
        self.assertTrue(all(c.args[2]["ok"] is False for c in report.call_args_list))

    @unittest.skipUnless(shutil.which("ffmpeg"), "ffmpeg not installed")
    def test_renders_vertical_mp4_with_end_card(self):
        with tempfile.TemporaryDirectory() as tmp:
            rec = os.path.join(tmp, "rec.m4a")
            subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "sine=f=220:d=15", "-c:a", "aac", rec], check=True)
            out = os.path.join(tmp, "out.mp4")
            with open(os.path.join(tmp, "clip.ass"), "w") as f:
                f.write(ASS)
            clips.sh(*clips.render_cmd(rec, 1, 12, clips.has_video(rec), None, out), cwd=tmp)
            probe = clips.sh("ffprobe", "-v", "error", "-show_entries", "stream=width,height:format=duration", "-of", "default=nw=1", out)
            self.assertIn("width=1080", probe)
            self.assertIn("height=1920", probe)
            duration = float(probe.split("duration=")[1].split()[0])
            self.assertAlmostEqual(duration, 15.0, delta=0.2)


if __name__ == "__main__":
    unittest.main()
