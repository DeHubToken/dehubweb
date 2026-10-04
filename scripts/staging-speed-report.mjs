import fs from 'node:fs';
import zlib from 'node:zlib';
const html = fs.readFileSync('dist/index.html', 'utf8');
const files = [...new Set([...html.matchAll(/<link[^>]*rel="modulepreload"[^>]*href="([^"?]+)"/g)].map(m => m[1]))];
const assets = files.map(file => { const data = fs.readFileSync(`dist${file}`); return { file, bytes: data.length, gzip: zlib.gzipSync(data).length }; });
console.log(JSON.stringify({ preloadCount: files.length, decodedBytes: assets.reduce((n,a) => n+a.bytes,0), gzipBytes: assets.reduce((n,a) => n+a.gzip,0), assets }, null, 2));
