import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Reveal } from './Reveal';
import { Chips } from './Chips';
import { Arrow } from './Icons';
import { HoverPreview } from './HoverPreview';
import { useFinePointer, useNarrow } from '../hooks/useMediaQuery';
import { heroOf, index, yearShort, type CaseStudy } from '../lib/studies';
import { imageSrc } from '../lib/images';

/**
 * The index of work: a numbered, ruled list set in display type. On a fine
 * pointer the hero follows the cursor; on touch each row carries its own
 * thumbnail so nothing is hidden behind a hover.
 */
export function WorkIndex({ studies, basePath = '/work', numbered = true, framings }: {
  studies: CaseStudy[]; basePath?: string; numbered?: boolean; framings?: Record<string, string>;
}) {
  const fine = useFinePointer();
  const narrow = useNarrow();
  const thumbs = narrow || !fine;
  const [hover, setHover] = useState<string | null>(null);
  const hovered = hover ? studies.find((s) => s.slug === hover) : null;
  const image = hovered ? heroOf(hovered) ?? null : null;
  return (
    <div className="index" onPointerLeave={() => setHover(null)}>
      {fine && !narrow ? <HoverPreview image={image} active={!!hover} /> : null}
      <ol className="index-list">
        {studies.map((s, i) => {
          const hero = heroOf(s);
          const framing = framings?.[s.slug];
          return (
            <Reveal as="li" key={s.slug} className="index-item" delay={Math.min(i, 8) * 40} margin="0px 0px -4% 0px">
              <Link
                to={`${basePath}/${s.slug}`}
                className={`index-row ${hover === s.slug ? 'is-hover' : ''}`}
                onPointerEnter={() => setHover(s.slug)}
                onFocus={() => setHover(s.slug)}
                onBlur={() => setHover(null)}
              >
                <span className="index-num label">{numbered ? index(i) : ''}</span>
                {thumbs && hero ? (
                  <span className="index-thumb frame" style={{ aspectRatio: `${hero.width} / ${hero.height}` }}>
                    <img src={imageSrc(hero.src)} alt="" width={hero.width} height={hero.height} loading="lazy" decoding="async" />
                  </span>
                ) : null}
                <span className="index-main">
                  <span className="index-title t-h1">{s.title}</span>
                  <span className="index-outcome secondary">{s.outcome}</span>
                  {framing ? <span className="index-framing">{framing}</span> : null}
                </span>
                <span className="index-side">
                  <span className="index-year label">{yearShort(s)}{s.kind === 'experiment' ? <span className="muted"> / lab</span> : null}{s.underNda ? <span className="muted"> / nda</span> : null}</span>
                  <Chips tags={s.tags} limit={3} link={false} className="index-tags hide-sm" />
                </span>
                <span className="index-arrow"><Arrow /></span>
              </Link>
            </Reveal>
          );
        })}
      </ol>
    </div>
  );
}
