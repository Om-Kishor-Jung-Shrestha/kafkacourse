'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from '@/components/Icon';
import { useToast } from '@/components/Toast';
import { Avatar, BarChart, CourseThumb, EmptyState, ErrorState, Modal, PageHeader, PageSpinner, StatCard, StatusBadge, Tabs } from '@/components/ui';
import { api } from '@/lib/api';
import { duration, fullName, labelize, money, moneyPlain, shortDate } from '@/lib/format';
import { useRequireAuth } from '@/lib/hooks';

type TabId = 'overview' | 'courses' | 'users' | 'payouts';

export default function AdminPage() {
  const { allowed, user } = useRequireAuth(['ADMIN']);
  const toast = useToast();
  const [tab, setTab] = useState<TabId>('overview');
  const [pending, setPending] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [reject, setReject] = useState<any>(null);
  const [reason, setReason] = useState('');
  const [payout, setPayout] = useState<any>(null);
  const [notes, setNotes] = useState('');
  const [userQ, setUserQ] = useState('');
  const [roleFilter, setRoleFilter] = useState('');

  const load = useCallback(async () => {
    try {
      const [p, u, a, po] = await Promise.all([
        api.get('/api/admin/courses/pending'), api.get('/api/admin/users'),
        api.get('/api/analytics/admin'), api.get('/api/payouts'),
      ]);
      setPending(p); setUsers(u); setAnalytics(a); setPayouts(po); setError('');
    } catch (e: any) { setError(e.message); } finally { setLoaded(true); }
  }, []);

  useEffect(() => { if (allowed) load(); }, [allowed, load]);

  async function act(fn: () => Promise<any>, ok: string) {
    try { await fn(); toast.success(ok); await load(); } catch (e: any) { toast.error(e.message); }
  }

  const filteredUsers = useMemo(() => users.filter((u) =>
    (!roleFilter || u.role === roleFilter) &&
    (!userQ.trim() || `${u.email} ${fullName(u)}`.toLowerCase().includes(userQ.trim().toLowerCase())),
  ), [users, userQ, roleFilter]);

  if (user && !allowed) return <div className="container-x py-16"><EmptyState icon="shield" title="Admins only" text="You don't have access to this page." /></div>;
  if (!allowed || !loaded) return <PageSpinner />;

  const pendingPayouts = payouts.filter((p) => p.status === 'PENDING').length;

  return (
    <div className="container-x py-10">
      <PageHeader title="Admin" subtitle="Moderate courses, manage users and process payouts." action={<Link href="/creator/coupons" className="btn-outline"><Icon name="tag" size={16} />Platform coupons</Link>} />
      {error && <div className="mb-6"><ErrorState message={error} onRetry={load} /></div>}

      <Tabs value={tab} onChange={setTab} tabs={[
        { id: 'overview', label: 'Overview' },
        { id: 'courses', label: 'Course approvals', count: pending.length },
        { id: 'users', label: 'Users', count: users.length },
        { id: 'payouts', label: 'Payouts', count: pendingPayouts },
      ]} />

      <div className="pt-8">
        {tab === 'overview' && analytics && (
          <>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <StatCard icon="users" label="Users" value={analytics.totalUsers} />
              <StatCard icon="award" label="Creators" value={analytics.totalCreators} />
              <StatCard icon="book" label="Enrollments" value={analytics.totalEnrollments} />
              <StatCard icon="dollar" label="Revenue" value={moneyPlain(analytics.totalRevenueCents)} />
            </div>
            <div className="grid lg:grid-cols-3 gap-6">
              <section className="card p-6 lg:col-span-2"><h2 className="font-bold text-lg">Platform revenue — last 6 months</h2><BarChart data={(analytics.revenueByMonth ?? []).map((m: any) => ({ label: m.month, value: m.revenueCents }))} format={moneyPlain} /></section>
              <section className="card p-6 space-y-3">
                <h2 className="font-bold text-lg">Needs attention</h2>
                <button onClick={() => setTab('courses')} className="w-full flex items-center justify-between border border-border p-3 hover:bg-surface"><span>Courses awaiting review</span><b>{pending.length}</b></button>
                <button onClick={() => setTab('payouts')} className="w-full flex items-center justify-between border border-border p-3 hover:bg-surface"><span>Pending payouts</span><b>{pendingPayouts}</b></button>
              </section>
            </div>
          </>
        )}

        {tab === 'courses' && (
          pending.length === 0 ? <EmptyState icon="checkCircle" title="Nothing to review" text="New submissions will appear here." /> : (
            <div className="space-y-4">
              {pending.map((c) => {
                const lessons = c.sections?.flatMap((s: any) => s.lessons) ?? [];
                return (
                  <div key={c.id} className="card p-4 flex flex-wrap gap-4">
                    <div className="w-44 aspect-video overflow-hidden bg-gray-100 shrink-0"><CourseThumb course={c} /></div>
                    <div className="flex-1 min-w-[240px]">
                      <p className="font-bold text-lg">{c.title}</p>
                      <p className="text-sm text-ink-muted">by {fullName(c.creator)} ({c.creator?.email}) • {money(c.priceCents)} • {labelize(c.category)}</p>
                      <p className="text-sm mt-2 line-clamp-2 text-ink-soft">{c.description}</p>
                      <p className="text-xs text-ink-muted mt-2">{c.sections?.length ?? 0} sections • {lessons.length} lessons • {lessons.filter((l: any) => l.videoUrl).length} with video • {duration(lessons.reduce((a: number, l: any) => a + l.durationSeconds, 0)) || 'no duration'}</p>
                    </div>
                    <div className="flex flex-col gap-2 w-36">
                      <Link href={`/courses/${c.slug}`} target="_blank" className="btn-outline"><Icon name="eye" size={16} />Preview</Link>
                      <button onClick={() => act(() => api.patch(`/api/admin/courses/${c.id}/approve`), 'Course approved & published')} className="btn-primary">Approve</button>
                      <button onClick={() => { setReject(c); setReason(''); }} className="btn-danger">Reject</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}

        {tab === 'users' && (
          <>
            <div className="flex flex-wrap gap-3 mb-4">
              <div className="flex items-center border border-ink/70 h-11 px-3 flex-1 min-w-[220px] max-w-sm"><Icon name="search" size={16} className="text-ink-muted" /><input value={userQ} onChange={(e) => setUserQ(e.target.value)} placeholder="Search by name or email" aria-label="Search users" className="flex-1 outline-none px-2 text-sm bg-transparent" /></div>
              <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} aria-label="Filter by role" className="input w-auto"><option value="">All roles</option>{['USER', 'CREATOR', 'ADMIN', 'SUPERADMIN'].map((r) => <option key={r} value={r}>{labelize(r)}</option>)}</select>
            </div>
            <div className="border border-border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface text-left"><tr>{['User', 'Role', 'Status', 'Joined', ''].map((h) => <th key={h} className="px-4 py-3 font-bold">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-border">
                  {filteredUsers.map((u) => (
                    <tr key={u.id}>
                      <td className="px-4 py-3"><div className="flex items-center gap-3"><Avatar user={u} size={32} /><div className="min-w-0"><p className="font-bold truncate">{fullName(u)}</p><p className="text-xs text-ink-muted truncate">{u.email}</p></div></div></td>
                      <td className="px-4 py-3">{labelize(u.role)}</td>
                      <td className="px-4 py-3"><StatusBadge status={u.status} /></td>
                      <td className="px-4 py-3 whitespace-nowrap">{shortDate(u.createdAt)}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {u.role !== 'SUPERADMIN' && u.id !== user?.id && (u.status === 'ACTIVE' ? (
                          <>
                            <button onClick={() => confirm(`Suspend ${u.email}?`) && act(() => api.patch(`/api/admin/users/${u.id}/suspend`, { reason: 'Policy violation' }), 'User suspended')} className="text-warning font-bold hover:underline mr-3">Suspend</button>
                            <button onClick={() => confirm(`Ban ${u.email}?`) && act(() => api.patch(`/api/admin/users/${u.id}/ban`, { reason: 'Policy violation' }), 'User banned')} className="text-error font-bold hover:underline">Ban</button>
                          </>
                        ) : <button onClick={() => act(() => api.patch(`/api/admin/users/${u.id}/reactivate`), 'User reactivated')} className="text-primary font-bold hover:underline">Reactivate</button>)}
                      </td>
                    </tr>
                  ))}
                  {filteredUsers.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-ink-muted">No users match.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === 'payouts' && (
          payouts.length === 0 ? <EmptyState icon="card" title="No payout requests" /> : (
            <div className="border border-border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface text-left"><tr>{['Creator', 'Amount', 'Requested', 'Status', ''].map((h) => <th key={h} className="px-4 py-3 font-bold">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-border">
                  {payouts.map((p) => (
                    <tr key={p.id}>
                      <td className="px-4 py-3"><p className="font-bold">{fullName(p.creator)}</p><p className="text-xs text-ink-muted">{p.creator?.email}</p></td>
                      <td className="px-4 py-3 font-bold">{moneyPlain(p.amountCents)}</td>
                      <td className="px-4 py-3">{shortDate(p.requestedAt)}</td>
                      <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                      <td className="px-4 py-3 text-right">{p.status === 'PENDING' && <button onClick={() => { setPayout(p); setNotes(''); }} className="btn-dark py-1.5">Process</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

      <Modal open={!!reject} onClose={() => setReject(null)} title="Reject course">
        <p className="text-sm mb-3">Tell <b>{fullName(reject?.creator)}</b> what to fix in “{reject?.title}”.</p>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={4} maxLength={500} className="input" placeholder="e.g. Lessons are missing video content" autoFocus />
        <div className="flex justify-end gap-3 mt-4"><button onClick={() => setReject(null)} className="btn-outline">Cancel</button>
          <button disabled={!reason.trim()} onClick={() => { const c = reject; setReject(null); act(() => api.patch(`/api/admin/courses/${c.id}/reject`, { reason: reason.trim() }), 'Course rejected'); }} className="btn-danger">Reject course</button></div>
      </Modal>

      <Modal open={!!payout} onClose={() => setPayout(null)} title="Process payout">
        <p className="text-sm mb-3">{moneyPlain(payout?.amountCents)} to <b>{fullName(payout?.creator)}</b></p>
        <label htmlFor="pn" className="label">Notes (optional)</label>
        <textarea id="pn" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={500} className="input" />
        <div className="flex justify-end gap-3 mt-4">
          <button onClick={() => { const p = payout; setPayout(null); act(() => api.patch(`/api/payouts/${p.id}/process`, { status: 'FAILED', adminNotes: notes || undefined }), 'Payout marked failed'); }} className="btn-danger">Mark failed</button>
          <button onClick={() => { const p = payout; setPayout(null); act(() => api.patch(`/api/payouts/${p.id}/process`, { status: 'PROCESSED', adminNotes: notes || undefined }), 'Payout processed'); }} className="btn-primary">Mark paid</button>
        </div>
      </Modal>
    </div>
  );
}
