import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { prepareOffline } from './offline.ts';
import './styles.css';
const root = document.getElementById('root');
if (!root) throw new Error('Application root not found');
createRoot(root).render(<StrictMode><App /></StrictMode>);
void prepareOffline().catch(() => { window.dispatchEvent(new Event('paymentplan-offline-unavailable')); });
