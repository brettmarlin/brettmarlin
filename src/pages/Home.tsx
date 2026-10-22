import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { SplitText } from '../components/SplitText';
import { SectionHead } from '../components/SectionHead';
import { WorkIndex } from '../components/WorkIndex';
import { Reveal } from '../components/Reveal';
import { Arrow } from '../components/Icons';
import { Counter } from '../components/Counter';
import { studies } from '../lib/studies';
import { substackPosts } from '../data/substack';
import { profile } from '../data/profile';
import { SITE } from '../lib/config';
import { formatDate } from '../lib/dates';
import { rise } from '../lib/motion';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export function Home() {
  useDocumentTitle(undefined, 'Brett Marlin. Design leader, twelve years in-house. Still in the file.');
  const reduce = useReducedMotion();
  const recent = substackPosts.slice(0, 3);
  return (
    <>
      <section className="hero container" aria-labelledby="statement">
        <div className="hero-top label muted">
          <span><span className="signal">01</span> {profile.name}</span>
          <span className="hide-sm">Portfolio, {new Date().getFullYear()}</span>
          <span className="hide-sm">{SITE.location}</span>
        </div>
        <SplitText as="h1" id="statement" text={profile.statement} className="t-display-xl hero-statement" />
        <div className="grid hero-grid">
          <motion.p className="t-lead hero-support col-7 pretty" variants={rise} custom={8} initial={reduce ? false : 'hidden'} animate="show">
            {profile.support}
          </motion.p>
          <motion.aside className="hero-aside col-4 col-start-9" variants={rise} custom={10} initial={reduce ? false : 'hidden'} animate="show" aria-label="Status">
            <dl className="status-list">
              {profile.status.map((s) => (
                <div key={s.k} className="status-row">
                  <dt className="label muted">{s.k}</dt>
                  <dd>{s.v}</dd>
                </div>
              ))}
            </dl>
            <a href="/brett.md" className="arrow-link brett-md" download>
              <span><span className="mono">brett.md</span> <span className="muted">A resume for people and for agents</span></span>
              <Arrow className="arrow" />
            </a>
          </motion.aside>
        </div>
        <motion.div className="hero-proof rule-strong" variants={rise} custom={12} initial={reduce ? false : 'hidden'} animate="show">
          {profile.proof.map((p) => (
            <div key={p.label} className="proof">
              <span className="proof-n t-display"><Counter to={p.n === 'studies' ? studies.length : Number(p.n)} /></span>
              <span className="label muted">{p.label}</span>
            </div>
          ))}
        </motion.div>
      </section>

      <section className="section container" id="work" aria-labelledby="work-head">
        <SectionHead n="02" title="Selected work" aside={<span>{studies.length} studies</span>} id="work-head" />
        <WorkIndex studies={studies} />
        <div className="section-foot">
          <Link to="/work" className="arrow-link t-h3">Browse by discipline, year or grid<Arrow className="arrow" /></Link>
        </div>
      </section>

      <section className="section container" id="practice" aria-labelledby="practice-head">
        <SectionHead n="03" title="How I work" aside="Four things I bring to a team" id="practice-head" />
        <div className="practice-grid">
          {profile.practice.map((p, i) => (
            <Reveal key={p.title} className="practice-item" delay={i * 80}>
              <span className="label signal">{String(i + 1).padStart(2, '0')}</span>
              <h3 className="t-h3">{p.title}</h3>
              <p className="secondary t-small">{p.body}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="section container" id="writing" aria-labelledby="writing-head">
        <SectionHead n="04" title="Writing" aside={<a href={SITE.substack} target="_blank" rel="noreferrer">Marliin Field Notes on Substack</a>} id="writing-head" />
        <ol className="posts">
          {recent.map((p, i) => (
            <Reveal as="li" key={p.url} delay={i * 60}>
              <a href={p.url} target="_blank" rel="noreferrer" className="post-row">
                <span className="post-date label muted">{formatDate(p.publishedAt)}</span>
                <span className="post-main">
                  <span className="post-title t-h2">{p.title}</span>
                  {p.snippet ? <span className="post-snippet secondary">{p.snippet}</span> : null}
                </span>
                <span className="index-arrow"><Arrow /></span>
              </a>
            </Reveal>
          ))}
        </ol>
        <div className="section-foot">
          <Link to="/writing" className="arrow-link t-h3">All {substackPosts.length} essays<Arrow className="arrow" /></Link>
        </div>
      </section>

      <section className="section container" id="about" aria-labelledby="about-head">
        <SectionHead n="05" title="About" aside={<Link to="/about">The full account</Link>} id="about-head" />
        <div className="grid about-grid">
          <Reveal className="col-6 prose about-bio">
            <p className="t-lead pretty">{profile.bio[0]}</p>
          </Reveal>
          <Reveal className="col-5 col-start-8" delay={120}>
            <ol className="timeline">
              {profile.roles.slice(0, 7).map((r) => (
                <li key={r.company} className="timeline-row">
                  <span className="label muted timeline-years">{r.years}</span>
                  <span className="timeline-main"><span className="timeline-company">{r.company}</span><span className="secondary t-small">{r.title}</span></span>
                </li>
              ))}
            </ol>
            <Link to="/about" className="arrow-link t-small timeline-more">Every role since 2002<Arrow className="arrow" /></Link>
          </Reveal>
        </div>
      </section>

      <section className="section container contact" id="contact" aria-labelledby="contact-head">
        <SectionHead n="06" title="Contact" aside="Same-day reply, usually" id="contact-head" />
        <Reveal>
          <p className="t-lead measure pretty contact-lede">{profile.contact}</p>
          <a href={`mailto:${SITE.email}`} className="contact-big t-display-xl">brett@<wbr />brettmarlin.com</a>
          <ul className="links">
            {[{ h: SITE.linkedin, l: 'LinkedIn' }, { h: SITE.substack, l: 'Substack' }, { h: SITE.x, l: 'X' }, { h: SITE.marliin, l: 'Marliin' }].map((x) => (
              <li key={x.l}><a href={x.h} target="_blank" rel="noreferrer" className="arrow-link up label">{x.l}<Arrow className="arrow" /></a></li>
            ))}
          </ul>
        </Reveal>
      </section>
    </>
  );
}
