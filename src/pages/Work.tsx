import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { WorkIndex } from '../components/WorkIndex';
import { Picture } from '../components/Picture';
import { Reveal } from '../components/Reveal';
import { Grid, Rows } from '../components/Icons';
import { groupByYear, heroOf, studies, tagFromSlug, tagLabel, tagSlug, tagsByCount, yearShort, type CaseStudy } from '../lib/studies';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

type View = 'list' | 'grid' | 'years';

export function Work() {
  const { tag: tagParam } = useParams();
  const navigate = useNavigate();
  const tag = tagParam ? tagFromSlug(tagParam) : undefined;
  const [allTags, setAllTags] = useState(false);
  const [view, setView] = useState<View>(() => { try { return (localStorage.getItem('bm-work-view') as View) || 'list'; } catch { return 'list'; } });
  const setViewPersist = (v: View) => { setView(v); try { localStorage.setItem('bm-work-view', v); } catch { /* ignore */ } };
  const list = useMemo(() => (tag ? studies.filter((s) => s.tags.includes(tag)) : studies), [tag]);
  const tags = useMemo(() => tagsByCount(2), []);
  useDocumentTitle(tag ? `${tagLabel(tag)}, work` : 'Work', `${studies.length} case studies across AI products, design systems, research practices and design organizations.`);

  return (
    <section className="container">
      <header className="page-head">
        <span className="label"><span className="signal">02</span> Work</span>
        <h1 className="t-display page-title">{tag ? tagLabel(tag) : 'Every study.'}</h1>
        <p className="t-lead measure pretty secondary">
          {tag ? `${list.length} of ${studies.length} studies carry this discipline.` : `${studies.length} case studies, from ${studies[0]?.title ?? 'the latest'} in ${studies[0]?.yearStart ?? ''} to ${studies[studies.length - 1]?.title ?? 'the earliest'} in ${studies[studies.length - 1]?.yearStart ?? ''}. Filter by discipline, or switch to the grid to browse by eye.`}
        </p>
      </header>

      <div className="work-toolbar">
        <div className="chips" role="group" aria-label="Filter by discipline">
          <Link to="/work" className={`chip ${!tag ? 'on' : ''}`} aria-current={!tag ? 'page' : undefined}>All {studies.length}</Link>
          {tags.filter((t, i) => allTags || i < 10 || t.id === tag).map((t) => (
            <Link key={t.id} to={`/work/tag/${tagSlug(t.id)}`} className={`chip ${tag === t.id ? 'on' : ''}`} aria-current={tag === t.id ? 'page' : undefined}>{tagLabel(t.id)} {t.count}</Link>
          ))}
          {tags.length > 10 ? <button type="button" className="chip" onClick={() => setAllTags((v) => !v)} aria-expanded={allTags}>{allTags ? 'Fewer' : `+${tags.length - 10} more`}</button> : null}
        </div>
        <div className="view-switch" role="group" aria-label="View">
          <button type="button" className={`label ${view === 'list' ? 'on' : ''}`} onClick={() => setViewPersist('list')} aria-pressed={view === 'list'}><Rows size={14} /> List</button>
          <button type="button" className={`label ${view === 'grid' ? 'on' : ''}`} onClick={() => setViewPersist('grid')} aria-pressed={view === 'grid'}><Grid size={14} /> Grid</button>
          <button type="button" className={`label ${view === 'years' ? 'on' : ''}`} onClick={() => setViewPersist('years')} aria-pressed={view === 'years'}>Years</button>
        </div>
      </div>

      {list.length === 0 ? (
        <p className="t-lead">No study carries that discipline yet. <button type="button" className="arrow-link" onClick={() => navigate('/work')}>Show everything</button></p>
      ) : view === 'list' ? (
        <WorkIndex studies={list} />
      ) : view === 'grid' ? (
        <WorkGrid studies={list} />
      ) : (
        <div>
          {groupByYear(list).map((g) => (
            <div key={g.year} className="year-group">
              <span className="year">{g.year}</span>
              <WorkIndex studies={g.studies} numbered={false} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function WorkGrid({ studies: list }: { studies: CaseStudy[] }) {
  return (
    <div className="work-grid">
      {list.map((s, i) => {
        const hero = heroOf(s);
        const bg = hero?.edgeColors ? `linear-gradient(90deg, ${hero.edgeColors.left}, ${hero.edgeColors.right})` : 'var(--paper-2)';
        return (
          <Reveal as="article" key={s.slug} className="work-card" delay={(i % 4) * 60}>
            <Link to={`/work/${s.slug}`} className="work-card-link">
              {hero ? (
                <div className="frame work-card-bg" style={{ background: bg, aspectRatio: '16 / 10' }}>
                  <Picture src={hero.src} alt={hero.alt} width={hero.width} height={hero.height} sizes="(max-width: 900px) 100vw, 50vw" />
                </div>
              ) : null}
              <div className="work-card-head">
                <span className="t-h2 work-card-title">{s.title}</span>
                <span className="label muted nowrap">{yearShort(s)}</span>
              </div>
              <p className="secondary">{s.outcome}</p>
            </Link>
          </Reveal>
        );
      })}
    </div>
  );
}
