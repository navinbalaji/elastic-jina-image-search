import { NextResponse } from 'next/server';
import { getConfig, validateConfigUpdate } from '@/lib/config';
import { errorMessage } from '@/lib/errors';
import { jsonError } from '@/lib/http';
import { testConnection } from '@/lib/index-setup';

export const runtime = 'nodejs';

// Test unsaved changes before saving them
export async function POST(req: Request) {
  const update = validateConfigUpdate(await req.json().catch(() => ({})));
  if (typeof update === 'string') return jsonError(update, 400);
  try {
    return NextResponse.json(await testConnection(await getConfig(update)));
  } catch (err) {
    return jsonError(errorMessage(err), 502);
  }
}
