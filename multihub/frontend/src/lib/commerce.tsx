'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/hooks';
import { useToast } from '@/components/Toast';

type Course = { id: string; title: string; slug: string; priceCents: number; [k: string]: any };

type Ctx = {
  cart: Course[];
  wishlist: Course[];
  ready: boolean;
  inCart: (id: string) => boolean;
  inWishlist: (id: string) => boolean;
  addToCart: (id: string) => Promise<boolean>;
  removeFromCart: (id: string) => Promise<void>;
  toggleWishlist: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
  /** Coupon the shopper applied (kept for the browser session so it survives cart -> checkout). */
  coupon: string;
  setCoupon: (code: string) => void;
};

const CommerceCtx = createContext<Ctx | null>(null);

export function useCommerce(): Ctx {
  const v = useContext(CommerceCtx);
  if (!v) throw new Error('useCommerce must be used inside <CommerceProvider>');
  return v;
}

export function CommerceProvider({ children }: { children: React.ReactNode }) {
  const { user, ready: authReady } = useAuth();
  const toast = useToast();
  const [cart, setCart] = useState<Course[]>([]);
  const [wishlist, setWishlist] = useState<Course[]>([]);
  const [ready, setReady] = useState(false);
  const [coupon, setCouponState] = useState('');

  useEffect(() => {
    try { setCouponState(sessionStorage.getItem('mh_coupon') ?? ''); } catch { /* storage unavailable */ }
  }, []);

  const setCoupon = useCallback((code: string) => {
    setCouponState(code);
    try { code ? sessionStorage.setItem('mh_coupon', code) : sessionStorage.removeItem('mh_coupon'); } catch { /* ignore */ }
  }, []);

  const refresh = useCallback(async () => {
    if (!getToken()) { setCart([]); setWishlist([]); setReady(true); return; }
    try {
      const [c, w] = await Promise.all([api.get('/api/cart'), api.get('/api/wishlist')]);
      setCart(c); setWishlist(w);
    } catch { /* keep previous state */ } finally { setReady(true); }
  }, []);

  useEffect(() => {
    if (!authReady) return;
    if (user) refresh(); else { setCart([]); setWishlist([]); setReady(true); }
  }, [authReady, user?.id, refresh]); // eslint-disable-line react-hooks/exhaustive-deps

  const value = useMemo<Ctx>(() => ({
    cart, wishlist, ready, coupon, setCoupon, refresh,
    inCart: (id) => cart.some((c) => c.id === id),
    inWishlist: (id) => wishlist.some((c) => c.id === id),
    async addToCart(id) {
      if (!user) { window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`; return false; }
      try { await api.post(`/api/cart/${id}`); await refresh(); return true; }
      catch (e: any) { toast.error(e.message); return false; }
    },
    async removeFromCart(id) {
      setCart((s) => s.filter((c) => c.id !== id));
      try { await api.del(`/api/cart/${id}`); } catch (e: any) { toast.error(e.message); refresh(); }
    },
    async toggleWishlist(id) {
      if (!user) { window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`; return; }
      try {
        if (wishlist.some((c) => c.id === id)) { await api.del(`/api/wishlist/${id}`); toast.info('Removed from wishlist'); }
        else { await api.post(`/api/wishlist/${id}`); toast.success('Added to wishlist'); }
        await refresh();
      } catch (e: any) { toast.error(e.message); }
    },
  }), [cart, wishlist, ready, coupon, setCoupon, refresh, user, toast]);

  return <CommerceCtx.Provider value={value}>{children}</CommerceCtx.Provider>;
}

function getToken() {
  return typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
}

export type Quote = {
  lines: { courseId: string; title: string; priceCents: number; discountCents: number; netCents: number }[];
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  coupon: { code: string; percentOff: number } | null;
};

/** Server-side price quote for a basket + optional coupon. Returns the quote or an error message (never throws). */
export async function fetchQuote(courseIds: string[], couponCode?: string): Promise<{ quote?: Quote; error?: string }> {
  try {
    return { quote: await api.post('/api/payments/quote', { courseIds, couponCode: couponCode || undefined }) };
  } catch (e: any) {
    return { error: e.message };
  }
}
