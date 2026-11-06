'use client';
import Link from 'next/link';
import { Suspense, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthShell, Divider, PasswordInput, safeNext } from '@/components/AuthShell';
import { GoogleSignInButton } from '@/components/GoogleSignInButton';
import { Icon } from '@/components/Icon';
import { Spinner } from '@/components/ui';
import { api, saveSession } from '@/lib/api';

function RegisterForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const rules = useMemo(() => [
    ['At least 8 characters', form.password.length >= 8],
    ['One uppercase letter', /[A-Z]/.test(form.password)],
    ['One lowercase letter', /[a-z]/.test(form.password)],
    ['One number', /\d/.test(form.password)],
  ] as [string, boolean][], [form.password]);
  const strong = rules.every(([, ok]) => ok);
  const matches = form.password === form.confirm;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!strong) return setError('Please choose a stronger password.');
    if (!matches) return setError('Passwords do not match.');
    setLoading(true);
    setError('');
    try {
      await api.post('/api/auth/register', {
        email: form.email.trim(),
        password: form.password,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim() || undefined,
      });
      const res = await api.post('/api/auth/login', { email: form.email.trim(), password: form.password });
      saveSession(res.accessToken, res.refreshToken, res.user);
      router.push(safeNext(sp.get('next')) ?? '/dashboard');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell title="Sign up and start learning" footer={<>Already have an account? <Link href="/login" className="text-primary font-bold hover:underline">Log in</Link></>}>
      <GoogleSignInButton />
      <Divider>or sign up with email</Divider>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div><label htmlFor="fn" className="label">First name</label><input id="fn" value={form.firstName} onChange={(e) => set('firstName')(e.target.value)} required maxLength={60} autoComplete="given-name" className="input" /></div>
          <div><label htmlFor="ln" className="label">Last name</label><input id="ln" value={form.lastName} onChange={(e) => set('lastName')(e.target.value)} maxLength={60} autoComplete="family-name" className="input" /></div>
        </div>
        <div><label htmlFor="em" className="label">Email</label><input id="em" type="email" value={form.email} onChange={(e) => set('email')(e.target.value)} required autoComplete="email" className="input" /></div>
        <div>
          <label htmlFor="pw" className="label">Password</label>
          <PasswordInput id="pw" value={form.password} onChange={set('password')} autoComplete="new-password" />
          {form.password && (
            <ul className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2 text-xs">
              {rules.map(([label, ok]) => <li key={label} className={`flex items-center gap-1.5 ${ok ? 'text-success' : 'text-ink-muted'}`}><Icon name={ok ? 'checkCircle' : 'info'} size={13} />{label}</li>)}
            </ul>
          )}
        </div>
        <div>
          <label htmlFor="pw2" className="label">Confirm password</label>
          <PasswordInput id="pw2" value={form.confirm} onChange={set('confirm')} autoComplete="new-password" />
          {form.confirm && !matches && <p className="text-xs text-error mt-1">Passwords do not match.</p>}
        </div>
        {error && <p role="alert" className="flex items-start gap-2 text-sm text-error bg-red-50 border border-red-200 p-3"><Icon name="alert" size={16} className="mt-0.5 shrink-0" />{error}</p>}
        <button disabled={loading} className="btn-primary w-full py-3 text-base">{loading ? <Spinner size={18} /> : 'Sign up'}</button>
      </form>
    </AuthShell>
  );
}

export default function RegisterPage() {
  return <Suspense fallback={null}><RegisterForm /></Suspense>;
}
