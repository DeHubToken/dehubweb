import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const policy = JSON.parse(fs.readFileSync('scripts/locale-policy.json', 'utf8'));
function build(root, prefix, client) {
  const source = path.join(root, prefix, 'locales');
  const files = fs.readdirSync(source).filter(f => f.endsWith('.json')).sort();
  const hash = crypto.createHash('sha256');
  for (const name of files) { hash.update(name); hash.update(fs.readFileSync(path.join(source, name), 'utf8').replace(/\r\n/g, '\n')); }
  const manifest = JSON.parse(fs.readFileSync(path.join(root, prefix, 'locale-manifest.json'), 'utf8'));
  if (manifest.version !== hash.digest('hex').slice(0, 16)) throw new Error(`${client}: regenerate locale-manifest after translation changes`);
  const directory = path.join('public/locale-packs', client, manifest.version);
  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(path.join(source, file), 'utf8'));
    const groups = {};
    for (const [key, value] of Object.entries(data)) {
      const group = Object.entries(policy).find(([, keys]) => keys.includes(key))?.[0] || 'features';
      (groups[group] ||= {})[key] = value;
    }
    const langDir = path.join(directory, file.slice(0, -5));
    fs.mkdirSync(langDir, { recursive: true });
    for (const group of ['core', 'wallet', 'creator', 'community', 'commerce', 'features']) {
      fs.writeFileSync(path.join(langDir, `${group}.json`), JSON.stringify(groups[group] || {}));
    }
  }
  console.log(`${client}: ${files.length} languages, version ${manifest.version}`);
}
build('.', 'src/i18n', 'web');
if (process.argv[2]) build(process.argv[2], 'i18n', 'mobile');
