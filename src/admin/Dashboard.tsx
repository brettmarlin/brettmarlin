import { Link } from 'react-router-dom';
import { admin } from '../lib/api';
import { useAsync, errorText } from './useAsync';
import { formatDate, formatDateTime } from '../lib/dates';

export function Dashboard() {
  const { data, error, loading } = useAsync(() => admin.stats(), []);
  if (loading) return <p className="label muted">Loading</p>;
  if (error || !data) return <p className="error">{errorText(error ?? 'error')}</p>;
  const max = Math.max(1, ...data.daily.map((d) => d.views));
  const today = data.daily[data.daily.length - 1]?.day;
  return (
    <>
      <header className="admin-head">
        <h1 className="t-h1">Dashboard</h1>
        <span className="label muted">{data.lastEvent ? `Last activity ${formatDateTime(data.lastEvent.ts)}` : 'No activity yet'}</span>
      </header>
      <div className="stat-grid">
        <Stat n={data.live} label="Live links" />
        <Stat n={data.drafts} label="Drafts" />
        <Stat n={data.protected} label="Password protected" />
        <Stat n={data.last30.recipient_portfolio_viewed ?? 0} label="Views, 30 days" />
        <Stat n={data.last30.study_unlocked ?? 0} label="Study unlocks, 30 days" />
        <Stat n={(data.last30.recipient_password_failed ?? 0) + (data.last30.study_password_failed ?? 0)} label="Failed attempts, 30 days" signal />
      </div>
      <div className="two-col">
        <section className="card">
          <div className="card-title"><h2 className="t-h3">Views, last 14 days</h2><span className="label muted">{data.daily.reduce((n, d) => n + d.views, 0)} total</span></div>
          <div className="spark" aria-label="Daily views">
            {data.daily.map((d) => <span key={d.day} className={d.day === today ? 'today' : ''} style={{ height: `${Math.max(3, (d.views / max) * 100)}%` }} title={`${d.day}: ${d.views}`} />)}
          </div>
          <div className="between label muted"><span>{data.daily[0]?.day}</span><span>{today}</span></div>
        </section>
        <section className="card">
          <div className="card-title"><h2 className="t-h3">Expiring within 14 days</h2><Link to="/admin/recipients" className="label">All recipients</Link></div>
          {data.expiringSoon.length === 0 ? <p className="t-small muted">Nothing expiring soon.</p> : (
            <ul className="stack">
              {data.expiringSoon.map((r) => <li key={r.slug} className="between t-small"><Link to={`/admin/recipients/${r.slug}`}>{r.company || r.slug}</Link><span className="mono">{formatDate(r.expires)}</span></li>)}
            </ul>
          )}
        </section>
        <section className="card">
          <div className="card-title"><h2 className="t-h3">Most viewed, 30 days</h2></div>
          {data.topRecipients.length === 0 ? <p className="t-small muted">No views in the window.</p> : (
            <ul className="stack">
              {data.topRecipients.map((r) => <li key={r.slug} className="between t-small"><Link to={`/admin/recipients/${r.slug}`}>{r.slug}</Link><span className="mono">{r.views}</span></li>)}
            </ul>
          )}
        </section>
        <section className="card">
          <div className="card-title"><h2 className="t-h3">Events by type, 30 days</h2><Link to="/admin/events" className="label">Access log</Link></div>
          <ul className="stack">
            {Object.entries(data.last30).sort((a, b) => b[1] - a[1]).map(([k, v]) => <li key={k} className="between t-small"><span className="ev-type">{k.replace(/_/g, ' ')}</span><span className="mono">{v}</span></li>)}
            {Object.keys(data.last30).length === 0 ? <li className="t-small muted">Quiet.</li> : null}
          </ul>
        </section>
      </div>
    </>
  );
}

function Stat({ n, label, signal = false }: { n: number; label: string; signal?: boolean }) {
  return <div className="stat"><span className={`t-display ${signal && n > 0 ? 'signal' : ''}`}>{n}</span><span className="label muted">{label}</span></div>;
}
