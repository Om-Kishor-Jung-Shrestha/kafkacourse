'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Icon } from '@/components/Icon';
import { useToast } from '@/components/Toast';
import { BarChart, CourseThumb, EmptyState, ErrorState, PageHeader, PageSpinner, StatCard, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { money, moneyPlain, shortDate } from '@/lib/format';
import { useRequireAuth } from '@/lib/hooks';

export default function CreatorDashboardPage() {
  const { allowed, user } = useRequireAuth(['CREATOR', 'ADMIN']);
  const toast = useToast();
  const [courses, setCourses] = useState<any[] | null>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [sales, setSales] = useState<any>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [c, a, p, sl] = await Promise.all([
        api.get('/api/courses/mine/list'),
        api.get('/api/analytics/creator'),
        api.get('/api/payouts/me'),
        api.get('/api/analytics/creator/sales'),
      ]);
      setCourses(c); setAnalytics(a); setPayouts(p); setSales(sl);
    } catch (e: any) { setError(e.message); }
  }, []);

  useEffect(() => { if (allowed) load(); }, [allowed, load]);

  async function requestPayout() {
    setBusy(true);
    try { await api.post('/api/payouts/request', {}); toast.success('Payout requested'); load(); }
    catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }

  async function submitForReview(id: string) {
    try { await api.post(`/api/courses/${id}/submit`); toast.success('Submitted for review'); load(); }
    catch (e: any) { toast.error(e.message); }
  }

  if (user && !allowed) {
    return <div className="container-x py-16"><EmptyState icon="shield" title="Creator access required" text="Become an instructor to create and manage courses." action={<Link href="/teach" className="btn-dark">Become an instructor</Link>} /></div>;
  }
  if (!allowed || (!courses && !error)) return <PageSpinner />;

  const hasPending = payouts.some((p) => p.status === 'PENDING');

  return (
    <div className="container-x py-10">
      <PageHeader title="Creator Studio" subtitle="Manage your courses, track performance and request payouts." action={<div className="flex gap-2"><Link href="/creator/coupons" className="btn-outline"><Icon name="tag" size={16} /> Coupons</Link><Link href="/creator/courses/new" className="btn-primary"><Icon name="plus" size={16} /> New course</Link></div>} />
      {error && <ErrorState message={error} onRetry={load} />}

      {analytics && (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
            <StatCard icon="layers" label="Courses" value={analytics.totalCourses} hint={`${analytics.publishedCourses} published`} />
            <StatCard icon="users" label="Enrollments" value={analytics.totalEnrollments} />
            <StatCard icon="dollar" label="Gross sales" value={moneyPlain(analytics.totalRevenueCents)} />
            <StatCard icon="card" label="Your earnings" value={moneyPlain(analytics.earningsCents ?? 0)} hint={`after ${analytics.commissionPercent}% platform fee`} />
            <StatCard icon="heart" label="Avg rating" value={analytics.averageRating ? analytics.averageRating.toFixed(1) : '—'} hint={`${analytics.reviewCount} reviews`} />
            <StatCard icon="clock" label="Pending payout" value={moneyPlain(analytics.pendingPayoutCents)} />
          </div>

          <div className="grid lg:grid-cols-3 gap-6 mb-10">
            <section className="card p-6 lg:col-span-2">
              <h2 className="font-bold text-lg">Revenue — last 6 months</h2>
              <BarChart data={(analytics.revenueByMonth ?? []).map((m: any) => ({ label: m.month, value: m.revenueCents }))} format={(v) => moneyPlain(v)} />
            </section>
            <section className="card p-6">
              <h2 className="font-bold text-lg mb-3">Top courses</h2>
              {(analytics.topCourses ?? []).length === 0 ? <p className="text-sm text-ink-muted">No data yet.</p> : (
                <ol className="space-y-3 text-sm">
                  {analytics.topCourses.map((c: any, i: number) => (
                    <li key={c.id} className="flex items-start gap-3">
                      <span className="w-6 h-6 bg-primary-soft text-primary text-xs font-bold inline-flex items-center justify-center shrink-0">{i + 1}</span>
                      <div className="min-w-0"><p className="font-bold truncate">{c.title}</p><p className="text-xs text-ink-muted">{c.enrollments} enrolled • {moneyPlain(c.revenueCents)}</p></div>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        </>
      )}

      <section className="mb-10">
        <h2 className="h-section mb-4">My courses</h2>
        {courses && courses.length === 0 ? (
          <EmptyState icon="layers" title="Create your first course" text="Add sections and lessons, then submit it for review." action={<Link href="/creator/courses/new" className="btn-primary">Create a course</Link>} />
        ) : (
          <div className="border border-border divide-y divide-border">
            {courses?.map((c) => {
              const lessons = (c.sections ?? []).reduce((a: number, s: any) => a + (s.lessons?.length ?? 0), 0);
              return (
                <div key={c.id} className="flex flex-wrap items-center gap-4 p-4">
                  <div className="w-28 aspect-video shrink-0 overflow-hidden bg-gray-100"><CourseThumb course={c} /></div>
                  <div className="flex-1 min-w-[200px]">
                    <div className="flex items-center gap-2 flex-wrap"><p className="font-bold">{c.title}</p><StatusBadge status={c.status} /></div>
                    <p className="text-xs text-ink-muted mt-1">{money(c.priceCents)} • {c._count?.enrollments ?? 0} enrolled • {c._count?.reviews ?? 0} reviews • {lessons} lessons • created {shortDate(c.createdAt)}</p>
                    {c.status === 'REJECTED' && c.rejectionReason && <p className="text-xs text-error mt-1.5 flex items-start gap-1.5"><Icon name="alert" size={13} className="mt-0.5 shrink-0" />Rejected: {c.rejectionReason}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    {c.status === 'PUBLISHED' && <Link href={`/courses/${c.slug}`} className="btn-ghost"><Icon name="eye" size={16} />View</Link>}
                    {(c.status === 'DRAFT' || c.status === 'REJECTED') && <button onClick={() => submitForReview(c.id)} className="btn-outline">{c.status === 'REJECTED' ? 'Resubmit' : 'Submit for review'}</button>}
                    <Link href={`/creator/courses/${c.id}/manage`} className="btn-dark"><Icon name="edit" size={16} />Manage</Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {sales && (
        <section className="mb-10">
          <h2 className="h-section mb-4">Recent sales</h2>
          {sales.sales.length === 0 ? <p className="text-sm text-ink-muted">No sales yet — share a coupon link to get your first one.</p> : (
            <div className="border border-border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface text-left"><tr>{['Date', 'Course', 'Buyer', 'Price paid', `Your share (${100 - sales.commissionPercent}%)`, 'Status'].map((h) => <th key={h} className="px-4 py-3 font-bold">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-border">
                  {sales.sales.map((x: any) => (
                    <tr key={x.id}>
                      <td className="px-4 py-3 whitespace-nowrap">{shortDate(x.paidAt)}</td>
                      <td className="px-4 py-3">{x.courseTitle}{x.couponCode && <span className="ml-2 text-xs text-ink-muted">({x.couponCode})</span>}</td>
                      <td className="px-4 py-3">{x.buyer}</td>
                      <td className="px-4 py-3">{moneyPlain(x.amountCents)}</td>
                      <td className="px-4 py-3 font-bold">{x.status === 'REFUNDED' ? '—' : moneyPlain(x.creatorShareCents)}</td>
                      <td className="px-4 py-3"><StatusBadge status={x.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="h-section">Payouts</h2>
          <button onClick={requestPayout} disabled={busy || hasPending} className="btn-primary" title={hasPending ? 'You already have a pending payout' : undefined}>Request payout</button>
        </div>
        {payouts.length === 0 ? <p className="text-sm text-ink-muted">No payouts yet. You can request one once your courses have earned revenue.</p> : (
          <div className="border border-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface text-left"><tr>{['Requested', 'Amount', 'Status', 'Processed', 'Notes'].map((h) => <th key={h} className="px-4 py-3 font-bold">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-border">
                {payouts.map((p) => (
                  <tr key={p.id}><td className="px-4 py-3">{shortDate(p.requestedAt)}</td><td className="px-4 py-3 font-bold">{moneyPlain(p.amountCents)}</td><td className="px-4 py-3"><StatusBadge status={p.status} /></td><td className="px-4 py-3">{shortDate(p.processedAt)}</td><td className="px-4 py-3 text-ink-muted">{p.adminNotes ?? '—'}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
