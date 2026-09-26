// Browser helper for calling this app's API routes

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: Record<string, unknown>,
  ) {
    super(message);
  }
}

export async function fetchJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(body.error || `Request failed (${res.status})`, res.status, body);
  return body as T;
}

export function postJson<T>(url: string, data: unknown, method = 'POST'): Promise<T> {
  return fetchJson<T>(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
}
