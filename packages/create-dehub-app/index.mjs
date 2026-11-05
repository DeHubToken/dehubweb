#!/usr/bin/env node
/**
 * npx https://github.com/DeHubToken/dehubweb/releases/download/packages/create-dehub-app.tgz my-app [--template html|react|server]
 * Copies a starter and fills in the app name. No dependencies.
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const TEMPLATES = {
  html: 'One HTML file. Sign-in, share and tip. No build step.',
  react: 'React + Vite with dehub-sdk: sign-in, share, pay, add-app.',
  server: 'Node server: verifies sign-in, payments and webhooks, sends notifications.',
};

const args = process.argv.slice(2);
let name = args.find((a) => !a.startsWith('--'));
let template = args.includes('--template') ? args[args.indexOf('--template') + 1] : null;

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
if (!name) name = (await rl.question('App folder name: ')).trim() || 'my-dehub-app';
if (!template || !TEMPLATES[template]) {
  console.log('\nTemplates:');
  for (const [key, text] of Object.entries(TEMPLATES)) console.log(`  ${key.padEnd(7)} ${text}`);
  template = (await rl.question('Template (html/react/server) [react]: ')).trim() || 'react';
  if (!TEMPLATES[template]) template = 'react';
}
rl.close();

const target = path.resolve(process.cwd(), name);
if (fs.existsSync(target) && fs.readdirSync(target).length) {
  console.error(`\n${name} already exists and is not empty.`);
  process.exit(1);
}
const source = path.join(path.dirname(fileURLToPath(import.meta.url)), 'templates', template);
const appName = path.basename(target);

function copy(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name === '_gitignore' ? '.gitignore' : entry.name);
    if (entry.isDirectory()) copy(src, dest);
    else fs.writeFileSync(dest, fs.readFileSync(src, 'utf8').replaceAll('{{APP_NAME}}', appName));
  }
}
copy(source, target);

console.log(`\nCreated ${name} from the ${template} template.\n`);
console.log('Next:');
console.log(`  cd ${name}`);
if (template === 'html') console.log('  open index.html, then host the folder on https (any static host)');
else console.log('  npm install\n  npm run dev');
console.log('  edit public/.well-known/dehub.json (or .well-known/dehub.json), then submit it at https://dehub.io/apps/dev\n');
