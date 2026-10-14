import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

// Vaul 0.9.9 tracks document scroll for every Root even with noBodyStyles.
// That getter forces layout on each scroll frame despite restoration being off.
const require = createRequire(import.meta.url);
const dist = dirname(require.resolve('vaul'));
for (const file of ['index.js', 'index.mjs']) {
  const path = join(dist, file);
  const source = readFileSync(path, 'utf8');
  const start = source.indexOf('function usePositionFixed(');
  const end = source.indexOf('\nfunction Root(', start);
  if (start < 0 || end < 0) throw new Error(`Vaul scroll patch needs review: ${file}`);
  const hook = source.slice(start, end);
  const guard = 'if (noBodyStyles || !isSafari()) return;';
  if (hook.includes(guard)) continue;
  const target = '        function onScroll() {';
  if (!hook.includes(target) || !hook.includes('    }, []);')) {
    throw new Error(`Vaul scroll effect changed: ${file}`);
  }
  const patched = hook.replace(target, `        ${guard}\n${target}`)
    .replace('    }, []);', '    }, [noBodyStyles]);');
  writeFileSync(path, source.slice(0, start) + patched + source.slice(end));
}
