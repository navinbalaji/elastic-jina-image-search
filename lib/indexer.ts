import { getConfig } from './config';
import { errorMessage } from './errors';
import { getEs, type PhotoDoc } from './es';
import { embedImages } from './embeddings';
import { extensionFor, IMAGE_TYPES, saveImage, sha256 } from './storage';
import type { IngestResult } from './types';

interface IngestFile {
  filename: string;
  buffer: Buffer;
  contentType?: string;
  // SHA-256 of the original file when the browser resized it; used as the id so duplicates still match
  hash?: string;
}

// Dedupe, store, embed and bulk-index a batch of images
export async function indexImages(files: IngestFile[]): Promise<IngestResult[]> {
  const [es, { esIndex }] = await Promise.all([getEs(), getConfig()]);
  const results: IngestResult[] = files.map((f) => ({ filename: f.filename, status: 'error' }));

  const candidates: { i: number; id: string; ext: string }[] = [];
  const seen = new Set<string>();
  files.forEach((f, i) => {
    const ext = extensionFor(f.filename, f.contentType);
    if (!ext) {
      results[i].error = 'Unsupported file type';
      return;
    }
    const id = f.hash ?? sha256(f.buffer);
    results[i].id = id;
    if (seen.has(id)) {
      results[i].status = 'duplicate';
      return;
    }
    seen.add(id);
    candidates.push({ i, id, ext });
  });
  if (candidates.length === 0) return results;

  const existing = await es.mget({ index: esIndex, ids: candidates.map((c) => c.id), _source: false });
  const exists = new Set(existing.docs.filter((d) => 'found' in d && d.found).map((d) => d._id));
  const todo = candidates.filter((c) => {
    if (!exists.has(c.id)) return true;
    results[c.i].status = 'duplicate';
    return false;
  });
  if (todo.length === 0) return results;

  let vectors: number[][];
  try {
    vectors = await embedImages(todo.map((c) => ({ buffer: files[c.i].buffer, contentType: IMAGE_TYPES[c.ext] })));
  } catch (err) {
    for (const c of todo) results[c.i].error = errorMessage(err);
    return results;
  }

  const operations: object[] = [];
  await Promise.all(
    todo.map(async (c, k) => {
      const f = files[c.i];
      const file = `${c.id}${c.ext}`;
      await saveImage(file, f.buffer);
      const doc: PhotoDoc = {
        filename: f.filename,
        file,
        content_type: IMAGE_TYPES[c.ext],
        size: f.buffer.length,
        created_at: new Date().toISOString(),
        clip_vector: vectors[k],
      };
      operations[2 * k] = { index: { _index: esIndex, _id: c.id } };
      operations[2 * k + 1] = doc;
    }),
  );

  const bulk = await es.bulk({ operations, refresh: 'wait_for' });
  bulk.items.forEach((item, k) => {
    const r = results[todo[k].i];
    if (item.index?.error) r.error = item.index.error.reason ?? 'Index error';
    else r.status = 'indexed';
  });
  return results;
}
