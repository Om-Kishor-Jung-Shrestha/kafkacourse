'use client';
import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageSpinner } from '@/components/ui';
import { saveSession } from '@/lib/api';

// §17 — final leg of the Google OAuth flow: the backend's
// GET /api/auth/google/callback redirects here with tokens in the query
// string once it's found/linked/created the user. We persist the session
// (same shape as a normal email/password login) and scrub the tokens from
// the address bar.
function Callback() {
  const router = useRouter();
  const sp = useSearchParams();
  const [error, setError] = useState('');

  useEffect(() => {
    const accessToken = sp.get('accessToken');
    const refreshToken = sp.get('refreshToken');
    const userRaw = sp.get('user');
    if (!accessToken || !refreshToken || !userRaw) { setError('Missing sign-in tokens — please try again.'); return; }
    try {
      saveSession(accessToken, refreshToken, JSON.parse(userRaw));
      window.history.replaceState(null, '', '/auth/callback');
      router.replace('/dashboard');
    } catch {
      setError('Could not parse sign-in response — please try again.');
    }
  }, [sp, router]);

  if (error) return <div className="container-x py-20 text-center"><p className="text-error mb-4">{error}</p><Link href="/login" className="btn-dark">Back to login</Link></div>;
  return <PageSpinner />;
}

export default function AuthCallbackPage() {
  return <Suspense fallback={<PageSpinner />}><Callback /></Suspense>;
}
