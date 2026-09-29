import { getConfig } from './config';
import { embedImages } from './embeddings';
import { faceMappings, getEs, type FaceDoc, type PhotoDoc } from './es';
import { addFaces, averageFace, centeredSimilarity } from './face-stats';
import { MIN_FACE_CONFIDENCE, type FaceBox, type PendingPhoto, type SearchHit } from './types';

// Faces are detected and cropped in the browser; the server embeds each crop and stores it on the photo

export interface FaceCrop {
  box: FaceBox;
  score: number;
  buffer: Buffer;
}

// Embedding calls per request; the inference service times out on large batches
const EMBED_BATCH = 4;

// Indexes created before face search lack the faces field, so add it once per index
const g = globalThis as typeof globalThis & { __faceMapping?: Set<string> };
async function ensureFaceMapping(index: string): Promise<void> {
  g.__faceMapping ??= new Set();
  if (g.__faceMapping.has(index)) return;
  const es = await getEs();
  const mapping = Object.values(await es.indices.getMapping({ index }))[0]?.mappings.properties ?? {};
  if (!mapping.faces) {
    const dims = (mapping.clip_vector as { dims?: number } | undefined)?.dims;
    if (!dims) throw new Error(`Index "${index}" has no clip_vector field`);
    await es.indices.putMapping({ index, properties: faceMappings(dims) });
  }
  g.__faceMapping.add(index);
}

export async function setFaces(id: string, crops: FaceCrop[]): Promise<number> {
  const [es, { esIndex }] = await Promise.all([getEs(), getConfig()]);
  await ensureFaceMapping(esIndex);
  const vectors: number[][] = [];
  for (let i = 0; i < crops.length; i += EMBED_BATCH) {
    const batch = crops.slice(i, i + EMBED_BATCH);
    vectors.push(...(await embedImages(batch.map((c) => ({ buffer: c.buffer, contentType: 'image/jpeg' })))));
  }
  const faces: FaceDoc[] = crops.map((c, k) => ({ box: c.box, score: c.score, vector: vectors[k] }));
  await es.update({ index: esIndex, id, doc: { faces, face_count: faces.length }, refresh: 'wait_for' });
  await addFaces(vectors);
  return faces.length;
}

export async function photoExists(id: string): Promise<boolean> {
  const [es, { esIndex }] = await Promise.all([getEs(), getConfig()]);
  return es.exists({ index: esIndex, id });
}

// Photos indexed before face search, or whose scan failed
export async function pendingPhotos(limit: number): Promise<{ photos: PendingPhoto[]; total: number }> {
  const [es, { esIndex }] = await Promise.all([getEs(), getConfig()]);
  const res = await es.search<PhotoDoc>({
    index: esIndex,
    size: limit,
    query: { bool: { must_not: { exists: { field: 'face_count' } } } },
    _source: ['filename', 'file'],
    track_total_hits: true,
  });
  const total = typeof res.hits.total === 'number' ? res.hits.total : (res.hits.total?.value ?? 0);
  const photos = res.hits.hits.map((h) => ({
    id: h._id!,
    filename: h._source!.filename,
    url: `/api/images/${h._source!.file}`,
  }));
  return { photos, total };
}

// A stored face's vector, to search from a face in the results
export async function getFaceVector(id: string, index: number): Promise<number[] | null> {
  const [es, { esIndex }] = await Promise.all([getEs(), getConfig()]);
  const res = await es.get<Partial<PhotoDoc>>({ index: esIndex, id, _source_includes: ['faces'] }, { ignore: [404] });
  return res._source?.faces?.[index]?.vector ?? null;
}

// Photos considered before re-ranking; covers whole libraries of a few hundred photos
const CANDIDATES = 200;

// kNN finds candidate photos by raw similarity, then every face in them is re-scored against the average face
export async function faceSearch(
  vector: number[],
  { k = 30, excludeId }: { k?: number; excludeId?: string } = {},
): Promise<SearchHit[]> {
  const [es, { esIndex }, mean] = await Promise.all([getEs(), getConfig(), averageFace()]);
  await ensureFaceMapping(esIndex);
  const res = await es.search<PhotoDoc>({
    index: esIndex,
    knn: {
      field: 'faces.vector',
      query_vector: vector,
      k: CANDIDATES,
      num_candidates: CANDIDATES * 2,
      ...(excludeId ? { filter: { bool: { must_not: { ids: { values: [excludeId] } } } } } : {}),
    },
    size: CANDIDATES,
    _source: false,
  });
  const ids = res.hits.hits.map((h) => h._id!);
  if (ids.length === 0) return [];

  // Search responses leave out nested vectors, so fetch the faces separately
  const docs = await es.mget<PhotoDoc>({ index: esIndex, ids, _source_includes: ['filename', 'file', 'faces'] });
  const hits: SearchHit[] = [];
  for (const doc of docs.docs) {
    if (!('found' in doc) || !doc.found || !doc._source) continue;
    const { filename, file, faces = [] } = doc._source;
    let best: { index: number; box: FaceBox; score: number } | undefined;
    faces.forEach((face, index) => {
      if (!face.vector?.length || face.score < MIN_FACE_CONFIDENCE) return;
      const score = centeredSimilarity(vector, face.vector, mean);
      if (!best || score > best.score) best = { index, box: face.box, score };
    });
    if (best)
      hits.push({
        id: doc._id,
        filename,
        url: `/api/images/${file}`,
        score: Math.max(0, best.score),
        face: { index: best.index, box: best.box },
      });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, k);
}
