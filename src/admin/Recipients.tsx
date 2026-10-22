import { Link } from 'react-router-dom';
import { admin } from '../lib/api';
import { useAsync, errorText } from './useAsync';
import { formatDate, daysUntil } from '../lib/dates';

export function Recipients() {
  const { data, error, loading } = useAsync(() => admin.recipients(), []);
  return (
    <>
      <header className="admin-head">
        <h1 className="t-h1">Recipients</h1>
        <div className="row"><span className="label muted">{data ? `${data.recipients.length} records` : ''}</span><Link to="/admin/recipients/new" className="btn inverse small">New recipient</Link></div>
      </header>
      {loading ? <p className="label muted">Loading</p> : null}
      {error ? <p className="error">{errorText(error)}</p> : null}
      {data ? (
        <table className="table">
          <thead><tr><th>Company</th><th>Status</th><th>Access</th><th>Picks</th><th>Expires</th><th>Views</th><th>Updated</th><th></th></tr></thead>
          <tbody>
            {data.recipients.map((r) => {
              const days = daysUntil(r.expires);
              return (
                <tr key={r.slug}>
                  <td><Link to={`/admin/recipients/${r.slug}`}><strong>{r.company || r.slug}</strong></Link><br /><span className="mono muted">{r.slug}</span>{r.recipient_name ? <><br /><span className="muted t-caption">{r.recipient_name}{r.recipient_title ? `, ${r.recipient_title}` : ''}</span></> : null}</td>
                  <td><span className={`pill ${r.expired ? 'expired' : r.status}`}>{r.expired ? 'expired' : r.status}</span></td>
                  <td className="t-caption">{r.protected ? 'Password' : 'Open'}{r.protected && !r.has_password ? <span className="error"> no password yet</span> : null}<br /><span className="muted">{r.access_mode ?? ''}{r.funnel_stage ? `, ${r.funnel_stage}` : ''}</span></td>
                  <td className="num">{r.picks}{r.gated_picks ? <span className="signal"> +{r.gated_picks} gated</span> : null}</td>
                  <td className="num">{r.expires ? <>{formatDate(r.expires)}<br /><span className={`t-caption ${days !== null && days <= 7 ? 'signal' : 'muted'}`}>{days === null ? '' : days < 0 ? 'past' : `${days}d`}</span></> : <span className="muted">none</span>}</td>
                  <td className="num">{r.views}</td>
                  <td className="num muted">{formatDate(r.updated ?? undefined)}</td>
                  <td><div className="inline-actions"><Link className="label" to={`/admin/recipients/${r.slug}/preview`}>Preview</Link><a className="label" href={`/for/${r.slug}`} target="_blank" rel="noreferrer">Open</a></div></td>
                </tr>
              );
            })}
            {data.recipients.length === 0 ? <tr><td colSpan={8} className="muted">No recipients yet.</td></tr> : null}
          </tbody>
        </table>
      ) : null}
    </>
  );
}
