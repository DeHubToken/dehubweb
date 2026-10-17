# Fetches the motion-library clips the film uses (featured swap clips with their Maboroshi recasts, plus every
# Jean Phil template) and cuts 4.2 s of each into ./a/clips/<id>_<o|vN>/NNN.jpg at 30 fps, then writes a/clips.js.
# Sources are the URLs in public/creator-clips/featured.json and catalog.json. Needs curl and ffmpeg.
import json, os, subprocess, sys
R = os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../../public/creator-clips')
os.chdir(os.path.dirname(os.path.abspath(__file__)))
feat = json.load(open(f'{R}/featured.json'))['clips']
t = open(f'{R}/catalog.json').read(); dec = json.JSONDecoder(); allc = []; i = 0
while True:  # the catalog is large; read it object by object
    j = t.find('{"id"', i)
    if j < 0: break
    o, i = dec.raw_decode(t, j); allc.append(o)
clips = feat + [c for c in allc if c['name'].startswith('Jean Phil')]
SKIP = {'1029c09b00e3f4e20e1c', 'f77ce78d', '60119f5b', '4e0805f3', 'ad2cb876', 'f0db06b6'}  # look like real people; not used
os.makedirs('a/clips', exist_ok=True); os.makedirs('a/raw', exist_ok=True)
info, ids, names = {}, [], {}
for c in clips:
    ids.append(c['id']); names[c['id']] = c['name']
    if any(c['id'].startswith(s) for s in SKIP): continue
    srcs = [('o', c['url'])] + [(f'v{n}', v['url']) for n, v in enumerate(c.get('variants', []))]
    for s, url in srcs:
        key, raw = f"{c['id']}_{s}", f"a/raw/{c['id']}_{s}.mp4"
        if not os.path.exists(raw) and subprocess.run(['curl', '-sSfL', '--max-time', '120', '-o', raw, url]).returncode:
            print('download failed', key, file=sys.stderr); continue
        d = f'a/clips/{key}'; os.makedirs(d, exist_ok=True)
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', '0.4', '-i', raw, '-t', '4.2', '-an', '-vf',
                        "fps=30,scale='if(gt(iw,ih),720,-2)':'if(gt(iw,ih),-2,720)'", '-q:v', '3', f'{d}/%03d.jpg'], check=True)
        fs = sorted(os.listdir(d))
        for n, f in enumerate(fs): os.rename(f'{d}/{f}', f'{d}/{n:03d}.jpg')
        w, h = map(int, subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', f'{d}/000.jpg'], capture_output=True, text=True).stdout.strip().split(','))
        info[key] = {'n': len(fs), 'w': w, 'h': h}
open('a/clips.js', 'w').write('window.CLIPS=' + json.dumps({'info': info, 'ids': ids, 'names': names}) + ';\n')
print(len(info), 'clips ready')
