import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { admin, type RecipientPayload } from '../lib/api';
import { RecipientSpace, RecipientStudy } from '../pages/RecipientSpace';
import { errorText } from './useAsync';

/** The recipient's own pages, rendered from the admin preview endpoint so a
 *  draft can be checked before it goes live. Nothing is logged as a view. */
export function RecipientPreview() {
  const { slug = '', study } = useParams();
  const [data, setData] = useState<RecipientPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { admin.preview(slug).then(setData).catch((e) => setError(e.code ?? String(e))); }, [slug]);
  if (error) return <p className="error">{errorText(error)}</p>;
  if (!data) return <p className="label muted">Loading preview</p>;
  return (
    <div style={{ margin: 'calc(-1 * var(--s-6)) calc(-1 * var(--s-7))' }}>
      <div className="container" style={{ padding: '12px var(--margin)', background: 'var(--signal)', color: 'var(--on-signal)', display: 'flex', justifyContent: 'space-between', gap: 16, position: 'sticky', top: 0, zIndex: 70 }}>
        <span className="label">Preview of {slug}. Not logged. Links below stay inside the preview.</span>
        <Link to={`/admin/recipients/${slug}`} className="label" style={{ textDecoration: 'underline' }}>Back to the editor</Link>
      </div>
      <PreviewRoutes data={data} slug={slug} study={study} />
    </div>
  );
}

function PreviewRoutes({ data, slug, study }: { data: RecipientPayload; slug: string; study?: string }) {
  // The recipient pages read :recipient and :slug from the route. The preview
  // route carries the same names so the pages work unchanged.
  void slug;
  return study ? <RecipientStudy preview={data} /> : <RecipientSpace preview={data} />;
}
