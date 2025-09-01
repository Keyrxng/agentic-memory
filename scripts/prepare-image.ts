#!/usr/bin/env bun
import fs from 'fs';
import path from 'path';
import { preprocessImagePath, TARGETS, pickTargetForDimensions } from '../src/utils/image-preprocessor.js';

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error('Usage: prepare-image.ts <input-image-path> [--target=square|tall|wide]');
    process.exit(1);
  }

  const input = args[0];
  const targetFlag = args.find(a => a.startsWith('--target='));
  const forceTargetName = targetFlag ? targetFlag.split('=')[1] : undefined;

  const forceTarget = forceTargetName ? (TARGETS as any)[forceTargetName] : null;

  const result = await preprocessImagePath(input, { forceTarget });

  const outName = path.basename(input).replace(/(\.[^.]+)?$/, `.${result.target.name}.jpg`);
  const outPath = path.join(process.cwd(), outName);
  fs.writeFileSync(outPath, result.buffer);
  console.log(`Wrote preprocessed image to ${outPath} (${result.width}x${result.height})`);
}

if (require.main === module) main().catch(err => { console.error(err); process.exit(1); });
