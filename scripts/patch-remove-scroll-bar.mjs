import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

// react-remove-scroll-bar (under every Radix dialog, drawer and sheet) writes
// `--removed-body-scroll-bar-size` on <body> while a sheet is open. Nothing in
// this app reads it, but a custom property appearing on <body> makes Chrome
// restyle the whole page: ~1900 elements, ~100ms on a phone, inside the tap
// that opens the sheet and again on close. Registering the property as
// non-inherited (index.css) did not stop it. This drops the declaration; the
// rest of the lock (overflow, the attribute, the gap classes) is unchanged.
const require = createRequire(import.meta.url);
const root = join(dirname(require.resolve('react-remove-scroll-bar/package.json')), 'dist');
const marker = 'scrollbar size not published';
const edits = [
  ['es2015/component.js', 'removedBarSizeVariable, ": ").concat(gap, "px;', `"/* ${marker}", " ").concat(gap, "px */`],
  ['es5/component.js', 'constants_1.removedBarSizeVariable, ": ").concat(gap, "px;', `"/* ${marker}", " ").concat(gap, "px */`],
  ['es2019/component.js', '${removedBarSizeVariable}: ${gap}px;', `/* ${marker} \${gap}px */`],
];
for (const [file, from, to] of edits) {
  const path = join(root, file);
  const source = readFileSync(path, 'utf8');
  if (source.includes(marker)) continue;
  if (!source.includes(from)) throw new Error(`react-remove-scroll-bar changed: ${file}`);
  writeFileSync(path, source.replace(from, to));
}
