import { getConfig } from './config';
import { getEs, type PhotoDoc } from './es';
import { embedImage } from './embeddings';
import { readImage } from './storage';
import type { SearchHit } from './types';

export async function knnSearch(
  vector: number[],
  { k = 30, excludeId }: { k?: number; excludeId?: string } = {},
): Promise<SearchHit[]> {
  const [es, { esIndex }] = await Promise.all([getEs(), getConfig()]);
  const res = await es.search<PhotoDoc>({
    index: esIndex,
    knn: {
      field: 'clip_vector',
      query_vector: vector,
      k,
      num_candidates: Math.max(100, k * 10),
      ...(excludeId ? { filter: { bool: { must_not: { ids: { values: [excludeId] } } } } } : {}),
    },
    size: k,
    _source: ['filename', 'file'],
  });
  return res.hits.hits.map((h) => ({
    id: h._id!,
    filename: h._source!.filename,
    url: `/api/images/${h._source!.file}`,
    score: toCosine(h._score ?? 0),
  }));
}

// Elasticsearch scores cosine kNN as (1 + cosine) / 2, so convert back to raw similarity
function toCosine(score: number) {
  return Math.max(0, 2 * score - 1);
}

// Newer Elasticsearch versions may omit vectors from _source, so re-embed as a fallback
export async function getVector(id: string): Promise<number[] | null> {
  const [es, { esIndex }] = await Promise.all([getEs(), getConfig()]);
  const res = await es.get<Partial<PhotoDoc>>(
    { index: esIndex, id, _source_includes: ['clip_vector', 'file'] },
    { ignore: [404] },
  );
  if (!res.found || !res._source) return null;
  if (res._source.clip_vector?.length) return res._source.clip_vector;
  const image = res._source.file ? await readImage(res._source.file) : null;
  return image ? embedImage(image) : null;
}
