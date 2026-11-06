'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CourseRow } from '@/components/CourseRow';
import { Icon } from '@/components/Icon';
import { useToast } from '@/components/Toast';
import { CourseThumb, EmptyState, PageSpinner, Spinner, Stars } from '@/components/ui';
import { api } from '@/lib/api';
import { fetchQuote, useCommerce, type Quote } from '@/lib/commerce';
import { LEVELS, money, moneyPlain } from '@/lib/format';
import { useRequireAuth } from '@/lib/hooks';

export default function CartPage() {
  const { allowed } = useRequireAuth();
  const router = useRouter();
  const toast = useToast();
  const { cart, ready, removeFromCart, toggleWishlist, inWishlist, coupon, setCoupon } = useCommerce();
  const [code, setCode] = useState('');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [couponError, setCouponError] = useState('');
  const [quoting, setQuoting] = useState(false);
  const [recs, setRecs] = useState<any[] | null>(null);

  const ids = cart.map((c) => c.id).join(',');

  useEffect(() => {
    if (!ready || cart.length === 0) { setQuote(null); return; }
    let cancelled = false;
    setQuoting(true);
    fetchQuote(cart.map((c) => c.id), coupon).then(async (r) => {
      if (cancelled) return;
      if (r.error && coupon) {
        // The stored coupon no longer applies (expired, different cart…): drop it and re-quote without it.
        setCouponError(r.error); setCoupon('');
        const plain = await fetchQuote(cart.map((c) => c.id));
        if (!cancelled) setQuote(plain.quote ?? null);
      } else setQuote(r.quote ?? null);
      setQuoting(false);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, ids, coupon]);

  useEffect(() => {
    if (allowed) api.get('/api/recommendations?limit=12').then(setRecs).catch(() => setRecs([]));
  }, [allowed]);

  async function apply(e: React.FormEvent) {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (!c) return;
    setCouponError('');
    const r = await fetchQuote(cart.map((x) => x.id), c);
    if (r.error) return setCouponError(r.error);
    setCoupon(c); setCode('');
    toast.success(`Coupon ${c} applied`);
  }

  async function saveForLater(id: string) {
    if (!inWishlist(id)) await toggleWishlist(id);
    await removeFromCart(id);
  }

  if (!allowed || !ready) return <PageSpinner />;

  const lineFor = (id: string) => quote?.lines.find((l) => l.courseId === id);

  return (
    <div className="container-x py-10">
      <h1 className="text-4xl font-bold tracking-tight">Shopping Cart</h1>
      <p className="font-bold mt-6 pb-3 border-b border-border">{cart.length} {cart.length === 1 ? 'Course' : 'Courses'} in Cart</p>

      {cart.length === 0 ? (
        <div className="mt-6">
          <EmptyState icon="cart" title="Your cart is empty" text="Keep shopping to find a course!" action={<Link href="/courses" className="btn-dark">Keep shopping</Link>} />
        </div>
      ) : (
        <div className="grid lg:grid-cols-[1fr_340px] gap-10 mt-2">
          <ul className="divide-y divide-border">
            {cart.map((c) => {
              const line = lineFor(c.id);
              return (
                <li key={c.id} className="py-5 flex flex-wrap gap-4">
                  <Link href={`/courses/${c.slug}`} className="w-32 sm:w-40 aspect-video shrink-0 overflow-hidden bg-gray-100 border border-border"><CourseThumb course={c} /></Link>
                  <div className="flex-1 min-w-[200px]">
                    <Link href={`/courses/${c.slug}`} className="font-bold hover:text-primary line-clamp-2">{c.title}</Link>
                    <p className="text-xs text-ink-muted mt-1">By {c.creatorName}</p>
                    <div className="flex items-center gap-1.5 mt-1 text-sm">
                      {c.averageRating > 0 ? <><span className="font-bold text-amber-800">{c.averageRating.toFixed(1)}</span><Stars value={c.averageRating} /><span className="text-xs text-ink-muted">({c.reviewCount})</span></> : <span className="text-xs text-ink-muted">New course</span>}
                    </div>
                    <p className="text-xs text-ink-muted mt-1">{LEVELS[c.level] ?? c.level}</p>
                  </div>
                  <div className="flex flex-col items-start gap-1 text-sm w-36">
                    <button onClick={() => removeFromCart(c.id)} className="text-primary font-bold hover:underline">Remove</button>
                    <button onClick={() => saveForLater(c.id)} className="text-primary font-bold hover:underline">Save for later</button>
                  </div>
                  <div className="text-right min-w-[90px]">
                    <p className="font-bold text-primary text-lg">{money(line ? line.netCents : c.priceCents)}</p>
                    {line && line.discountCents > 0 && <p className="text-sm text-ink-muted line-through">{money(c.priceCents)}</p>}
                    <Icon name="tag" size={14} className="inline text-ink-muted" />
                  </div>
                </li>
              );
            })}
          </ul>

          <aside>
            <div className="lg:sticky lg:top-24">
              <p className="font-bold text-ink-muted">Total:</p>
              <p className="text-4xl font-bold mt-1 min-h-[2.5rem]">{quoting && !quote ? <Spinner /> : moneyPlain(quote?.totalCents ?? cart.reduce((a, c) => a + c.priceCents, 0))}</p>
              {quote && quote.discountCents > 0 && (
                <>
                  <p className="text-ink-muted line-through mt-1">{moneyPlain(quote.subtotalCents)}</p>
                  <p className="text-sm mt-1">{Math.round((quote.discountCents / Math.max(quote.subtotalCents, 1)) * 100)}% off</p>
                </>
              )}
              <button onClick={() => router.push('/checkout')} disabled={quoting} className="btn-primary w-full py-4 text-base mt-4">Checkout</button>

              <div className="border-t border-border mt-6 pt-5">
                <p className="font-bold mb-2">Promotions</p>
                {coupon && (
                  <div className="flex items-center justify-between bg-primary-soft border border-primary/30 px-3 py-2 text-sm mb-3">
                    <span className="flex items-center gap-2 font-bold"><Icon name="checkCircle" size={16} className="text-primary" />{coupon} <span className="font-normal text-ink-muted">is applied</span></span>
                    <button onClick={() => setCoupon('')} aria-label="Remove coupon" className="text-ink-muted hover:text-ink"><Icon name="close" size={16} /></button>
                  </div>
                )}
                <form onSubmit={apply} className="flex">
                  <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Enter Coupon" aria-label="Coupon code" className="input flex-1 uppercase placeholder:normal-case" />
                  <button className="btn-dark shrink-0">Apply</button>
                </form>
                {couponError && <p role="alert" className="text-sm text-error mt-2">{couponError}</p>}
              </div>
            </div>
          </aside>
        </div>
      )}

      <div className="mt-8">
        <CourseRow title="You might also like" courses={recs} loading={recs === null} />
      </div>
    </div>
  );
}
