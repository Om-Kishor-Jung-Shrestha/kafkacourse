'use client';
import { useEffect, useState } from 'react';
import { api, apiUrl } from '@/lib/api';

// §17 — server-driven OAuth flow: this is a plain link (not a fetch) so the
// browser follows the redirect chain itself (Google consent screen -> our
// callback -> back to /auth/callback with tokens). Only rendered when the
// backend reports Google OAuth is actually configured
// (GOOGLE_CLIENT_ID/SECRET set) — see GET /api/auth/google/status — so
// there's never a dead "Continue with Google" button in the UI.
export function GoogleSignInButton() {
  const [enabled, setEnabled] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    api
      .get('/api/auth/google/status')
      .then((res) => setEnabled(Boolean(res?.enabled)))
      .catch(() => setEnabled(false))
      .finally(() => setChecked(true));
  }, []);

  if (!checked || !enabled) return null;

  return (
    <a
      href={apiUrl('/api/auth/google')}
      className="w-full flex items-center justify-center gap-2 border border-ink py-3 hover:bg-surface transition-colors"
    >
      <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-4z" />
        <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6 29.6 4 24 4 16.3 4 9.6 8.3 6.3 14.7z" />
        <path fill="#4CAF50" d="M24 44c5.5 0 10.4-1.9 14.1-5.1l-6.5-5.5C29.6 35.4 26.9 36 24 36c-5.3 0-9.7-3.4-11.3-8l-6.6 5.1C9.5 39.6 16.2 44 24 44z" />
        <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.4l6.5 5.5C41.5 36 44 30.5 44 24c0-1.3-.1-2.7-.4-3.5z" />
      </svg>
      <span className="text-sm font-bold">Continue with Google</span>
    </a>
  );
}
