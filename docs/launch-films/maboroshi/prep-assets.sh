#!/bin/bash
# Builds ./a (fonts, logo, sparkle icons, motion-library clip frames) and icons.js.
# Everything comes from this repo (public/) and the clip URLs it lists, except the 幻 glyph (Noto Serif JP, OFL).
set -e
cd "$(dirname "$0")"
R=../../../public
mkdir -p a/icons
cp $R/brand-kit/font/*.ttf a/
cp $R/brand-kit/brand/grain.png a/
python3 -I -c "
from PIL import Image
a = Image.open('$R/brand-kit/brand/mark-white.png').convert('RGBA')
a.crop(a.split()[3].getbbox()).save('a/mark.png')"
for i in sparkle star sparkles-duo; do cp $R/brand-kit/icons/$i.png a/icons/; done
[ -f a/kanji.woff2 ] || curl -sSf -A 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36' \
  'https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@900&text=%E5%B9%BB' | grep -o 'https://[^)]*' | head -1 | xargs curl -sSf -o a/kanji.woff2
python3 prep-clips.py
node make-icons.mjs icons.js
echo "assets ready"
