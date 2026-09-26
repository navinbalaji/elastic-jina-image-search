import { NextResponse } from 'next/server';
import { jsonError } from '@/lib/http';
import { verifyAdminPassword } from '@/lib/admin-password';
import { createSession, isAuthConfigured, SESSION_COOKIE, SESSION_TTL_SECONDS } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  if (!isAuthConfigured()) {
    return jsonError('ADMIN_PASSWORD is not set in .env.local', 500);
  }
  const { password } = (await req.json().catch(() => ({}))) as { password?: string };
  if (!password || !(await verifyAdminPassword(password))) {
    // Slow down guessing
    await new Promise((r) => setTimeout(r, 800));
    return jsonError('Incorrect password', 401);
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSession(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
  return res;
}
