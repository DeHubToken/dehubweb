"""Normalize a saved public video catalog into the shared Creator clip library."""
import argparse
import collections
import hashlib
import json
import pathlib
import re
from urllib.parse import urlparse

CATEGORIES = {
    'Rap': r'\brap\b|hip.?hop|studio duo|freestyle|microphone|cash stack',
    'Dance': r'danc|groov|rhythm|choreograph|routine|head bob|celebration',
    'Sports': r'sport|athlet|stadium|dribbl|parkour|fight|combat|kick|boxer|soccer|football|basketball',
    'Fashion': r'fashion|runway|outfit|streetwear|gown|lookbook|wardrobe|jacket|luxury bag|handbag',
    'Reactions': r'reaction|observer|expression|selfie|confrontation|waiter|diner|influencer|comedy',
    'Travel': r'coast|desert|drive|road|car\b|truck|rider|ride\b|tower|city|urban|street|walk',
    'Film': r'scene|cinema|film|world|recast|character|fantasy|vision|fire|zoom|room|commercial',
}

def category(name):
    return next((key for key, pattern in CATEGORIES.items() if re.search(pattern, name, re.I)), 'Other')

def https(value):
    return isinstance(value, str) and urlparse(value).scheme == 'https' and bool(urlparse(value).hostname)

def normalize(items):
    clips = {}; skipped = collections.Counter()
    for item in items:
        source = item.get('original_video') or item.get('reference') or {}
        inputs = [source] + [entry.get('media', {}) for entry in item.get('input_videos', [])]
        for position, media in enumerate(inputs):
            url = media.get('main_url') or media.get('url')
            poster = media.get('thumbnail_url')
            seconds = media.get('duration')
            if not https(url) or not https(poster) or not isinstance(seconds, (int, float)):
                skipped['incomplete'] += 1; continue
            if not 3 <= seconds <= 30:
                skipped['duration'] += 1; continue
            width, height = media.get('main_width') or media.get('width'), media.get('main_height') or media.get('height')
            if not width or not height:
                skipped['dimensions'] += 1; continue
            name = str(item.get('title') or 'Source clip')[:100]
            if position: name += f' ({position + 1})'
            variants = []
            if position == 0:
                for variant in item.get('variants', []) + item.get('results', []):
                    if variant.get('type') == 'original': continue
                    example = variant.get('media') or {}
                    video = example.get('url')
                    if https(video) and https(example.get('thumbnail_url')) and video != url:
                        variants.append({'url': video, 'poster': example['thumbnail_url']})
            entry = clips.setdefault(url, {
                'id': hashlib.sha256(url.encode()).hexdigest()[:20], 'name': name, 'category': category(name),
                'tags': '', 'url': url, 'poster': poster, 'seconds': seconds, 'width': width, 'height': height,
                'variants': [],
            })
            if name.lower() not in entry['tags'].lower() and len(entry['tags']) < 600:
                entry['tags'] = f"{entry['tags']} {name}".strip()
            for variant in variants:
                if len(entry['variants']) >= 3: break
                if variant['url'] not in [value['url'] for value in entry['variants']]: entry['variants'].append(variant)
            if entry['category'] == 'Other': entry['category'] = category(name)
    return list(clips.values()), dict(skipped)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('catalogs', nargs='+', help='Saved item arrays or paginated catalog responses')
    parser.add_argument('--output', default='public/creator-clips')
    parser.add_argument('--captured', required=True)
    args = parser.parse_args()
    items = {}; order = []
    for file in args.catalogs:
        data = json.loads(pathlib.Path(file).read_text(encoding='utf-8'))
        for page in data if isinstance(data, list) else [data]:
            for item in page.get('items', [page]):
                if item['id'] not in items: order.append(item['id'])
                items[item['id']] = item
    clips, skipped = normalize([items[key] for key in order])
    featured = []
    for group in CATEGORIES:
        featured.extend([clip for clip in clips if clip['category'] == group and clip['variants']][:4])
    featured.extend([clip for clip in clips if clip['category'] == 'Other' and clip['variants']][:4])
    output = pathlib.Path(args.output); output.mkdir(parents=True, exist_ok=True)
    for filename, values in [('catalog.json', clips), ('featured.json', featured)]:
        header = json.dumps({'captured': args.captured, 'total': len(clips)}, separators=(',', ':'))[:-1]
        records = ',\n'.join(json.dumps(value, ensure_ascii=False, separators=(',', ':')) for value in values)
        (output / filename).write_text(header + ',"clips":[\n' + records + '\n]}\n', encoding='utf-8')
    manifest = {'captured': args.captured, 'entriesInspected': len(items), 'sourceClips': len(clips),
        'categories': dict(collections.Counter(clip['category'] for clip in clips)), 'skippedReferences': skipped,
        'durationRange': [3, 30], 'schemaVersion': 1}
    (output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(manifest, indent=2))

if __name__ == '__main__': main()
