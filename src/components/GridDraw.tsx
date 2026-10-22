import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { EASE } from '../lib/motion';

/** The twelve columns draw themselves on the first paint of a session and
 *  fade away: the grid is shown once, then trusted. Never under reduced
 *  motion, never twice. */
export function GridDraw() {
  const reduce = useReducedMotion();
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (reduce) return;
    try {
      if (sessionStorage.getItem('bm-grid-drawn')) return;
      sessionStorage.setItem('bm-grid-drawn', '1');
    } catch { return; }
    setShow(true);
    const t = window.setTimeout(() => setShow(false), 1500);
    return () => window.clearTimeout(t);
  }, [reduce]);
  if (!show) return null;
  return (
    <motion.div className="grid-overlay grid-draw" aria-hidden="true" initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={{ delay: 0.9, duration: 0.5, ease: EASE }}>
      <div className="grid-overlay-inner">
        {Array.from({ length: 12 }, (_, i) => (
          <motion.span key={i} initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ duration: 0.48, delay: i * 0.03, ease: EASE }} style={{ transformOrigin: 'top' }} />
        ))}
      </div>
    </motion.div>
  );
}
