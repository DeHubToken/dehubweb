#!/bin/bash
# Builds ./a (fonts, logo, backgrounds, alley footage frames, the six featured looks cut out) and icons.js.
# Everything comes from this repo (public/ and services/maboroshi/static) except the 幻 glyph (Noto Serif JP, OFL).
# Cutting the looks out needs `pip install rembg onnxruntime` once.
set -e
cd "$(dirname "$0")"
R=../../../public
mkdir -p a/icons a/bg a/osaka a/looks
cp $R/brand-kit/font/*.ttf a/
cp $R/brand-kit/brand/grain.png a/
python3 -I -c "
from PIL import Image
a = Image.open('$R/brand-kit/brand/mark-white.png').convert('RGBA')
a.crop(a.split()[3].getbbox()).save('a/mark.png')"
for i in sparkle star sparkles-duo; do cp $R/brand-kit/icons/$i.png a/icons/; done
for k in 12 13 20 30 40; do cp $R/brand-kit/bg/bg-$k.jpg a/bg/; done
ffmpeg -v error -y -i $R/osaka/osaka-loop.mp4 -q:v 2 a/osaka/%03d.jpg
[ -f a/kanji.woff2 ] || curl -sSf -A 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36' \
  'https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@900&text=%E5%B9%BB' | grep -o 'https://[^)]*' | head -1 | xargs curl -sSf -o a/kanji.woff2
python3 cut-looks.py ../../../services/maboroshi/static/looks-atlas.png a/looks
node make-icons.mjs icons.js
echo "assets ready"
