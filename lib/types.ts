// Types shared by the API routes and the UI (keep this file free of server-only imports)

// Face position as fractions of the photo: [x, y, width, height]
export type FaceBox = [number, number, number, number];

export interface SearchHit {
  id: string;
  filename: string;
  url: string;
  score: number;
  // Best matching face, for face searches
  face?: { index: number; box: FaceBox };
}

// An indexed photo whose faces haven't been scanned yet
export interface PendingPhoto {
  id: string;
  filename: string;
  url: string;
}

export const MAX_FACES_PER_PHOTO = 50;
// Detector confidence below which a "face" is usually a hand, a phone or the back of a head
export const MIN_FACE_CONFIDENCE = 0.7;

export type IngestStatus = 'indexed' | 'duplicate' | 'error';

export interface IngestResult {
  filename: string;
  id?: string;
  status: IngestStatus;
  error?: string;
  // Faces found, once the photo has been scanned
  faces?: number;
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
  // Where admin settings are saved: a local path or an S3 URL
  settingsLocation: string;
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
