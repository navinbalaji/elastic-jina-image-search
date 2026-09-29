import { Client } from '@elastic/elasticsearch';
import { getConfig } from './config';
import type { FaceBox } from './types';

export function createClient(endpoint?: string, apiKey?: string): Client {
  if (!endpoint) throw new Error('Elasticsearch endpoint is not set (admin panel, ES_URL or ES_CLOUD_ID)');
  if (!apiKey) throw new Error('Elasticsearch API key is not set (admin panel or ES_API_KEY)');
  const auth = { apiKey };
  // Accept a URL (Serverless, hosted or self-managed) or an Elastic Cloud ID
  return endpoint.startsWith('http')
    ? new Client({ node: endpoint, auth })
    : new Client({ cloud: { id: endpoint }, auth });
}

let cached: { key: string; client: Client } | undefined;

// Reuse one client until the connection settings change
export async function getEs(): Promise<Client> {
  const { esEndpoint, esApiKey } = await getConfig();
  const key = `${esEndpoint}\n${esApiKey}`;
  if (cached?.key !== key) {
    const client = createClient(esEndpoint, esApiKey);
    cached?.client.close().catch(() => {});
    cached = { key, client };
  }
  return cached.client;
}

export interface PhotoDoc {
  filename: string;
  file: string;
  content_type: string;
  size: number;
  created_at: string;
  clip_vector: number[];
  // One entry per face; set with face_count once the photo has been scanned
  faces?: FaceDoc[];
  face_count?: number;
}

export interface FaceDoc {
  box: FaceBox;
  score: number;
  vector: number[];
}

// Faces are nested so kNN ranks each photo by its best matching face
export function faceMappings(dims: number) {
  return {
    face_count: { type: 'integer' },
    faces: {
      type: 'nested',
      properties: {
        box: { type: 'float', index: false },
        score: { type: 'float', index: false },
        vector: { type: 'dense_vector', dims, index: true, similarity: 'cosine' },
      },
    },
  } as const;
}

export function indexMappings(dims: number) {
  return {
    properties: {
      filename: { type: 'keyword' },
      file: { type: 'keyword', index: false },
      content_type: { type: 'keyword' },
      size: { type: 'long' },
      created_at: { type: 'date' },
      clip_vector: { type: 'dense_vector', dims, index: true, similarity: 'cosine' },
      ...faceMappings(dims),
    },
  } as const;
}
