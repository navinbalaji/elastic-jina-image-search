// Types shared by the API routes and the UI (keep this file free of server-only imports)

export interface SearchHit {
  id: string;
  filename: string;
  url: string;
  score: number;
}

export type IngestStatus = 'indexed' | 'duplicate' | 'error';

export interface IngestResult {
  filename: string;
  id?: string;
  status: IngestStatus;
  error?: string;
}

export interface RateLimitSettings {
  enabled: boolean;
  maxRequests: number;
  windowSeconds: number;
}

export interface AppSettings {
  rateLimit: RateLimitSettings;
}

export const MIN_PASSWORD_LENGTH = 8;

export type ConfigKey = 'esEndpoint' | 'esApiKey' | 'esIndex' | 'inferenceId';

// Where a config value comes from: saved in the admin panel, .env, a built-in default, or nowhere
export type ConfigSource = 'admin' | 'env' | 'default' | 'unset';

// An empty string removes the admin override; omitted keys stay unchanged
export type ConfigUpdate = Partial<Record<ConfigKey, string>>;

export interface ConfigView {
  // The API key is never sent to the browser
  values: Record<Exclude<ConfigKey, 'esApiKey'>, string>;
  sources: Record<ConfigKey, ConfigSource>;
  dataDir: string;
}

export interface ConnectionTest {
  version: string;
  inferenceId: string;
  dims: number;
  index: string;
  indexExists: boolean;
  indexDims?: number;
  docCount?: number;
}
