import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

// Radix moves a focus guard to the very start of <body> whenever a dialog,
// drawer or menu opens, and removes it again on close. Every insert or removal
// in front of #root restyles the whole page (~130ms on a phone, twice per
// open and close). index.html ships a permanent guard there instead
// (data-guard-static); this lets Radix use it in place and keeps it on close.
const require = createRequire(import.meta.url);
const dist = dirname(require.resolve('@radix-ui/react-focus-guards'));
const insert = 'document.body.insertAdjacentElement("afterbegin", edgeGuards[0] ?? createFocusGuard());';
const remove = 'document.querySelectorAll("[data-radix-focus-guard]").forEach((node) => node.remove());';
const marker = 'data-guard-static';
for (const file of ['index.js', 'index.mjs']) {
  const path = join(dist, file);
  const source = readFileSync(path, 'utf8');
  if (source.includes(marker)) continue;
  if (!source.includes(insert) || !source.includes(remove)) {
    throw new Error(`Radix focus guards changed: ${file}`);
  }
  writeFileSync(path, source
    .replace(insert, `if (edgeGuards[0]?.hasAttribute("${marker}")) edgeGuards[0].tabIndex = 0;
    else ${insert}`)
    .replace(remove, `document.querySelectorAll("[data-radix-focus-guard]").forEach((node) => {
          if (node.hasAttribute("${marker}")) node.tabIndex = -1;
          else node.remove();
        });`));
}
