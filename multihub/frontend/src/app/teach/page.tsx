'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { EmailVerifyModal } from '@/components/EmailVerifyModal';
import { Icon, type IconName } from '@/components/Icon';
import { useToast } from '@/components/Toast';
import { Spinner } from '@/components/ui';
import { api, refreshSession, updateStoredUser } from '@/lib/api';
import { useAuth } from '@/lib/hooks';

const STEPS: [IconName, string, string][] = [
  ['edit', 'Plan your curriculum', 'Create a course, add sections and lessons, and attach a video to each lesson.'],
  ['shield', 'Submit for review', 'Our admins review every course for quality before it is published.'],
  ['dollar', 'Earn from enrollments', 'Get paid for every enrollment. Request a payout whenever you have a balance.'],
];

export default function TeachPage() {
  const { user, ready } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [verify, setVerify] = useState(false);
  const isCreator = user && ['CREATOR', 'ADMIN', 'SUPERADMIN'].includes(user.role);

  async function promote() {
    setBusy(true);
    try {
      const updated = await api.post('/api/auth/promote-to-creator');
      updateStoredUser(updated);
      await refreshSession(); // the access token embeds the role — mint a new one
      toast.success('You are now an instructor!');
      router.push('/creator/dashboard');
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }

  function start() {
    if (!user) return router.push('/register?next=/teach');
    if (isCreator) return router.push('/creator/dashboard');
    if (!user.isEmailVerified) return setVerify(true);
    promote();
  }

  return (
    <>
      <section className="bg-ink text-white">
        <div className="container-x py-16 lg:py-24 max-w-4xl">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-tight">Come teach with us</h1>
          <p className="text-lg text-white/80 mt-4 max-w-2xl">Become an instructor and change lives — including your own. Build a course, reach learners, and get paid for it.</p>
          <button onClick={start} disabled={!ready || busy} className="btn bg-white text-ink hover:bg-gray-100 mt-8 px-8 py-3.5 text-base">
            {busy ? <Spinner size={18} /> : isCreator ? 'Open Creator Studio' : 'Get started'}
          </button>
          {ready && user && !isCreator && !user.isEmailVerified && <p className="text-sm text-white/70 mt-3">You&apos;ll be asked to verify your email first.</p>}
        </div>
      </section>
      <section className="container-x py-16">
        <h2 className="text-3xl font-bold tracking-tight text-center mb-10">So many reasons to start</h2>
        <div className="grid md:grid-cols-3 gap-8">
          {STEPS.map(([icon, title, text]) => (
            <div key={title} className="text-center">
              <span className="w-16 h-16 bg-primary-soft text-primary inline-flex items-center justify-center mx-auto"><Icon name={icon} size={30} /></span>
              <h3 className="font-bold text-lg mt-4">{title}</h3>
              <p className="text-ink-muted mt-2 text-sm">{text}</p>
            </div>
          ))}
        </div>
        {!user && ready && <p className="text-center mt-12 text-sm">Already have an account? <Link href="/login?next=/teach" className="text-primary font-bold hover:underline">Log in</Link></p>}
      </section>
      {user && <EmailVerifyModal open={verify} email={user.email} onClose={() => setVerify(false)} onVerified={() => { setVerify(false); promote(); }} />}
    </>
  );
}
