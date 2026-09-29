import { getConfig } from '../lib/config';
import { embedImages } from '../lib/embeddings';
import { getEs, type PhotoDoc } from '../lib/es';
import { testConnection } from '../lib/index-setup';
import { readImage } from '../lib/storage';

// Re-embed every indexed photo from its stored image with the current INFERENCE_ID, e.g. after switching models
const BATCH = 4;
const RETRIES = 4;

// The inference service throttles bursts with 429s, so wait and retry
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const status = (err as { meta?: { statusCode?: number } }).meta?.statusCode;
      if (attempt > RETRIES || (status !== 429 && status !== 408 && status !== 503)) throw err;
      const wait = 5000 * 2 ** (attempt - 1);
      console.log(`  Throttled (${status}), retrying in ${wait / 1000}s`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

async function main() {
  const [es, config] = await Promise.all([getEs(), getConfig()]);
  const { dims, indexExists, indexDims, docCount } = await testConnection(config);
  if (!indexExists) throw new Error(`Index "${config.esIndex}" doesn't exist`);
  if (indexDims !== dims) {
    throw new Error(
      `${config.inferenceId} returns ${dims}-d vectors but the index holds ${indexDims}-d ones; recreate the index and re-upload instead`,
    );
  }
  console.log(`Re-embedding ${docCount} photos in "${config.esIndex}" with ${config.inferenceId}`);

  let done = 0;
  const missing: string[] = [];
  let after: (string | number)[] | undefined;
  // A point in time keeps paging stable while documents are updated
  const pit = await es.openPointInTime({ index: config.esIndex, keep_alive: '5m' });
  for (;;) {
    const page = await es.search<Pick<PhotoDoc, 'file' | 'filename'>>({
      size: BATCH,
      _source: ['file', 'filename'],
      pit: { id: pit.id, keep_alive: '5m' },
      sort: ['_shard_doc'],
      search_after: after,
    });
    const hits = page.hits.hits;
    if (hits.length === 0) break;
    after = hits[hits.length - 1].sort as (string | number)[];

    const images = await Promise.all(hits.map((h) => readImage(h._source!.file)));
    const found = hits.flatMap((h, k) => {
      const image = images[k];
      if (!image) missing.push(h._source!.filename);
      return image ? [{ id: h._id!, image }] : [];
    });
    if (found.length === 0) continue;

    const vectors = await withRetry(() => embedImages(found.map((f) => f.image)));
    const bulk = await es.bulk({
      operations: found.flatMap((f, k) => [
        { update: { _index: config.esIndex, _id: f.id } },
        { doc: { clip_vector: vectors[k] } },
      ]),
    });
    if (bulk.errors) throw new Error('Some updates failed: ' + JSON.stringify(bulk.items.find((i) => i.update?.error)));
    done += found.length;
    console.log(`  ${done} / ${docCount}`);
  }

  await es.closePointInTime({ id: pit.id });
  await es.indices.refresh({ index: config.esIndex });
  console.log(`Done: ${done} re-embedded.`);
  if (missing.length) console.log(`No stored image for ${missing.length}, left unchanged: ${missing.join(', ')}`);
}

main().catch((err) => {
  console.error(err.meta?.body ?? err.message ?? err);
  process.exit(1);
});
