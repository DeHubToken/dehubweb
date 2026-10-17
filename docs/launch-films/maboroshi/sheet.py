import sys, glob
from PIL import Image
out, cols, fs = sys.argv[1], int(sys.argv[2]), sys.argv[3:]
ims = [Image.open(f) for f in fs]
w, h = ims[0].size; s = 480 / max(w, h); tw, th = int(w * s), int(h * s)
S = Image.new('RGB', (tw * cols, th * ((len(ims) + cols - 1) // cols)))
for i, im in enumerate(ims): S.paste(im.resize((tw, th)), ((i % cols) * tw, (i // cols) * th))
S.save(out, quality=88)
