import sharp from 'sharp';

export type Target = { width: number; height: number; name?: string };

export const TARGETS: Record<string, Target> = {
  square: { width: 672, height: 672, name: '672x672' },
  tall: { width: 336, height: 1344, name: '336x1344' },
  wide: { width: 1344, height: 336, name: '1344x336' }
};

export function pickTargetForDimensions(width: number, height: number): Target {
  const ar = width / height;
  if (Math.abs(ar - 1) < 0.2) return TARGETS.square;
  if (ar < 1) return TARGETS.tall;
  return TARGETS.wide;
}

export interface PreprocessOptions {
  quality?: number; // jpeg quality 1-100
  background?: { r: number; g: number; b: number } | string;
  forceTarget?: Target | null; // override target
}

export async function preprocessImageBuffer(
  inputBuffer: Buffer,
  opts: PreprocessOptions = {}
): Promise<{ buffer: Buffer; width: number; height: number; target: Target }> {
  const metadata = await sharp(inputBuffer).metadata();
  const w = metadata.width || 0;
  const h = metadata.height || 0;

  const target = opts.forceTarget ?? pickTargetForDimensions(w, h);

  const resized = await sharp(inputBuffer)
    .resize({ width: target.width, height: target.height, fit: 'contain', background: opts.background ?? { r: 0, g: 0, b: 0 } })
    .jpeg({ quality: opts.quality ?? 90 })
    .toBuffer();

  return { buffer: resized, width: target.width, height: target.height, target };
}

export async function preprocessImagePath(
  inputPath: string,
  opts: PreprocessOptions = {}
): Promise<{ buffer: Buffer; width: number; height: number; target: Target }> {
  const buf = await sharp(inputPath).toBuffer();
  return preprocessImageBuffer(buf, opts);
}

export default { preprocessImageBuffer, preprocessImagePath, pickTargetForDimensions, TARGETS };
