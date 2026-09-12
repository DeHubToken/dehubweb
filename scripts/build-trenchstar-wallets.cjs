const path=require('node:path');
const modules=path.resolve(process.argv[2]||'node_modules');
const esbuild=require(path.join(modules,'esbuild'));
esbuild.buildSync({entryPoints:['scripts/trenchstar-wallet-engine.mjs'],bundle:true,minify:true,format:'esm',platform:'browser',target:'es2022',nodePaths:[modules],inject:['scripts/trenchstar-buffer.mjs'],outfile:'public/trenchstar-game/vendor/wallet-engine.js',legalComments:'external'});
