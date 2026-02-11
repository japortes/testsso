import { useEffect } from 'react';
import { useMsal, useIsAuthenticated, AuthenticatedTemplate, UnauthenticatedTemplate } from '@azure/msal-react';
import { InteractionStatus } from '@azure/msal-browser';
import { loginRequest } from './authConfig';
import './App.css';

function App() {
  const { instance, accounts, inProgress } = useMsal();
  const isAuthenticated = useIsAuthenticated();

  // Attempt silent sign-in on mount
  useEffect(() => {
    if (!isAuthenticated && inProgress === InteractionStatus.None) {
      instance.ssoSilent(loginRequest).catch(() => {
        // Silent sign-in failed, automatically redirect to interactive login
        console.log('Silent sign-in failed. Redirecting to interactive login...');
        instance.loginRedirect(loginRequest).catch((e) => {
          console.error('Login redirect failed:', e);
        });
      });
    }
  }, [isAuthenticated, inProgress, instance]);

  const handleLogin = () => {
    instance.loginRedirect(loginRequest).catch((e) => {
      console.error('Login failed:', e);
    });
  };

  const handleLogout = () => {
    instance.logoutRedirect().catch((e) => {
      console.error('Logout failed:', e);
    });
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>Microsoft Entra ID Authentication</h1>
        
        <AuthenticatedTemplate>
          <div className="user-info">
            <h2>Welcome!</h2>
            {accounts.length > 0 && (
              <div>
                <p><strong>Display Name:</strong> {accounts[0].name || 'N/A'}</p>
                <p><strong>Username:</strong> {accounts[0].username || 'N/A'}</p>
              </div>
            )}
            <button onClick={handleLogout} className="logout-button">
              Sign Out
            </button>
          </div>
        </AuthenticatedTemplate>

        <UnauthenticatedTemplate>
          <div className="login-container">
            <p>Signing you in...</p>
            <button onClick={handleLogin} className="login-button">
              Sign In
            </button>
          </div>
        </UnauthenticatedTemplate>
      </header>
    </div>
  );
}

export default App;
