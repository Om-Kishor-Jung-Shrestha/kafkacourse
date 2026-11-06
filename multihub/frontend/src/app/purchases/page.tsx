'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/components/Toast';
import { CourseThumb, EmptyState, ErrorState, Modal, PageHeader, PageSpinner, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { moneyPlain, shortDate } from '@/lib/format';
import { useRequireAuth } from '@/lib/hooks';

export default function PurchasesPage() {
  const { allowed } = useRequireAuth();
  const toast = useToast();
  const [payments, setPayments] = useState<any[] | null>(null);
  const [error, setError] = useState('');
  const [refund, setRefund] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api.get('/api/payments/me').then(setPayments).catch((e) => setError(e.message)), []);
  useEffect(() => { if (allowed) load(); }, [allowed, load]);

  async function doRefund() {
    setBusy(true);
    try {
      await api.post(`/api/payments/${refund.id}/refund`);
      toast.success('Refund issued — the course was removed from My learning.');
      setRefund(null);
      await load();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }

  if (!allowed || (!payments && !error)) return <PageSpinner />;
  const paid = (payments ?? []).filter((p) => p.status === 'COMPLETED');
  const total = paid.reduce((a, p) => a + p.amountCents, 0);

  return (
    <div className="container-x py-10 max-w-5xl">
      <PageHeader title="Purchase history" subtitle={payments?.length ? `${paid.length} purchase${paid.length === 1 ? '' : 's'} • ${moneyPlain(total)} spent` : undefined} />
      {error && <ErrorState message={error} />}
      {payments && payments.length === 0 && <EmptyState icon="card" title="No purchases yet" text="Courses you buy will show up here." action={<Link href="/courses" className="btn-dark">Browse courses</Link>} />}
      {payments && payments.length > 0 && (
        <div className="border border-border divide-y divide-border">
          {payments.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-4 p-4">
              <div className="w-24 aspect-video shrink-0 overflow-hidden bg-gray-100 border border-border">{p.course && <CourseThumb course={p.course} />}</div>
              <div className="flex-1 min-w-[200px]">
                {p.enrollmentId && p.status === 'COMPLETED'
                  ? <Link href={`/learn/${p.enrollmentId}`} className="font-bold text-primary hover:underline">{p.course?.title ?? 'Course'}</Link>
                  : <p className="font-bold">{p.course?.title ?? 'Course'}</p>}
                <p className="text-xs text-ink-muted mt-1">{shortDate(p.paidAt ?? p.createdAt)}{p.couponCode && ` • coupon ${p.couponCode}`}{p.status === 'REFUNDED' && p.refundedAt && ` • refunded ${shortDate(p.refundedAt)}`}</p>
                {p.status === 'COMPLETED' && !p.refundable && p.refundReason && p.amountCents > 0 && <p className="text-xs text-ink-muted mt-0.5">{p.refundReason}</p>}
              </div>
              <div className="text-right"><p className="font-bold">{p.amountCents === 0 ? 'Free' : moneyPlain(p.amountCents)}</p>{p.discountCents > 0 && <p className="text-xs text-ink-muted">saved {moneyPlain(p.discountCents)}</p>}</div>
              <StatusBadge status={p.status} />
              <div className="flex gap-2 w-[190px] justify-end">
                {p.orderId && <Link href={`/checkout/success?order=${p.orderId}`} className="btn-ghost py-1.5">Receipt</Link>}
                {p.refundable && <button onClick={() => setRefund(p)} className="btn-outline py-1.5">Refund</button>}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={!!refund} onClose={() => setRefund(null)} title="Request a refund">
        <p className="text-sm">Refund <b>{moneyPlain(refund?.amountCents)}</b> for “{refund?.course?.title}”?</p>
        <p className="text-sm text-ink-muted mt-2">You&apos;ll lose access to the course. The money goes back to your original payment method.</p>
        <div className="flex justify-end gap-3 mt-6"><button onClick={() => setRefund(null)} className="btn-outline">Keep course</button><button onClick={doRefund} disabled={busy} className="btn-danger">{busy ? 'Refunding…' : 'Confirm refund'}</button></div>
      </Modal>
    </div>
  );
}
