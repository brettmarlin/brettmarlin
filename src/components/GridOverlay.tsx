import { useEffect, useState } from 'react';

/** Press g anywhere (outside a field) to see the twelve columns and the
 *  8px baseline the page is set on. Shift+g is not needed: g toggles. */
export function GridOverlay() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.key === 'g' && !e.metaKey && !e.ctrlKey && !e.altKey) setOn((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  if (!on) return null;
  return (
    <div className="grid-overlay" aria-hidden="true">
      <div className="grid-overlay-inner">
        {Array.from({ length: 12 }, (_, i) => <span key={i} data-n={String(i + 1).padStart(2, '0')} />)}
      </div>
    </div>
  );
}
