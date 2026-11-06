'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUser, onAuthChange } from '@/lib/api';

/** Reactive current user. `ready` is false until localStorage has been read (avoids SSR flashes). */
export function useAuth() {
  const [user, setUser] = useState<any | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const sync = () => setUser(getCurrentUser());
    sync();
    setReady(true);
    return onAuthChange(sync);
  }, []);
  return { user, ready };
}

/** Redirects to /login (remembering where to come back to) when logged out. */
export function useRequireAuth(roles?: string[]) {
  const { user, ready } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!ready) return;
    if (!user) {
      router.replace(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
    }
  }, [ready, user, router]);
  const allowed = !!user && (!roles || user.role === 'SUPERADMIN' || roles.includes(user.role));
  return { user, ready, allowed, loading: !ready || !user };
}

/** Tiny data-fetching helper: { data, error, loading, reload }. */
export function useFetch<T = any>(loader: (() => Promise<T>) | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(!!loader);

  const run = useCallback(async () => {
    if (!loader) return;
    setLoading(true);
    setError('');
    try {
      setData(await loader());
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => { run(); }, [run]);
  return { data, setData, error, loading, reload: run };
}

export function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
