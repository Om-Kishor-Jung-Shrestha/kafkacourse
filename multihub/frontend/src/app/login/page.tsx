'use client';
import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthShell, Divider, PasswordInput, safeNext } from '@/components/AuthShell';
import { GoogleSignInButton } from '@/components/GoogleSignInButton';
import { Icon } from '@/components/Icon';
import { Spinner } from '@/components/ui';
import { api, saveSession } from '@/lib/api';

// Seeded by backend/prisma/seed.ts — only shown in development builds.
const DEMO = [
  ['Learner', 'user1@multihub.dev'],
  ['Creator', 'omkishor.28471@student.trinity.edu.np'],
  ['Admin', 'luciferdrose124@gmail.com'],
  ['SuperAdmin', 'omshrestha40@gmail.com'],
];

function LoginForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(sp.get('error') ?? '');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await api.post('/api/auth/login', { email: email.trim(), password });
      saveSession(res.accessToken, res.refreshToken, res.user);
      const admin = ['ADMIN', 'SUPERADMIN'].includes(res.user.role);
      router.push(safeNext(sp.get('next')) ?? (admin ? '/admin' : '/dashboard'));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Log in to your account"
      footer={<>Don&apos;t have an account? <Link href={`/register${sp.get('next') ? `?next=${encodeURIComponent(sp.get('next')!)}` : ''}`} className="text-primary font-bold hover:underline">Sign up</Link></>}
    >
      <GoogleSignInButton />
      <Divider>or continue with email</Divider>
      <form onSubmit={submit} className="space-y-4" noValidate={false}>
        <div>
          <label htmlFor="email" className="label">Email</label>
          <input id="email" value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" required className="input" />
        </div>
        <div>
          <label htmlFor="password" className="label">Password</label>
          <PasswordInput id="password" value={password} onChange={setPassword} autoComplete="current-password" />
        </div>
        {error && <p role="alert" className="flex items-start gap-2 text-sm text-error bg-red-50 border border-red-200 p-3"><Icon name="alert" size={16} className="mt-0.5 shrink-0" />{error}</p>}
        <button disabled={loading} className="btn-primary w-full py-3 text-base">{loading ? <Spinner size={18} /> : 'Log in'}</button>
      </form>

      {process.env.NODE_ENV !== 'production' && (
        <div className="mt-6 border border-dashed border-border p-3 text-xs">
          <p className="font-bold mb-2">Demo accounts <span className="font-normal text-ink-muted">(password <code>Password123!</code>)</span></p>
          <div className="flex flex-wrap gap-1.5">
            {DEMO.map(([label, mail]) => (
              <button key={mail} type="button" onClick={() => { setEmail(mail); setPassword('Password123!'); }} className="px-2.5 py-1 border border-border hover:bg-surface font-bold">{label}</button>
            ))}
          </div>
        </div>
      )}
    </AuthShell>
  );
}

export default function LoginPage() {
  return <Suspense fallback={null}><LoginForm /></Suspense>;
}
