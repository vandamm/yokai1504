import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import './ui/table.css';
import { publicAsset } from './ui/assets';

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.register(publicAsset('sw.js')).catch(() => console.warn('Notification service worker could not start.'));
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
