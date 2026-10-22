import { useRef, type ElementType } from 'react';
import { motion, useInView, useReducedMotion } from 'motion/react';
import { lineUp } from '../lib/motion';

/**
 * A headline whose words slide up out of a mask, one short stagger apart. The
 * accessible name is the whole sentence on the container; the moving spans
 * are hidden from assistive tech so the line is read once, not word by word.
 * Sentences break lines where the text does: words wrap naturally and each
 * carries its own mask, so there is no line measurement to go stale.
 */
export function SplitText({ text, as: Tag = 'h1', className = '', delay = 0, inView: animateInView = false, stagger = 0.045 }: {
  text: string; as?: ElementType; className?: string; delay?: number; inView?: boolean; stagger?: number;
}) {
  const ref = useRef<HTMLElement>(null);
  const seen = useInView(ref, { once: true, margin: '0px 0px -8% 0px' });
  const reduce = useReducedMotion();
  const words = text.split(/\s+/).filter(Boolean);
  const show = animateInView ? seen : true;
  return (
    <Tag ref={ref} className={`split ${className}`} aria-label={text}>
      {words.map((w, i) => (
        <span className="split-word" key={`${w}-${i}`} aria-hidden="true">
          <motion.span
            className="split-inner"
            variants={reduce ? undefined : lineUp}
            custom={i * (stagger / 0.06) + delay / 0.06}
            initial={reduce ? false : 'hidden'}
            animate={show ? 'show' : 'hidden'}
          >
            {w}
          </motion.span>
        </span>
      )).flatMap((el, i) => (i < words.length - 1 ? [el, ' '] : [el]))}
    </Tag>
  );
}
