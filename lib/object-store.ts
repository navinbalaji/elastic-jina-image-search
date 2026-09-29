import { GetObjectCommand, NoSuchKey, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Files live in S3 when S3_BUCKET is set (needed on serverless hosts), otherwise on local disk
export interface ObjectStore {
  read(name: string): Promise<Buffer | null>;
  write(name: string, body: Buffer | string, contentType: string): Promise<void>;
}

const BUCKET = process.env.S3_BUCKET;

// Shared client; credentials come from the default AWS chain (IAM role, profile or env)
const g = globalThis as typeof globalThis & { __s3?: S3Client };
function s3(): S3Client {
  g.__s3 ??= new S3Client({ region: process.env.S3_REGION || undefined });
  return g.__s3;
}

function s3Store(bucket: string, prefix: string): ObjectStore {
  return {
    async read(name) {
      try {
        const res = await s3().send(new GetObjectCommand({ Bucket: bucket, Key: `${prefix}/${name}` }));
        return res.Body ? Buffer.from(await res.Body.transformToByteArray()) : null;
      } catch (err) {
        if (err instanceof NoSuchKey) return null;
        throw err;
      }
    },
    async write(name, body, contentType) {
      await s3().send(
        new PutObjectCommand({ Bucket: bucket, Key: `${prefix}/${name}`, Body: body, ContentType: contentType }),
      );
    },
  };
}

// mode is applied to new files, e.g. 0o600 for secrets
function diskStore(dir: string, mode?: number): ObjectStore {
  return {
    async read(name) {
      try {
        return await readFile(path.join(dir, name));
      } catch {
        return null;
      }
    },
    async write(name, body) {
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, name), body, { mode });
    },
  };
}

export const STORAGE_DIR = process.env.STORAGE_DIR || './storage';
export const DATA_DIR = process.env.DATA_DIR || './data';
export const USES_S3 = Boolean(BUCKET);

// Uploaded images; env only, since moving them would break every image already indexed
export const imageStore = BUCKET ? s3Store(BUCKET, 'images') : diskStore(STORAGE_DIR);

// Admin settings, which can hold the Elasticsearch API key
export const settingsStore = BUCKET ? s3Store(BUCKET, 'settings') : diskStore(DATA_DIR, 0o600);
