import { getEs } from '../lib/es';
import { createIndex, IndexExistsError } from '../lib/index-setup';

async function main() {
  const info = await (await getEs()).info();
  console.log(`Connected to Elasticsearch ${info.version.number}`);

  const recreate = process.argv.includes('--recreate');
  try {
    const { index, dims } = await createIndex({ recreate });
    console.log(`${recreate ? 'Recreated' : 'Created'} index "${index}" for ${dims}-d embeddings.`);
  } catch (err) {
    if (!(err instanceof IndexExistsError)) throw err;
    console.log(`${err.message} (use --recreate to drop it).`);
  }
}

main().catch((err) => {
  console.error(err.meta?.body ?? err);
  process.exit(1);
});
