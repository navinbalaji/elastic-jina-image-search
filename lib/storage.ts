import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const IMAGE_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

// Env only: moving it at runtime would break every image already indexed
export const STORAGE_DIR = process.env.STORAGE_DIR || './storage';

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
  await mkdir(STORAGE_DIR, { recursive: true });
  await writeFile(path.join(STORAGE_DIR, file), buffer);
}

export async function readImage(file: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  if (!SAFE_FILE.test(file)) return null;
  try {
    const buffer = await readFile(path.join(STORAGE_DIR, file));
    return { buffer, contentType: IMAGE_TYPES[path.extname(file)] };
  } catch {
    return null;
  }
}
