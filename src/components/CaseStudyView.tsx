import React, { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion, useScroll, useSpring, useTransform } from 'motion/react';
import { Picture } from './Picture';
import { Chips } from './Chips';
import { Reveal } from './Reveal';
import { SplitText } from './SplitText';
import { Lightbox, type LightboxImage } from './Lightbox';
import { Arrow, ArrowLeft } from './Icons';
import { arrange, columnsFor, widthFor, visuals, type Visual } from '../lib/beatLayout';
import { heroOf, index, primaryBeats, yearLabel, type Beat, type CaseStudy } from '../lib/studies';
import { useScrollSpy } from '../hooks/useScrollSpy';
import { useNarrow } from '../hooks/useMediaQuery';
import { EASE, unveil } from '../lib/motion';

type Section = { id: string; n: string; title: string; sub?: boolean };

/**
 * One case study, rendered the same way wherever it came from: the public
 * bundle, a recipient payload, or a gated extension unlocked in place. The
 * page never names or hints at which take produced it.
 */
export function CaseStudyView({ study, extension, backTo, backLabel, framing, next, prev, nextBase = '/work', gate }: {
  study: CaseStudy;
  /** Sections unlocked on this page by a recipient password; rendered in place of the public ones. */
  extension?: CaseStudy | null;
  backTo: string; backLabel: string; framing?: string;
  next?: CaseStudy; prev?: CaseStudy; nextBase?: string;
  /** The gate block to render between the public sections and the locked ones. */
  gate?: ReactNode;
}) {
  const shown = extension ? { ...study, ...extension, title: study.title, hero: study.hero ?? extension.hero } : study;
  const beats = primaryBeats(shown);
  const hero = heroOf(shown);
  const narrow = useNarrow();
  const reduce = useReducedMotion();

  const sections: Section[] = useMemo(() => {
    const s: Section[] = [];
    let n = 0;
    const push = (id: string, title: string, sub = false) => s.push({ id, n: index(n++), title, sub });
    if (shown.context) push('context', 'Context');
    push('problem', 'Problem');
    if (shown.role) push('role', 'Role');
    if (shown.built?.length) push('decisions', 'Decisions');
    for (const b of beats) push(`beat-${b.id}`, b.heading, true);
    push('outcome', 'Outcome');
    if (shown.storyThroughLine) push('through-line', 'Through-line');
    return s;
  }, [shown, beats]);
  const active = useScrollSpy(sections.map((s) => s.id));

  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.3 });
  const heroY = useTransform(scrollYProgress, [0, 0.25], [0, reduce ? 0 : -60]);

  const [lightbox, setLightbox] = useState<{ images: LightboxImage[]; index: number; label: string } | null>(null);
  useEffect(() => { setLightbox(null); }, [study.slug]);

  // The lightbox walks every image in the study in page order, so a reader
  // who opens the third figure can keep going to the end without closing.
  const allImages = useMemo(() => beats.flatMap((b, bi) => visuals(b).filter((m): m is Extract<Visual, { kind: 'image' }> => m.kind === 'image').map((m, mi) => ({ src: m.src, alt: `${m.alt} (Fig. ${index(bi)}.${mi + 1})`, width: m.width, height: m.height }))), [beats]);
  const openLightbox = (_beat: Beat, items: Visual[], i: number) => {
    const target = items[i];
    const idx = target.kind === 'image' ? allImages.findIndex((im) => im.src === target.src) : 0;
    setLightbox({ images: allImages, index: Math.max(0, idx), label: shown.title });
  };

  const bg = hero?.edgeColors
    ? `linear-gradient(90deg, ${hero.edgeColors.left}, ${hero.edgeColors.right})`
    : 'var(--paper-2)';
  const lightEdges = hero?.edgeColors ? isLight(hero.edgeColors.left) && isLight(hero.edgeColors.right) : true;

  return (
    <article className="cs" aria-labelledby="cs-title" style={hero?.edgeColors ? ({ '--tint': hero.edgeColors.left } as React.CSSProperties) : undefined}>
      <div className="container cs-head">
        <div className="cs-crumbs label muted">
          <Link to={backTo} className="arrow-link"><ArrowLeft className="arrow" />{backLabel}</Link>
          <span className="hide-sm">{shown.kind === 'experiment' ? 'Marliin Labs' : 'Case study'}{shown.underNda ? ', under NDA' : ''}</span>
          <span>{yearLabel(shown)}</span>
        </div>
        <SplitText as="h1" id="cs-title" text={shown.title} className="t-display cs-title" />
        <motion.p className="t-lead cs-outcome pretty" initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35, duration: 0.6, ease: EASE }}>{shown.outcome}</motion.p>
        {framing ? (
          <motion.aside className="framing-block" initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45, duration: 0.6, ease: EASE }} aria-label="Why this one, for you">
            <span className="label muted">Why this one, for you</span>
            <p className="t-h3" style={{ marginTop: 'var(--s-3)' }}>{framing}</p>
          </motion.aside>
        ) : null}
        <motion.dl className="meta cs-meta" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5, duration: 0.6 }}>
          <div><dt>Years</dt><dd>{yearLabel(shown)}</dd></div>
          {shown.role ? <div><dt>Role</dt><dd>{firstSentence(shown.role)}</dd></div> : null}
          <div><dt>Disciplines</dt><dd><Chips tags={shown.tags} limit={narrow ? 3 : 6} /></dd></div>
          {beats.length ? <div><dt>Walkthrough</dt><dd>{beats.length} beats, {countImages(beats)} images</dd></div> : null}
        </motion.dl>
      </div>

      {hero ? (
        <motion.div className="cs-hero" initial={reduce ? false : 'hidden'} animate="show" variants={unveil}>
          <div className="cs-hero-bg" style={{ background: bg }} aria-hidden="true" />
          <motion.div className="cs-hero-frame" style={{ y: heroY }}>
            <Picture src={hero.src} alt={hero.alt} width={hero.width} height={hero.height} eager sizes="(max-width: 1400px) 100vw, 1400px" style={lightEdges ? { boxShadow: '0 0 0 1px var(--rule)' } : undefined} />
          </motion.div>
        </motion.div>
      ) : null}

      <div className="container cs-body">
        <aside className="cs-rail" aria-label="Sections">
          <div className="rail-progress" aria-hidden="true"><motion.span style={{ scaleX: progress }} /></div>
          <ol className="rail-list">
            {sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className={`rail-item ${s.sub ? 'sub' : ''} ${active === s.id ? 'active' : ''}`} aria-current={active === s.id ? 'true' : undefined}>
                  <span className="n">{s.n}</span><span>{s.title}</span>
                </a>
              </li>
            ))}
          </ol>
        </aside>

        <div className="cs-content">
          {shown.context ? <Section id="context" n={numOf(sections, 'context')} title="Context"><Prose text={shown.context} /></Section> : null}
          <Section id="problem" n={numOf(sections, 'problem')} title="Problem"><Prose text={shown.problem} lead /></Section>
          {shown.role ? <Section id="role" n={numOf(sections, 'role')} title="Role"><Prose text={shown.role} /></Section> : null}

          {gate}

          {shown.built?.length ? (
            <Section id="decisions" n={numOf(sections, 'decisions')} title="Decisions">
              <ol className="decisions">
                {shown.built.map((d, i) => (
                  <Reveal as="li" key={i} className="decision" delay={i * 40}>
                    <span className="n">{index(i)}</span><span>{d}</span>
                  </Reveal>
                ))}
              </ol>
            </Section>
          ) : null}

          {beats.map((beat, bi) => (
            <BeatBlock key={beat.id} beat={beat} n={numOf(sections, `beat-${beat.id}`)} fig={index(bi)} onOpen={(items, i) => openLightbox(beat, items, i)} />
          ))}

          <Section id="outcome" n={numOf(sections, 'outcome')} title="Outcome"><Prose text={shown.result} lead /></Section>
          {shown.storyThroughLine ? (
            <Section id="through-line" n={numOf(sections, 'through-line')} title="Through-line">
              <Reveal className="pull"><Prose text={shown.storyThroughLine} /></Reveal>
            </Section>
          ) : null}

          {shown.underNda ? (
            <div className="cs-section nda"><span className="label"><span className="signal">Under NDA</span> <span className="muted">A deeper walkthrough is available on request.</span></span></div>
          ) : null}

          {shown.substackUrl ? (
            <div className="cs-section"><a href={shown.substackUrl} target="_blank" rel="noreferrer" className="arrow-link up t-h3">The essay behind this study<Arrow className="arrow" /></a></div>
          ) : null}
        </div>
      </div>

      {next ? (
        <div className="container">
          <Link to={`${nextBase}/${next.slug}`} className="cs-next">
            <div className="cs-next-text">
              <span className="label muted">Next{prev && prev.slug !== next.slug ? '' : ''}</span>
              <span className="t-display cs-next-title">{next.title}</span>
              <span className="secondary">{next.outcome}</span>
              <span className="arrow-link label">Read the study<Arrow className="arrow" /></span>
            </div>
            {heroOf(next) ? <Picture src={heroOf(next)!.src} alt="" width={heroOf(next)!.width} height={heroOf(next)!.height} /> : null}
          </Link>
        </div>
      ) : null}

      <Lightbox images={lightbox?.images ?? []} index={lightbox?.index ?? null} label={lightbox?.label ?? ''} onClose={() => setLightbox(null)} onIndex={(i) => setLightbox((l) => (l ? { ...l, index: i } : l))} />
    </article>
  );
}

function Section({ id, n, title, children }: { id: string; n: string; title: string; children: ReactNode }) {
  return (
    <Reveal as="section" id={id} className="cs-section" aria-labelledby={`${id}-h`} tabIndex={-1}>
      <h2 className="cs-section-head label" id={`${id}-h`}><span className="n">{n}</span><span>{title}</span></h2>
      {children}
    </Reveal>
  );
}

function BeatBlock({ beat, n, fig, onOpen }: { beat: Beat; n: string; fig: string; onOpen: (items: Visual[], i: number) => void }) {
  const a = arrange(beat);
  const items = visuals(beat);
  const media = (() => {
    if (a.mode === 'none') return null;
    if (a.mode === 'grid') {
      return (
        <div className="media-grid">
          {a.items.map((m, i) => <MediaItem key={keyOf(m)} m={m} fig={`${fig}.${i + 1}`} onClick={() => onOpen(items, i)} eager={false} />)}
        </div>
      );
    }
    return a.rows.map((row, r) => (
      <div key={r} className="media-row" style={{ gridTemplateColumns: columnsFor(row), width: widthFor(row) }}>
        {row.items.map((m) => <MediaItem key={keyOf(m)} m={m} fig={`${fig}.${items.indexOf(m) + 1}`} onClick={() => onOpen(items, items.indexOf(m))} />)}
      </div>
    ));
  })();
  const sideClass = a.mode === 'side' ? `side ${a.side === 'left' ? 'image-left' : 'image-right'}` : '';
  return (
    <Reveal as="section" id={`beat-${beat.id}`} className={`beat ${sideClass}`} aria-labelledby={`beat-${beat.id}-h`} tabIndex={-1}>
      <h2 className="beat-head" id={`beat-${beat.id}-h`}><span className="n">{n}</span><span className="t-h2">{beat.heading}</span></h2>
      <div className="beat-prose prose"><Prose text={beat.body} /></div>
      {media ? <div className="beat-media">{media}</div> : null}
    </Reveal>
  );
}

function MediaItem({ m, fig, onClick, eager = false }: { m: Visual; fig: string; onClick: () => void; eager?: boolean }) {
  if (m.kind === 'video') {
    return <VideoFacade m={m} />;
  }
  return (
    <button type="button" className="media-item" onClick={onClick} aria-label={`Open ${m.alt} at full size`}>
      <Picture src={m.src} alt={m.alt} width={m.width} height={m.height} eager={eager} sizes="(max-width: 900px) 100vw, 70vw" />
      <span className="fig label" aria-hidden="true"><span className="fig-bar" />Fig. {fig}</span>
    </button>
  );
}

function VideoFacade({ m }: { m: Extract<Visual, { kind: 'video' }> }) {
  const [on, setOn] = useState(false);
  const src = `https://www.youtube-nocookie.com/embed/${m.videoId}?autoplay=1&rel=0${m.start ? `&start=${m.start}` : ''}`;
  return (
    <div className="frame" style={{ aspectRatio: `${m.poster.width} / ${m.poster.height}` }}>
      {on ? (
        <iframe src={src} title={m.poster.alt} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }} />
      ) : (
        <button type="button" onClick={() => setOn(true)} aria-label={`Play ${m.poster.alt}`} style={{ position: 'absolute', inset: 0, width: '100%' }}>
          <Picture src={m.poster.src} alt={m.poster.alt} width={m.poster.width} height={m.poster.height} />
          <span className="btn inverse" style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}>Play</span>
        </button>
      )}
    </div>
  );
}

/** Paragraphs from vault prose: blank lines separate them, single newlines
 *  are soft wraps. Inline markdown is left as text on purpose. */
export function Prose({ text, lead = false }: { text: string; lead?: boolean }) {
  const paras = text.split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean);
  return (
    <div className={`prose ${lead ? 'pretty' : ''}`}>
      {paras.map((p, i) => <p key={i} className={lead && i === 0 ? 't-h3' : undefined}>{p}</p>)}
    </div>
  );
}

function keyOf(m: Visual) { return m.kind === 'image' ? m.src : m.videoId; }
function numOf(sections: Section[], id: string) { return sections.find((s) => s.id === id)?.n ?? ''; }
function firstSentence(s: string) { const m = /^(.+?[.!?])(\s|$)/.exec(s.replace(/\n/g, ' ')); return m ? m[1] : s; }
function countImages(beats: Beat[]) { return beats.reduce((n, b) => n + b.media.filter((m) => m.kind === 'image').length, 0); }
function isLight(hex: string) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return true;
  const [r, g, b] = [m[1], m[2], m[3]].map((x) => parseInt(x, 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.82;
}
