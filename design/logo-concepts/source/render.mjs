// Render the vector geometry with Sharp. This is not image generation or tracing.
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(path.join(process.env.SXB_ARTIFACT_NODE_MODULES, '_loader.cjs'));
const sharp = require('sharp');
const root = fileURLToPath(new URL('../', import.meta.url));
const concepts = JSON.parse(await readFile(path.join(root, 'concepts.json'), 'utf8'));
await mkdir(path.join(root, 'qa'), { recursive: true });
const report = [];
for (const c of concepts) {
  const source = path.join(root, c.id, 'mark.svg');
  const input = await readFile(source);
  await sharp(input, { density: 288 }).resize(1024, 1024).png().toFile(path.join(root, c.id, 'mark-1024.png'));
  const raw = await sharp(input, { density: 288 }).resize(256,256).ensureAlpha().raw().toBuffer();
  let minX=256,minY=256,maxX=-1,maxY=-1,sumX=0,sumY=0,mass=0;
  for(let y=0;y<256;y++)for(let x=0;x<256;x++){
    const a=raw[(y*256+x)*4+3]/255;
    if(a>.05){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
    sumX+=x*a;sumY+=y*a;mass+=a;
  }
  for (const size of [24,48,128]) {
    await sharp(input,{density:288}).resize(size,size).png().toFile(path.join(root,'qa',`${c.id}-${size}.png`));
  }
  report.push({id:c.id,viewBox:[0,0,256,256],bounds:[minX,minY,maxX,maxY],inkCenter:[+(sumX/mass).toFixed(2),+(sumY/mass).toFixed(2)],edgesClear:minX>0&&minY>0&&maxX<255&&maxY<255});
}
await writeFile(path.join(root,'qa','geometry-report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
