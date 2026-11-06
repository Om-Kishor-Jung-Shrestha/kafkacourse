'use client';
import { useEffect, useState } from 'react';
import { Icon, type IconName } from '@/components/Icon';
import { useToast } from '@/components/Toast';
import { EmptyState, ErrorState, PageHeader, PageSpinner } from '@/components/ui';
import { api } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { useRequireAuth } from '@/lib/hooks';

const ICONS: Record<string, IconName> = {
  SYSTEM: 'info', COURSE_UPDATE: 'book', ENROLLMENT: 'checkCircle', PAYMENT: 'card', REVIEW: 'heart', PROMOTION: 'award',
};

export default function NotificationsPage() {
  const { allowed } = useRequireAuth();
  const toast = useToast();
  const [items, setItems] = useState<any[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (allowed) api.get('/api/notifications').then(setItems).catch((e) => setError(e.message));
  }, [allowed]);

  async function markRead(id: string) {
    setItems((s) => s?.map((n) => (n.id === id ? { ...n, isRead: true } : n)) ?? s);
    api.patch(`/api/notifications/${id}/read`).catch(() => {});
  }

  async function markAll() {
    try {
      await api.patch('/api/notifications/read-all');
      setItems((s) => s?.map((n) => ({ ...n, isRead: true })) ?? s);
      toast.success('All notifications marked as read');
    } catch (e: any) { toast.error(e.message); }
  }

  if (!allowed || (!items && !error)) return <PageSpinner />;
  const unread = (items ?? []).filter((n) => !n.isRead).length;

  return (
    <div className="container-x py-10 max-w-3xl">
      <PageHeader title="Notifications" subtitle={unread ? `${unread} unread` : 'You\u2019re all caught up'} action={unread > 0 ? <button onClick={markAll} className="btn-outline">Mark all as read</button> : undefined} />
      {error && <ErrorState message={error} />}
      {items && items.length === 0 && <EmptyState icon="bell" title="No notifications yet" text="Enrollment, payment and review updates will appear here." />}
      <ul className="border border-border divide-y divide-border">
        {items?.map((n) => (
          <li key={n.id} className={`flex gap-4 p-4 ${n.isRead ? '' : 'bg-primary-soft/50'}`}>
            <span className="w-10 h-10 bg-white border border-border inline-flex items-center justify-center text-primary shrink-0"><Icon name={ICONS[n.type] ?? 'bell'} size={18} /></span>
            <div className="flex-1 min-w-0">
              <p className="font-bold">{n.title}</p>
              <p className="text-sm text-ink-soft mt-0.5">{n.message}</p>
              <p className="text-xs text-ink-muted mt-1">{timeAgo(n.createdAt)}</p>
            </div>
            {!n.isRead && <button onClick={() => markRead(n.id)} className="text-xs font-bold text-primary hover:underline self-start shrink-0">Mark read</button>}
          </li>
        ))}
      </ul>
    </div>
  );
}
