import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { checkPassword } from './auth';
import { getSettings, updateSettings } from './settings';

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

async function matchesHash(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const actual = await scryptAsync(password, Buffer.from(salt, 'hex'), 64);
  return timingSafeEqual(actual, Buffer.from(hash, 'hex'));
}

// A password set in the admin panel replaces ADMIN_PASSWORD from .env
export async function verifyAdminPassword(password: string): Promise<boolean> {
  const { adminPasswordHash } = await getSettings();
  return adminPasswordHash ? matchesHash(password, adminPasswordHash) : checkPassword(password);
}

// Returns false when the current password is wrong
export async function changeAdminPassword(current: string, next: string): Promise<boolean> {
  if (!(await verifyAdminPassword(current))) return false;
  await updateSettings({ adminPasswordHash: await hashPassword(next) });
  return true;
}
