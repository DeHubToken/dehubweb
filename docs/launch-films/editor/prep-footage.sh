#!/bin/bash
# usage: prep-footage.sh clip1.mp4 [clip2.mp4 ...]  -> a/foot/cN frames (540x960, 24 fps, max 6 s each) + a/foot/manifest.js
set -e
cd "$(dirname "$0")"
rm -rf a/foot; mkdir -p a/foot
i=0; M="window.FOOT_CLIPS = ["
for f in "$@"; do
  i=$((i+1)); d=a/foot/c$i; mkdir -p $d
  ffmpeg -v error -y -i "$f" -t 6 -vf "scale=540:960:force_original_aspect_ratio=increase,crop=540:960,fps=24" -q:v 3 -start_number 0 $d/%03d.jpg
  n=$(ls $d | wc -l); M="$M{ dir: '$d', n: $n, fps: 24, start: 0 },"; echo "$f -> $d ($n frames)"
done
echo "$M];" > a/foot/manifest.js; cat a/foot/manifest.js
