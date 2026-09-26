import { DATA_DIR, getSettings } from './settings';
import type { ConfigKey, ConfigSource, ConfigUpdate, ConfigView } from './types';

export interface AppConfig {
  esEndpoint?: string;
  esApiKey?: string;
  esIndex: string;
  inferenceId: string;
}

const ENV: Record<ConfigKey, () => string | undefined> = {
  esEndpoint: () => process.env.ES_URL || process.env.ES_CLOUD_ID,
  esApiKey: () => process.env.ES_API_KEY,
  esIndex: () => process.env.ES_INDEX,
  inferenceId: () => process.env.INFERENCE_ID,
};

const DEFAULTS: ConfigUpdate = { esIndex: 'photos', inferenceId: '.jina-clip-v2' };

const KEYS = Object.keys(ENV) as ConfigKey[];

// Admin overrides win over .env, which wins over the defaults
function resolve(key: ConfigKey, overrides: ConfigUpdate): { value?: string; source: ConfigSource } {
  if (overrides[key]) return { value: overrides[key], source: 'admin' };
  const env = ENV[key]();
  if (env) return { value: env, source: 'env' };
  if (DEFAULTS[key]) return { value: DEFAULTS[key], source: 'default' };
  return { source: 'unset' };
}

export function applyUpdate(overrides: ConfigUpdate, update: ConfigUpdate): ConfigUpdate {
  const next = { ...overrides };
  for (const key of KEYS) {
    if (update[key] === undefined) continue;
    if (update[key]) next[key] = update[key];
    else delete next[key];
  }
  return next;
}

// Current config, optionally with unsaved changes applied (used to test before saving)
export async function getConfig(update: ConfigUpdate = {}): Promise<AppConfig> {
  const overrides = applyUpdate((await getSettings()).config, update);
  return Object.fromEntries(KEYS.map((k) => [k, resolve(k, overrides).value])) as unknown as AppConfig;
}

export async function describeConfig(): Promise<ConfigView> {
  const settings = await getSettings();
  const resolved = Object.fromEntries(KEYS.map((k) => [k, resolve(k, settings.config)]));
  return {
    values: {
      esEndpoint: resolved.esEndpoint.value ?? '',
      esIndex: resolved.esIndex.value ?? '',
      inferenceId: resolved.inferenceId.value ?? '',
    },
    sources: Object.fromEntries(KEYS.map((k) => [k, resolved[k].source])) as ConfigView['sources'],
    dataDir: DATA_DIR,
  };
}

const RULES: Record<ConfigKey, { test: (v: string) => boolean; message: string }> = {
  esEndpoint: {
    test: (v) => (v.startsWith('http') ? URL.canParse(v) : /^\S+:\S+$/.test(v)),
    message: 'Elasticsearch endpoint must be an http(s) URL or an Elastic Cloud ID',
  },
  esApiKey: { test: (v) => !/\s/.test(v), message: 'API key must not contain spaces' },
  esIndex: {
    test: (v) => /^[a-z0-9][a-z0-9._-]{0,254}$/.test(v),
    message: 'Index name must be lowercase letters, numbers, ".", "_" or "-"',
  },
  inferenceId: {
    test: (v) => /^[\w.-]+$/.test(v),
    message: 'Inference endpoint ID must be letters, numbers, ".", "_" or "-"',
  },
};

export function validateConfigUpdate(input: unknown): ConfigUpdate | string {
  if (!input || typeof input !== 'object') return 'Expected a config object';
  const update: ConfigUpdate = {};
  for (const [key, raw] of Object.entries(input)) {
    if (!(key in RULES)) return `Unknown setting ${key}`;
    if (typeof raw !== 'string') return `${key} must be a string`;
    const value = raw.trim();
    const rule = RULES[key as ConfigKey];
    if (value && !rule.test(value)) return rule.message;
    update[key as ConfigKey] = value;
  }
  return update;
}
