'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { Avatar } from '@/components/ui';
import { api, logout } from '@/lib/api';
import { CATEGORIES, fullName, labelize, timeAgo } from '@/lib/format';
import { useAuth, useDebounced } from '@/lib/hooks';
import { useCommerce } from '@/lib/commerce';

function useClickOutside(ref: React.RefObject<HTMLElement | null>, onOutside: () => void) {
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && onOutside();
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [ref, onOutside]);
}

export function Nav() {
  const { user, ready } = useAuth();
  const { cart, wishlist } = useCommerce();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSug, setShowSug] = useState(false);
  const [menu, setMenu] = useState<'user' | 'bell' | 'cats' | null>(null);
  const [mobile, setMobile] = useState(false);
  const [unread, setUnread] = useState(0);
  const [recent, setRecent] = useState<any[]>([]);
  const searchRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const dq = useDebounced(q, 200);

  useClickOutside(searchRef, () => setShowSug(false));
  useClickOutside(menuRef, () => setMenu(null));

  useEffect(() => {
    if (dq.trim().length < 2) { setSuggestions([]); return; }
    api.get(`/api/search/suggestions?q=${encodeURIComponent(dq.trim())}`).then(setSuggestions).catch(() => setSuggestions([]));
  }, [dq]);

  // Unread badge: fetch on login and poll gently.
  useEffect(() => {
    if (!user) { setUnread(0); return; }
    const load = () => api.get('/api/notifications/unread-count').then((r) => setUnread(r.count ?? 0)).catch(() => {});
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [user]);

  async function openBell() {
    setMenu(menu === 'bell' ? null : 'bell');
    if (menu !== 'bell') api.get('/api/notifications').then((n) => setRecent(n.slice(0, 5))).catch(() => {});
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    setShowSug(false);
    setMobile(false);
    router.push(q.trim() ? `/courses?q=${encodeURIComponent(q.trim())}` : '/courses');
  }

  async function doLogout() {
    await logout();
    setMenu(null);
    window.location.href = '/';
  }

  const isCreator = user && ['CREATOR', 'ADMIN', 'SUPERADMIN'].includes(user.role);
  const isAdmin = user && ['ADMIN', 'SUPERADMIN'].includes(user.role);

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-border shadow-[0_2px_4px_rgba(0,0,0,.06)]">
      <div className="container-x h-[72px] flex items-center gap-4" ref={menuRef}>
        <button className="lg:hidden p-2 -ml-2" onClick={() => setMobile(true)} aria-label="Open menu"><Icon name="menu" size={24} /></button>

        <Link href="/" className="flex items-center gap-2 shrink-0">
          <span className="w-8 h-8 bg-primary text-white inline-flex items-center justify-center font-bold">M</span>
          <span className="text-xl font-bold tracking-tight hidden sm:inline">MultiHub</span>
        </Link>

        {/* Categories */}
        <div className="relative hidden lg:block">
          <button onClick={() => setMenu(menu === 'cats' ? null : 'cats')} className="text-sm px-3 py-2 hover:text-primary" aria-expanded={menu === 'cats'}>Categories</button>
          {menu === 'cats' && (
            <div className="absolute left-0 top-full mt-2 w-60 bg-white border border-border shadow-pop py-2 animate-fadeIn">
              {CATEGORIES.map((c) => (
                <Link key={c} href={`/courses?category=${c}`} onClick={() => setMenu(null)} className="flex items-center justify-between px-4 py-2 text-sm hover:bg-surface hover:text-primary">
                  {labelize(c)}<Icon name="right" size={14} />
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Search */}
        <div className="flex-1 relative" ref={searchRef}>
          <form onSubmit={submitSearch} role="search" className="flex items-center border border-ink bg-surface rounded-full px-4 h-12 focus-within:bg-white focus-within:ring-2 focus-within:ring-primary/30">
            <Icon name="search" size={18} className="text-ink-muted" />
            <input
              value={q}
              onChange={(e) => { setQ(e.target.value); setShowSug(true); }}
              onFocus={() => setShowSug(true)}
              placeholder="Search for anything"
              aria-label="Search courses"
              className="flex-1 bg-transparent outline-none px-3 text-sm"
            />
          </form>
          {showSug && suggestions.length > 0 && (
            <ul className="absolute left-0 right-0 top-full mt-1 bg-white border border-border shadow-pop z-10 animate-fadeIn">
              {suggestions.map((s) => (
                <li key={s.id}>
                  <Link href={`/courses/${s.slug}`} onClick={() => { setShowSug(false); setQ(''); }} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-surface">
                    <Icon name="search" size={16} className="text-ink-muted" />{s.title}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <nav className="hidden lg:flex items-center gap-1 text-sm">
          {ready && user ? (
            <>
              {isCreator ? (
                <Link href="/creator/dashboard" className="px-3 py-2 hover:text-primary">Creator Studio</Link>
              ) : (
                <Link href="/teach" className="px-3 py-2 hover:text-primary">Teach on MultiHub</Link>
              )}
              <Link href="/dashboard" className="px-3 py-2 hover:text-primary">My learning</Link>
            </>
          ) : (
            ready && <Link href="/teach" className="px-3 py-2 hover:text-primary">Teach on MultiHub</Link>
          )}
        </nav>

        {ready && user ? (
          <div className="flex items-center gap-1">
            <Link href="/wishlist" className="relative p-2.5 hover:bg-surface rounded-full hidden sm:inline-flex" aria-label={`Wishlist${wishlist.length ? `, ${wishlist.length} saved` : ''}`}>
              <Icon name="heart" size={22} />
              {wishlist.length > 0 && <span className="absolute top-1 right-0.5 min-w-[18px] h-[18px] px-1 bg-ink text-white text-[10px] font-bold rounded-full inline-flex items-center justify-center">{wishlist.length}</span>}
            </Link>
            <Link href="/cart" className="relative p-2.5 hover:bg-surface rounded-full" aria-label={`Shopping cart${cart.length ? `, ${cart.length} item${cart.length > 1 ? 's' : ''}` : ''}`}>
              <Icon name="cart" size={22} />
              {cart.length > 0 && <span className="absolute top-1 right-0.5 min-w-[18px] h-[18px] px-1 bg-accent text-white text-[10px] font-bold rounded-full inline-flex items-center justify-center">{cart.length}</span>}
            </Link>
            {/* Notifications */}
            <div className="relative">
              <button onClick={openBell} className="relative p-2.5 hover:bg-surface rounded-full" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
                <Icon name="bell" size={22} />
                {unread > 0 && <span className="absolute top-1 right-0.5 min-w-[18px] h-[18px] px-1 bg-accent text-white text-[10px] font-bold rounded-full inline-flex items-center justify-center">{unread > 9 ? '9+' : unread}</span>}
              </button>
              {menu === 'bell' && (
                <div className="absolute right-0 top-full mt-2 w-[340px] max-w-[92vw] bg-white border border-border shadow-pop animate-fadeIn">
                  <div className="px-4 py-3 border-b border-border font-bold flex justify-between">Notifications
                    <Link href="/notifications" onClick={() => setMenu(null)} className="text-primary text-sm hover:underline">See all</Link>
                  </div>
                  {recent.length === 0 ? <p className="p-6 text-sm text-ink-muted text-center">You&apos;re all caught up.</p> : (
                    <ul className="max-h-80 overflow-y-auto divide-y divide-border">
                      {recent.map((n) => (
                        <li key={n.id} className={`px-4 py-3 text-sm ${n.isRead ? '' : 'bg-primary-soft/50'}`}>
                          <p className="font-bold">{n.title}</p>
                          <p className="text-ink-muted line-clamp-2">{n.message}</p>
                          <p className="text-xs text-ink-muted mt-1">{timeAgo(n.createdAt)}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            {/* User menu */}
            <div className="relative">
              <button onClick={() => setMenu(menu === 'user' ? null : 'user')} className="p-1 rounded-full hover:ring-2 hover:ring-border" aria-label="Account menu" aria-expanded={menu === 'user'}>
                <Avatar user={user} size={40} />
              </button>
              {menu === 'user' && (
                <div className="absolute right-0 top-full mt-2 w-72 bg-white border border-border shadow-pop animate-fadeIn">
                  <div className="flex items-center gap-3 p-4 border-b border-border">
                    <Avatar user={user} size={52} />
                    <div className="min-w-0">
                      <p className="font-bold truncate">{fullName(user)}</p>
                      <p className="text-xs text-ink-muted truncate">{user.email}</p>
                    </div>
                  </div>
                  <MenuLink href="/dashboard" onClick={() => setMenu(null)}>My learning</MenuLink>
                  <MenuLink href="/cart" onClick={() => setMenu(null)}>My cart{cart.length > 0 && ` (${cart.length})`}</MenuLink>
                  <MenuLink href="/wishlist" onClick={() => setMenu(null)}>Wishlist{wishlist.length > 0 && ` (${wishlist.length})`}</MenuLink>
                  <MenuLink href="/notifications" onClick={() => setMenu(null)}>Notifications{unread > 0 && ` (${unread})`}</MenuLink>
                  <MenuLink href="/purchases" onClick={() => setMenu(null)}>Purchase history</MenuLink>
                  {isCreator && <MenuLink href="/creator/dashboard" onClick={() => setMenu(null)}>Creator Studio</MenuLink>}
                  {isAdmin && <MenuLink href="/admin" onClick={() => setMenu(null)}>Admin</MenuLink>}
                  {user.role === 'SUPERADMIN' && <MenuLink href="/superadmin" onClick={() => setMenu(null)}>Platform settings</MenuLink>}
                  <div className="border-t border-border" />
                  <MenuLink href="/profile" onClick={() => setMenu(null)}>Account settings</MenuLink>
                  <button onClick={doLogout} className="w-full text-left px-4 py-2.5 text-sm hover:bg-surface hover:text-primary">Log out</button>
                </div>
              )}
            </div>
          </div>
        ) : (
          ready && (
            <div className="flex items-center gap-2">
              <Link href="/cart" className="relative p-2.5 hover:bg-surface rounded-full" aria-label={`Shopping cart${cart.length ? `, ${cart.length} item${cart.length > 1 ? 's' : ''}` : ''}`}>
              <Icon name="cart" size={22} />
              {cart.length > 0 && <span className="absolute top-1 right-0.5 min-w-[18px] h-[18px] px-1 bg-accent text-white text-[10px] font-bold rounded-full inline-flex items-center justify-center">{cart.length}</span>}
            </Link>
              <Link href="/login" className="btn-outline hidden sm:inline-flex">Log in</Link>
              <Link href="/register" className="btn-dark">Sign up</Link>
            </div>
          )
        )}
      </div>

      {/* Mobile drawer */}
      {mobile && (
        <div className="fixed inset-0 z-[80] lg:hidden">
          <div className="absolute inset-0 bg-ink/60" onClick={() => setMobile(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-[300px] max-w-[85vw] bg-white overflow-y-auto animate-fadeIn">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <span className="font-bold text-lg">Menu</span>
              <button onClick={() => setMobile(false)} aria-label="Close menu"><Icon name="close" /></button>
            </div>
            <div className="p-2">
              {user ? (
                <>
                  <MenuLink href="/dashboard" onClick={() => setMobile(false)}>My learning</MenuLink>
                  <MenuLink href="/cart" onClick={() => setMobile(false)}>My cart{cart.length > 0 && ` (${cart.length})`}</MenuLink>
                  <MenuLink href="/wishlist" onClick={() => setMobile(false)}>Wishlist{wishlist.length > 0 && ` (${wishlist.length})`}</MenuLink>
                  <MenuLink href="/notifications" onClick={() => setMobile(false)}>Notifications</MenuLink>
                  <MenuLink href="/purchases" onClick={() => setMobile(false)}>Purchase history</MenuLink>
                  {isCreator ? <MenuLink href="/creator/dashboard" onClick={() => setMobile(false)}>Creator Studio</MenuLink> : <MenuLink href="/teach" onClick={() => setMobile(false)}>Teach on MultiHub</MenuLink>}
                  {isAdmin && <MenuLink href="/admin" onClick={() => setMobile(false)}>Admin</MenuLink>}
                  {user.role === 'SUPERADMIN' && <MenuLink href="/superadmin" onClick={() => setMobile(false)}>Platform settings</MenuLink>}
                  <MenuLink href="/profile" onClick={() => setMobile(false)}>Account settings</MenuLink>
                </>
              ) : (
                <>
                  <MenuLink href="/login" onClick={() => setMobile(false)}>Log in</MenuLink>
                  <MenuLink href="/register" onClick={() => setMobile(false)}>Sign up</MenuLink>
                  <MenuLink href="/teach" onClick={() => setMobile(false)}>Teach on MultiHub</MenuLink>
                </>
              )}
              <p className="px-4 pt-4 pb-1 text-xs font-bold uppercase tracking-wide text-ink-muted">Categories</p>
              {CATEGORIES.map((c) => <MenuLink key={c} href={`/courses?category=${c}`} onClick={() => setMobile(false)}>{labelize(c)}</MenuLink>)}
              {user && <button onClick={doLogout} className="w-full text-left px-4 py-2.5 text-sm hover:bg-surface mt-2 border-t border-border">Log out</button>}
            </div>
          </aside>
        </div>
      )}
    </header>
  );
}

function MenuLink({ href, children, onClick }: { href: string; children: React.ReactNode; onClick?: () => void }) {
  return <Link href={href} onClick={onClick} className="block px-4 py-2.5 text-sm hover:bg-surface hover:text-primary">{children}</Link>;
}
