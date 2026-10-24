import { build } from 'esbuild';
import {readFile,mkdir,writeFile,copyFile} from 'node:fs/promises';
await mkdir('dist',{recursive:true});
const result=await build({entryPoints:['public/app.mjs'],bundle:true,minify:true,format:'esm',write:false,external:['./discord-sdk.js'],target:'es2022'});
const css=await readFile('public/style.css','utf8');
let html=await readFile('src/index.html','utf8');
html=html.replace('<link rel="stylesheet" href="/style.css">',`<style>${css}</style>`).replace('<script type="module" src="/app.mjs"></script>',`<script type="module">${result.outputFiles[0].text}</script>`);
await writeFile('dist/index.html',html);
// Keep the familiar public entry point directly openable without a web server too.
await writeFile('public/index.html',html);
await build({stdin:{contents:'export { DiscordSDK } from "@discord/embedded-app-sdk";',resolveDir:process.cwd()},bundle:true,minify:true,format:'esm',outfile:'dist/discord-sdk.js',legalComments:'eof',target:'es2022'});
await copyFile('dist/discord-sdk.js','public/discord-sdk.js');
// GitHub Pages publishes /docs; separate scripts also work with stricter iframe CSPs.
await mkdir('docs',{recursive:true});
const hosted=(await readFile('src/index.html','utf8')).replace('href="/style.css"','href="./style.css"').replace('src="/app.mjs"','src="./app.js"');
await writeFile('docs/index.html',hosted);
await writeFile('docs/app.js',result.outputFiles[0].text);
await writeFile('docs/style.css',css);
await copyFile('dist/discord-sdk.js','docs/discord-sdk.js');
await writeFile('docs/.nojekyll','');
console.log('Built public/index.html and dist/index.html (both open directly, no local server).');
