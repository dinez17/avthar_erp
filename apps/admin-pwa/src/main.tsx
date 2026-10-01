import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Fonts are self-hosted rather than linked from Google. This is an installable,
// offline-capable PWA: a webfont fetched from a third party is precisely the asset
// Workbox cannot precache, so on a cold offline start the app would fall back to a
// system face and reflow. Only the weights the theme actually uses are imported.
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/plus-jakarta-sans/700.css';
import '@fontsource/plus-jakarta-sans/800.css';

import App from './App';

// autoUpdate activates a new service worker immediately. Reload an already-open
// app once when that new worker takes control so its JavaScript cannot remain on
// an obsolete API contract or obsolete diagnostics message.
if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
  navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), {
    once: true,
  });
}

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root not found');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
