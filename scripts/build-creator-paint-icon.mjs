import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Palette materials follow the same theme families as the navigation artwork.
const materials = {
  system: ['#ffffff', '#b8c0ca', '#46515e', '#f4f7ff', ['#f35571', '#ffd34c', '#53c99b', '#57aaff']],
  minimal: ['#ffffff', '#d4d4d8', '#3f3f46', '#fafafa', ['#fafafa', '#d4d4d8', '#a1a1aa', '#71717a']],
  light: ['#ffffff', '#d7e4ee', '#8ba0b4', '#ffffff', ['#e9688d', '#eabf53', '#64bda7', '#81a2e0']],
  cosmic: ['#f6d9ff', '#9479d9', '#352d6d', '#d8bdff', ['#ff73cf', '#a891ff', '#68d7f3', '#ffc66b']],
  lavalamp: ['#ffe5ad', '#ff8a52', '#932728', '#ffc770', ['#ffe248', '#ff5b76', '#d33faf', '#ffae3e']],
  hazy: ['#f8dcff', '#b19cdb', '#5a427e', '#e4baff', ['#c788ef', '#ffb4da', '#96c5f7', '#ead4a4']],
  swarms: ['#cffcff', '#4b9caf', '#123746', '#85f7ff', ['#42e8ee', '#9ef7a1', '#5b99f4', '#d3ff68']],
  winter: ['#ffffff', '#bbe3f4', '#658fae', '#ecfcff', ['#b8edff', '#91bef0', '#c7b5ee', '#e2f6ff']],
  osaka: ['#ffe7fa', '#be82c3', '#553b78', '#ff99d2', ['#ff65ad', '#8c9dff', '#60dedc', '#ffd5a4']],
  jungle: ['#ffe6a5', '#ad7e43', '#533c22', '#f2c579', ['#9dc653', '#efb04e', '#5f9e68', '#e3874c']],
  war: ['#c9ffef', '#4a9f98', '#1c4542', '#66fff0', ['#77f6dd', '#cbd488', '#5ebdd0', '#99d8ac']],
  hacker: ['#d9ffc6', '#51c764', '#124322', '#72ff94', ['#b7ff56', '#3effa4', '#63d278', '#ccffb7']],
  island: ['#e2fff2', '#6fcbbd', '#286c82', '#abfff2', ['#ffb48b', '#ffd981', '#47d7b9', '#71bfee']],
  horror: ['#ffd1c7', '#b84b57', '#491728', '#ff8b91', ['#e34b56', '#b07494', '#ee947a', '#713e70']],
};

function paletteSvg([highlight, face, shade, rim, paints]) {
  const silhouette = 'M218 105C218 58 173 31 124 31C66 31 27 71 27 121C27 173 72 211 119 211C145 211 157 197 157 182C157 171 150 165 150 157C150 147 161 143 175 143H189C207 143 218 128 218 105Z';
  const spots = [[69, 109], [94, 70], [139, 64], [182, 91]];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <defs>
    <linearGradient id="body" x1="0" y1="0" x2="0.8" y2="1"><stop stop-color="${highlight}"/><stop offset="0.34" stop-color="${face}"/><stop offset="0.67" stop-color="${highlight}"/><stop offset="1" stop-color="${shade}"/></linearGradient>
    <linearGradient id="edge" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${face}"/><stop offset="1" stop-color="${shade}"/></linearGradient>
    <linearGradient id="gloss" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fff" stop-opacity="0.75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <radialGradient id="hole"><stop stop-color="${shade}"/><stop offset="0.82" stop-color="${shade}"/><stop offset="1" stop-color="${highlight}"/></radialGradient>
    ${paints.map((color, i) => `<radialGradient id="paint${i}" cx="0.3" cy="0.25" r="0.85"><stop stop-color="#fff"/><stop offset="0.25" stop-color="${color}"/><stop offset="1" stop-color="${shade}"/></radialGradient>`).join('')}
  </defs>
  <path d="${silhouette}" transform="translate(0 8)" fill="url(#edge)" stroke="${shade}" stroke-width="3"/>
  <path d="${silhouette}" fill="url(#body)" stroke="${rim}" stroke-width="2.5"/>
  <path d="M43 112C47 69 81 43 124 43C163 43 197 61 205 91" fill="none" stroke="${highlight}" stroke-opacity="0.9" stroke-width="3" stroke-linecap="round"/>
  ${spots.map(([x, y], i) => `<ellipse cx="${x}" cy="${y + 3}" rx="17" ry="16" fill="${shade}" opacity="0.7"/><circle cx="${x}" cy="${y}" r="16" fill="url(#paint${i})" stroke="${rim}" stroke-opacity="0.5"/><ellipse cx="${x - 4}" cy="${y - 6}" rx="7" ry="3" fill="#fff" opacity="0.55"/>`).join('')}
  <ellipse cx="98" cy="162" rx="19" ry="23" transform="rotate(-22 98 162)" fill="url(#hole)"/>
  <ellipse cx="98" cy="164" rx="13" ry="17" transform="rotate(-22 98 164)" fill="${shade}"/>
  <path d="M44 137C56 174 78 196 116 199" fill="none" stroke="url(#gloss)" stroke-width="5" stroke-linecap="round"/>
  </svg>`;
}

export async function buildCreatorPaintIcons(sharp) {
  const root = path.join(process.cwd(), 'public', 'theme-icons');
  const manifest = JSON.parse(await readFile(path.join(root, 'pack-manifest.json'), 'utf8'));
  for (const theme of manifest.themes) {
    if (!materials[theme]) throw new Error(`Missing paint palette material: ${theme}`);
    const sourceDir = path.join(root, 'sources', 'packs', theme);
    await mkdir(sourceDir, { recursive: true });
    const original = await sharp(Buffer.from(paletteSvg(materials[theme]))).ensureAlpha().png().toBuffer();
    await sharp(original).png().toFile(path.join(sourceDir, 'paint.png'));
    await sharp(original).webp({ quality: 94, alphaQuality: 100 }).toFile(path.join(root, theme, 'paint.webp'));
  }
  console.log(`Built paint palettes for ${manifest.themes.length} theme families.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const { default: sharp } = await import('sharp');
  await buildCreatorPaintIcons(sharp);
}
