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

    const results = await indexImages(
      await Promise.all(
        files.map(async (f) => ({ filename: f.name, contentType: f.type, buffer: Buffer.from(await f.arrayBuffer()) })),
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
