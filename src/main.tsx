import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MsalProvider } from '@azure/msal-react'
import { msalInstance, initializeMsal } from './msalInstance'
import './index.css'
import App from './App.tsx'

// Initialize MSAL before rendering the app
initializeMsal().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <MsalProvider instance={msalInstance}>
        <App />
      </MsalProvider>
    </StrictMode>,
  );
}).catch((error) => {
  console.error('Failed to initialize MSAL:', error);
});
