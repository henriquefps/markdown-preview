import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'katex/dist/katex.min.css'
import './index.css'
import Root from './Root.tsx'
import { TooltipProvider } from '@/components/ui/tooltip'
import { initTheme } from '@/lib/theme/theme'

// Applies the saved theme and palette before the first paint (no inline script, CSP-safe).
initTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TooltipProvider delayDuration={300}>
      <Root />
    </TooltipProvider>
  </StrictMode>,
)

if ('serviceWorker' in navigator) {
  if (import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then((reg) => console.log('Service Worker registered', reg))
        .catch((err) => console.error('Service Worker registration failed', err));
    });
  } else {
    // Dev: make sure a worker left over from a production build never serves stale files.
    navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()));
  }
}
