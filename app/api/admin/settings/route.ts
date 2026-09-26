import { NextResponse } from 'next/server';
import { jsonError } from '@/lib/http';
import { getSettings, updateSettings, validateRateLimit } from '@/lib/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Admin-only via middleware.ts
export async function GET() {
  const { rateLimit } = await getSettings();
  return NextResponse.json({ rateLimit });
}

export async function PUT(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { rateLimit?: object };
  const rateLimit = validateRateLimit(body.rateLimit ?? {});
  if (typeof rateLimit === 'string') return jsonError(rateLimit, 400);

  await updateSettings({ rateLimit });
  return NextResponse.json({ rateLimit });
}
