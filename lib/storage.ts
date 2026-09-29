import { createHash } from 'node:crypto';
import path from 'node:path';
import { imageStore } from './object-store';

export const IMAGE_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

const SAFE_FILE = /^[a-f0-9]{64}\.(jpg|jpeg|png|webp|gif)$/;

export function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

export function extensionFor(filename: string, contentType?: string): string | undefined {
  const ext = path.extname(filename).toLowerCase();
  if (IMAGE_TYPES[ext]) return ext;
  return Object.keys(IMAGE_TYPES).find((e) => IMAGE_TYPES[e] === contentType);
}

export async function saveImage(file: string, buffer: Buffer): Promise<void> {
  await imageStore.write(file, buffer, IMAGE_TYPES[path.extname(file)]);
}

export async function readImage(file: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  if (!SAFE_FILE.test(file)) return null;
  const buffer = await imageStore.read(file);
  return buffer && { buffer, contentType: IMAGE_TYPES[path.extname(file)] };
}
