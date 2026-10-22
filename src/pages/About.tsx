import { Reveal } from '../components/Reveal';
import { SplitText } from '../components/SplitText';
import { Arrow } from '../components/Icons';
import { profile } from '../data/profile';
import { SITE } from '../lib/config';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export function About() {
  useDocumentTitle('About', 'Brett Marlin, product design leader. Twelve years in-house at Carta, Mixpanel, Blend, Altana and Sayari.');
  return (
    <section className="container">
      <header className="page-head">
        <span className="label"><span className="signal">05</span> About</span>
        <SplitText as="h1" text="Player-coach. I run design organizations and I still design, in the file." className="t-display page-title" />
      </header>
      <div className="grid about-grid">
        <Reveal className="col-7 prose stack">
          {profile.bio.map((p, i) => <p key={i} className={i === 0 ? 't-lead pretty' : 'pretty'}>{p}</p>)}
          <p>
            <a href="/brett.md" className="arrow-link" download><span className="mono">brett.md</span> is the same account, written for people and for AI agents<Arrow className="arrow" /></a>
          </p>
        </Reveal>
        <Reveal className="col-4 col-start-9 stack-lg" delay={100}>
          <div>
            <span className="label muted">Status</span>
            <dl className="status-list" style={{ marginTop: 'var(--s-4)' }}>
              {profile.status.map((s) => (
                <div key={s.k} className="status-row"><dt className="label muted">{s.k}</dt><dd>{s.v}</dd></div>
              ))}
            </dl>
          </div>
          <div>
            <span className="label muted">Education</span>
            {profile.education.map((e) => <p key={e.institution} className="t-small" style={{ marginTop: 'var(--s-3)' }}><strong>{e.institution}</strong><br />{e.credentials}</p>)}
          </div>
          <div>
            <span className="label muted">Elsewhere</span>
            <ul className="stack" style={{ marginTop: 'var(--s-3)' }}>
              {[{ h: `mailto:${SITE.email}`, l: SITE.email }, { h: SITE.linkedin, l: 'LinkedIn' }, { h: SITE.substack, l: 'Substack' }, { h: SITE.marliin, l: 'Marliin, the practice' }].map((x) => (
                <li key={x.l} style={{ marginTop: 'var(--s-2)' }}><a href={x.h} className="arrow-link up t-small" target={x.h.startsWith('http') ? '_blank' : undefined} rel="noreferrer">{x.l}<Arrow className="arrow" /></a></li>
              ))}
            </ul>
          </div>
        </Reveal>
      </div>

      <div className="section" style={{ paddingBottom: 0 }}>
        <header className="section-head"><h2 className="label"><span className="n">A</span><span>Every role since 2002</span></h2><span className="label muted">{profile.roles.length} roles</span></header>
        <ol className="timeline">
          {profile.roles.map((r, i) => (
            <Reveal as="li" key={r.company + r.years} className="timeline-row" delay={Math.min(i, 6) * 40}>
              <span className="label muted timeline-years">{r.years}{r.end !== r.years ? <><br />{r.end}</> : null}</span>
              <span className="timeline-main">
                <span className="t-h3">{r.company}<span className="muted"> {r.title}</span></span>
                <span className="timeline-note">{r.note}</span>
              </span>
            </Reveal>
          ))}
        </ol>
      </div>

      <div className="section" style={{ paddingBottom: 0 }}>
        <header className="section-head"><h2 className="label"><span className="n">B</span><span>Competencies</span></h2></header>
        <ul className="chips">
          {profile.competencies.map((c) => <li key={c}><span className="chip">{c}</span></li>)}
        </ul>
      </div>
    </section>
  );
}
