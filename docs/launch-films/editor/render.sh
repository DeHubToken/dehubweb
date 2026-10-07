#!/bin/bash
# usage: render.sh W H TAG
set -e
cd "$(dirname "$0")"
W=$1; H=$2; TAG=$3; FR=frames_$TAG
rm -rf $FR; mkdir -p $FR
NF=$(python3 -c "import math;print(math.ceil((68*60/140+1.4)*60))")
node capture.cjs --w $W --h $H --stills 0 --events events.json --out tmpst > /dev/null 2>&1
node synth.mjs events.json music.wav
M=$(ffmpeg -hide_banner -i music.wav -af loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json -f null - 2>&1 | python3 -c "import sys,json;t=sys.stdin.read();j=json.loads(t[t.rindex('{'):]);print(f\"measured_I={j['input_i']}:measured_TP={j['input_tp']}:measured_LRA={j['input_lra']}:measured_thresh={j['input_thresh']}:offset={j['target_offset']}\")")
ffmpeg -v error -y -i music.wav -af loudnorm=I=-14:TP=-1.5:LRA=11:$M:linear=true,aresample=48000 -c:a pcm_s16le music_norm.wav
Q=$(( (NF + 3) / 4 ))
for k in 0 1 2 3; do
  node capture.cjs --w $W --h $H --from $((k*Q)) --to $(((k+1)*Q)) --out $FR > log_${TAG}_$k.txt 2>&1 &
done
wait
grep -h "done" log_${TAG}_*.txt
python3 -I post.py $FR $W $H $NF music_norm.wav dehub-editor-launch__$TAG.mp4
