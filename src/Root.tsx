import { lazy, Suspense } from 'react';

// Two pages, no router: /sync is the sync server guide, everything else is the editor.
// Each is its own chunk, so the guide never loads the editor (Mermaid, KaTeX, ...).
// public/_redirects serves index.html for every path, and the service worker's navigation
// handler falls back to the cached index.html offline, so /sync works like /.
const SyncGuide = lazy(() => import('./pages/SyncGuide.tsx'));
const App = lazy(() => import('./App.tsx'));

function isSyncGuidePath(pathname: string) {
  return /^\/sync\/?$/.test(pathname);
}

export default function Root() {
  const Page = isSyncGuidePath(window.location.pathname) ? SyncGuide : App;
  return (
    <Suspense fallback={null}>
      <Page />
    </Suspense>
  );
}
