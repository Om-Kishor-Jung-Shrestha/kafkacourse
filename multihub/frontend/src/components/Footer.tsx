import Link from 'next/link';
import { CATEGORIES, labelize } from '@/lib/format';

export function Footer() {
  return (
    <footer className="bg-ink text-white mt-16">
      <div className="container-x py-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 bg-primary text-white inline-flex items-center justify-center font-bold">M</span>
            <span className="text-xl font-bold">MultiHub</span>
          </div>
          <p className="text-sm text-white/70 mt-3 max-w-xs">Learn something new every day. Courses from expert instructors, at your own pace.</p>
        </div>
        <div>
          <h4 className="font-bold mb-3">Explore</h4>
          <ul className="space-y-2 text-sm text-white/80">
            <li><Link href="/courses" className="hover:text-white hover:underline">All courses</Link></li>
            <li><Link href="/courses?price=free" className="hover:text-white hover:underline">Free courses</Link></li>
            <li><Link href="/courses?sort=popular" className="hover:text-white hover:underline">Most popular</Link></li>
            <li><Link href="/courses?sort=newest" className="hover:text-white hover:underline">New releases</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="font-bold mb-3">Categories</h4>
          <ul className="space-y-2 text-sm text-white/80">
            {CATEGORIES.slice(0, 5).map((c) => <li key={c}><Link href={`/courses?category=${c}`} className="hover:text-white hover:underline">{labelize(c)}</Link></li>)}
          </ul>
        </div>
        <div>
          <h4 className="font-bold mb-3">Community</h4>
          <ul className="space-y-2 text-sm text-white/80">
            <li><Link href="/teach" className="hover:text-white hover:underline">Become an instructor</Link></li>
            <li><Link href="/dashboard" className="hover:text-white hover:underline">My learning</Link></li>
            <li><Link href="/profile" className="hover:text-white hover:underline">Account settings</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="container-x py-5 text-xs text-white/60 flex flex-wrap justify-between gap-2">
          <span>© {new Date().getFullYear()} MultiHub</span>
          <span>Academic capstone project</span>
        </div>
      </div>
    </footer>
  );
}
