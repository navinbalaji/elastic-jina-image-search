// Session cookie is `<expiry>.<hmac>`; Web Crypto keeps it edge and node compatible
export const SESSION_COOKIE = 'admin_session';
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

const encoder = new TextEncoder();

function secret(): string | undefined {
  return process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD;
}

async function hmac(key: string, data: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function isAuthConfigured(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD);
}

// Compare HMAC digests for a constant-time check
export async function checkPassword(input: string): Promise<boolean> {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  const [a, b] = await Promise.all([hmac('password-check', input), hmac('password-check', expected)]);
  return timingSafeEqual(a, b);
}

export async function createSession(): Promise<string> {
  const key = secret();
  if (!key) throw new Error('ADMIN_PASSWORD is not set');
  const exp = String(Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS);
  return `${exp}.${await hmac(key, exp)}`;
}

export async function verifySession(token: string | undefined): Promise<boolean> {
  const key = secret();
  if (!key || !token) return false;
  const [exp, sig] = token.split('.');
  if (!exp || !sig || Number(exp) < Date.now() / 1000) return false;
  return timingSafeEqual(sig, await hmac(key, exp));
}
