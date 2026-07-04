import type { TripDetail, TripRow, UserRow } from '@travel-plan/shared';

export class NetworkError extends Error {
  constructor() {
    super("You appear to be offline — couldn't reach the server.");
    this.name = 'NetworkError';
  }
}

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const init: RequestInit = {
    method,
    credentials: 'include',
    headers: { Accept: 'application/json' },
  };
  if (body !== undefined) {
    (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  // fetch rejects only when no response arrives at all (offline, DNS,
  // service-worker cache miss) — surface that distinctly from HTTP errors.
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    throw new NetworkError();
  }

  // Parse JSON when present; tolerate empty bodies (e.g. 204).
  const text = await res.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!res.ok) {
    const message =
      (parsed && typeof parsed === 'object' && 'error' in parsed && typeof (parsed as { error: unknown }).error === 'string'
        ? (parsed as { error: string }).error
        : undefined) ?? `Request failed (${res.status})`;
    throw new ApiError(res.status, message, parsed);
  }

  return parsed as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body ?? {}),
  del: <T>(path: string) => request<T>('DELETE', path),
};

/* ---- Typed convenience endpoints ---- */

export interface MeResponse {
  user: UserRow | null;
}

export interface ShareResponse {
  url: string;
  token: string;
}

export interface AppConfig {
  googleClientId: string | null;
}

export const getConfig = () => api.get<AppConfig>('/api/config');

export const getShared = (token: string) => api.get<TripDetail>(`/api/shared/${encodeURIComponent(token)}`);
export const getTrip = (id: string) => api.get<TripDetail>(`/api/trips/${encodeURIComponent(id)}`);
export const listTrips = () => api.get<TripRow[]>('/api/trips');
export const me = () => api.get<MeResponse>('/api/auth/me');
export const googleLogin = (credential: string) =>
  api.post<MeResponse>('/api/auth/google', { credential });
export const logout = () => api.post<{ ok: true }>('/api/auth/logout');
export const createShare = (tripId: string) =>
  api.post<ShareResponse>(`/api/trips/${encodeURIComponent(tripId)}/share`);
