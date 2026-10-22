import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { CaseStudyView } from '../components/CaseStudyView';
import { Gate } from '../components/Gate';
import { NotFound } from './NotFound';
import { findStudy, nextStudy, prevStudy, type CaseStudy as Study } from '../lib/studies';
import { fetchStudyGate, unlockStudy, session, studyPasswordKey } from '../lib/api';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { EASE } from '../lib/motion';
import { capture } from '../lib/analytics';

type GateState = 'idle' | 'checking' | 'wrong' | 'limited' | 'error' | 'ok';

export function CaseStudy() {
  const { slug = '' } = useParams();
  const study = findStudy(slug);
  useDocumentTitle(study?.title, study?.outcome);
  const [locked, setLocked] = useState(false);
  const [extension, setExtension] = useState<Study | null>(null);
  const [state, setState] = useState<GateState>('idle');
  const [retryIn, setRetryIn] = useState<number | undefined>();
  const [via, setVia] = useState('');

  useEffect(() => {
    setLocked(false); setExtension(null); setState('idle');
    if (!study) return;
    const ctrl = new AbortController();
    fetchStudyGate(study.slug, ctrl.signal).then(async (isLocked) => {
      if (ctrl.signal.aborted) return;
      setLocked(isLocked);
      const remembered = isLocked ? session.get(studyPasswordKey(study.slug)) : null;
      if (remembered) {
        const r = await unlockStudy(study.slug, remembered);
        if (ctrl.signal.aborted) return;
        if (r.status === 'ok') { setExtension(r.study); setVia(r.via.company); setState('ok'); }
        else session.clear(studyPasswordKey(study.slug));
      }
    });
    return () => ctrl.abort();
  }, [study?.slug]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!study) return <NotFound />;

  const submit = async (password: string) => {
    setState('checking');
    const r = await unlockStudy(study.slug, password);
    if (r.status === 'ok') {
      capture('study_unlocked', { slug: study.slug });
      session.set(studyPasswordKey(study.slug), password);
      setState('ok');
      setVia(r.via.company);
      setTimeout(() => {
        setExtension(r.study);
        requestAnimationFrame(() => document.getElementById('decisions')?.focus({ preventScroll: true }));
      }, 650);
    } else if (r.status === 'bad-password') setState('wrong');
    else if (r.status === 'rate-limited') {
      setRetryIn(r.retryIn);
      setState('limited');
      window.setTimeout(() => setState((s) => (s === 'limited' ? 'idle' : s)), (r.retryIn || 60) * 1000);
    } else setState('error');
  };

  const gate = locked && !extension ? (
    <AnimatePresence>
      <motion.div key="gate" className="cs-section" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.5, ease: EASE }}>
        <Gate
          title="There is more to this one."
          body="The named version of this study, with its decisions, outcome and walkthrough, opens with the password from the link you were sent. If you have one for a different study, it will not work here."
          onSubmit={submit}
          state={state}
          retryIn={retryIn}
          autoFocus={false}
          hint="The rest of this study"
        />
      </motion.div>
    </AnimatePresence>
  ) : null;

  return (
    <>
      {extension ? (
        <div className="container" style={{ paddingTop: 'var(--s-6)' }}>
          <motion.p className="label" role="status" initial={{ opacity: 0 }} animate={{ opacity: 1 }}><span className="dot live" style={{ marginRight: 8 }} />Opened{via ? ` for ${via}` : ""}. The named version is showing.</motion.p>
        </div>
      ) : null}
      <CaseStudyView
        key={`${study.slug}:${extension ? 'x' : 'p'}`}
        study={study}
        extension={extension}
        backTo="/work"
        backLabel="All work"
        next={nextStudy(study.slug)}
        prev={prevStudy(study.slug)}
        gate={gate}
      />
    </>
  );
}
