'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { EmailVerifyModal } from '@/components/EmailVerifyModal';
import { Icon } from '@/components/Icon';
import { useToast } from '@/components/Toast';
import { Avatar, Badge, PageSpinner, Spinner } from '@/components/ui';
import { api, logout, updateStoredUser } from '@/lib/api';
import { fullName, labelize, shortDate } from '@/lib/format';
import { useRequireAuth } from '@/lib/hooks';

export default function ProfilePage() {
  const { user, allowed } = useRequireAuth();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [verify, setVerify] = useState(false);

  useEffect(() => {
    if (!allowed) return;
    // Refresh from the server so verified/role changes show up.
    api.get('/api/auth/me').then((me) => { updateStoredUser(me); }).catch(() => {});
  }, [allowed]);

  useEffect(() => {
    if (user) { setFirstName(user.firstName ?? ''); setLastName(user.lastName ?? ''); }
  }, [user?.id, user?.firstName, user?.lastName]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!allowed || !user) return <PageSpinner />;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      updateStoredUser(await api.patch('/api/auth/profile', { firstName: firstName.trim(), lastName: lastName.trim() }));
      toast.success('Profile updated');
    } catch (err: any) { toast.error(err.message); } finally { setSaving(false); }
  }

  async function onAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) return toast.error('Please choose a JPEG, PNG or WEBP image.');
    if (f.size > 5 * 1024 * 1024) return toast.error('Image must be 5 MB or smaller.');
    setUploading(true);
    try {
      updateStoredUser(await api.upload('/api/auth/avatar', f));
      toast.success('Photo updated');
    } catch (err: any) { toast.error(err.message); } finally { setUploading(false); }
  }

  const dirty = firstName.trim() !== (user.firstName ?? '') || lastName.trim() !== (user.lastName ?? '');

  return (
    <div className="container-x py-10 max-w-3xl">
      <div className="flex items-center gap-5 mb-8">
        <div className="relative">
          <Avatar user={user} size={96} />
          {uploading && <span className="absolute inset-0 bg-white/70 rounded-full flex items-center justify-center"><Spinner /></span>}
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{fullName(user)}</h1>
          <p className="text-ink-muted">{user.email}</p>
          <div className="flex gap-2 mt-2"><Badge tone="dark">{labelize(user.role)}</Badge>{user.isEmailVerified ? <Badge tone="green">Email verified</Badge> : <Badge tone="amber">Not verified</Badge>}</div>
        </div>
      </div>

      <section className="card p-6 mb-6">
        <h2 className="text-xl font-bold mb-4">Public profile</h2>
        <form onSubmit={save} className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div><label htmlFor="fn" className="label">First name</label><input id="fn" value={firstName} onChange={(e) => setFirstName(e.target.value)} required maxLength={60} className="input" /></div>
            <div><label htmlFor="ln" className="label">Last name</label><input id="ln" value={lastName} onChange={(e) => setLastName(e.target.value)} maxLength={60} className="input" /></div>
          </div>
          <div>
            <label className="label">Photo</label>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={onAvatar} className="hidden" />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="btn-outline"><Icon name="upload" size={16} /> Upload photo</button>
            <p className="text-xs text-ink-muted mt-1.5">JPEG, PNG or WEBP, up to 5 MB.</p>
          </div>
          <button disabled={saving || !dirty || !firstName.trim()} className="btn-dark">{saving ? 'Saving…' : 'Save changes'}</button>
        </form>
      </section>

      <section className="card p-6 mb-6">
        <h2 className="text-xl font-bold mb-4">Account</h2>
        <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
          <div><dt className="text-ink-muted">Email</dt><dd className="font-bold break-all">{user.email}</dd></div>
          <div><dt className="text-ink-muted">Sign-in method</dt><dd className="font-bold">{labelize(user.authProvider ?? 'EMAIL')}</dd></div>
          <div><dt className="text-ink-muted">Member since</dt><dd className="font-bold">{shortDate(user.createdAt)}</dd></div>
          <div><dt className="text-ink-muted">Last login</dt><dd className="font-bold">{shortDate(user.lastLoginAt)}</dd></div>
        </dl>
        {!user.isEmailVerified && (
          <div className="mt-5 border border-amber-200 bg-amber-50 p-4 flex flex-wrap items-center justify-between gap-3 text-sm text-amber-900">
            <span className="flex items-center gap-2"><Icon name="mail" size={18} />Verify your email to become an instructor.</span>
            <button onClick={() => setVerify(true)} className="btn-dark">Verify email</button>
          </div>
        )}
      </section>

      <section className="card p-6 mb-6">
        <h2 className="text-xl font-bold mb-1">Teaching</h2>
        {['CREATOR', 'ADMIN', 'SUPERADMIN'].includes(user.role)
          ? <p className="text-sm text-ink-soft">You can create and manage courses. <Link href="/creator/dashboard" className="text-primary font-bold hover:underline">Open Creator Studio</Link></p>
          : <p className="text-sm text-ink-soft">Want to share your knowledge? <Link href="/teach" className="text-primary font-bold hover:underline">Become an instructor</Link></p>}
      </section>

      <button onClick={async () => { await logout(); window.location.href = '/'; }} className="btn-outline"><Icon name="logout" size={16} /> Log out</button>

      <EmailVerifyModal open={verify} email={user.email} onClose={() => setVerify(false)} onVerified={() => setVerify(false)} />
    </div>
  );
}
