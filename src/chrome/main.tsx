import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ChromeApp } from './app/ChromeApp';
import { ModelManagerPage } from './features/model-manager/ModelManagerPage';
import './index.css';

const hasModel = new URLSearchParams(window.location.search).has('model');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {hasModel ? <ChromeApp /> : <ModelManagerPage />}
  </StrictMode>,
);
