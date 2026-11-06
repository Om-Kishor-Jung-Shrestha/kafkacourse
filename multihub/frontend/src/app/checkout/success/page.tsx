'use client';
import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { CourseThumb, ErrorState, PageSpinner } from '@/components/ui';
import { api } from '@/lib/api';
import { useCommerce } from '@/lib/commerce';
import { moneyPlain, shortDate } from '@/lib/format';
import { useRequireAuth } from '@/lib/hooks';

function Success() {
  const sp = useSearchParams();
  const orderId = sp.get('order');
  const { allowed } = useRequireAuth();
  const { refresh } = useCommerce();
  const [order, setOrder] = useState<any>(null);
  const [error, setError] = useState('');
  const [waiting, setWaiting] = useState(false);

  useEffect(() => {
    if (!allowed || !orderId) return;
    let cancelled = false;
    let tries = 0;
    // With real Stripe the webhook can land a moment after the redirect — poll briefly until the order is paid.
    const load = async () => {
      try {
        const o = await api.get(`/api/payments/orders/${orderId}`);
        if (cancelled) return;
        setOrder(o);
        if (o.status === 'PENDING' && ++tries < 12) { setWaiting(true); setTimeout(load, 1500); }
        else { setWaiting(false); refresh(); }
      } catch (e: any) { if (!cancelled) setError(e.message); }
    };
    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, orderId]);

  if (!orderId) return <div className="container-x py-16"><ErrorState message="No order specified." /></div>;
  if (error) return <div className="container-x py-16 max-w-2xl"><ErrorState message={error} /><Link href="/dashboard" className="btn-dark mt-4">My learning</Link></div>;
  if (!order) return <PageSpinner />;

  const paid = order.status === 'COMPLETED';

  return (
    <div className="container-x py-12 max-w-3xl">
      <div className="text-center mb-10">
        <span className={`w-16 h-16 ${paid ? 'bg-green-100 text-success' : 'bg-amber-100 text-warning'} rounded-full inline-flex items-center justify-center`}><Icon name={paid ? 'checkCircle' : 'clock'} size={34} /></span>
        <h1 className="text-3xl font-bold tracking-tight mt-4">{paid ? 'Thank you for your purchase!' : 'Finishing your payment…'}</h1>
        <p className="text-ink-muted mt-2">{paid ? 'Your courses are ready. Happy learning!' : waiting ? 'We are waiting for the payment provider to confirm. This page updates automatically.' : 'Your payment is still processing. Your courses will appear in My learning shortly.'}</p>
      </div>

      <section className="border border-border" id="receipt">
        <div className="px-5 py-4 bg-surface flex flex-wrap justify-between gap-2 text-sm">
          <span><b>Order</b> #{order.id.slice(-8).toUpperCase()}</span>
          <span>{shortDate(order.paidAt ?? order.createdAt)}</span>
        </div>
        <ul className="divide-y divide-border">
          {order.items.map((it: any) => (
            <li key={it.paymentId} className="flex flex-wrap items-center gap-4 p-5">
              <div className="w-24 aspect-video shrink-0 overflow-hidden bg-gray-100 border border-border">{it.course && <CourseThumb course={it.course} />}</div>
              <div className="flex-1 min-w-[160px]"><p className="font-bold">{it.course?.title}</p></div>
              <span className="font-bold">{moneyPlain(it.amountCents)}</span>
              {paid && it.enrollmentId && <Link href={`/learn/${it.enrollmentId}`} className="btn-primary print:hidden">Start learning</Link>}
            </li>
          ))}
        </ul>
        <dl className="p-5 border-t border-border text-sm space-y-1.5">
          <div className="flex justify-between"><dt>Subtotal</dt><dd>{moneyPlain(order.subtotalCents)}</dd></div>
          {order.discountCents > 0 && <div className="flex justify-between"><dt>Discount{order.couponCode ? ` (${order.couponCode})` : ''}</dt><dd>−{moneyPlain(order.discountCents)}</dd></div>}
          <div className="flex justify-between font-bold text-lg pt-2"><dt>Total paid</dt><dd>{moneyPlain(order.totalCents)}</dd></div>
        </dl>
      </section>

      <div className="flex flex-wrap justify-center gap-3 mt-8 print:hidden">
        <Link href="/dashboard" className="btn-dark">Go to My learning</Link>
        <button onClick={() => window.print()} className="btn-outline"><Icon name="print" size={16} />Print receipt</button>
        <Link href="/courses" className="btn-outline">Keep browsing</Link>
      </div>
    </div>
  );
}

export default function CheckoutSuccessPage() {
  return <Suspense fallback={<PageSpinner />}><Success /></Suspense>;
}
