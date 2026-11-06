'use client';
import { useEffect, useState } from 'react';
import { EmptyState, ErrorState, PageHeader, PageSpinner } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { api } from '@/lib/api';
import { useRequireAuth } from '@/lib/hooks';

const STRATEGIES: [string, string][] = [
  ['local', 'Files are stored on the server disk (default for development).'],
  ['cloudinary', 'Images and media are stored on Cloudinary.'],
  ['s3', 'Files are stored in an S3 bucket.'],
];

export default function SuperAdminPage() {
  const { allowed, user } = useRequireAuth(['SUPERADMIN']);
  const toast = useToast();
  const [config, setConfig] = useState<any>(null);
  const [commission, setCommission] = useState('30');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!allowed) return;
    api.get('/api/superadmin/storage').then((s) => { setConfig(s); setCommission(String(s.commissionPercent)); }).catch((e) => setError(e.message));
  }, [allowed]);

  async function strategy(s: string) {
    try { setConfig(await api.patch('/api/superadmin/storage', { strategy: s })); toast.success(`Storage strategy set to ${s}`); } catch (e: any) { toast.error(e.message); }
  }

  async function saveCommission(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(commission);
    if (!Number.isFinite(n) || n < 0 || n > 100) return toast.error('Commission must be between 0 and 100.');
    try { setConfig(await api.patch('/api/superadmin/commission', { commissionPercent: n })); toast.success('Commission updated'); } catch (err: any) { toast.error(err.message); }
  }

  if (user && !allowed) return <div className="container-x py-16"><EmptyState icon="shield" title="SuperAdmin only" /></div>;
  if (!allowed || (!config && !error)) return <PageSpinner />;

  return (
    <div className="container-x py-10 max-w-3xl">
      <PageHeader title="Platform settings" subtitle="Global configuration — changes apply to the whole platform." />
      {error && <ErrorState message={error} />}
      {config && (
        <div className="space-y-6">
          <section className="card p-6">
            <h2 className="text-xl font-bold">Storage strategy</h2>
            <p className="text-sm text-ink-muted mt-1 mb-4">Where uploaded thumbnails and avatars are stored.</p>
            <div className="grid sm:grid-cols-3 gap-3">
              {STRATEGIES.map(([s, desc]) => (
                <button key={s} onClick={() => strategy(s)} aria-pressed={config.strategy === s} className={`text-left border p-4 transition-colors ${config.strategy === s ? 'border-primary bg-primary-soft' : 'border-border hover:bg-surface'}`}>
                  <p className="font-bold capitalize">{s}</p><p className="text-xs text-ink-muted mt-1">{desc}</p>
                </button>
              ))}
            </div>
          </section>
          <section className="card p-6">
            <h2 className="text-xl font-bold">Platform commission</h2>
            <p className="text-sm text-ink-muted mt-1 mb-4">Percentage of each paid enrollment kept by the platform; the rest goes to the creator.</p>
            <form onSubmit={saveCommission} className="flex items-center gap-3">
              <input type="number" min={0} max={100} value={commission} onChange={(e) => setCommission(e.target.value)} aria-label="Commission percent" className="input w-28" /><span className="font-bold">%</span>
              <button className="btn-dark">Save</button>
            </form>
            <p className="text-xs text-ink-muted mt-3">Creators currently keep <b>{100 - (Number(commission) || 0)}%</b> of each sale.</p>
          </section>
        </div>
      )}
    </div>
  );
}
