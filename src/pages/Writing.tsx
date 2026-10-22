import { substackPosts } from '../data/substack';
import { Reveal } from '../components/Reveal';
import { Arrow } from '../components/Icons';
import { formatDate, yearOf } from '../lib/dates';
import { SITE } from '../lib/config';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export function Writing() {
  useDocumentTitle('Writing', 'Essays from Marliin Field Notes on design leadership, agents, and operating models.');
  const years = [...new Set(substackPosts.map((p) => yearOf(p.publishedAt)))].filter(Boolean);
  return (
    <section className="container">
      <header className="page-head">
        <span className="label"><span className="signal">04</span> Writing</span>
        <h1 className="t-display page-title">Field notes, written as I go.</h1>
        <p className="t-lead measure pretty secondary">Essays on design leadership, agents at work, and the operating models underneath both. Published on Substack as <a href={SITE.substack} target="_blank" rel="noreferrer" className="arrow-link up">Marliin Field Notes<Arrow className="arrow" /></a>.</p>
      </header>
      {years.map((y) => (
        <div key={y} className="year-group">
          <span className="t-display">{y}</span>
          <ol className="posts">
            {substackPosts.filter((p) => yearOf(p.publishedAt) === y).map((p, i) => (
              <Reveal as="li" key={p.url} delay={i * 40}>
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
        </div>
      ))}
    </section>
  );
}
