import { NextResponse } from 'next/server';
import { applyUpdate, describeConfig, validateConfigUpdate } from '@/lib/config';
import { jsonError } from '@/lib/http';
import { getSettings, updateSettings } from '@/lib/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Admin-only via middleware.ts
export async function GET() {
  return NextResponse.json(await describeConfig());
}

export async function PUT(req: Request) {
  const update = validateConfigUpdate(await req.json().catch(() => null));
  if (typeof update === 'string') return jsonError(update, 400);

  await updateSettings({ config: applyUpdate((await getSettings()).config, update) });
  return NextResponse.json(await describeConfig());
}
