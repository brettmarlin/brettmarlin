import type { Transition, Variants } from 'motion/react';

/** One easing for the whole site, mirrored as --ease in tokens.css. */
export const EASE = [0.22, 1, 0.36, 1] as const;
export const EASE_IO = [0.65, 0, 0.35, 1] as const;

export const t = {
  fast: { duration: 0.18, ease: EASE } as Transition,
  base: { duration: 0.5, ease: EASE } as Transition,
  slow: { duration: 0.8, ease: EASE } as Transition,
};

/** Rise and fade, staggered by index via `custom`. */
export const rise: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.6, delay: i * 0.07, ease: EASE } }),
};

/** A masked line that slides up into view. The parent needs overflow hidden. */
export const lineUp: Variants = {
  hidden: { y: '110%' },
  show: (i: number = 0) => ({ y: 0, transition: { duration: 0.9, delay: 0.05 + i * 0.06, ease: EASE } }),
};

/** Image reveal: a soft scale down behind a clip. */
export const unveil: Variants = {
  hidden: { clipPath: 'inset(0 0 100% 0)', scale: 1.06 },
  show: { clipPath: 'inset(0 0 0% 0)', scale: 1, transition: { duration: 1.1, ease: EASE } },
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: t.base },
};

export const page: Variants = {
  initial: { opacity: 0, y: 8 },
  enter: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } },
  exit: { opacity: 0, y: -6, transition: { duration: 0.22, ease: EASE } },
};
