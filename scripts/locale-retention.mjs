import fs from 'node:fs';
import path from 'node:path';

const VERSION = /^[a-f0-9]{16}$/;

/** Keep the current and immediately preceding generation. Older URLs are
 * served through the worker's current-version fallback, including old clients.
 */
export function pruneLocaleVersions(root, version, previousVersion) {
  if (!VERSION.test(version)) throw new Error('Invalid public locale version');
  const directory = fs.realpathSync(path.join(root, 'public/locale-pages'));
  const retained = new Set([version, previousVersion].filter(value => VERSION.test(value ?? '')));
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory() || !VERSION.test(entry.name) || retained.has(entry.name)) continue;
    const target = fs.realpathSync(path.join(directory, entry.name));
    if (path.dirname(target) !== directory) throw new Error('Locale directory escapes public/locale-pages');
    fs.rmSync(target, { recursive: true });
  }
  fs.writeFileSync(path.join(directory, 'current.json'), JSON.stringify({ version, previousVersion: previousVersion ?? null }) + '\n');
}
