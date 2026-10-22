import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ThemeToggle } from './ThemeToggle';
import { Close } from './Icons';
import { SITE } from '../lib/config';
import { EASE } from '../lib/motion';

const LINKS = [
  { to: '/work', label: 'Work' },
  { to: '/writing', label: 'Writing' },
  { to: '/about', label: 'About' },
];

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const reduce = useReducedMotion();
  const closeRef = useRef<HTMLButtonElement>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);

  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    document.documentElement.style.overflow = open ? 'hidden' : '';
    if (open) requestAnimationFrame(() => closeRef.current?.focus());
    else menuBtnRef.current?.focus({ preventScroll: true });
    return () => { document.documentElement.style.overflow = ''; };
  }, [open]);

  const trapTab = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return;
    const focusables = e.currentTarget.querySelectorAll<HTMLElement>('a[href], button:not([disabled])');
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <header className={`nav ${scrolled ? 'scrolled' : ''}`}>
        <div className="container nav-inner">
          <Link to="/" className="wordmark">
            <span className="wordmark-name">Brett Marlin</span>
            <span className="wordmark-meta label muted hide-sm">Design leader, {SITE.location}</span>
          </Link>
          <nav className="nav-links" aria-label="Primary">
            {LINKS.map((l) => (
              <NavLink key={l.to} to={l.to} className={({ isActive }) => `nav-link label ${isActive ? 'active' : ''}`}>{l.label}</NavLink>
            ))}
            <a className="nav-link label" href={`mailto:${SITE.email}`}>Contact</a>
            <ThemeToggle />
          </nav>
          <div className="nav-mobile">
            <ThemeToggle />
            <button ref={menuBtnRef} type="button" className="menu-btn label" aria-expanded={open} aria-controls="menu" onClick={() => setOpen((v) => !v)}>
              {open ? 'Close' : 'Menu'}
            </button>
          </div>
        </div>
      </header>
      <AnimatePresence>
        {open ? (
          <motion.div
            id="menu"
            className="menu"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            onKeyDown={trapTab}
            initial={reduce ? { opacity: 0 } : { clipPath: 'inset(0 0 100% 0)' }}
            animate={reduce ? { opacity: 1 } : { clipPath: 'inset(0 0 0% 0)' }}
            exit={reduce ? { opacity: 0 } : { clipPath: 'inset(0 0 100% 0)' }}
            transition={{ duration: 0.5, ease: EASE }}
          >
            <div className="container menu-inner">
              <div className="between">
                <span className="label muted">Menu</span>
                <button ref={closeRef} type="button" className="menu-close" onClick={() => setOpen(false)} aria-label="Close menu"><Close /></button>
              </div>
              <nav aria-label="Primary, mobile" className="menu-links">
                {[{ to: '/', label: 'Home' }, ...LINKS].map((l, i) => (
                  <motion.div key={l.to} initial={reduce ? false : { opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.06, duration: 0.5, ease: EASE }}>
                    <Link to={l.to} className="menu-link t-display"><span className="label signal">0{i + 1}</span>{l.label}</Link>
                  </motion.div>
                ))}
                <motion.div initial={reduce ? false : { opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + 4 * 0.06, duration: 0.5, ease: EASE }}>
                  <a href={`mailto:${SITE.email}`} className="menu-link t-display"><span className="label signal">05</span>Contact</a>
                </motion.div>
              </nav>
              <div className="menu-foot label muted">
                <a href={SITE.linkedin} target="_blank" rel="noreferrer">LinkedIn</a>
                <a href={SITE.substack} target="_blank" rel="noreferrer">Substack</a>
                <a href={SITE.marliin} target="_blank" rel="noreferrer">Marliin</a>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
