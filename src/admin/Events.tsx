import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { admin } from '../lib/api';
import { useAsync, errorText } from './useAsync';
import { formatDateTime } from '../lib/dates';

export function Events() {
  const [params] = useSearchParams();
  const slugParam = params.get('slug') ?? '';
  const [filter, setFilter] = useState(slugParam);
  const { data, error, loading, reload } = useAsync(() => admin.events(filter || undefined, 300), [filter]);
  return (
    <>
      <header className="admin-head">
        <h1 className="t-h1">Access log</h1>
        <div className="row">
          <input className="input boxed" placeholder="Filter by slug" value={filter} onChange={(e) => setFilter(e.target.value.trim())} style={{ width: 240 }} />
          <button type="button" className="btn small quiet" onClick={reload}>Refresh</button>
        </div>
      </header>
      <p className="t-caption muted">Server-side events written by the Worker on every view, opened study, failed attempt and expired hit. Kept 180 days. The same events reach PostHog when a key is set.</p>
      {loading ? <p className="label muted">Loading</p> : null}
      {error ? <p className="error">{errorText(error)}</p> : null}
      {data ? (
        <table className="table events-table">
          <thead><tr><th>When</th><th>Event</th><th>Recipient</th><th>Where</th><th>Referrer</th><th>Agent</th></tr></thead>
          <tbody>
            {data.events.map((e, i) => (
              <tr key={`${e.ts}-${i}`}>
                <td className="num">{formatDateTime(e.ts)}</td>
                <td><span className={`ev-type ${e.event === 'recipient_portfolio_viewed' || e.event === 'study_unlocked' ? 'ev-viewed' : ''}`}>{e.event.replace(/_/g, ' ')}</span>{e.study ? <><br /><span className="muted t-caption">{e.study}</span></> : null}</td>
                <td><Link to={`/admin/recipients/${e.slug}`} className="mono">{e.slug}</Link></td>
                <td className="t-caption">{[e.city, e.country].filter(Boolean).join(', ') || <span className="muted">unknown</span>}</td>
                <td className="t-caption muted" style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.referrer ?? ''}</td>
                <td className="t-caption muted" style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={e.ua ?? ''}>{e.ua ?? ''}</td>
              </tr>
            ))}
            {data.events.length === 0 ? <tr><td colSpan={6} className="muted">Nothing logged yet.</td></tr> : null}
          </tbody>
        </table>
      ) : null}
    </>
  );
}
