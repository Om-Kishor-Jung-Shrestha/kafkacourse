'use client';
import { useEffect, useState } from 'react';
import { Modal, Spinner } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { api, updateStoredUser } from '@/lib/api';

/** Email verification via a 6-digit OTP (sent through the backend's email service → MailHog in dev). */
export function EmailVerifyModal({ open, email, onClose, onVerified }: { open: boolean; email: string; onClose: () => void; onVerified: () => void }) {
  const toast = useToast();
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (!open) { setSent(false); setCode(''); setError(''); }
  }, [open]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function send() {
    setBusy(true); setError('');
    try {
      await api.post('/api/auth/otp/send', { email, purpose: 'REGISTRATION' });
      setSent(true); setCooldown(60);
      toast.info(`Code sent to ${email}`);
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await api.post('/api/auth/otp/verify', { email, purpose: 'REGISTRATION', code });
      const me = await api.get('/api/auth/me');
      updateStoredUser(me);
      toast.success('Email verified!');
      onVerified();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title="Verify your email">
      {!sent ? (
        <div className="space-y-4">
          <p className="text-sm text-ink-soft">We&apos;ll email a 6-digit code to <b>{email}</b>. It expires after 3 minutes.</p>
          {error && <p role="alert" className="text-sm text-error">{error}</p>}
          <button onClick={send} disabled={busy} className="btn-primary w-full py-3">{busy ? <Spinner size={18} /> : 'Send code'}</button>
        </div>
      ) : (
        <form onSubmit={verify} className="space-y-4">
          <p className="text-sm text-ink-soft">Enter the code we sent to <b>{email}</b>.</p>
          {process.env.NODE_ENV !== 'production' && <p className="text-xs bg-surface border border-border p-2">Dev tip: emails are captured by MailHog at <a href="http://localhost:8025" target="_blank" rel="noreferrer" className="text-primary font-bold underline">localhost:8025</a>.</p>}
          <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="123456" aria-label="Verification code" className="input text-center text-2xl tracking-[0.5em] font-bold" autoFocus />
          {error && <p role="alert" className="text-sm text-error">{error}</p>}
          <button disabled={busy || code.length !== 6} className="btn-primary w-full py-3">{busy ? <Spinner size={18} /> : 'Verify'}</button>
          <button type="button" onClick={send} disabled={busy || cooldown > 0} className="w-full text-sm font-bold text-primary disabled:text-ink-muted">{cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}</button>
        </form>
      )}
    </Modal>
  );
}
