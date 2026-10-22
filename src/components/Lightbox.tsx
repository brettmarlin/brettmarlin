import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowLeft, Arrow, Close } from './Icons';
import { imageSrc } from '../lib/images';
import { EASE } from '../lib/motion';

export type LightboxImage = { src: string; alt: string; width: number; height: number };

/**
 * A focus-trapped dialog over one beat's images. Escape closes, arrows move
 * within the beat only, focus returns to what opened it. Images render at
 * natural size capped to the viewport, never scaled up.
 */
export function Lightbox({ images, index, onClose, onIndex, label }: {
  images: LightboxImage[]; index: number | null; onClose: () => void; onIndex: (i: number) => void; label: string;
}) {
  const open = index !== null;
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnTo = useRef<Element | null>(null);
  const reduce = useReducedMotion();
  const [dir, setDir] = useState(0);

  useEffect(() => {
    if (!open) return;
    returnTo.current = document.activeElement;
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    requestAnimationFrame(() => closeRef.current?.focus());
    return () => {
      document.documentElement.style.overflow = prev;
      (returnTo.current as HTMLElement | null)?.focus?.();
    };
  }, [open]);

  const go = (d: number) => {
    if (index === null) return;
    const next = index + d;
    if (next < 0 || next >= images.length) return;
    setDir(d);
    onIndex(next);
  };

  // Escape and the arrows work wherever focus went, the image included.
  useEffect(() => {
    if (!open) return;
    const onWindowKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    };
    window.addEventListener('keydown', onWindowKey);
    return () => window.removeEventListener('keydown', onWindowKey);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Tab') {
      const focusables = (e.currentTarget.querySelectorAll('button:not([disabled])') as NodeListOf<HTMLElement>);
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };

  return (
    <AnimatePresence>
      {open && index !== null && images[index] ? (
        <motion.div
          className="lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={`${label}, image ${index + 1} of ${images.length}`}
          onKeyDown={onKey}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.25, ease: EASE }}
        >
          <div className="lightbox-bar">
            <span className="mono">{images[index].alt}</span>
            <button ref={closeRef} type="button" onClick={onClose} aria-label="Close"><Close /></button>
          </div>
          <div className="lightbox-stage" onClick={onClose}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.img
                key={images[index].src}
                src={imageSrc(images[index].src)}
                alt={images[index].alt}
                width={images[index].width}
                height={images[index].height}
                onClick={(e) => e.stopPropagation()}
                initial={reduce ? { opacity: 0 } : { opacity: 0, x: dir * 32 }}
                animate={{ opacity: 1, x: 0 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, x: dir * -32 }}
                transition={{ duration: 0.3, ease: EASE }}
              />
            </AnimatePresence>
          </div>
          <div className="lightbox-foot">
            <span className="mono">{index + 1} / {images.length}</span>
            <div className="lightbox-nav">
              <button type="button" onClick={() => go(-1)} aria-disabled={index === 0} aria-label="Previous image"><ArrowLeft /></button>
              <button type="button" onClick={() => go(1)} aria-disabled={index === images.length - 1} aria-label="Next image"><Arrow /></button>
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
