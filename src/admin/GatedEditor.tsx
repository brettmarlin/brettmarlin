import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { admin, ApiError } from '../lib/api';
import { findStudy } from '../lib/studies';
import { useToast } from './Toast';
import { errorText } from './useAsync';

/** Paste the output of scripts/generate-recipient-study.mjs (the named take,
 *  beats bound against R2) and the Worker keeps it behind the study's gate. */
export function GatedEditor() {
  const { publicSlug = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const pub = findStudy(publicSlug);
  const [raw, setRaw] = useState('');
  const [slug, setSlug] = useState('');
  const [existing, setExisting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    admin.gatedOne(publicSlug).then((g) => { setExisting(true); setSlug(g.slug); setRaw(JSON.stringify(g.study, null, 2)); }).catch(() => setExisting(false));
  }, [publicSlug]);

  const parsed = (() => { try { const v = JSON.parse(raw); return v?.study && v?.take ? v.study : v; } catch { return null; } })();
  const save = async () => {
    setError(null);
    if (!parsed || typeof parsed !== 'object' || !parsed.title) { setError('Paste a study object with at least a title.'); return; }
    const s = slug || parsed.slug;
    if (!s) { setError('Give the gated take a slug (its Card slug in the vault).'); return; }
    try { await admin.saveGated(publicSlug, { slug: s, study: { ...parsed, slug: s } }); toast('Gated extension saved.'); navigate('/admin/studies'); }
    catch (e) { setError(e instanceof ApiError ? errorText(e.code) : String(e)); }
  };
  const remove = async () => {
    if (!window.confirm('Remove the gated extension? The public study stays.')) return;
    await admin.removeGated(publicSlug); toast('Removed.'); navigate('/admin/studies');
  };
  return (
    <>
      <header className="admin-head">
        <h1 className="t-h1">Gated extension</h1>
        <span className="label muted">on {pub?.title ?? publicSlug}</span>
      </header>
      <p className="t-caption muted measure">From the site repo, with the vault present: <span className="mono">node scripts/generate-recipient-study.mjs {'<gated-card-slug>'} --take recipient-named --images-from {publicSlug}</span>, then paste the JSON below. Or run <span className="mono">npm run gated:publish -- --public {publicSlug} --slug {'<gated-card-slug>'}</span> to do both.</p>
      <div className="form-grid">
        <label className="field"><span>Gated take slug</span><input className="input" value={slug} onChange={(e) => setSlug(e.target.value.trim())} placeholder="the Card slug of the named take" /></label>
        <div className="field"><span>Status</span><p className="t-small">{existing ? 'An extension is stored for this study.' : 'No extension stored yet.'}</p></div>
        <label className="field span"><span>Study JSON</span><textarea className="input boxed mono" rows={18} value={raw} onChange={(e) => setRaw(e.target.value)} placeholder='{ "slug": "...", "title": "...", "built": [], "result": "...", "beats": { ... } }' /></label>
      </div>
      {parsed?.title ? <p className="t-small"><span className="label muted">Parsed</span> {parsed.title}, {Array.isArray(parsed.built) ? parsed.built.length : 0} decisions, {parsed.beats ? Object.values(parsed.beats as Record<string, unknown[]>).reduce((n, a) => n + a.length, 0) : 0} beats</p> : raw ? <p className="error">Not valid JSON yet.</p> : null}
      {error ? <p className="error">{error}</p> : null}
      <div className="row">
        <button type="button" className="btn inverse" onClick={save}>Save extension</button>
        {existing ? <button type="button" className="btn quiet" onClick={remove}>Remove</button> : null}
        <Link to="/admin/studies" className="btn quiet">Cancel</Link>
      </div>
    </>
  );
}
