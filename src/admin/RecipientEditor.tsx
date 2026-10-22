import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { admin, ApiError, type GatedEntry, type RecipientPick, type RecipientRecord } from '../lib/api';
import { studies } from '../lib/studies';
import { payloadJson, recipientMarkdown, wordCount } from '../lib/vaultExport';
import { todayPlus, formatDate, daysUntil } from '../lib/dates';
import { useToast } from './Toast';
import { errorText } from './useAsync';
import { Close } from '../components/Icons';

const STAGES = ['first-contact', 'recruiter-preview', 'active-evaluation', 'interview-or-discovery'];
const MODES = ['public-preview', 'protected-deep-dive'];
const CROCKFORD = '0123456789abcdefghjkmnpqrstvwxyz';
const FRAMING_LIMIT = 40;

function hash6(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return [...bytes].map((b) => CROCKFORD[b % 32]).join('');
}
function slugify(s: string): string { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

const empty = (): RecipientRecord => ({
  slug: '', status: 'draft', has_password: false, company: '', recipient_name: '', recipient_title: '', company_context: '',
  callout: '', intro: '', role: '', jd: '', funnel_stage: 'active-evaluation', access_mode: 'protected-deep-dive', expires: todayPlus(45), picks: [], protected: true,
});

export function RecipientEditor() {
  const { slug: slugParam } = useParams();
  const isNew = !slugParam;
  const navigate = useNavigate();
  const toast = useToast();
  const [rec, setRec] = useState<RecipientRecord>(empty);
  const [hash] = useState(hash6);
  const [gated, setGated] = useState<GatedEntry[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [words, setWords] = useState('');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    admin.gated().then((g) => setGated(g.gated)).catch(() => {});
    if (!slugParam) return;
    admin.recipient(slugParam).then((r) => { setRec({ ...empty(), ...r.recipient, picks: r.recipient.picks ?? [] }); setLoading(false); }).catch((e) => { setError(e instanceof ApiError ? errorText(e.code) : String(e)); setLoading(false); });
  }, [slugParam]);

  const slug = isNew ? (rec.company ? `${slugify(rec.company)}-${hash}` : '') : rec.slug;
  const set = <K extends keyof RecipientRecord>(k: K, v: RecipientRecord[K]) => { setRec((r) => ({ ...r, [k]: v })); setDirty(true); };
  const setPick = (i: number, p: Partial<RecipientPick>) => { setRec((r) => ({ ...r, picks: r.picks.map((x, j) => (j === i ? { ...x, ...p } : x)) })); setDirty(true); };
  const movePick = (i: number, d: number) => { setRec((r) => { const picks = [...r.picks]; const j = i + d; if (j < 0 || j >= picks.length) return r; [picks[i], picks[j]] = [picks[j], picks[i]]; return { ...r, picks }; }); setDirty(true); };
  const removePick = (i: number) => { setRec((r) => ({ ...r, picks: r.picks.filter((_, j) => j !== i) })); setDirty(true); };
  const addPick = (case_study: string, isGated: boolean) => { if (!case_study) return; setRec((r) => ({ ...r, picks: [...r.picks, { case_study, take: isGated ? 'recipient-named' : 'decisions-outcomes', framing: '', ...(isGated ? { gated: true } : {}) }] })); setDirty(true); };

  const protectedDerived = rec.access_mode === 'protected-deep-dive' || rec.picks.some((p) => p.gated || p.study);
  const available = useMemo(() => studies.filter((s) => !rec.picks.some((p) => p.case_study === s.slug && !p.gated)), [rec.picks]);
  const gatedAvailable = useMemo(() => gated.filter((g) => !rec.picks.some((p) => p.case_study === g.publicSlug && p.gated)), [gated, rec.picks]);

  const save = async (): Promise<RecipientRecord | null> => {
    setError(null); setSaving(true);
    try {
      if (!slug) throw new Error('A company name is needed to mint the slug.');
      const body = { ...rec, slug, protected: protectedDerived, picks: rec.picks.map((p) => ({ ...p, framing: p.framing.trim() })) };
      const res = await admin.save(slug, body);
      setRec({ ...empty(), ...res.recipient, picks: res.recipient.picks ?? [] });
      setDirty(false);
      toast(isNew ? 'Recipient created as a draft.' : 'Saved.');
      if (isNew) navigate(`/admin/recipients/${slug}`, { replace: true });
      return res.recipient;
    } catch (e) { setError(e instanceof ApiError ? errorText(e.code) : (e as Error).message); return null; }
    finally { setSaving(false); }
  };

  const rotate = async () => {
    const saved = dirty ? await save() : rec;
    if (!saved) return;
    try {
      const res = await admin.rotatePassword(saved.slug, words.split(/[\s,]+/).filter(Boolean));
      setRevealed(res.password);
      setRec({ ...empty(), ...res.recipient, picks: res.recipient.picks ?? [] });
      toast('New password set. Copy it now; it is not stored.');
    } catch (e) { setError(e instanceof ApiError ? errorText(e.code) : String(e)); }
  };

  const setStatus = async (status: 'draft' | 'live' | 'expired') => {
    const saved = dirty ? await save() : rec;
    if (!saved) return;
    try { const res = await admin.setStatus(saved.slug, status); setRec({ ...empty(), ...res.recipient, picks: res.recipient.picks ?? [] }); toast(status === 'live' ? 'Live. The link works now.' : `Status: ${status}.`); }
    catch (e) { setError(e instanceof ApiError ? errorText(e.code) : String(e)); }
  };

  const remove = async () => {
    if (!window.confirm(`Delete ${rec.slug}? The link stops working immediately. This cannot be undone.`)) return;
    await admin.remove(rec.slug); toast('Deleted.'); navigate('/admin/recipients');
  };

  const copy = async (text: string, what: string) => { try { await navigator.clipboard.writeText(text); toast(`${what} copied.`); } catch { toast('Could not copy. Select it by hand.'); } };
  const link = `${window.location.origin}/for/${slug}`;
  const days = daysUntil(rec.expires ?? null);

  if (loading) return <p className="label muted">Loading</p>;
  return (
    <>
      <header className="admin-head">
        <div>
          <h1 className="t-h1">{isNew ? 'New recipient' : rec.company || rec.slug}</h1>
          {!isNew ? <p className="mono muted" style={{ marginTop: 8 }}>{link}</p> : null}
        </div>
        <div className="row">
          {!isNew ? <span className={`pill ${rec.status}`}>{rec.status}</span> : null}
          {!isNew ? <button type="button" className="btn small quiet" onClick={() => copy(link, 'Link')}>Copy link</button> : null}
          {!isNew ? <Link to={`/admin/recipients/${rec.slug}/preview`} className="btn small quiet">Preview</Link> : null}
          <button type="button" className="btn small inverse" onClick={save} disabled={saving || (!dirty && !isNew)}>{saving ? 'Saving' : isNew ? 'Create draft' : 'Save'}</button>
        </div>
      </header>

      {error ? <p className="error">{error}</p> : null}

      <section className="form-grid">
        <label className="field"><span>Company</span><input className="input" value={rec.company ?? ''} onChange={(e) => set('company', e.target.value)} placeholder="Acme" /></label>
        <div className="field"><span>Slug</span><p className="mono" style={{ padding: '12px 0' }}>{slug || <span className="muted">from the company name</span>}</p></div>
        <label className="field"><span>Recipient name</span><input className="input" value={rec.recipient_name ?? ''} onChange={(e) => set('recipient_name', e.target.value)} placeholder="Jane Doe, or Acme hiring team" /></label>
        <label className="field"><span>Recipient title</span><input className="input" value={rec.recipient_title ?? ''} onChange={(e) => set('recipient_title', e.target.value)} placeholder="VP Product" /></label>
        <label className="field span"><span>Company context</span><textarea className="input" rows={2} value={rec.company_context ?? ''} onChange={(e) => set('company_context', e.target.value)} placeholder="Their space and the problem they are hiring for, in plain terms." /></label>
        <label className="field"><span>Role pursued</span><input className="input" value={rec.role ?? ''} onChange={(e) => set('role', e.target.value)} placeholder="Head of Product Design" /></label>
        <label className="field"><span>JD link</span><input className="input" value={rec.jd ?? ''} onChange={(e) => set('jd', e.target.value)} placeholder="https://" /></label>
        <label className="field span"><span>Callout, the big line</span><input className="input" value={rec.callout ?? ''} onChange={(e) => set('callout', e.target.value)} placeholder={`Selected work for ${rec.company || 'Acme'}`} /></label>
        <label className="field span"><span>Intro, one or two sentences on why these</span><textarea className="input" rows={3} value={rec.intro ?? ''} onChange={(e) => set('intro', e.target.value)} /></label>
        <label className="field"><span>Funnel stage</span><select className="input" value={rec.funnel_stage ?? ''} onChange={(e) => set('funnel_stage', e.target.value)}>{STAGES.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
        <label className="field"><span>Access mode</span><select className="input" value={rec.access_mode ?? ''} onChange={(e) => set('access_mode', e.target.value)}>{MODES.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
        <label className="field"><span>Expires {protectedDerived ? '(required)' : '(optional)'}</span><input className="input" type="date" value={rec.expires ?? ''} onChange={(e) => set('expires', e.target.value)} /><span className="hint">{days !== null ? (days < 0 ? 'In the past.' : `${days} days from today.`) : 'Protected links must expire.'} <button type="button" className="label" onClick={() => set('expires', todayPlus(45))}>+45d</button> <button type="button" className="label" onClick={() => set('expires', todayPlus(90))}>+90d</button></span></label>
        <div className="field"><span>Protection</span><p className="t-small" style={{ padding: '12px 0' }}>{protectedDerived ? 'Password protected.' : 'Open: anyone with the link.'} <span className="muted">Derived from the access mode and the picks.</span></p></div>
        <label className="field span"><span>Notes, admin only</span><textarea className="input" rows={2} value={rec.notes ?? ''} onChange={(e) => set('notes', e.target.value)} placeholder="Why this selection. Never shown to the recipient." /></label>
      </section>

      <section>
        <div className="between" style={{ borderTop: 'var(--strong) solid var(--rule-2)', paddingTop: 'var(--s-4)' }}>
          <h2 className="t-h3">Picks, in order</h2>
          <span className="label muted">{rec.picks.length} selected</span>
        </div>
        <div className="row" style={{ marginTop: 'var(--s-4)' }}>
          <label className="field" style={{ minWidth: 320 }}><span>Add a public study</span>
            <select className="input" value="" onChange={(e) => addPick(e.target.value, false)}>
              <option value="">Choose</option>
              {available.map((s) => <option key={s.slug} value={s.slug}>{s.title}</option>)}
            </select>
          </label>
          {gatedAvailable.length ? (
            <label className="field" style={{ minWidth: 320 }}><span>Add a gated extension (forces a password)</span>
              <select className="input" value="" onChange={(e) => addPick(e.target.value, true)}>
                <option value="">Choose</option>
                {gatedAvailable.map((g) => <option key={g.publicSlug} value={g.publicSlug}>{g.title || g.slug} ({g.publicSlug})</option>)}
              </select>
            </label>
          ) : null}
        </div>
        {rec.picks.length === 0 ? <p className="t-small muted" style={{ marginTop: 'var(--s-4)' }}>Three strong studies beat five with filler. First contact wants one to three; active evaluation three to five.</p> : null}
        <ol>
          {rec.picks.map((p, i) => {
            const study = studies.find((s) => s.slug === p.case_study);
            const g = gated.find((x) => x.publicSlug === p.case_study);
            const n = wordCount(p.framing);
            return (
              <li key={`${p.case_study}-${i}`} className="pick-editor">
                <div className="pick-editor-head">
                  <span><span className="label signal">{String(i + 1).padStart(2, '0')}</span> <strong>{study?.title ?? g?.title ?? p.study?.title ?? p.case_study}</strong>{p.gated || p.study ? <span className="pill live" style={{ marginLeft: 8 }}>gated</span> : null} <span className="mono muted">{p.case_study}</span></span>
                  <span className="pick-tools">
                    <button type="button" onClick={() => movePick(i, -1)} aria-label="Move up" disabled={i === 0}>&#8593;</button>
                    <button type="button" onClick={() => movePick(i, 1)} aria-label="Move down" disabled={i === rec.picks.length - 1}>&#8595;</button>
                    <button type="button" onClick={() => removePick(i)} aria-label="Remove"><Close size={14} /></button>
                  </span>
                </div>
                <label className="field">
                  <span>Why this one, for them <span className={`word-count ${n > FRAMING_LIMIT ? 'over' : ''}`}>{n}/{FRAMING_LIMIT} words</span></span>
                  <textarea className="input" rows={2} value={p.framing} onChange={(e) => setPick(i, { framing: e.target.value })} placeholder="Open on the connection to their context, close on the single strongest proof. One claim." />
                </label>
              </li>
            );
          })}
        </ol>
      </section>

      {!isNew ? (
        <section className="two-col">
          <div className="card">
            <div className="card-title"><h2 className="t-h3">Password</h2><span className="label muted">{rec.has_password ? `set ${rec.password_set ? formatDate(rec.password_set) : ''}` : 'none'}</span></div>
            <p className="t-small secondary">Four words: two from the target's own language, two from the house list. The plaintext shows once, here, and is never stored. Rotating it invalidates the old one everywhere, including any study unlocked with it, so record the new one in the vault's local password ledger before sending it.</p>
            <label className="field"><span>Target words, optional</span><input className="input" value={words} onChange={(e) => setWords(e.target.value)} placeholder="words from their site, role or JD, separated by spaces" /></label>
            <div className="row"><button type="button" className="btn small inverse" onClick={rotate} disabled={!protectedDerived}>{rec.has_password ? 'Rotate password' : 'Generate password'}</button>{!protectedDerived ? <span className="hint">Open links have no password.</span> : null}</div>
            {revealed ? <div className="stack"><div className="reveal-once">{revealed}</div><div className="row"><button type="button" className="btn small quiet" onClick={() => copy(revealed, 'Password')}>Copy</button><button type="button" className="btn small quiet" onClick={() => setRevealed(null)}>Hide</button></div></div> : null}
          </div>
          <div className="card">
            <div className="card-title"><h2 className="t-h3">Publish</h2><span className={`pill ${rec.status}`}>{rec.status}</span></div>
            <p className="t-small secondary">A draft answers 404 to the world. Live means the link works until it expires. Expired closes it now and tells the reader to ask for a new one.</p>
            <div className="inline-actions">
              {rec.status !== 'live' ? <button type="button" className="btn small signal" onClick={() => setStatus('live')}>Go live</button> : null}
              {rec.status === 'live' ? <button type="button" className="btn small quiet" onClick={() => setStatus('draft')}>Back to draft</button> : null}
              {rec.status !== 'expired' ? <button type="button" className="btn small quiet" onClick={() => setStatus('expired')}>Expire now</button> : null}
              <button type="button" className="btn small quiet" onClick={() => copy(recipientMarkdown({ ...rec, slug }), 'Vault note')}>Copy as vault note</button>
              <button type="button" className="btn small quiet" onClick={() => copy(payloadJson({ ...rec, slug }), 'Payload JSON')}>Copy payload JSON</button>
              <Link to={`/admin/events?slug=${rec.slug}`} className="btn small quiet">Access log</Link>
              <button type="button" className="btn small quiet" onClick={remove} style={{ marginLeft: 'auto' }}>Delete</button>
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
}
