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
  // Render error message if initialization fails
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <div style={{ padding: '2rem', textAlign: 'center', fontFamily: 'sans-serif' }}>
        <h1>Initialization Error</h1>
        <p>Failed to initialize the authentication system. Please refresh the page to try again.</p>
        <p style={{ color: '#666', fontSize: '0.9rem' }}>If the problem persists, please contact support.</p>
      </div>
    </StrictMode>,
  );
});
