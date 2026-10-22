import { useEffect, useState } from 'react';

/** The id of the section nearest the reading band (15% to 30% from the top). */
export function useScrollSpy(ids: string[], rootMargin = '-15% 0px -70% 0px'): string | null {
  const [active, setActive] = useState<string | null>(ids[0] ?? null);
  useEffect(() => {
    if (!ids.length) return;
    const visible = new Map<string, number>();
    const observer = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) visible.set(e.target.id, e.boundingClientRect.top);
        else visible.delete(e.target.id);
      }
      if (visible.size) {
        const [top] = [...visible.entries()].sort((a, b) => a[1] - b[1]);
        setActive(top[0]);
      }
    }, { rootMargin, threshold: [0, 0.2] });
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [ids.join('|'), rootMargin]); // eslint-disable-line react-hooks/exhaustive-deps
  return active;
}
