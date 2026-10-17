# Splits the featured-looks atlas into its six tiles and cuts each character out (2x upscale for full-frame shots).
import sys, os
from PIL import Image
from rembg import remove, new_session
atlas, out = sys.argv[1], sys.argv[2]
A = Image.open(atlas).convert('RGB')
s = new_session('isnet-general-use')
for i, n in enumerate(['plushie', 'anime', 'chrome', 'crochet', 'crystal', 'clay']):
    c, r = i % 3, i // 3
    tile = A.crop((c * 512, r * 512, c * 512 + 512, r * 512 + 512))
    tile.save(os.path.join(out, n + '_tile.jpg'), quality=94)
    cut = remove(tile, session=s)
    a = cut.split()[3].point(lambda v: 0 if v < 10 else v)  # drop stray haze
    cut.putalpha(a)
    cut = cut.crop(a.getbbox())
    cut.resize((cut.width * 2, cut.height * 2), Image.LANCZOS).save(os.path.join(out, n + '.png'))
    print(n, cut.size)
