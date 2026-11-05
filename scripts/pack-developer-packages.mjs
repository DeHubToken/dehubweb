#!/usr/bin/env node
/**
 * Builds the developer packages and puts them on riftn.com, so nobody needs
 * an npm account:
 *
 *   npm i https://riftn.com/sdk/dehub-sdk.tgz
 *   npx https://riftn.com/sdk/create-dehub-app.tgz my-app
 *   import { dehub } from 'https://riftn.com/sdk/dehub-sdk.mjs'
 *
 * Writes public/sdk/{dehub-sdk,create-dehub-app}-<version>.tgz, an
 * unversioned copy of each (always the latest) and dehub-sdk.mjs (the browser
 * build, no dependencies). Run it after changing packages/, then commit
 * public/sdk. Templates pin the versioned tarball, so bump the version in
 * packages/dehub-sdk/package.json and the templates together.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = path.join(root, 'public', 'sdk');
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'inherit'] }).toString().trim();

const sdk = path.join(root, 'packages', 'dehub-sdk');
run('npx', ['-y', '-p', 'typescript@5.6.3', '-p', 'jose@5.9.6', 'tsc', '-p', 'tsconfig.json'], sdk);

for (const name of ['dehub-sdk', 'create-dehub-app']) {
  const dir = path.join(root, 'packages', name);
  const { version } = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  const file = JSON.parse(run('npm', ['pack', '--json', '--pack-destination', out], dir))[0].filename;
  fs.copyFileSync(path.join(out, file), path.join(out, `${name}.tgz`));
  console.log(`${name}@${version} → public/sdk/${file} (+ ${name}.tgz)`);
}

fs.copyFileSync(path.join(sdk, 'dist', 'index.js'), path.join(out, 'dehub-sdk.mjs'));
console.log('browser build → public/sdk/dehub-sdk.mjs');
