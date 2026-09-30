import { NextResponse } from 'next/server';
import { getConfig } from '@/lib/config';
import { getEs } from '@/lib/es';
import { errorMessage } from '@/lib/errors';
import { jsonError } from '@/lib/http';
import { indexImages } from '@/lib/indexer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const files = form.getAll('files').filter((f): f is File => f instanceof File);
    if (files.length === 0) return jsonError('No files uploaded', 400);
    // Optional SHA-256 of each original, sent when the browser resized the photo
    const hashes = form.getAll('hashes').map(String);

    const results = await indexImages(
      await Promise.all(
        files.map(async (f, i) => ({
          filename: f.name,
          contentType: f.type,
          buffer: Buffer.from(await f.arrayBuffer()),
          hash: /^[a-f0-9]{64}$/.test(hashes[i] ?? '') ? hashes[i] : undefined,
        })),
      ),
    );
    return NextResponse.json({ results });
  } catch (err) {
    return jsonError(errorMessage(err), 500);
  }
}

// Indexed photo count for the admin page
export async function GET() {
  try {
    const [es, { esIndex }] = await Promise.all([getEs(), getConfig()]);
    const { count } = await es.count({ index: esIndex });
    return NextResponse.json({ count });
  } catch (err) {
    return jsonError(errorMessage(err), 500);
  }
}
