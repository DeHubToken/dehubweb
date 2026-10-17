# Post pass: blend motion-blur subframes, then glitch tears, RGB split, grain and vignette. Streams to ffmpeg.
# usage: python3 -I post.py FRAMES_DIR W H NFRAMES AUDIO.wav OUT.mp4
import sys, json, os, subprocess
import numpy as np
from PIL import Image

fd, W, H, NF, AUD, OUT = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4]), sys.argv[5], sys.argv[6]
ff = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', '60', '-i', '-',
                       '-i', AUD, '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-maxrate', '12M', '-bufsize', '24M', '-pix_fmt', 'yuv420p',
                       '-profile:v', 'high', '-tune', 'film', '-x264-params', 'keyint=60:min-keyint=30', '-c:a', 'aac', '-b:a', '320k', '-ar', '48000',
                       '-movflags', '+faststart', '-shortest', OUT], stdin=subprocess.PIPE)
rng0 = np.random.default_rng(1)
GR = [rng0.normal(0, 1, (H, W)).astype(np.float32) for _ in range(6)]
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
d = np.sqrt(((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2) / np.sqrt(2)
VIG = (1 - 0.22 * np.clip(d - 0.35, 0, 1) ** 1.6 / (0.65 ** 1.6))[..., None].astype(np.float32)

def shift(a, dx):
    if dx == 0: return a
    o = np.empty_like(a)
    if dx > 0: o[:, dx:] = a[:, :-dx]; o[:, :dx] = a[:, :1]
    else: o[:, :dx] = a[:, -dx:]; o[:, dx:] = a[:, -1:]
    return o

for f in range(NF):
    fx = json.load(open(os.path.join(fd, f'f{f:05d}.json')))
    n = fx['mb']
    acc = None
    for j in range(n):
        im = np.asarray(Image.open(os.path.join(fd, f'f{f:05d}_{j}.jpg')).convert('RGB'), dtype=np.float32)
        acc = im if acc is None else acc + im
    img = acc / n
    tear = fx['tear']
    if tear > 0.03:
        r = np.random.default_rng(int(fx['tearSeed']))
        for _ in range(int(3 + tear * 9)):
            h = int(r.integers(6, 18 + int(110 * tear)))
            y = int(r.integers(0, H - h))
            dx = int(r.uniform(-1, 1) * 160 * tear * W / 1920)
            band = shift(img[y:y + h], dx)
            if r.random() < .5:  # split the band's channels harder
                k = int(10 * tear) + 2
                band = np.stack([shift(band[..., 0:1], k)[..., 0], band[..., 1], shift(band[..., 2:3], -k)[..., 0]], -1)
            if r.random() < .25: band = band * 1.35 + 18
            img[y:y + h] = band
    px = int(round(fx['rgb'] * W / 1920))
    if px > 0:
        img = np.stack([shift(img[..., 0], px), img[..., 1], shift(img[..., 2], -px)], -1)
    img = img * VIG + (GR[f % 6] * 2.6)[..., None]
    ff.stdin.write(np.clip(img, 0, 255).astype(np.uint8).tobytes())
    if f % 120 == 0: print('post', f, NF, flush=True)
ff.stdin.close(); ff.wait()
print('encoded ->', OUT)
