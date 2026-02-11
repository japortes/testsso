import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MsalProvider } from '@azure/msal-react'
import { msalInstance, initializeMsal } from './msalInstance'
import './index.css'
import App from './App.tsx'

// Create root once
const root = createRoot(document.getElementById('root')!);

// Initialize MSAL before rendering the app
initializeMsal().then(() => {
  root.render(
    <StrictMode>
      <MsalProvider instance={msalInstance}>
        <App />
      </MsalProvider>
    </StrictMode>,
  );
}).catch((error) => {
  console.error('Failed to initialize MSAL:', error);
  // Render error message if initialization fails
  root.render(
    <StrictMode>
      <div className="error-container">
        <h1>Initialization Error</h1>
        <p>Failed to initialize the authentication system. Please refresh the page to try again.</p>
        <p className="error-detail">If the problem persists, please contact support.</p>
      </div>
    </StrictMode>,
  );
});
