import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../lib/api';

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(() => {
    setLoading(true);
    fn().then((d) => { setData(d); setError(null); }).catch((e) => setError(e instanceof ApiError ? e.code : String(e))).finally(() => setLoading(false));
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  return { data, error, loading, reload: load };
}

export function errorText(code: string): string {
  const map: Record<string, string> = {
    no_picks: 'Add at least one pick before publishing.',
    password_required_before_publish: 'Protected links need a password before they go live. Generate one.',
    expires_required_when_protected: 'Protected links need an expiry date.',
    already_expired: 'The expiry date is in the past.',
    bad_expires: 'Expiry must be a date, YYYY-MM-DD.',
    pick_missing_case_study: 'Every pick needs a study.',
    pick_embedded_study_incomplete: 'An embedded study needs at least a slug and a title.',
    bad_gated_payload: 'Expected { slug, study: { title, ... } }.',
    unauthorized: 'Signed out. Sign in again.',
    not_found: 'Not found.',
  };
  return map[code] ?? code.replace(/_/g, ' ');
}
