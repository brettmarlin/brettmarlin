import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { ThemeToggle } from '../components/ThemeToggle';
import { admin, session, ApiError } from '../lib/api';
import { SESSION_KEYS } from '../lib/config';
import { useDocumentTitle, useNoIndex } from '../hooks/useDocumentTitle';
import { Dashboard } from './Dashboard';
import { Recipients } from './Recipients';
import { RecipientEditor } from './RecipientEditor';
import { RecipientPreview } from './RecipientPreview';
import { Events } from './Events';
import { Studies } from './Studies';
import { GatedEditor } from './GatedEditor';
import { ToastProvider } from './Toast';

/**
 * The admin panel. Token login (the Worker's ADMIN_TOKEN, held in
 * sessionStorage for the tab), then recipients, events, studies and gated
 * extensions. Everything here talks to /api/admin/* and nothing here is
 * reachable without the token: the panel is a client, the Worker decides.
 */
export function Admin() {
  useNoIndex();
  useDocumentTitle('Admin');
  const [authed, setAuthed] = useState<boolean | null>(null);
  useEffect(() => {
    const token = session.get(SESSION_KEYS.adminToken);
    if (!token) { setAuthed(false); return; }
    admin.me().then(() => setAuthed(true)).catch(() => { session.clear(SESSION_KEYS.adminToken); setAuthed(false); });
  }, []);
  if (authed === null) return <div className="login"><span className="label muted">Checking</span></div>;
  if (!authed) return <Login onDone={() => setAuthed(true)} />;
  return (
    <ToastProvider>
      <AdminLayout>
        <Routes>
          <Route index element={<Dashboard />} />
          <Route path="recipients" element={<Recipients />} />
          <Route path="recipients/new" element={<RecipientEditor />} />
          <Route path="recipients/:slug" element={<RecipientEditor />} />
          <Route path="recipients/:slug/preview" element={<RecipientPreview />} />
          <Route path="recipients/:slug/preview/work/:study" element={<RecipientPreview />} />
          <Route path="events" element={<Events />} />
          <Route path="studies" element={<Studies />} />
          <Route path="gated/:publicSlug" element={<GatedEditor />} />
          <Route path="*" element={<p className="secondary">Nothing here. <Link to="/admin" className="arrow-link">Dashboard</Link></p>} />
        </Routes>
      </AdminLayout>
    </ToastProvider>
  );
}

function Login({ onDone }: { onDone: () => void }) {
  const [token, setToken] = useState('');
  const [state, setState] = useState<'idle' | 'checking' | 'wrong' | 'error'>('idle');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState('checking');
    session.set(SESSION_KEYS.adminToken, token.trim());
    try { await admin.me(); onDone(); }
    catch (err) { session.clear(SESSION_KEYS.adminToken); setState(err instanceof ApiError && err.status === 401 ? 'wrong' : 'error'); }
  };
  return (
    <main className="login" id="main">
      <form className="card" onSubmit={submit}>
        <div className="between"><span className="wordmark-name">Brett Marlin</span><span className="label muted">Admin</span></div>
        <h1 className="t-h2">Sign in with the Worker token.</h1>
        <p className="t-small secondary">The token is the Worker's ADMIN_TOKEN secret. It lives in this tab only and is never written to disk by the site.</p>
        <label className="field"><span>Token</span><input className="input" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} autoFocus /></label>
        {state === 'wrong' ? <p className="error">That token was refused.</p> : null}
        {state === 'error' ? <p className="error">Could not reach the Worker. Is the API running?</p> : null}
        <div className="row"><button className="btn inverse" type="submit" disabled={!token.trim() || state === 'checking'}>{state === 'checking' ? 'Checking' : 'Sign in'}</button><Link to="/" className="btn quiet">Back to the site</Link></div>
      </form>
    </main>
  );
}

function AdminLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const signOut = () => { session.clear(SESSION_KEYS.adminToken); navigate('/'); };
  return (
    <div className="admin">
      <aside className="admin-rail">
        <div className="between"><Link to="/admin" className="wordmark-name">Admin</Link><ThemeToggle /></div>
        <nav className="admin-nav" aria-label="Admin">
          <NavLink to="/admin" end>Dashboard</NavLink>
          <NavLink to="/admin/recipients">Recipients</NavLink>
          <NavLink to="/admin/events">Access log</NavLink>
          <NavLink to="/admin/studies">Studies</NavLink>
        </nav>
        <div className="stack">
          <Link to="/admin/recipients/new" className="btn inverse small">New recipient</Link>
          <p className="t-caption muted">Records of truth stay in the vault. Use "Copy as vault note" on a recipient to keep recipients/ in step.</p>
        </div>
        <div className="row" style={{ marginTop: 'auto' }}>
          <Link to="/" className="label muted">View site</Link>
          <button type="button" className="label muted" onClick={signOut}>Sign out</button>
        </div>
      </aside>
      <main className="admin-main" id="main">{children}</main>
    </div>
  );
}
