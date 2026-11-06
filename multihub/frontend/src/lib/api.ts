// Always an absolute URL pointing at Kong (the API gateway) — set by
// docker-compose.yml to http://localhost:8000 in the Dockerized stack.
// frontend-nginx (serving this app, port 80) and Kong (port 8000) are
// deliberately separate containers/origins; Kong's CORS config
// (infra/kong/declarative/kong.yml) explicitly allows the frontend's
// origins. Falls back to the backend's own port only if the env var is
// entirely unset (e.g. running the frontend standalone with no Kong).
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/** For links the browser must navigate to directly (not fetch), like
 *  starting the Google OAuth redirect flow. */
export function apiUrl(path: string): string {
  return `${API_URL}${path}`;
}

/** Resolve a stored asset URL (e.g. "/uploads/x.png" from local storage) to
 *  something an <img> can load. Absolute URLs pass through. */
export function assetUrl(url?: string | null): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url) || url.startsWith('data:')) return url;
  return `${API_URL}${url.startsWith('/') ? '' : '/'}${url}`;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const AUTH_EVENT = 'multihub:auth';

function emitAuthChange() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(AUTH_EVENT));
}

export function onAuthChange(cb: () => void): () => void {
  window.addEventListener(AUTH_EVENT, cb);
  window.addEventListener('storage', cb); // other tabs
  return () => {
    window.removeEventListener(AUTH_EVENT, cb);
    window.removeEventListener('storage', cb);
  };
}

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('accessToken');
}

// One refresh at a time: if several requests 401 together they all await the
// same refresh (rotation invalidates the old token, so parallel refreshes
// would log the user out).
let refreshing: Promise<boolean> | null = null;

export async function refreshSession(): Promise<boolean> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const refreshToken = typeof window !== 'undefined' ? localStorage.getItem('refreshToken') : null;
    if (!refreshToken) return false;
    try {
      const res = await fetch(`${API_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      saveSession(data.accessToken, data.refreshToken, data.user);
      return true;
    } catch {
      return false;
    } finally {
      setTimeout(() => { refreshing = null; }, 0);
    }
  })();
  return refreshing;
}

function messageFrom(data: any, fallback: string): string {
  const m = data?.message;
  if (Array.isArray(m)) return m.join('. ');
  return typeof m === 'string' && m ? m : fallback;
}

async function request(path: string, options: RequestInit = {}, retry = true): Promise<any> {
  const token = getToken();
  const isForm = typeof FormData !== 'undefined' && options.body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        ...(isForm ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new ApiError('Cannot reach the server. Check that the API gateway is running.', 0);
  }

  if (res.status === 401 && retry && token && !path.startsWith('/api/auth/')) {
    if (await refreshSession()) return request(path, options, false);
    clearSession();
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    }
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(messageFrom(data, `Request failed (${res.status})`), res.status);
  return data;
}

const json = (body?: unknown) => (body === undefined ? undefined : JSON.stringify(body));

export const api = {
  get: (path: string) => request(path),
  post: (path: string, body?: unknown) => request(path, { method: 'POST', body: json(body) }),
  patch: (path: string, body?: unknown) => request(path, { method: 'PATCH', body: json(body) }),
  put: (path: string, body?: unknown) => request(path, { method: 'PUT', body: json(body) }),
  del: (path: string) => request(path, { method: 'DELETE' }),
  upload: (path: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request(path, { method: 'POST', body: form });
  },
};

export function saveSession(accessToken: string, refreshToken: string, user: unknown) {
  localStorage.setItem('accessToken', accessToken);
  localStorage.setItem('refreshToken', refreshToken);
  localStorage.setItem('user', JSON.stringify(user));
  emitAuthChange();
}

export function updateStoredUser(user: unknown) {
  localStorage.setItem('user', JSON.stringify(user));
  emitAuthChange();
}

export function clearSession() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
  emitAuthChange();
}

/** Revoke the refresh token server-side, then clear local state. */
export async function logout() {
  const refreshToken = localStorage.getItem('refreshToken');
  if (refreshToken) {
    await fetch(`${API_URL}/api/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    }).catch(() => {});
  }
  clearSession();
}

export function getCurrentUser(): any | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
