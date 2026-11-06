'use client';
import { useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import { Icon, StarFilled, type IconName } from '@/components/Icon';
import { assetUrl } from '@/lib/api';
import { initials, labelize } from '@/lib/format';

/* ───────── Rating ───────── */
export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex items-center" aria-label={`${value.toFixed(1)} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = Math.max(0, Math.min(1, value - (i - 1)));
        return (
          <span key={i} className="relative inline-block" style={{ width: size, height: size }}>
            <StarFilled size={size} className="absolute inset-0 text-gray-300" />
            <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
              <StarFilled size={size} className="text-star" />
            </span>
          </span>
        );
      })}
    </span>
  );
}

export function StarInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="inline-flex gap-1" role="radiogroup" aria-label="Your rating">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          role="radio"
          aria-checked={value === i}
          aria-label={`${i} star${i > 1 ? 's' : ''}`}
          onClick={() => onChange(i)}
          className="p-0.5"
        >
          <StarFilled size={28} className={i <= value ? 'text-star' : 'text-gray-300 hover:text-star/60'} />
        </button>
      ))}
    </div>
  );
}

/* ───────── Progress ───────── */
export function ProgressBar({ value, className = '' }: { value: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)));
  return (
    <div className={`h-1.5 bg-gray-200 ${className}`} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full bg-primary transition-all duration-500" style={{ width: `${pct}%` }} />
    </div>
  );
}

/* ───────── Avatar ───────── */
export function Avatar({ user, size = 32, className = '' }: { user: any; size?: number; className?: string }) {
  const src = assetUrl(user?.avatarUrl);
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" width={size} height={size} className={`rounded-full object-cover shrink-0 ${className}`} style={{ width: size, height: size }} />
  ) : (
    <span
      className={`rounded-full bg-ink text-white inline-flex items-center justify-center font-bold shrink-0 ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      aria-hidden="true"
    >
      {initials(user)}
    </span>
  );
}

/* ───────── Course thumbnail (flat colour tiles — no gradients, RULE-21) ───────── */
const TILE: Record<string, { bg: string; icon: IconName }> = {
  programming: { bg: 'bg-teal-700', icon: 'layers' },
  'data-science': { bg: 'bg-sky-700', icon: 'trending' },
  design: { bg: 'bg-rose-600', icon: 'edit' },
  business: { bg: 'bg-amber-600', icon: 'bag' },
  marketing: { bg: 'bg-orange-600', icon: 'users' },
  music: { bg: 'bg-slate-700', icon: 'film' },
  health: { bg: 'bg-emerald-700', icon: 'heart' },
  other: { bg: 'bg-zinc-600', icon: 'book' },
};

export function CourseThumb({ course, className = '' }: { course: any; className?: string }) {
  const src = assetUrl(course?.thumbnailUrl);
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" className={`w-full h-full object-cover ${className}`} />;
  }
  const t = TILE[course?.category] ?? TILE.other;
  return (
    <div className={`w-full h-full ${t.bg} text-white/90 flex flex-col items-center justify-center gap-1 ${className}`}>
      <Icon name={t.icon} size={34} />
      <span className="text-[11px] font-bold uppercase tracking-widest opacity-80">{labelize(course?.category ?? 'course')}</span>
    </div>
  );
}

/* ───────── Misc ───────── */
export function Badge({ children, tone = 'gray' }: { children: ReactNode; tone?: 'gray' | 'teal' | 'amber' | 'red' | 'green' | 'dark' }) {
  const tones = {
    gray: 'bg-gray-100 text-ink',
    teal: 'bg-primary-soft text-primary',
    amber: 'bg-amber-100 text-amber-900',
    red: 'bg-red-100 text-red-800',
    green: 'bg-green-100 text-green-800',
    dark: 'bg-ink text-white',
  };
  return <span className={`inline-block px-2 py-0.5 text-xs font-bold ${tones[tone]}`}>{children}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  const tone: Record<string, any> = {
    PUBLISHED: 'green', ACTIVE: 'green', COMPLETED: 'green', PROCESSED: 'green',
    DRAFT: 'gray', PENDING: 'amber', PENDING_REVIEW: 'amber', SUSPENDED: 'amber',
    REJECTED: 'red', BANNED: 'red', FAILED: 'red', REFUNDED: 'red', ARCHIVED: 'gray',
  };
  return <Badge tone={tone[status] ?? 'gray'}>{labelize(status)}</Badge>;
}

export function Spinner({ size = 20 }: { size?: number }) {
  return (
    <svg className="animate-spin text-primary" width={size} height={size} viewBox="0 0 24 24" fill="none" aria-label="Loading">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.2" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function PageSpinner() {
  return (
    <div className="flex justify-center py-24">
      <Spinner size={32} />
    </div>
  );
}

export function EmptyState({ icon = 'book', title, text, action }: { icon?: IconName; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="border border-dashed border-border py-14 px-6 text-center">
      <Icon name={icon} size={36} className="mx-auto text-ink-muted" />
      <h3 className="font-bold text-lg mt-3">{title}</h3>
      {text && <p className="text-ink-muted text-sm mt-1 max-w-md mx-auto">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="border border-red-200 bg-red-50 text-red-800 px-4 py-3 text-sm flex items-center justify-between gap-4">
      <span className="flex items-center gap-2"><Icon name="alert" size={18} />{message}</span>
      {onRetry && <button onClick={onRetry} className="font-bold underline">Retry</button>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide = false }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-ink/60" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className={`bg-white w-full ${wide ? 'max-w-2xl' : 'max-w-md'} max-h-[92vh] overflow-y-auto shadow-pop animate-fadeIn`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-bold text-lg">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="text-ink-muted hover:text-ink"><Icon name="close" /></button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-6 border-b border-border overflow-x-auto no-scrollbar" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={`py-3 text-sm font-bold whitespace-nowrap border-b-2 -mb-px transition-colors ${value === t.id ? 'border-ink text-ink' : 'border-transparent text-ink-muted hover:text-ink'}`}
        >
          {t.label}{t.count !== undefined && <span className="ml-1.5 text-xs font-normal text-ink-muted">({t.count})</span>}
        </button>
      ))}
    </div>
  );
}

export function StatCard({ label, value, icon, hint }: { label: string; value: ReactNode; icon?: IconName; hint?: string }) {
  return (
    <div className="card p-5 flex items-start gap-4">
      {icon && (
        <span className="w-10 h-10 bg-primary-soft text-primary inline-flex items-center justify-center shrink-0">
          <Icon name={icon} size={20} />
        </span>
      )}
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-wide text-ink-muted">{label}</p>
        <p className="text-2xl font-bold mt-0.5 truncate">{value}</p>
        {hint && <p className="text-xs text-ink-muted mt-0.5">{hint}</p>}
      </div>
    </div>
  );
}

/** Minimal dependency-free bar chart. */
export function BarChart({ data, format }: { data: { label: string; value: number }[]; format?: (v: number) => string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex items-end gap-3 h-44 pt-6" role="img" aria-label="Bar chart">
      {data.map((d) => (
        <div key={d.label} className="flex-1 flex flex-col items-center justify-end h-full min-w-0">
          <span className="text-[11px] text-ink-muted mb-1 truncate max-w-full">{d.value ? (format ? format(d.value) : d.value) : ''}</span>
          <div className="w-full bg-primary/80 hover:bg-primary transition-colors" style={{ height: `${Math.max((d.value / max) * 100, d.value ? 4 : 1)}%`, minHeight: 2 }} title={`${d.label}: ${format ? format(d.value) : d.value}`} />
          <span className="text-xs text-ink-muted mt-2">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="text-ink-muted mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Breadcrumb({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center flex-wrap gap-1.5 text-sm">
      {items.map((it, i) => (
        <span key={i} className="inline-flex items-center gap-1.5">
          {it.href ? <Link href={it.href} className="text-primary font-bold hover:underline">{it.label}</Link> : <span className="opacity-90">{it.label}</span>}
          {i < items.length - 1 && <Icon name="right" size={14} className="opacity-60" />}
        </span>
      ))}
    </nav>
  );
}

export function CourseCardSkeleton() {
  return (
    <div>
      <div className="skeleton aspect-video" />
      <div className="skeleton h-4 mt-3 w-11/12" />
      <div className="skeleton h-3 mt-2 w-1/2" />
      <div className="skeleton h-3 mt-2 w-2/3" />
      <div className="skeleton h-4 mt-3 w-1/4" />
    </div>
  );
}
