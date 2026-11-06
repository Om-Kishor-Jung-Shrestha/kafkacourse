'use client';
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Icon } from '@/components/Icon';

type ToastKind = 'success' | 'error' | 'info';
type ToastItem = { id: number; kind: ToastKind; text: string };
type ToastApi = { success: (t: string) => void; error: (t: string) => void; info: (t: string) => void };

const ToastCtx = createContext<ToastApi>({ success() {}, error() {}, info() {} });
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((kind: ToastKind, text: string) => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { id, kind, text }]);
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), 4500);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({ success: (t) => push('success', t), error: (t) => push('error', t), info: (t) => push('info', t) }),
    [push],
  );

  const color: Record<ToastKind, string> = { success: 'bg-success', error: 'bg-error', info: 'bg-ink' };
  const icon: Record<ToastKind, 'checkCircle' | 'alert' | 'info'> = { success: 'checkCircle', error: 'alert', info: 'info' };

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-[min(92vw,380px)]" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`${color[t.kind]} text-white px-4 py-3 shadow-pop flex items-start gap-3 text-sm animate-fadeIn`}>
            <Icon name={icon[t.kind]} size={18} className="mt-0.5 shrink-0" />
            <span className="flex-1">{t.text}</span>
            <button onClick={() => setItems((s) => s.filter((x) => x.id !== t.id))} aria-label="Dismiss" className="opacity-80 hover:opacity-100">
              <Icon name="close" size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
