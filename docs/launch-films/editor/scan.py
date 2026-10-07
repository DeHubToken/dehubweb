# Frame-to-frame change scan: lists the biggest jumps with their beat, so stray one-frame flashes stand out.
import sys, subprocess, numpy as np
f = sys.argv[1]
w, h = (108, 192) if len(sys.argv) > 2 and sys.argv[2] == 'v' else (192, 108)  # pass 'v' for vertical
p = subprocess.run(['ffmpeg', '-v', 'error', '-i', f, '-vf', f'scale={w}:{h}', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], capture_output=True)
a = np.frombuffer(p.stdout, np.uint8).reshape(-1, h, w).astype(np.float32)
d = np.abs(np.diff(a, axis=0)).mean(axis=(1, 2))
B = 60 / 140
idx = np.argsort(d)[::-1][:25]
print('frames', len(a))
for i in sorted(idx): print(f'frame {i+1:5d}  t={((i+1)/60):6.2f}s  beat={((i+1)/60/B):6.2f}  diff={d[i]:6.1f}')
# one-frame spikes: a frame that differs from both neighbours but the neighbours match each other
sp = [i for i in range(1, len(a) - 1) if np.abs(a[i] - a[i-1]).mean() > 25 and np.abs(a[i+1] - a[i-1]).mean() < 6]
print('one-frame spikes:', [(i, round(i/60/B, 2)) for i in sp])
