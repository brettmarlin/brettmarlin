import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Gate } from '../components/Gate';
import { WorkIndex } from '../components/WorkIndex';
import { CaseStudyView } from '../components/CaseStudyView';
import { ThemeToggle } from '../components/ThemeToggle';
import { Arrow } from '../components/Icons';
import { SplitText } from '../components/SplitText';
import { fetchRecipient, recipientPasswordKey, session, type RecipientPayload, type RecipientResult } from '../lib/api';
import { callout, isRecipientSlug, resolvePicks } from '../lib/recipient';
import { formatDate } from '../lib/dates';
import { SITE } from '../lib/config';
import { EASE } from '../lib/motion';
import { useDocumentTitle, useNoIndex } from '../hooks/useDocumentTitle';
import { capture } from '../lib/analytics';

type GateState = 'idle' | 'checking' | 'wrong' | 'limited' | 'error' | 'ok';

type SpaceState =
  | { kind: 'loading' }
  | { kind: 'gate'; name: string; company: string; gate: GateState; retryIn?: number }
  | { kind: 'ready'; data: RecipientPayload }
  | { kind: 'expired'; expires?: string | null }
  | { kind: 'missing' }
  | { kind: 'error'; message: string };

/** Loads one recipient payload, asking for the password when the Worker
 *  requires one and remembering it for the tab's life. Shared by the space
 *  and by each study inside it. */
function useRecipient(slug: string, preview?: RecipientPayload) {
  const [state, setState] = useState<SpaceState>(preview ? { kind: 'ready', data: preview } : { kind: 'loading' });
  useNoIndex();

  useEffect(() => {
    if (preview) return;
    if (!slug || !isRecipientSlug(slug)) { setState({ kind: 'missing' }); return; }
    const ctrl = new AbortController();
    const remembered = session.get(recipientPasswordKey(slug));
    fetchRecipient(slug, remembered, ctrl.signal).then((r) => {
      if (ctrl.signal.aborted) return;
      if (remembered && (r.status === 'bad-password' || r.status === 'password')) session.clear(recipientPasswordKey(slug));
      capture(r.status === 'ok' ? 'recipient_space_opened' : r.status === 'password' ? 'recipient_gate_landing' : `recipient_${r.status.replace(/-/g, '_')}`, { slug });
      setState(fromResult(r, 'idle'));
    });
    return () => ctrl.abort();
  }, [slug, preview]);

  const submit = async (password: string) => {
    setState((s) => (s.kind === 'gate' ? { ...s, gate: 'checking' } : s));
    const r = await fetchRecipient(slug, password);
    if (r.status === 'ok') {
      capture('recipient_unlocked', { slug });
      session.set(recipientPasswordKey(slug), password);
      setState((s) => (s.kind === 'gate' ? { ...s, gate: 'ok' } : s));
      setTimeout(() => setState({ kind: 'ready', data: r.data }), 700);
      return;
    }
    setState(fromResult(r, 'wrong'));
  };
  return { state, submit };
}

function fromResult(r: RecipientResult, wrong: GateState): SpaceState {
  switch (r.status) {
    case 'ok': return { kind: 'ready', data: r.data };
    case 'password': return { kind: 'gate', name: r.recipientName, company: r.company, gate: 'idle' };
    case 'bad-password': return { kind: 'gate', name: r.recipientName, company: r.company, gate: wrong };
    case 'rate-limited': return { kind: 'gate', name: '', company: '', gate: 'limited', retryIn: r.retryIn };
    case 'expired': return { kind: 'expired', expires: r.expires };
    case 'not-found': return { kind: 'missing' };
    default: return { kind: 'error', message: r.message };
  }
}

function SpaceChrome({ children, company }: { children: React.ReactNode; company?: string }) {
  return (
    <div className="space">
      <header className="nav scrolled">
        <div className="container nav-inner">
          <Link to="/" className="wordmark"><span className="wordmark-name">Brett Marlin</span>{company ? <span className="wordmark-meta label muted hide-sm">Prepared for {company}</span> : null}</Link>
          <nav className="nav-links" aria-label="Recipient space">
            <a className="nav-link label" href={`mailto:${SITE.email}`}>Contact</a>
            <ThemeToggle />
          </nav>
          <div className="nav-mobile"><ThemeToggle /></div>
        </div>
      </header>
      <main id="main">{children}</main>
    </div>
  );
}

function Shell({ state, submit, children }: { state: SpaceState; submit: (p: string) => void; children: (data: RecipientPayload) => React.ReactNode }) {
  const reduce = useReducedMotion();
  if (state.kind === 'loading') return <SpaceChrome><div className="container" style={{ paddingTop: 'var(--s-9)' }}><span className="label muted" aria-live="polite">Opening</span></div></SpaceChrome>;
  if (state.kind === 'gate') {
    const who = state.name || state.company;
    return (
      <SpaceChrome company={state.company}>
        <div className="gate-page">
          <motion.div className="gate-card" initial={reduce ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }}>
            <div className="between"><span className="wordmark-name">Brett Marlin</span><span className="label muted">Private link</span></div>
            <Gate
              title={who ? `Selected work, prepared for ${who}.` : 'Selected work, prepared for you.'}
              body="This link was made for one reader and expires. The password came with the message that carried the link."
              onSubmit={submit}
              state={state.gate}
              retryIn={state.retryIn}
              headingLevel={1}
            />
            <p className="t-caption muted">Looking for the public portfolio instead? <Link to="/" className="arrow-link">It is here<Arrow className="arrow" /></Link></p>
          </motion.div>
        </div>
      </SpaceChrome>
    );
  }
  if (state.kind === 'expired') {
    return (
      <SpaceChrome>
        <div className="container" style={{ paddingTop: 'var(--s-9)' }}>
          <span className="label"><span className="signal">Expired</span> {state.expires ? formatDate(state.expires) : ''}</span>
          <h1 className="t-display page-title">This link has expired.</h1>
          <p className="t-lead measure pretty secondary">Links like this one are made for a conversation and close after it. Write to <a href={`mailto:${SITE.email}`} className="arrow-link">{SITE.email}</a> and I will send a new one the same day.</p>
          <p style={{ marginTop: 'var(--s-6)' }}><Link to="/work" className="arrow-link t-h3">The public work is always open<Arrow className="arrow" /></Link></p>
        </div>
      </SpaceChrome>
    );
  }
  if (state.kind === 'missing') {
    return (
      <SpaceChrome>
        <div className="container" style={{ paddingTop: 'var(--s-9)' }}>
          <span className="label"><span className="signal">404</span> No such link</span>
          <h1 className="t-display page-title">Nothing lives at this address.</h1>
          <p className="t-lead measure pretty secondary">Check the link you were sent, or start from the public portfolio.</p>
          <p style={{ marginTop: 'var(--s-6)' }}><Link to="/" className="arrow-link t-h3">Home<Arrow className="arrow" /></Link></p>
        </div>
      </SpaceChrome>
    );
  }
  if (state.kind === 'error') {
    return <SpaceChrome><div className="container" style={{ paddingTop: 'var(--s-9)' }}><h1 className="t-h1">Could not open this link right now.</h1><p className="secondary">{state.message}. Try again in a moment.</p></div></SpaceChrome>;
  }
  return <SpaceChrome company={state.data.company}>{children(state.data)}</SpaceChrome>;
}

export function RecipientSpace({ preview }: { preview?: RecipientPayload }) {
  const { recipient = '' } = useParams();
  const { state, submit } = useRecipient(recipient, preview);
  useDocumentTitle(state.kind === 'ready' ? callout(state.data) : 'Selected work');
  return (
    <Shell state={state} submit={submit}>
      {(data) => <SpaceHome data={data} slug={recipient} preview={!!preview} />}
    </Shell>
  );
}

function SpaceHome({ data, slug, preview }: { data: RecipientPayload; slug: string; preview: boolean }) {
  const picks = useMemo(() => resolvePicks(data), [data]);
  const framings = Object.fromEntries(picks.map((p) => [p.study.slug, p.pick.framing]));
  const studies = picks.map((p) => p.study);
  const reduce = useReducedMotion();
  return (
    <AnimatePresence>
      <motion.div initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }}>
        <section className="container space-banner" aria-labelledby="space-title">
          <div className="space-kicker label muted">
            <span><span className="signal">For</span> {data.recipient_name || data.company}{data.recipient_title ? `, ${data.recipient_title}` : ''}</span>
            <span>{picks.length} {picks.length === 1 ? 'study' : 'studies'}{data.expires ? `, open until ${formatDate(data.expires)}` : ''}{preview ? ', preview' : ''}</span>
          </div>
          <SplitText as="h1" text={callout(data)} className="t-display-xl space-callout" />
          {data.intro ? <p className="t-lead space-intro pretty">{data.intro}</p> : null}
          {data.company_context ? <div className="space-meta"><span className="label muted">Your context</span><span className="t-small secondary measure">{data.company_context}</span></div> : null}
        </section>
        <section className="container space-body" aria-label="Selected studies">
          <WorkIndex studies={studies} basePath={`/for/${slug}/work`} framings={framings} />
          <p className="space-note t-small secondary">
            Each study opens with a note on why it was chosen for you. The full public portfolio has {21} studies and is one click away, but these are the ones I would walk through with you first.
            {' '}<Link to="/work" className="arrow-link">All work<Arrow className="arrow" /></Link>
          </p>
        </section>
      </motion.div>
    </AnimatePresence>
  );
}

export function RecipientStudy({ preview }: { preview?: RecipientPayload }) {
  const { recipient = '', slug = '' } = useParams();
  const { state, submit } = useRecipient(recipient, preview);
  return (
    <Shell state={state} submit={submit}>
      {(data) => {
        const picks = resolvePicks(data);
        const i = picks.findIndex((p) => p.study.slug === slug);
        if (i === -1) {
          return (
            <div className="container" style={{ paddingTop: 'var(--s-9)' }}>
              <h1 className="t-h1">That study is not part of this selection.</h1>
              <p style={{ marginTop: 'var(--s-4)' }}><Link to={`/for/${recipient}`} className="arrow-link t-h3">Back to your selection<Arrow className="arrow" /></Link></p>
            </div>
          );
        }
        const current = picks[i];
        const next = picks.length > 1 ? picks[(i + 1) % picks.length].study : undefined;
        const prev = picks.length > 1 ? picks[(i - 1 + picks.length) % picks.length].study : undefined;
        return (
          <CaseStudyView
            key={current.study.slug}
            study={current.study}
            backTo={`/for/${recipient}`}
            backLabel={`Selected work for ${data.company || data.recipient_name || 'you'}`}
            framing={current.pick.framing}
            next={next}
            prev={prev}
            nextBase={`/for/${recipient}/work`}
          />
        );
      }}
    </Shell>
  );
}
