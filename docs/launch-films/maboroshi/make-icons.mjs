import fs from 'fs';
const names = {Upload:'upload',Search:'search',Sparkles:'sparkles',Check:'check',Play:'play',Download:'download',ChevronDown:'chevron-down',Film:'film',Volume2:'volume-2',Wand2:'wand-sparkles',ArrowRight:'arrow-right',RefreshCw:'refresh-cw',Heart:'heart',MessageCircle:'message-circle',Share2:'share-2',Smartphone:'smartphone',Monitor:'monitor',Lock:'lock',ScanFace:'scan-face',Layers:'layers'};
const out = {};
const LUCIDE = process.env.LUCIDE || new URL('../../../node_modules/lucide-react/dist/esm/icons/', import.meta.url).pathname;
for (const [k, f] of Object.entries(names)) {
  const p = `${LUCIDE}${f}.js`;
  if (!fs.existsSync(p)) { console.log('missing', k, f); continue; }
  const s = fs.readFileSync(p, 'utf8');
  const m = s.match(/createLucideIcon\("[^"]+", (\[[\s\S]*?\])\);\n/);
  const node = eval(m[1]);
  out[k] = node.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).filter(([a]) => a !== 'key').map(([a, v]) => `${a}="${v}"`).join(' ')}/>`).join('');
}
fs.writeFileSync(process.argv[2], 'const ICONS=' + JSON.stringify(out) + ';\n');
console.log(Object.keys(out).length);
