import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/roboto/wght.css';
import '@xyflow/react/dist/style.css';
import './styles.css';
import './material.css';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

import "./cleanup.css";
