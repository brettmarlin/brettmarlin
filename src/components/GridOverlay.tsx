import { useEffect, useState } from 'react';

/** Shift+Alt+G anywhere (a chord, so a dictated g never trips it) or the
 *  footer's Grid button shows the twelve columns and the 8px baseline the
 *  page is set on. */
export function GridOverlay() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyG' && e.altKey && e.shiftKey && !e.metaKey && !e.ctrlKey) { e.preventDefault(); setOn((v) => !v); }
    };
    const onToggle = () => setOn((v) => !v);
    window.addEventListener('keydown', onKey);
    window.addEventListener('bm:grid', onToggle);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('bm:grid', onToggle); };
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
