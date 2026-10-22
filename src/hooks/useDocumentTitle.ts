import { useEffect } from 'react';

export function useDocumentTitle(title?: string, description?: string) {
  useEffect(() => {
    document.title = title ? `${title}, Brett Marlin` : 'Brett Marlin';
    if (description) {
      let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
      if (!meta) { meta = document.createElement('meta'); meta.name = 'description'; document.head.appendChild(meta); }
      meta.content = description;
    }
  }, [title, description]);
}

/** /for and /admin never enter an index. The static _headers file says the
 *  same at the edge; this covers the SPA path when the page was reached by
 *  navigation rather than a fresh request. */
export function useNoIndex() {
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => { meta.remove(); };
  }, []);
}
