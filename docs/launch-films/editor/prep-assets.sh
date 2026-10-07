#!/bin/bash
# Builds ./a (fonts, logo, icons, backgrounds, demo footage frames, animated emoji) and icons.js.
# Everything comes from the repo's public/ folder except the animated emoji (Noto Emoji Animation, CC BY 4.0).
set -e
cd "$(dirname "$0")"
R=../../../public
mkdir -p a/osaka a/emoji a/icons a/bg
cp $R/brand-kit/font/*.ttf a/
cp $R/brand-kit/brand/grain.png $R/brand-kit/brand/wordmark-white.png a/
python3 -I -c "
from PIL import Image
a = Image.open('$R/brand-kit/brand/mark-white.png').convert('RGBA')
a.crop(a.split()[3].getbbox()).save('a/mark.png')"
for i in clock mic sparkle sparkles-duo play camera megaphone rocket star thumbs-up coin gamepad globe gift folder-star chain shield coins-falling; do cp $R/brand-kit/icons/$i.png a/icons/; done
for k in 01 12 13 20 25 30 40; do cp $R/brand-kit/bg/bg-$k.jpg a/bg/; done
ffmpeg -v error -y -i $R/osaka/osaka-loop.mp4 -vf scale=1280:-2 -q:v 3 a/osaka/%03d.jpg
mkdir -p .dl
for c in 1f480 1f62d 1f525 1f4af 1f602 1f633 1f92f 2764_fe0f; do
  [ -f .dl/$c.webp ] || curl -sSf -o .dl/$c.webp https://fonts.gstatic.com/s/e/notoemoji/latest/$c/512.webp
done
python3 -I -c "
from PIL import Image, ImageSequence
names = {'1f480':'skull','1f62d':'cry','1f525':'fire','1f4af':'hundred','1f602':'joy','1f633':'flushed','1f92f':'blown','2764_fe0f':'heart'}
for c, n in names.items():
    for i, fr in enumerate(ImageSequence.Iterator(Image.open('.dl/' + c + '.webp'))):
        fr.convert('RGBA').resize((256, 256), Image.LANCZOS).save('a/emoji/%s_%03d.png' % (n, i))"
node make-icons.mjs icons.js
echo "assets ready"
