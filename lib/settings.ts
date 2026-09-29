import { settingsStore } from './object-store';
import type { ConfigUpdate, RateLimitSettings } from './types';

export interface StoredSettings {
  rateLimit: RateLimitSettings;
  // Admin panel overrides for .env values
  config: ConfigUpdate;
  // scrypt hash of a password set in the admin panel, replaces ADMIN_PASSWORD
  adminPasswordHash?: string;
}

const DEFAULT_SETTINGS: StoredSettings = {
  rateLimit: { enabled: true, maxRequests: 10, windowSeconds: 60 },
  config: {},
};

const FILE = 'settings.json';
const CACHE_MS = 2000;

// Shared via globalThis since route handlers may be bundled separately
const g = globalThis as typeof globalThis & { __settings?: { value: StoredSettings; at: number } };

export async function getSettings(): Promise<StoredSettings> {
  if (g.__settings && Date.now() - g.__settings.at < CACHE_MS) return g.__settings.value;
  let value = DEFAULT_SETTINGS;
  try {
    const raw = await settingsStore.read(FILE);
    const saved = (raw ? JSON.parse(raw.toString('utf8')) : {}) as Partial<StoredSettings>;
    value = {
      ...DEFAULT_SETTINGS,
      ...saved,
      rateLimit: { ...DEFAULT_SETTINGS.rateLimit, ...saved.rateLimit },
      config: { ...saved.config },
    };
  } catch {
    // Fall back to defaults
  }
  g.__settings = { value, at: Date.now() };
  return value;
}

export async function updateSettings(change: Partial<StoredSettings>): Promise<StoredSettings> {
  const settings = { ...(await getSettings()), ...change };
  await settingsStore.write(FILE, JSON.stringify(settings, null, 2), 'application/json');
  g.__settings = { value: settings, at: Date.now() };
  return settings;
}

export function validateRateLimit(input: Partial<RateLimitSettings>): RateLimitSettings | string {
  const { enabled, maxRequests, windowSeconds } = input;
  if (typeof enabled !== 'boolean') return 'enabled must be true or false';
  if (!Number.isInteger(maxRequests) || maxRequests! < 1 || maxRequests! > 100000) {
    return 'Max requests must be a whole number between 1 and 100000';
  }
  if (!Number.isInteger(windowSeconds) || windowSeconds! < 1 || windowSeconds! > 86400) {
    return 'Window must be between 1 second and 1 day';
  }
  return { enabled, maxRequests: maxRequests!, windowSeconds: windowSeconds! };
}
