import { NextResponse } from 'next/server';
import { errorMessage } from '@/lib/errors';
import { jsonError } from '@/lib/http';
import { createIndex, IndexExistsError } from '@/lib/index-setup';

export const runtime = 'nodejs';

// Create the index, or drop and recreate it with { recreate: true }
export async function POST(req: Request) {
  const { recreate } = (await req.json().catch(() => ({}))) as { recreate?: boolean };
  try {
    return NextResponse.json(await createIndex({ recreate: recreate === true }));
  } catch (err) {
    return jsonError(errorMessage(err), err instanceof IndexExistsError ? 409 : 502);
  }
}
