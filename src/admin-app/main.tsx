import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import '@fontsource/manrope/cyrillic-400.css';
import '@fontsource/manrope/cyrillic-500.css';
import '@fontsource/manrope/cyrillic-600.css';
import '@fontsource/manrope/cyrillic-700.css';
import '@fontsource/manrope/cyrillic-800.css';
import '@fontsource/manrope/latin-400.css';
import '@fontsource/manrope/latin-500.css';
import '@fontsource/manrope/latin-600.css';
import '@fontsource/manrope/latin-700.css';
import '@fontsource/manrope/latin-800.css';
import './App.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Admin App root element was not found.');
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
