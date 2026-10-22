import { API_BASE, SESSION_KEYS } from './config';
import type { CaseStudy } from '../data/caseStudies';

export type RecipientPick = {
  case_study: string;
  take?: string;
  framing: string;
  gated?: boolean;
  study?: CaseStudy;
  demand?: { quote: string; source: string }[];
};

export type RecipientPayload = {
  slug?: string;
  recipient_name?: string;
  recipient_title?: string;
  company?: string;
  company_context?: string;
  callout?: string;
  intro?: string;
  picks: RecipientPick[];
  expires?: string | null;
  protected?: boolean;
  funnel_stage?: string;
  access_mode?: string;
  created?: string;
  updated?: string;
};

export type RecipientResult =
  | { status: 'ok'; data: RecipientPayload }
  | { status: 'password'; recipientName: string; company: string }
  | { status: 'bad-password'; recipientName: string; company: string }
  | { status: 'rate-limited'; retryIn: number }
  | { status: 'expired'; expires?: string | null }
  | { status: 'not-found' }
  | { status: 'error'; message: string };

const url = (path: string) => `${API_BASE}${path}`;

export async function fetchRecipient(slug: string, password?: string | null, signal?: AbortSignal): Promise<RecipientResult> {
  let res: Response;
  try {
    res = await fetch(url(`/api/recipient/${encodeURIComponent(slug)}`), password
      ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }), signal }
      : { signal });
  } catch (e) {
    return { status: 'error', message: (e as Error).message };
  }
  const body = await res.json().catch(() => ({}));
  if (res.ok) return { status: 'ok', data: body as RecipientPayload };
  if (res.status === 401 && body.error === 'password_required') return { status: 'password', recipientName: body.recipient_name ?? '', company: body.company ?? '' };
  if (res.status === 401) return { status: 'bad-password', recipientName: body.recipient_name ?? '', company: body.company ?? '' };
  if (res.status === 429) return { status: 'rate-limited', retryIn: Number(body.retry_in ?? 60) };
  if (res.status === 410) return { status: 'expired', expires: body.expires };
  if (res.status === 404) return { status: 'not-found' };
  return { status: 'error', message: body.error ?? `HTTP ${res.status}` };
}

export async function fetchStudyGate(slug: string, signal?: AbortSignal): Promise<boolean> {
  try {
    const res = await fetch(url(`/api/study/${encodeURIComponent(slug)}/gate`), { signal });
    return res.ok;
  } catch {
    return false;
  }
}

export type UnlockResult =
  | { status: 'ok'; study: CaseStudy; via: { company: string } }
  | { status: 'bad-password' }
  | { status: 'rate-limited'; retryIn: number }
  | { status: 'error'; message: string };

export async function unlockStudy(slug: string, password: string): Promise<UnlockResult> {
  let res: Response;
  try {
    res = await fetch(url(`/api/study/${encodeURIComponent(slug)}/unlock`), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) });
  } catch (e) {
    return { status: 'error', message: (e as Error).message };
  }
  const body = await res.json().catch(() => ({}));
  if (res.ok) return { status: 'ok', study: body.study, via: body.via ?? { company: '' } };
  if (res.status === 401) return { status: 'bad-password' };
  if (res.status === 429) return { status: 'rate-limited', retryIn: Number(body.retry_in ?? 60) };
  return { status: 'error', message: body.error ?? `HTTP ${res.status}` };
}

/** Passwords live in sessionStorage for the tab's life, never longer. */
export const session = {
  get(key: string): string | null {
    try { return sessionStorage.getItem(key); } catch { return null; }
  },
  set(key: string, value: string) {
    try { sessionStorage.setItem(key, value); } catch { /* private mode */ }
  },
  clear(key: string) {
    try { sessionStorage.removeItem(key); } catch { /* ignore */ }
  },
};

export const recipientPasswordKey = SESSION_KEYS.recipientPassword;
export const studyPasswordKey = SESSION_KEYS.studyPassword;

// ----------------------------------------------------------------- admin
export type RecipientSummary = {
  slug: string; company: string; recipient_name: string; recipient_title: string; status: 'draft' | 'live' | 'expired';
  protected: boolean; expires: string | null; expired: boolean; picks: number; gated_picks: number;
  funnel_stage: string | null; access_mode: string | null; created: string | null; updated: string | null; has_password: boolean; views: number;
};
export type RecipientRecord = RecipientPayload & {
  slug: string; status: 'draft' | 'live' | 'expired'; has_password: boolean; role?: string; jd?: string; notes?: string; password_set?: string;
};
export type AccessEvent = { ts: string; event: string; slug: string; referrer?: string | null; ua?: string | null; country?: string | null; city?: string | null; study?: string; gated?: boolean };
export type Stats = {
  recipients: number; live: number; drafts: number; protected: number; expired: number;
  expiringSoon: { slug: string; company: string; expires: string }[];
  last30: Record<string, number>; topRecipients: { slug: string; views: number }[];
  daily: { day: string; views: number }[]; lastEvent: AccessEvent | null;
};
export type GatedEntry = { publicSlug: string; slug: string; title: string; beats: number; updated: string | null };

export class ApiError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}

async function adminFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = session.get(SESSION_KEYS.adminToken) ?? '';
  const res = await fetch(url(`/api/admin${path}`), { ...init, headers: { ...(init.headers ?? {}), authorization: `Bearer ${token}`, ...(init.body ? { 'content-type': 'application/json' } : {}) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body.error ?? `http_${res.status}`);
  return body as T;
}

export const admin = {
  me: () => adminFetch<{ ok: boolean }>('/me'),
  recipients: () => adminFetch<{ recipients: RecipientSummary[] }>('/recipients'),
  recipient: (slug: string) => adminFetch<{ recipient: RecipientRecord }>(`/recipients/${slug}`),
  save: (slug: string, body: Partial<RecipientRecord> & { password?: string }) => adminFetch<{ ok: boolean; recipient: RecipientRecord }>(`/recipients/${slug}`, { method: 'PUT', body: JSON.stringify(body) }),
  remove: (slug: string) => adminFetch<{ ok: boolean }>(`/recipients/${slug}`, { method: 'DELETE' }),
  rotatePassword: (slug: string, words: string[], password?: string) => adminFetch<{ ok: boolean; password: string; recipient: RecipientRecord }>(`/recipients/${slug}/password`, { method: 'POST', body: JSON.stringify({ words, password }) }),
  setStatus: (slug: string, status: 'draft' | 'live' | 'expired') => adminFetch<{ ok: boolean; recipient: RecipientRecord }>(`/recipients/${slug}/status`, { method: 'POST', body: JSON.stringify({ status }) }),
  preview: (slug: string) => adminFetch<RecipientPayload>(`/recipients/${slug}/preview`),
  events: (slug?: string, limit = 200) => adminFetch<{ events: AccessEvent[] }>(`/events?limit=${limit}${slug ? `&slug=${encodeURIComponent(slug)}` : ''}`),
  stats: () => adminFetch<Stats>('/stats'),
  gated: () => adminFetch<{ gated: GatedEntry[] }>('/gated'),
  gatedOne: (publicSlug: string) => adminFetch<{ slug: string; study: CaseStudy; updated?: string }>(`/gated/${publicSlug}`),
  saveGated: (publicSlug: string, body: { slug: string; study: CaseStudy }) => adminFetch<{ ok: boolean }>(`/gated/${publicSlug}`, { method: 'PUT', body: JSON.stringify(body) }),
  removeGated: (publicSlug: string) => adminFetch<{ ok: boolean }>(`/gated/${publicSlug}`, { method: 'DELETE' }),
  generatePassword: (words: string[]) => adminFetch<{ password: string }>('/password/generate', { method: 'POST', body: JSON.stringify({ words }) }),
};
