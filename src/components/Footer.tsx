import { Link } from 'react-router-dom';
import { SITE } from '../lib/config';
import { Arrow } from './Icons';

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-top rule-strong">
          <Link to="/" className="footer-mark t-h2">Brett Marlin</Link>
          <a href={`mailto:${SITE.email}`} className="arrow-link t-h3">{SITE.email}<Arrow className="arrow" /></a>
        </div>
        <div className="footer-grid">
          <div className="footer-col">
            <span className="label muted">Site</span>
            <Link to="/work">Work</Link>
            <Link to="/writing">Writing</Link>
            <Link to="/about">About</Link>
            <a href="/brett.md">brett.md</a>
          </div>
          <div className="footer-col">
            <span className="label muted">Elsewhere</span>
            <a href={SITE.linkedin} target="_blank" rel="noreferrer">LinkedIn</a>
            <a href={SITE.substack} target="_blank" rel="noreferrer">Substack</a>
            <a href={SITE.x} target="_blank" rel="noreferrer">X</a>
            <a href={SITE.github} target="_blank" rel="noreferrer">GitHub</a>
          </div>
          <div className="footer-col">
            <span className="label muted">Practice</span>
            <a href={SITE.marliin} target="_blank" rel="noreferrer">Marliin</a>
            <span className="muted t-small">Fractional and consulting work runs through Marliin.</span>
          </div>
          <div className="footer-col colophon">
            <span className="label muted">Colophon</span>
            <span className="t-small muted">Set in Archivo and IBM Plex Mono on a twelve column grid. Built with React, Motion and Cloudflare. Case studies are generated from a private vault; names ship only when cleared. Shift, Alt and G show the grid.</span>
          </div>
        </div>
        <div className="footer-bottom label muted">
          <span>{year} Brett Marlin</span>
          <span>{SITE.location}</span>
          <button type="button" className="footer-admin" onClick={() => window.dispatchEvent(new CustomEvent('bm:grid'))}>Grid</button>
        </div>
      </div>
    </footer>
  );
}
