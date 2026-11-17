export class ApiError extends Error {
  constructor(public status: number, message: string, public code: string, public data?: any) { super(message); }
}

/** Server clock offset (serverNow - Date.now()), updated from responses that include serverNow. */
export let serverOffset = 0;
export const serverNow = () => Date.now() + serverOffset;

async function request<T>(method: string, url: string, body?: unknown, retries = 1): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', 'x-playzo': '1' },
      body: body === undefined ? (method === 'GET' ? undefined : '{}') : JSON.stringify(body),
    });
  } catch {
    if (retries > 0 && method === 'GET') { await new Promise((r) => setTimeout(r, 600)); return request(method, url, body, retries - 1); }
    throw new ApiError(0, navigator.onLine
      ? "Can't reach the PLAYZO server. If you run PLAYZO on this computer, start it with start-playzo.cmd, then try again."
      : 'You appear to be offline. Check your connection and try again.', 'NETWORK');
  }
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  // 502/503/504 without a JSON body = a proxy in front of a stopped or restarting API server.
  if (!res.ok && !data && res.status >= 502 && res.status <= 504) throw new ApiError(res.status, "The PLAYZO server isn't responding. It may be starting up; try again in a moment.", 'SERVER_DOWN');
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `Request failed (${res.status})`, data?.code ?? 'ERROR', data);
  if (data && typeof data.serverNow === 'number') serverOffset = data.serverNow - Date.now();
  return data as T;
}

export const api = {
  get: <T = any>(url: string) => request<T>('GET', url),
  post: <T = any>(url: string, body?: unknown) => request<T>('POST', url, body ?? {}),
  patch: <T = any>(url: string, body?: unknown) => request<T>('PATCH', url, body ?? {}),
};

export function reportError(message: string, where: string) {
  api.post('/api/client-errors', { message, where }).catch(() => undefined);
}
export function trackEvent(name: string, props?: Record<string, unknown>) {
  api.post('/api/events', { name, props }).catch(() => undefined);
}
