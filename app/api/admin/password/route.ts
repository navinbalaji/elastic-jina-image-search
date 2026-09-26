import { NextResponse } from 'next/server';
import { changeAdminPassword } from '@/lib/admin-password';
import { jsonError } from '@/lib/http';
import { MIN_PASSWORD_LENGTH } from '@/lib/types';

export const runtime = 'nodejs';

export async function PUT(req: Request) {
  const { current, next } = (await req.json().catch(() => ({}))) as { current?: unknown; next?: unknown };
  if (typeof current !== 'string' || typeof next !== 'string') return jsonError('Enter both passwords', 400);
  if (next.length < MIN_PASSWORD_LENGTH) {
    return jsonError(`New password must be at least ${MIN_PASSWORD_LENGTH} characters`, 400);
  }
  if (!(await changeAdminPassword(current, next))) {
    // Slow down guessing
    await new Promise((r) => setTimeout(r, 800));
    return jsonError('Current password is incorrect', 400);
  }
  return NextResponse.json({ ok: true });
}
