import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import App from './App.jsx';
import { initTheme } from './services/theme';
import { startServiceWorkerCleanup } from './services/serviceWorkerCleanup';

// Customer Web registers NO service worker.
//
// The app is an online-first React SPA: the backend is the authoritative source
// for auth, tokens and queue state, and every offline affordance (offline
// banner, cached token envelope, connection indicator) is plain app code
// driven by `navigator.onLine` + localStorage. A hand-rolled app-shell worker
// added no value while its navigation handler could call `respondWith(undefined)`,
// which made the browser fail `/login` and every other route with
// "The FetchEvent ... resulted in a network error response".
//
// The QR camera needs `navigator.mediaDevices.getUserMedia`, which requires a
// secure (HTTPS) context — satisfied by the Cloudflare Pages custom domain, and
// entirely independent of any service worker.
//
// startServiceWorkerCleanup() actively evicts the retired worker and its stale
// caches from browsers that already installed it, so no user stays stuck on the
// broken cached worker after this build deploys.
startServiceWorkerCleanup();

// Put the stored theme on <html> before the first render, so the state a
// component reads and the attribute CSS is painting against are the same.
initTheme();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
