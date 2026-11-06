'use client';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { Icon } from '@/components/Icon';

/** Split-screen auth layout: brand panel + form (Udemy-style). */
export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer: ReactNode }) {
  return (
    <div className="grid lg:grid-cols-2 min-h-[calc(100vh-72px)]">
      <div className="hidden lg:flex bg-primary text-white flex-col justify-center px-16 xl:px-24 gap-8">
        <Link href="/" className="flex items-center gap-2 w-fit">
          <span className="w-10 h-10 bg-white text-primary inline-flex items-center justify-center font-bold text-lg">M</span>
          <span className="text-2xl font-bold">MultiHub</span>
        </Link>
        <h2 className="text-4xl font-bold tracking-tight leading-tight">Skills that move your career forward.</h2>
        <ul className="space-y-4 text-white/90">
          {['Learn at your own pace, on any device', 'Track progress lesson by lesson', 'Courses from reviewed, expert instructors'].map((t) => (
            <li key={t} className="flex items-center gap-3"><Icon name="checkCircle" size={22} />{t}</li>
          ))}
        </ul>
      </div>
      <div className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-[400px]">
          <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="text-ink-muted mt-2">{subtitle}</p>}
          <div className="mt-8">{children}</div>
          <div className="border-t border-border mt-8 pt-5 text-center text-sm">{footer}</div>
        </div>
      </div>
    </div>
  );
}

/** Only allow same-site relative redirects after login. */
export function safeNext(next: string | null | undefined): string | null {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : null;
}

export function Divider({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 my-5 text-xs text-ink-muted">
      <div className="flex-1 border-t border-border" />{children}<div className="flex-1 border-t border-border" />
    </div>
  );
}

export function PasswordInput({ id, value, onChange, autoComplete, placeholder }: { id: string; value: string; onChange: (v: string) => void; autoComplete?: string; placeholder?: string }) {
  return <PasswordInner id={id} value={value} onChange={onChange} autoComplete={autoComplete} placeholder={placeholder} />;
}

function PasswordInner({ id, value, onChange, autoComplete, placeholder }: { id: string; value: string; onChange: (v: string) => void; autoComplete?: string; placeholder?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input id={id} type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} placeholder={placeholder} required className="input pr-16" />
      <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-primary hover:underline" aria-label={show ? 'Hide password' : 'Show password'}>
        {show ? 'Hide' : 'Show'}
      </button>
    </div>
  );
}
