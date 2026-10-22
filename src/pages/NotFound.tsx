import { Link } from 'react-router-dom';
import { Arrow } from '../components/Icons';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export function NotFound() {
  useDocumentTitle('Not found');
  return (
    <section className="container nf">
      <span className="label"><span className="signal">404</span> Nothing here</span>
      <h1 className="t-display">This page does not exist, or the link has moved.</h1>
      <p className="t-lead measure">The work is one step away.</p>
      <div className="row">
        <Link to="/" className="arrow-link t-h3">Home<Arrow className="arrow" /></Link>
        <Link to="/work" className="arrow-link t-h3">Selected work<Arrow className="arrow" /></Link>
      </div>
    </section>
  );
}
