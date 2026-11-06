import type { Metadata } from 'next';
import './globals.css';
import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';
import { ToastProvider } from '@/components/Toast';
import { CommerceProvider } from '@/lib/commerce';

export const metadata: Metadata = {
  title: 'MultiHub — Learn something new',
  description: 'Online courses from expert instructors. Learn at your own pace.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-bg text-ink font-sans flex flex-col">
        <ToastProvider>
          <CommerceProvider>
            <Nav />
            <main className="flex-1">{children}</main>
            <Footer />
          </CommerceProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
