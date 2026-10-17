import { build } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';
await rm('dist',{recursive:true,force:true});
await mkdir('dist',{recursive:true});
await cp('public','dist',{recursive:true});
await build({entryPoints:{background:'src/background/index.ts',popup:'src/popup.ts',options:'src/options.ts'},outdir:'dist',bundle:true,format:'esm',target:'chrome120'});
await build({entryPoints:['src/content/index.ts'],outfile:'dist/content.js',bundle:true,format:'iife',target:'chrome120'});
