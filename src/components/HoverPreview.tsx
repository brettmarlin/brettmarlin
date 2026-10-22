import { useEffect, useRef } from 'react';
import { motion, useMotionValue, useSpring, useReducedMotion, AnimatePresence } from 'motion/react';
import { imageSrc } from '../lib/images';
import type { BeatMedia } from '../lib/studies';

type Img = Extract<BeatMedia, { kind: 'image' }>;

/**
 * The floating image that follows the cursor over the work index. One element
 * for the whole list; the row under the pointer decides what it shows. Springs
 * trail the cursor so the picture feels carried rather than pinned. Never
 * mounted on coarse pointers, never on reduced motion.
 */
export function HoverPreview({ image, active }: { image: Img | null; active: boolean }) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 260, damping: 32, mass: 0.6 });
  const sy = useSpring(y, { stiffness: 260, damping: 32, mass: 0.6 });
  const reduce = useReducedMotion();
  const last = useRef<Img | null>(null);
  if (image) last.current = image;

  useEffect(() => {
    const on = (e: PointerEvent) => { x.set(e.clientX); y.set(e.clientY); };
    window.addEventListener('pointermove', on, { passive: true });
    return () => window.removeEventListener('pointermove', on);
  }, [x, y]);

  const shown = image ?? last.current;
  if (reduce || !shown) return null;
  const w = 360;
  const h = Math.round((w * shown.height) / shown.width);
  return (
    <AnimatePresence>
      {active ? (
        <motion.div
          className="preview"
          aria-hidden="true"
          style={{ x: sx, y: sy, width: w, height: Math.min(h, 360) }}
          initial={{ opacity: 0, scale: 0.92, rotate: -1.5 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          exit={{ opacity: 0, scale: 0.96, rotate: 1 }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        >
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.img
              key={shown.src}
              src={imageSrc(shown.src)}
              alt=""
              width={shown.width}
              height={shown.height}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            />
          </AnimatePresence>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
