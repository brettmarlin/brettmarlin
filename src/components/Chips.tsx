import { Link } from 'react-router-dom';
import { tagLabel, tagSlug } from '../lib/studies';

export function Chips({ tags, limit, link = true, className = '' }: { tags: string[]; limit?: number; link?: boolean; className?: string }) {
  const shown = limit ? tags.slice(0, limit) : tags;
  const rest = limit ? tags.length - shown.length : 0;
  return (
    <ul className={`chips ${className}`} aria-label="Disciplines">
      {shown.map((t) => (
        <li key={t}>{link ? <Link className="chip" to={`/work/tag/${tagSlug(t)}`}>{tagLabel(t)}</Link> : <span className="chip">{tagLabel(t)}</span>}</li>
      ))}
      {rest > 0 ? <li><span className="chip">+{rest}</span></li> : null}
    </ul>
  );
}
