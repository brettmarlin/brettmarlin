import { Link } from 'react-router-dom';
import { admin } from '../lib/api';
import { useAsync } from './useAsync';
import { heroOf, primaryBeats, studies, yearShort } from '../lib/studies';
import { formatDate } from '../lib/dates';

/** The public inventory, as the bundle ships it, beside the gated extensions
 *  the Worker holds. Public content is generated from the vault; this page
 *  only reads it. */
export function Studies() {
  const { data } = useAsync(() => admin.gated(), []);
  const gatedBy = new Map((data?.gated ?? []).map((g) => [g.publicSlug, g]));
  return (
    <>
      <header className="admin-head">
        <h1 className="t-h1">Studies</h1>
        <span className="label muted">{studies.length} public, {data?.gated.length ?? 0} with a gated extension</span>
      </header>
      <p className="t-caption muted">Order, visibility and prose come from the vault through <span className="mono">npm run generate</span>. A gated extension is the named take of a public study, stored on the Worker and unlocked on the study's own page by any recipient password that includes it. Publish one with <span className="mono">npm run gated:publish</span> or paste it here.</p>
      <table className="table">
        <thead><tr><th>#</th><th>Study</th><th>Years</th><th>Beats</th><th>Hero</th><th>Gated extension</th><th></th></tr></thead>
        <tbody>
          {studies.map((s, i) => {
            const g = gatedBy.get(s.slug);
            return (
              <tr key={s.slug}>
                <td className="num muted">{String(i + 1).padStart(2, '0')}</td>
                <td><strong>{s.title}</strong><br /><span className="mono muted">{s.slug}</span>{s.underNda ? <span className="pill" style={{ marginLeft: 8 }}>nda</span> : null}{s.kind === 'experiment' ? <span className="pill" style={{ marginLeft: 8 }}>lab</span> : null}</td>
                <td className="num">{yearShort(s)}</td>
                <td className="num">{primaryBeats(s).length}</td>
                <td className="t-caption">{heroOf(s) ? `${heroOf(s)!.width} x ${heroOf(s)!.height}` : <span className="error">none</span>}</td>
                <td className="t-caption">{g ? <><span className="pill live">locked</span> <span className="mono">{g.slug}</span>, {g.beats} beats{g.updated ? <>, {formatDate(g.updated)}</> : null}</> : <span className="muted">none</span>}</td>
                <td><div className="inline-actions"><Link className="label" to={`/admin/gated/${s.slug}`}>{g ? 'Edit' : 'Add'} extension</Link><Link className="label" to={`/work/${s.slug}`} target="_blank">Open</Link></div></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
