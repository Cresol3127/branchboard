import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/roboto/wght.css';
import '@xyflow/react/dist/style.css';
import './styles.css';
import './material.css';
import './workspace.css';
import './motion.css';
import App from './App';
import { applyAppearance } from './appearance';
import { installMotionTokens } from './motion';

installMotionTokens(document.documentElement);

try {
  applyAppearance(localStorage.getItem('branchboard.theme') ?? 'system');
} catch {
  /* Safe defaults when storage is disabled. */
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
