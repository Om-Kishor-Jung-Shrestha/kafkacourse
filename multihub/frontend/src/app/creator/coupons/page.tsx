'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Icon } from '@/components/Icon';
import { useToast } from '@/components/Toast';
import { Badge, Breadcrumb, EmptyState, ErrorState, Modal, PageHeader, PageSpinner, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { shortDate } from '@/lib/format';
import { useRequireAuth } from '@/lib/hooks';

const randomCode = () => 'SAVE' + Math.random().toString(36).slice(2, 8).toUpperCase();

export default function CouponsPage() {
  const { allowed, user } = useRequireAuth(['CREATOR', 'ADMIN']);
  const toast = useToast();
  const [coupons, setCoupons] = useState<any[] | null>(null);
  const [courses, setCourses] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ code: '', percentOff: '20', courseId: '', maxUses: '', expiresAt: '' });
  const isStaff = user && ['ADMIN', 'SUPERADMIN'].includes(user.role);

  const load = useCallback(async () => {
    try {
      const [c, mine] = await Promise.all([api.get('/api/coupons/mine'), api.get('/api/courses/mine/list').catch(() => [])]);
      setCoupons(c);
      setCourses(mine.filter((x: any) => x.status === 'PUBLISHED'));
    } catch (e: any) { setError(e.message); }
  }, []);
  useEffect(() => { if (allowed) load(); }, [allowed, load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/api/coupons', {
        code: form.code.trim(),
        percentOff: Number(form.percentOff),
        courseId: form.courseId || undefined,
        maxUses: form.maxUses ? Number(form.maxUses) : undefined,
        expiresAt: form.expiresAt ? new Date(`${form.expiresAt}T23:59:59`).toISOString() : undefined,
      });
      toast.success('Coupon created');
      setOpen(false);
      await load();
    } catch (err: any) { toast.error(err.message); } finally { setBusy(false); }
  }

  async function toggle(c: any) {
    try { await api.patch(`/api/coupons/${c.id}`, { isActive: !c.isActive }); await load(); } catch (e: any) { toast.error(e.message); }
  }

  async function copyLink(c: any) {
    const course = courses.find((x) => x.id === c.courseId);
    const link = course ? `${window.location.origin}/courses/${course.slug}?couponCode=${c.code}` : c.code;
    try { await navigator.clipboard.writeText(link); toast.success(course ? 'Coupon link copied' : 'Code copied'); } catch { toast.info(link); }
  }

  if (!allowed || (!coupons && !error)) return <PageSpinner />;

  return (
    <div className="container-x py-10">
      <div className="text-primary mb-4"><Breadcrumb items={[{ label: isStaff ? 'Admin' : 'Creator Studio', href: isStaff ? '/admin' : '/creator/dashboard' }, { label: 'Coupons' }]} /></div>
      <PageHeader title="Coupons" subtitle={isStaff ? 'Platform-wide discount codes that apply to every course (or one you pick).' : 'Discount codes for your courses. Share a coupon link to apply it automatically.'} action={<button onClick={() => { setForm({ code: randomCode(), percentOff: '20', courseId: '', maxUses: '', expiresAt: '' }); setOpen(true); }} className="btn-primary"><Icon name="plus" size={16} />New coupon</button>} />
      {error && <ErrorState message={error} onRetry={load} />}

      {coupons && coupons.length === 0 ? (
        <EmptyState icon="tag" title="No coupons yet" text="Create a coupon to run a promotion and attract new learners." />
      ) : (
        <div className="border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left"><tr>{['Code', 'Discount', 'Applies to', 'Used', 'Expires', 'Status', ''].map((h) => <th key={h} className="px-4 py-3 font-bold">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-border">
              {coupons?.map((c) => {
                const expired = c.expiresAt && new Date(c.expiresAt) < new Date();
                const exhausted = c.maxUses != null && c.usedCount >= c.maxUses;
                return (
                  <tr key={c.id}>
                    <td className="px-4 py-3 font-mono font-bold">{c.code}</td>
                    <td className="px-4 py-3">{c.percentOff}% off</td>
                    <td className="px-4 py-3">{c.scope === 'COURSE' ? c.courseTitle ?? 'One course' : c.scope === 'PLATFORM' ? 'All courses (platform-wide)' : 'All my courses'}</td>
                    <td className="px-4 py-3">{c.usedCount}{c.maxUses != null && ` / ${c.maxUses}`}</td>
                    <td className="px-4 py-3">{c.expiresAt ? shortDate(c.expiresAt) : 'Never'}</td>
                    <td className="px-4 py-3">{!c.isActive ? <Badge>Paused</Badge> : expired ? <Badge tone="red">Expired</Badge> : exhausted ? <Badge tone="amber">Used up</Badge> : <Badge tone="green">Active</Badge>}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button onClick={() => copyLink(c)} className="text-primary font-bold hover:underline mr-3">{c.courseId ? 'Copy link' : 'Copy code'}</button>
                      <button onClick={() => toggle(c)} className="font-bold hover:underline mr-3">{c.isActive ? 'Pause' : 'Resume'}</button>
                      <button onClick={() => confirm(`Delete coupon ${c.code}?`) && api.del(`/api/coupons/${c.id}`).then(load).catch((e) => toast.error(e.message))} className="text-error font-bold hover:underline">Delete</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="New coupon">
        <form onSubmit={create} className="space-y-4">
          <div>
            <label htmlFor="cc" className="label">Code</label>
            <div className="flex gap-2"><input id="cc" required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} pattern="[A-Za-z0-9_-]{4,40}" title="4-40 letters, numbers, - or _" className="input font-mono" /><button type="button" onClick={() => setForm({ ...form, code: randomCode() })} className="btn-outline shrink-0">Generate</button></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label htmlFor="cp" className="label">Discount (%)</label><input id="cp" type="number" min={1} max={100} required value={form.percentOff} onChange={(e) => setForm({ ...form, percentOff: e.target.value })} className="input" /></div>
            <div><label htmlFor="cm" className="label">Max uses (optional)</label><input id="cm" type="number" min={1} value={form.maxUses} onChange={(e) => setForm({ ...form, maxUses: e.target.value })} placeholder="Unlimited" className="input" /></div>
          </div>
          <div>
            <label htmlFor="cs" className="label">Applies to</label>
            <select id="cs" value={form.courseId} onChange={(e) => setForm({ ...form, courseId: e.target.value })} className="input">
              <option value="">{isStaff ? 'All courses on the platform' : 'All my courses'}</option>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </div>
          <div><label htmlFor="ce" className="label">Expires on (optional)</label><input id="ce" type="date" min={new Date().toISOString().slice(0, 10)} value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} className="input max-w-[200px]" /></div>
          <div className="flex justify-end gap-3 pt-2"><button type="button" onClick={() => setOpen(false)} className="btn-outline">Cancel</button><button disabled={busy} className="btn-primary">{busy ? <Spinner size={16} /> : 'Create coupon'}</button></div>
        </form>
      </Modal>
    </div>
  );
}
