import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Nav } from './Nav';
import { GridOverlay } from './GridOverlay';
import { Footer } from './Footer';
import { page } from '../lib/motion';

export function Layout() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      const el = document.getElementById(hash.slice(1));
      if (el) { el.scrollIntoView({ block: 'start' }); return; }
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname, hash]);
  return (
    <>
      <Nav />
      <AnimatePresence mode="wait" initial={false}>
        <motion.main id="main" key={pathname} className="page" variants={page} initial="initial" animate="enter" exit="exit">
          <Outlet />
        </motion.main>
      </AnimatePresence>
      <Footer />
      <GridOverlay />
    </>
  );
}
