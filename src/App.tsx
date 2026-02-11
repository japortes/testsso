import { useEffect, useState } from 'react';
import './App.css';

interface User {
  name?: string;
  email?: string;
  sub?: string;
  oid?: string;
}

interface AuthState {
  authenticated: boolean;
  user?: User;
  loading: boolean;
  error?: string;
  csrfToken?: string;
}

function App() {
  const [authState, setAuthState] = useState<AuthState>({
    authenticated: false,
    loading: true,
  });

  // Check authentication status on mount
  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const response = await fetch('/auth/me', {
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error('Failed to check authentication status');
      }
      
      const data = await response.json();
      setAuthState({
        authenticated: data.authenticated,
        user: data.user,
        csrfToken: data.csrfToken,
        loading: false,
      });
    } catch (error) {
      console.error('Auth check error:', error);
      setAuthState({
        authenticated: false,
        loading: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  const handleLogin = () => {
    // Navigate to login endpoint which will redirect to Entra ID
    window.location.href = '/auth/login';
  };

  const handleLogout = async () => {
    try {
      const response = await fetch('/auth/logout', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ csrfToken: authState.csrfToken }),
      });
      
      if (!response.ok) {
        throw new Error('Logout failed');
      }
      
      const data = await response.json();
      
      // Redirect to Entra ID logout endpoint
      window.location.assign(data.logoutUrl);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  if (authState.loading) {
    return (
      <div className="App">
        <header className="App-header">
          <h1>Microsoft Entra ID Authentication</h1>
          <div className="login-container">
            <p>Loading...</p>
          </div>
        </header>
      </div>
    );
  }

  return (
    <div className="App">
      <header className="App-header">
        <h1>Microsoft Entra ID Authentication</h1>
        
        {authState.authenticated && authState.user ? (
          <div className="user-info">
            <h2>Welcome!</h2>
            <div>
              <p><strong>Display Name:</strong> {authState.user.name || 'N/A'}</p>
              <p><strong>Email:</strong> {authState.user.email || 'N/A'}</p>
            </div>
            <button onClick={handleLogout} className="logout-button">
              Sign Out
            </button>
          </div>
        ) : (
          <div className="login-container">
            <p>You are not signed in.</p>
            <button onClick={handleLogin} className="login-button">
              Sign In
            </button>
          </div>
        )}
        
        {authState.error && (
          <div className="error-message">
            <p>Error: {authState.error}</p>
          </div>
        )}
      </header>
    </div>
  );
}

export default App;
