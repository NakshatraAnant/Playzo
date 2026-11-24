import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import { api } from './api';

export interface Me {
  id: string; username: string; displayName: string; email: string | null; isGuest: boolean; ageBand: 'unknown' | 'child' | 'teen' | 'adult';
  role: 'user' | 'tester' | 'support' | 'admin'; avatar: string; frame: string | null; theme: string | null; xp: number; level: number; emailVerified: boolean;
  parentalConsent: boolean; adultVerified: boolean; adultVerifyMethod: string | null; premium: boolean; premiumUntil: string | null; privacy: string; allowFriendRequests: boolean;
  balances: { ZO: number; CHIPS?: number }; lounge: { entitled: boolean; reasons: string[]; cooloffUntil: string | null; qaPreview: boolean; visible: boolean };
  social: { canSearchUsers: boolean; canSendFriendRequests: boolean; canJoinPrivateRooms: boolean; canUsePublicMatchmaking: boolean; canPurchase: boolean };
  loungeDailyLimitMin: number | null; preferences?: string[]; hasPassword?: boolean;
}
interface Providers { google: boolean; apple: boolean; devMode: boolean; email?: boolean }
interface Toast { id: number; text: string; kind?: 'ok' | 'bad' | 'reward' }

interface Store {
  me: Me | null; ready: boolean; providers: Providers;
  refresh: () => Promise<void>; setMe: (m: Me | null) => void;
  ensureSession: () => Promise<Me>;
  toast: (text: string, kind?: Toast['kind']) => void; toasts: Toast[];
  muted: boolean; setMuted: (m: boolean) => void;
  reducedMotion: boolean;
}
const Ctx = createContext<Store>(null as any);

const safeGet = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const safeSet = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } };

export function StoreProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);
  const [providers, setProviders] = useState<Providers>({ google: false, apple: false, devMode: false });
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [muted, setMutedState] = useState(safeGet('pz-muted') === '1');
  const reducedMotion = useMemo(() => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  const nextId = useRef(1);

  const refresh = useCallback(async () => {
    try {
      const r = await api.get<{ user: Me | null; providers: Providers }>('/api/auth/me');
      setMe(r.user);
      setProviders(r.providers);
    } catch {
      /* API unreachable (e.g. still starting): stay signed-out, retry shortly */
      setTimeout(() => { api.get<{ user: Me | null; providers: Providers }>('/api/auth/me').then((r) => { setMe(r.user); setProviders(r.providers); }).catch(() => undefined); }, 2500);
    } finally { setReady(true); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { document.documentElement.dataset.theme = me?.theme ?? ''; }, [me?.theme]);

  // One shared in-flight request: concurrent callers (StrictMode double effects, several widgets)
  // must not each create a guest. If a session already exists server-side, adopt it.
  const pendingSession = useRef<Promise<Me> | null>(null);
  const ensureSession = useCallback(async () => {
    if (me) return me;
    if (!pendingSession.current) {
      pendingSession.current = (async () => {
        try {
          const r = await api.post<{ user: Me }>('/api/auth/guest');
          return r.user;
        } catch (e: any) {
          if (e?.code !== 'ALREADY') throw e;
          const r = await api.get<{ user: Me | null }>('/api/auth/me');
          if (!r.user) throw e;
          return r.user;
        }
      })().finally(() => { pendingSession.current = null; });
    }
    const u = await pendingSession.current;
    setMe(u);
    return u;
  }, [me]);

  const toast = useCallback((text: string, kind?: Toast['kind']) => {
    const id = nextId.current++;
    setToasts((t) => [...t.slice(-3), { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'reward' ? 4200 : 3200);
  }, []);
  const setMuted = (m: boolean) => { setMutedState(m); safeSet('pz-muted', m ? '1' : '0'); };

  return <Ctx.Provider value={{ me, ready, providers, refresh, setMe, ensureSession, toast, toasts, muted, setMuted, reducedMotion }}>{children}</Ctx.Provider>;
}
export const useStore = () => useContext(Ctx);

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): { data: T | null; error: string | null; loading: boolean; reload: () => void } {
  const [state, set] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: true });
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    set((s) => ({ ...s, loading: true, error: null }));
    fn().then((data) => alive && set({ data, error: null, loading: false })).catch((e) => alive && set({ data: null, error: e?.message ?? 'Failed to load', loading: false }));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n]);
  return { ...state, reload: () => setN((x) => x + 1) };
}
