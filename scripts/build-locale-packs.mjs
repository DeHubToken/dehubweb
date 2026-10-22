import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const policyText = fs.readFileSync('scripts/locale-policy.json', 'utf8').replace(/\r\n/g, '\n');
const policy = JSON.parse(policyText);
const groupFor = key => Object.entries(policy).find(([, keys]) => keys.includes(key))?.[0] || 'features';
const groups = ['core', 'wallet', 'creator', 'community', 'commerce', 'features'];

function localSource(root, prefix) {
  const directory = path.join(root, prefix, 'locales');
  return fs.readdirSync(directory).filter(name => name.endsWith('.json')).sort()
    .map(name => ({ name, text: fs.readFileSync(path.join(directory, name), 'utf8').replace(/\r\n/g, '\n') }));
}

function metadata(source, sourcePolicyText = policyText) {
  const sourcePolicy = JSON.parse(sourcePolicyText);
  const sourceGroupFor = key => Object.entries(sourcePolicy).find(([, keys]) => keys.includes(key))?.[0] || 'features';
  const hash = crypto.createHash('sha256').update(sourcePolicyText);
  for (const { name, text } of source) hash.update(name).update(text);
  const english = JSON.parse(source.find(file => file.name === 'en.json').text);
  const manifest = {
    version: hash.digest('hex').slice(0, 16),
    languages: source.map(file => file.name.slice(0, -5)),
    groups: Object.fromEntries(Object.keys(english).map(key => [key, sourceGroupFor(key)])),
  };
  return { manifest, core: Object.fromEntries(Object.entries(english).filter(([key]) => groupFor(key) === 'core')) };
}

function writeMetadata(prefix, source) {
  const { manifest, core } = metadata(source);
  if (prefix === 'i18n') {
    let ref = JSON.parse(fs.readFileSync(path.join(prefix, 'locale-manifest.json'), 'utf8')).sourceRef;
    try { ref = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch {}
    if (!/^[a-f0-9]{40}$/.test(ref || '')) throw new Error('An immutable mobile source commit is required');
    manifest.sourceRef = ref;
  }
  fs.writeFileSync(path.join(prefix, 'locale-manifest.json'), JSON.stringify(manifest) + '\n');
  fs.writeFileSync(path.join(prefix, 'core-en.json'), JSON.stringify(core) + '\n');
  return manifest;
}

function writePacks(source, client, expectedVersion, sourcePolicyText = policyText) {
  const { manifest } = metadata(source, sourcePolicyText);
  if (expectedVersion && manifest.version !== expectedVersion) throw new Error(`${client}: pinned language source does not match its manifest`);
  for (const { name, text } of source) {
    const packs = Object.fromEntries(groups.map(group => [group, {}]));
    for (const [key, value] of Object.entries(JSON.parse(text))) packs[manifest.groups[key] || 'features'][key] = value;
    const directory = path.join('public/locale-packs', client, manifest.version, name.slice(0, -5));
    fs.mkdirSync(directory, { recursive: true });
    for (const group of groups) fs.writeFileSync(path.join(directory, `${group}.json`), JSON.stringify(packs[group]));
  }
  console.log(`${client}: ${source.length} languages, version ${manifest.version}`);
}

async function fetchText(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(`Language source HTTP ${response.status}`);
      return (await response.text()).replace(/\r\n/g, '\n');
    } catch (error) { if (attempt === 2) throw error; }
  }
}

async function pinnedMobileSource() {
  const pin = JSON.parse(fs.readFileSync('scripts/mobile-locale-source.json', 'utf8'));
  if (!/^[a-f0-9]{40}$/.test(pin.ref)) throw new Error('An immutable mobile source commit is required');
  const origin = `https://raw.githubusercontent.com/DeHubToken/dehub-mobile/${pin.ref}/i18n`;
  const manifest = JSON.parse(await fetchText(`${origin}/locale-manifest.json`));
  const source = new Array(manifest.languages.length);
  let next = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (next < source.length) {
      const index = next++;
      const name = `${manifest.languages[index]}.json`;
      source[index] = { name, text: await fetchText(`${origin}/locales/${name}`) };
    }
  }));
  source.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  const sourcePolicyText = await fetchText(`https://raw.githubusercontent.com/DeHubToken/dehub-mobile/${pin.ref}/scripts/locale-policy.json`);
  return { source, version: manifest.version, sourcePolicyText };
}

const isWeb = fs.existsSync('src/i18n/locales');
const prefix = isWeb ? 'src/i18n' : 'i18n';
const source = localSource('.', prefix);
writeMetadata(prefix, source);
if (isWeb && !process.argv.includes('--metadata-only')) {
  writePacks(source, 'web');
  const mobileRoot = process.argv[2];
  if (mobileRoot) {
    const manifest = JSON.parse(fs.readFileSync(path.join(mobileRoot, 'i18n/locale-manifest.json'), 'utf8'));
    const sourcePolicyText = fs.readFileSync(path.join(mobileRoot, 'scripts/locale-policy.json'), 'utf8').replace(/\r\n/g, '\n');
    writePacks(localSource(mobileRoot, 'i18n'), 'mobile', manifest.version, sourcePolicyText);
  } else {
    const mobile = await pinnedMobileSource();
    writePacks(mobile.source, 'mobile', mobile.version, mobile.sourcePolicyText);
  }
}
