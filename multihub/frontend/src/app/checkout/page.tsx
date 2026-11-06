'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { useToast } from '@/components/Toast';
import { CourseThumb, PageSpinner, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { fetchQuote, useCommerce, type Quote } from '@/lib/commerce';
import { moneyPlain } from '@/lib/format';
import { useRequireAuth } from '@/lib/hooks';

export default function CheckoutPage() {
  const { allowed } = useRequireAuth();
  const router = useRouter();
  const toast = useToast();
  const { cart, ready, coupon, refresh, setCoupon } = useCommerce();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [stripe, setStripe] = useState<boolean | null>(null);

  useEffect(() => { api.get('/api/payments/config').then((c) => setStripe(!!c.stripeConfigured)).catch(() => setStripe(false)); }, []);

  useEffect(() => {
    if (!ready || cart.length === 0) return;
    fetchQuote(cart.map((c) => c.id), coupon).then((r) => {
      if (r.error) { setError(r.error); setCoupon(''); fetchQuote(cart.map((c) => c.id)).then((p) => setQuote(p.quote ?? null)); }
      else setQuote(r.quote ?? null);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, cart.map((c) => c.id).join(','), coupon]);

  useEffect(() => {
    if (ready && allowed && cart.length === 0 && !busy) router.replace('/cart');
  }, [ready, allowed, cart.length, busy, router]);

  async function pay() {
    setBusy(true);
    setError('');
    try {
      const order = await api.post('/api/payments/checkout', { courseIds: cart.map((c) => c.id), couponCode: coupon || undefined });
      if (order.mode === 'stripe') { window.location.href = order.checkoutUrl; return; }
      if (order.mode === 'mock') await api.post(`/api/payments/complete/${order.sessionId}`); // stands in for Stripe's webhook
      setCoupon('');
      await refresh();
      router.push(`/checkout/success?order=${order.orderId}`);
    } catch (e: any) {
      setError(e.message);
      toast.error(e.message);
      setBusy(false);
    }
  }

  if (!allowed || !ready || stripe === null || cart.length === 0) return <PageSpinner />;
  const total = quote?.totalCents ?? cart.reduce((a, c) => a + c.priceCents, 0);

  return (
    <div className="container-x py-10 grid lg:grid-cols-[1fr_380px] gap-12">
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-8">Checkout</h1>

        <h2 className="text-xl font-bold mb-3">Payment method</h2>
        <div className="border border-border p-5">
          <div className="flex items-center gap-3 font-bold"><Icon name="card" size={22} />{stripe ? 'Credit / debit card (via Stripe)' : 'Test payment'}</div>
          {stripe ? (
            <p className="text-sm text-ink-muted mt-2">You&apos;ll be redirected to Stripe&apos;s secure checkout to enter your card details. We never see or store your card number.</p>
          ) : (
            <p className="text-sm bg-amber-50 border border-amber-200 text-amber-900 p-3 mt-3 flex gap-2"><Icon name="info" size={16} className="shrink-0 mt-0.5" />Stripe isn&apos;t configured on this server, so checkout runs in test mode: no card is needed and nothing is charged. Completing the order enrolls you immediately.</p>
          )}
        </div>

        <h2 className="text-xl font-bold mt-10 mb-3">Order details ({cart.length} {cart.length === 1 ? 'course' : 'courses'})</h2>
        <ul className="divide-y divide-border border-t border-b border-border">
          {cart.map((c) => {
            const line = quote?.lines.find((l) => l.courseId === c.id);
            return (
              <li key={c.id} className="flex items-center gap-4 py-4">
                <div className="w-20 aspect-video shrink-0 overflow-hidden bg-gray-100 border border-border"><CourseThumb course={c} /></div>
                <div className="flex-1 min-w-0"><p className="font-bold line-clamp-1">{c.title}</p><p className="text-xs text-ink-muted">{c.creatorName}</p></div>
                <div className="text-right"><p className="font-bold">{moneyPlain(line?.netCents ?? c.priceCents)}</p>{line && line.discountCents > 0 && <p className="text-xs text-ink-muted line-through">{moneyPlain(c.priceCents)}</p>}</div>
              </li>
            );
          })}
        </ul>
        <Link href="/cart" className="text-primary font-bold text-sm hover:underline inline-block mt-4">← Edit cart</Link>
      </div>

      <aside>
        <div className="bg-surface p-6 lg:sticky lg:top-24">
          <h2 className="text-2xl font-bold mb-4">Summary</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt>Original price:</dt><dd>{moneyPlain(quote?.subtotalCents ?? total)}</dd></div>
            {quote && quote.discountCents > 0 && <div className="flex justify-between"><dt>Discounts{quote.coupon ? ` (${quote.coupon.code})` : ''}:</dt><dd>−{moneyPlain(quote.discountCents)}</dd></div>}
            <div className="flex justify-between font-bold text-lg border-t border-border pt-3 mt-3"><dt>Total ({'USD'}):</dt><dd>{moneyPlain(total)}</dd></div>
          </dl>
          <p className="text-xs text-ink-muted mt-4">By completing your purchase you agree to these Terms of Service. 30-day refund if you&apos;ve completed less than half of the course.</p>
          {error && <p role="alert" className="text-sm text-error bg-red-50 border border-red-200 p-3 mt-4">{error}</p>}
          <button onClick={pay} disabled={busy} className="btn-primary w-full py-4 text-base mt-4">{busy ? <Spinner size={20} /> : total === 0 ? 'Enroll now' : stripe ? 'Proceed to payment' : 'Complete checkout'}</button>
        </div>
      </aside>
    </div>
  );
}
