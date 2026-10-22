import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { MotionConfig } from 'motion/react';
import { Layout } from './components/Layout';

const Home = lazy(() => import('./pages/Home').then((m) => ({ default: m.Home })));
const Work = lazy(() => import('./pages/Work').then((m) => ({ default: m.Work })));
const CaseStudy = lazy(() => import('./pages/CaseStudy').then((m) => ({ default: m.CaseStudy })));
const Writing = lazy(() => import('./pages/Writing').then((m) => ({ default: m.Writing })));
const About = lazy(() => import('./pages/About').then((m) => ({ default: m.About })));
const NotFound = lazy(() => import('./pages/NotFound').then((m) => ({ default: m.NotFound })));
const RecipientSpace = lazy(() => import('./pages/RecipientSpace').then((m) => ({ default: m.RecipientSpace })));
const RecipientStudy = lazy(() => import('./pages/RecipientSpace').then((m) => ({ default: m.RecipientStudy })));
const Admin = lazy(() => import('./admin/Admin').then((m) => ({ default: m.Admin })));

export function App() {
  return (
    <MotionConfig reducedMotion="user">
      <BrowserRouter>
        <Suspense fallback={null}>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<Home />} />
              <Route path="/work" element={<Work />} />
              <Route path="/work/tag/:tag" element={<Work />} />
              <Route path="/work/:slug" element={<CaseStudy />} />
              <Route path="/writing" element={<Writing />} />
              <Route path="/opinion" element={<Navigate to="/writing" replace />} />
              <Route path="/about" element={<About />} />
              <Route path="*" element={<NotFound />} />
            </Route>
            <Route path="/for/:recipient" element={<RecipientSpace />} />
            <Route path="/for/:recipient/work/:slug" element={<RecipientStudy />} />
            <Route path="/admin/*" element={<Admin />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </MotionConfig>
  );
}
