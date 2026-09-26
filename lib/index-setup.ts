import { createClient, getEs, indexMappings } from './es';
import { embedText } from './embeddings';
import { getConfig, type AppConfig } from './config';
import type { ConnectionTest } from './types';

export class IndexExistsError extends Error {}

// Check the connection, the inference endpoint and the index for a given config
export async function testConnection(config: AppConfig): Promise<ConnectionTest> {
  const es = createClient(config.esEndpoint, config.esApiKey);
  try {
    const info = await es.info();
    const dims = (await embedText('test', { es, inferenceId: config.inferenceId })).length;
    const index = config.esIndex;
    const base = { version: info.version.number, inferenceId: config.inferenceId, dims, index };
    if (!(await es.indices.exists({ index }))) return { ...base, indexExists: false };

    const [mapping, { count }] = await Promise.all([es.indices.getMapping({ index }), es.count({ index })]);
    const vector = Object.values(mapping)[0]?.mappings.properties?.clip_vector as { dims?: number } | undefined;
    return { ...base, indexExists: true, indexDims: vector?.dims, docCount: count };
  } finally {
    await es.close();
  }
}

// Create the index, sized to what the inference endpoint returns
export async function createIndex({ recreate = false } = {}): Promise<{ index: string; dims: number }> {
  const [es, { esIndex: index }] = await Promise.all([getEs(), getConfig()]);
  const dims = (await embedText('test')).length;
  if (await es.indices.exists({ index })) {
    if (!recreate) throw new IndexExistsError(`Index "${index}" already exists`);
    await es.indices.delete({ index });
  }
  await es.indices.create({ index, mappings: indexMappings(dims) });
  return { index, dims };
}
