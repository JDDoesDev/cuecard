import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

// Import fonts
import './styles/fonts';

// Import global styles
import './styles/global.css';
import './styles/print.css';

// ============================================================================
// Mount React App
// ============================================================================

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found. Check index.html for <div id="root"></div>');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
