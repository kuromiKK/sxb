// Export app icons directly from the original vector paths at each target size.
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(path.join(process.env.SXB_ARTIFACT_NODE_MODULES, '_loader.cjs'));
const sharp = require('sharp');
const root = fileURLToPath(new URL('../', import.meta.url));
const concepts = JSON.parse(await readFile(path.join(root, 'concepts.json'), 'utf8'));
const report = [];
const previews = [];
await mkdir(path.join(root, 'qa'), { recursive: true });

for (const [index, c] of concepts.entries()) {
  const paths = c.paths.map(([, d]) => `<path d="${d}"/>`).join('');
  for (const rounded of [false, true]) {
    // 18 / 80 is the radius ratio in the approved app-icon preview.
    const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect width="256" height="256" rx="${rounded ? 57.6 : 0}" fill="#3569E8"/><g fill="#FFFFFF">${paths}</g></svg>`);
    for (const size of [1024, 640, 64]) {
      const filename = `app-icon${rounded ? '-rounded' : ''}-${size}.png`;
      const file = path.join(root, c.id, filename);
      let pipeline = sharp(svg, { density: 72 * size / 256 }).resize(size, size);
      if (!rounded) pipeline = pipeline.removeAlpha();
      await pipeline.png().toFile(file);
      const meta = await sharp(file).metadata();
      const {data, info} = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const corner = [...data.subarray(0, 4)];
      let bluePixels = 0, whitePixels = 0, transparentPixels = 0;
      for (let i = 0; i < data.length; i += info.channels) {
        if (data[i] === 53 && data[i+1] === 105 && data[i+2] === 232 && data[i+3] === 255) bluePixels++;
        if (data[i] === 255 && data[i+1] === 255 && data[i+2] === 255 && data[i+3] === 255) whitePixels++;
        if (data[i+3] < 255) transparentPixels++;
      }
      if (meta.width !== size || meta.height !== size || meta.format !== 'png' || !bluePixels || !whitePixels || (!rounded && transparentPixels) || (rounded && corner[3] !== 0)) {
        throw new Error(`Invalid icon export: ${file}`);
      }
      report.push({file:`${c.id}/${filename}`,width:meta.width,height:meta.height,format:meta.format,rounded,hasAlpha:meta.hasAlpha,bluePixels,whitePixels,transparentPixels});
    }
    previews.push({input:await sharp(svg).resize(128,128).png().toBuffer(),left:32+index*168,top:rounded?208:32});
  }
}
await sharp({create:{width:528,height:368,channels:3,background:'#e6e9ef'}}).composite(previews).png().toFile(path.join(root,'qa','app-icons-overview.png'));
await writeFile(path.join(root,'qa','app-icons-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(`Verified ${report.length} app icon PNGs: three concepts, three sizes, square and rounded variants.`);
