import fs from 'fs';
const names = {Bot:'bot',LayoutTemplate:'layout-template',Shapes:'shapes',LibraryBig:'library-big',ImagePlus:'image-plus',Type:'type',Layers:'layers',Sparkles:'sparkles',Wand2:'wand-sparkles',Save:'save',Download:'download',Undo2:'undo-2',Redo2:'redo-2',Info:'info',ArrowUp:'arrow-up',Loader2:'loader-circle',RotateCcw:'rotate-ccw',Trash2:'trash-2',Plus:'plus',Minus:'minus',Scissors:'scissors',Volume2:'volume-2',Eye:'eye',X:'x',GripVertical:'grip-vertical',Copy:'copy',Play:'play',Repeat:'repeat',Share2:'share-2',ChevronLeft:'chevron-left',Film:'film',Music:'music',Heart:'heart',MessageCircle:'message-circle',Send:'send',Image:'image',Smile:'smile',Globe:'globe',Check:'check',Upload:'upload',MousePointer2:'mouse-pointer-2',Maximize:'maximize',Gamepad2:'gamepad-2',Bell:'bell',BadgeCheck:'badge-check',Search:'search',Home:'house',User:'user',Gem:'gem',Wifi:'wifi',BatteryFull:'battery-full',Signal:'signal'};
const out = {};
const LUCIDE = new URL('../../../node_modules/lucide-react/dist/esm/icons/', import.meta.url).pathname;
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
