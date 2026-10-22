import { useRef, type ReactNode, type ElementType } from 'react';
import { useInView } from 'motion/react';

/** The one scroll reveal. Pure CSS transition driven by a data attribute, so
 *  the cost is one IntersectionObserver per element and no JS per frame. */
export function Reveal({ children, as: Tag = 'div', className = '', delay = 0, once = true, margin = '0px 0px -10% 0px', ...rest }: {
  children: ReactNode; as?: ElementType; className?: string; delay?: number; once?: boolean; margin?: string; [key: string]: unknown;
}) {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once, margin: margin as never });
  return (
    <Tag ref={ref} className={`reveal ${className}`} data-inview={inView ? 'true' : 'false'} style={delay ? { transitionDelay: `${delay}ms` } : undefined} {...rest}>
      {children}
    </Tag>
  );
}
