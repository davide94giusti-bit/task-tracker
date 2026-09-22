import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { PwaInstallProvider } from './PwaInstallPrompt';
import './styles.css';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js', { updateViaCache: 'none' })
      .then(registration => registration.update())
      .catch(error => console.warn('Service worker registration failed', error));
  });
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><PwaInstallProvider><App/></PwaInstallProvider></React.StrictMode>);
