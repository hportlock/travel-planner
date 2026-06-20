import type { TripDetail, TripRow, UserRow } from '@travel-plan/shared';

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

  const res = await fetch(path, init);

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

export const getShared = (token: string) => api.get<TripDetail>(`/api/shared/${encodeURIComponent(token)}`);
export const getTrip = (id: string) => api.get<TripDetail>(`/api/trips/${encodeURIComponent(id)}`);
export const listTrips = () => api.get<TripRow[]>('/api/trips');
export const me = () => api.get<MeResponse>('/api/auth/me');
export const googleLogin = (credential: string) =>
  api.post<MeResponse>('/api/auth/google', { credential });
export const logout = () => api.post<{ ok: true }>('/api/auth/logout');
export const createShare = (tripId: string) =>
  api.post<ShareResponse>(`/api/trips/${encodeURIComponent(tripId)}/share`);
