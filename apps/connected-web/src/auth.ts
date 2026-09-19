const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const APP_URL = (import.meta.env.VITE_APP_URL || location.origin) as string;
const KEY = 'tt-connected-session';

export type Session = { access_token: string; refresh_token: string; expires_at: number; user: { id: string; email?: string } };
export type AuthLinkMode = 'invite' | 'recovery' | null;

let memorySession: Session | null = null;
let refreshInFlight: Promise<Session> | null = null;

function readStoredSession(): Session | null {
  try {
    const value = localStorage.getItem(KEY);
    return value ? JSON.parse(value) : memorySession;
  } catch {
    return memorySession;
  }
}

export const session = {
  get(): Session | null {
    if (import.meta.env.VITE_DEMO_MODE === 'true') return { access_token: 'demo', refresh_token: 'demo', expires_at: 4102444800, user: { id: 'demo', email: 'demo@example.test' } };
    return readStoredSession();
  },
  set(value: Session | null) {
    memorySession = value;
    try {
      if (value) localStorage.setItem(KEY, JSON.stringify(value));
      else localStorage.removeItem(KEY);
    } catch {
      // Some mobile and private browsing modes deny storage. Keep this tab signed in.
    }
  }
};

async function auth(path: string, payload: unknown, method = 'POST', token?: string) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method,
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: payload === undefined ? undefined : JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.msg || data.error_description || data.message || 'Authentication failed');
  return data;
}

function save(data: Session & { expires_in?: number }) {
  const value = { ...data, expires_at: data.expires_at || Math.floor(Date.now() / 1000) + Number(data.expires_in || 3600) };
  session.set(value);
  return value;
}

export async function signIn(email: string, password: string) { return save(await auth('token?grant_type=password', { email, password })); }
export async function requestPasswordReset(email: string) { await auth('recover', { email, redirect_to: `${APP_URL}/?auth=recovery` }); return { sent: true }; }
export const resetPassword = requestPasswordReset;
export async function updatePassword(password: string) { const token = await accessToken(); if (!token) throw new Error('Authentication required'); return auth('user', { password }, 'PUT', token); }
export async function signOut(scope: 'local' | 'global' = 'local') { const current = session.get(); if (current) await auth(`logout?scope=${scope}`, {}, 'POST', current.access_token).catch(() => undefined); session.set(null); }

export async function refresh() {
  if (refreshInFlight) return refreshInFlight;
  const current = session.get();
  if (!current) throw new Error('No session');
  refreshInFlight = auth('token?grant_type=refresh_token', { refresh_token: current.refresh_token })
    .then(save)
    .catch((error) => { session.set(null); throw error; })
    .finally(() => { refreshInFlight = null; });
  return refreshInFlight;
}

export async function accessToken() {
  let current = session.get();
  if (current && current.expires_at - Date.now() / 1000 < 60) current = await refresh();
  return current?.access_token;
}

export async function consumeAuthLink(): Promise<AuthLinkMode> {
  const url = new URL(location.href);
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
  const mode = (url.searchParams.get('auth') || hash.get('type')) as AuthLinkMode;
  const access = hash.get('access_token'), refreshToken = hash.get('refresh_token');
  if (access && refreshToken) save({ access_token: access, refresh_token: refreshToken, expires_at: Math.floor(Date.now() / 1000) + Number(hash.get('expires_in') || 3600), user: { id: 'pending' } });
  else if (url.searchParams.get('code')) {
    let verifier: string | null = null;
    try { verifier = sessionStorage.getItem('tt-pkce-verifier'); } catch { /* storage may be unavailable */ }
    if (verifier) save(await auth('token?grant_type=pkce', { auth_code: url.searchParams.get('code'), code_verifier: verifier }));
  }
  url.hash = '';
  ['code', 'token_hash', 'type', 'auth'].forEach(key => url.searchParams.delete(key));
  history.replaceState(null, '', url.pathname + url.search);
  return mode === 'invite' || mode === 'recovery' ? mode : null;
}
