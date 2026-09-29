import { getConfig } from './config';
import { getEs, type PhotoDoc } from './es';
import { settingsStore } from './object-store';

// General-purpose embeddings put every face close together (cosine 0.85-0.98), so faces are
// compared after subtracting the average face, which spreads same-person and different-person scores apart

interface FaceStats {
  // Vectors from different models can't be averaged together
  inferenceId: string;
  count: number;
  // Sum of unit-length face vectors
  sum: number[];
}

const FILE = 'face-stats.json';
// Below this many faces the average is too noisy to help
const MIN_FACES = 20;
const CACHE_MS = 60_000;

const g = globalThis as typeof globalThis & { __faceStats?: { value: FaceStats | null; at: number } };

export function unit(v: number[]): number[] {
  const norm = Math.hypot(...v) || 1;
  return v.map((x) => x / norm);
}

async function load(): Promise<FaceStats | null> {
  const raw = await settingsStore.read(FILE);
  return raw ? (JSON.parse(raw.toString('utf8')) as FaceStats) : null;
}

async function save(stats: FaceStats): Promise<void> {
  await settingsStore.write(FILE, JSON.stringify(stats), 'application/json');
  g.__faceStats = { value: stats, at: Date.now() };
}

// Sum every stored face; used when the stats are missing or from another model
async function rebuild(inferenceId: string): Promise<FaceStats> {
  const [es, { esIndex }] = await Promise.all([getEs(), getConfig()]);
  const stats: FaceStats = { inferenceId, count: 0, sum: [] };
  const pit = await es.openPointInTime({ index: esIndex, keep_alive: '1m' });
  let after: (string | number)[] | undefined;
  try {
    for (;;) {
      const page = await es.search<Pick<PhotoDoc, 'faces'>>({
        size: 100,
        query: { range: { face_count: { gt: 0 } } },
        _source: false,
        pit: { id: pit.id, keep_alive: '1m' },
        sort: ['_shard_doc'],
        search_after: after,
      });
      const hits = page.hits.hits;
      if (hits.length === 0) break;
      after = hits[hits.length - 1].sort as (string | number)[];
      // Search responses leave out nested vectors, so fetch them by id
      const docs = await es.mget<Pick<PhotoDoc, 'faces'>>({
        index: esIndex,
        ids: hits.map((h) => h._id!),
        _source_includes: ['faces'],
      });
      for (const doc of docs.docs) {
        if ('found' in doc && doc.found) for (const f of doc._source?.faces ?? []) add(stats, f.vector);
      }
    }
  } finally {
    await es.closePointInTime({ id: pit.id }).catch(() => {});
  }
  await save(stats);
  return stats;
}

function add(stats: FaceStats, vector: number[]) {
  const v = unit(vector);
  if (stats.sum.length === 0) stats.sum = new Array(v.length).fill(0);
  if (stats.sum.length !== v.length) return;
  v.forEach((x, i) => (stats.sum[i] += x));
  stats.count++;
}

async function current(): Promise<FaceStats | null> {
  if (g.__faceStats && Date.now() - g.__faceStats.at < CACHE_MS) return g.__faceStats.value;
  const { inferenceId } = await getConfig();
  let stats = await load();
  if (!stats || stats.inferenceId !== inferenceId) stats = await rebuild(inferenceId);
  g.__faceStats = { value: stats, at: Date.now() };
  return stats;
}

// Record newly stored faces
export async function addFaces(vectors: number[][]): Promise<void> {
  const stats = await current();
  if (!stats) return;
  vectors.forEach((v) => add(stats, v));
  await save(stats);
}

// The average face, or null while there are too few faces for it to be reliable
export async function averageFace(): Promise<number[] | null> {
  const stats = await current();
  if (!stats || stats.count < MIN_FACES) return null;
  return stats.sum.map((x) => x / stats.count);
}

// Cosine similarity after subtracting the average face
export function centeredSimilarity(a: number[], b: number[], mean: number[] | null): number {
  const [x, y] = mean ? [unit(a).map((v, i) => v - mean[i]), unit(b).map((v, i) => v - mean[i])] : [a, b];
  const dot = x.reduce((s, v, i) => s + v * y[i], 0);
  return dot / ((Math.hypot(...x) || 1) * (Math.hypot(...y) || 1));
}
