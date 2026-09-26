import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySession } from './auth';
import { getSettings } from './settings';
import type { RateLimitSettings } from './types';

// In-memory fixed-window limiter per IP (single process; use Redis to scale out)

interface Bucket {
  count: number;
  resetAt: number;
}

interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetIn: number;
}

const MAX_BUCKETS = 10_000;

const g = globalThis as typeof globalThis & { __rateBuckets?: Map<string, Bucket> };
const buckets = (g.__rateBuckets ??= new Map<string, Bucket>());

function sweep(now: number) {
  for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
}

function checkRateLimit(key: string, { maxRequests, windowSeconds }: RateLimitSettings): RateLimitResult {
  const now = Date.now();
  if (buckets.size > MAX_BUCKETS) sweep(now);

  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowSeconds * 1000 };
    buckets.set(key, bucket);
  }
  bucket.count++;

  return {
    allowed: bucket.count <= maxRequests,
    limit: maxRequests,
    remaining: Math.max(0, maxRequests - bucket.count),
    resetIn: Math.ceil((bucket.resetAt - now) / 1000),
  };
}

function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  return forwarded?.split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown';
}

// Returns headers to attach, or a 429 response when the client is over the limit
export async function enforceRateLimit(
  req: NextRequest,
): Promise<{ headers: Record<string, string>; blocked?: NextResponse }> {
  const { rateLimit } = await getSettings();
  const isAdmin = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!rateLimit.enabled || isAdmin) return { headers: {} };

  const result = checkRateLimit(clientIp(req), rateLimit);
  const headers = {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(result.resetIn),
  };
  if (result.allowed) return { headers };

  const blocked = NextResponse.json(
    { error: `Too many searches. Try again in ${result.resetIn}s.`, retryAfter: result.resetIn },
    { status: 429, headers: { ...headers, 'Retry-After': String(result.resetIn) } },
  );
  return { headers, blocked };
}
