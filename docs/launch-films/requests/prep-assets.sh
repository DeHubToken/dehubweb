#!/bin/bash
# Builds ./a (fonts, logo, lightbulb, 3D icons, backgrounds, animated emoji) from the repo's public/ and src/assets.
# Animated emoji: Noto Emoji Animation (CC BY 4.0), the set the app uses for reactions.
set -e
cd "$(dirname "$0")"
R=../../../public
mkdir -p a/emoji a/icons a/bg
cp $R/brand-kit/font/*.ttf a/
python3 -I -c "
from PIL import Image
a = Image.open('$R/brand-kit/brand/mark-white.png').convert('RGBA')
a.crop(a.split()[3].getbbox()).save('a/mark.png')
Image.open('../../../src/assets/features-lightbulb.png').convert('RGBA').resize((240,240), Image.LANCZOS).save('a/bulb.png')"
for i in sparkle star sparkles-duo rocket thumbs-up megaphone; do cp $R/brand-kit/icons/$i.png a/icons/; done
for k in 01 12 13 20 25 30 40; do cp $R/brand-kit/bg/bg-$k.jpg a/bg/; done
mkdir -p .dl
for c in 1f44d 1f525 2764_fe0f 1f680 1f389 1f92f 1f4af; do
  [ -f .dl/$c.webp ] || curl -sSf -o .dl/$c.webp https://fonts.gstatic.com/s/e/notoemoji/latest/$c/512.webp
done
python3 -I -c "
from PIL import Image, ImageSequence
names = {'1f44d':'thumb','1f525':'fire','2764_fe0f':'heart','1f680':'rocket','1f389':'party','1f92f':'blown','1f4af':'hundred'}
for c, n in names.items():
    k = 0
    for i, fr in enumerate(ImageSequence.Iterator(Image.open('.dl/' + c + '.webp'))):
        fr.convert('RGBA').resize((192, 192), Image.LANCZOS).save('a/emoji/%s_%03d.png' % (n, i)); k += 1
    print(n, k, Image.open('.dl/' + c + '.webp').info.get('duration'))"
echo "assets ready"
