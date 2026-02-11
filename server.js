import express from 'express';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import * as openidClient from 'openid-client';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

// Configuration from environment variables
const config = {
  port: process.env.PORT || 8080,
  tenantId: process.env.TENANT_ID || 'YOUR_TENANT_ID_HERE',
  clientId: process.env.CLIENT_ID || 'YOUR_CLIENT_ID_HERE',
  clientSecret: process.env.CLIENT_SECRET || 'YOUR_CLIENT_SECRET_HERE',
  baseUrl: process.env.BASE_URL || 'http://localhost:8080',
  sessionSecret: process.env.SESSION_SECRET,
  callbackPath: '/auth/callback',
};

// Generate session secret only for development (to avoid startup failure)
if (!config.sessionSecret) {
  config.sessionSecret = crypto.randomBytes(32).toString('hex');
  console.warn('⚠️  WARNING: SESSION_SECRET not set. Generated a temporary session secret.');
  console.warn('   All sessions will be invalidated on server restart.');
  console.warn('   Set SESSION_SECRET environment variable for production.');
}

// Validate required configuration
if (config.tenantId === 'YOUR_TENANT_ID_HERE' || 
    config.clientId === 'YOUR_CLIENT_ID_HERE' || 
    config.clientSecret === 'YOUR_CLIENT_SECRET_HERE') {
  console.warn('⚠️  WARNING: Using placeholder values for auth configuration.');
  console.warn('   Set TENANT_ID, CLIENT_ID, and CLIENT_SECRET environment variables.');
}

// Trust proxy for Azure App Service (enables secure cookies behind proxy)
app.set('trust proxy', 1);

// Middleware
app.use(express.json());
app.use(cookieParser());

// Session configuration
// Note: Using MemoryStore for development. For production with multiple instances,
// consider using a persistent store like connect-redis or @azure/storage-blob-session-store
app.use(
  session({
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie: {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
    name: 'session',
  })
);

// OIDC configuration
let oidcConfig = null;

async function getOidcConfig() {
  if (oidcConfig) return oidcConfig;

  try {
    const issuerUrl = `https://login.microsoftonline.com/${config.tenantId}/v2.0`;
    const discoveredConfig = await openidClient.discovery(
      new URL(issuerUrl),
      config.clientId,
      config.clientSecret
    );
    
    oidcConfig = discoveredConfig;
    console.log('✅ OIDC configuration initialized successfully');
    return oidcConfig;
  } catch (error) {
    console.error('❌ Failed to initialize OIDC configuration:', error.message);
    throw error;
  }
}

// Initialize OIDC at startup
getOidcConfig().catch((err) => {
  console.error('Failed to initialize OIDC configuration:', err);
});

// Auth endpoints
// Note: Rate limiting is handled by Azure App Service platform layer.
// For local development or other deployment scenarios, consider adding
// express-rate-limit middleware to these endpoints.
app.get('/auth/login', async (req, res) => {
  try {
    const config_oidc = await getOidcConfig();
    
    // Generate PKCE verifier and challenge
    const codeVerifier = openidClient.randomPKCECodeVerifier();
    const codeChallenge = await openidClient.calculatePKCECodeChallenge(codeVerifier);
    
    // Generate state and nonce for security
    const state = openidClient.randomState();
    const nonce = openidClient.randomNonce();
    
    // Store in session for verification in callback
    req.session.codeVerifier = codeVerifier;
    req.session.state = state;
    req.session.nonce = nonce;
    
    await new Promise((resolve) => req.session.save(resolve));
    
    // Build authorization URL
    const parameters = {
      redirect_uri: `${config.baseUrl}${config.callbackPath}`,
      scope: 'openid profile email User.Read',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state: state,
      nonce: nonce,
    };
    
    const redirectTo = openidClient.buildAuthorizationUrl(config_oidc, parameters);
    
    console.log('🔐 Redirecting to login');
    res.redirect(redirectTo.href);
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Failed to initiate login', message: error.message });
  }
});

app.get('/auth/callback', async (req, res) => {
  try {
    const config_oidc = await getOidcConfig();
    const currentUrl = new URL(`${config.baseUrl}${req.originalUrl}`);
    
    // Validate state
    const state = currentUrl.searchParams.get('state');
    if (!req.session.state || state !== req.session.state) {
      console.error('❌ State mismatch');
      return res.status(400).send('State mismatch - possible CSRF attack');
    }
    
    // Exchange code for tokens
    const tokens = await openidClient.authorizationCodeGrant(
      config_oidc,
      currentUrl,
      {
        pkceCodeVerifier: req.session.codeVerifier,
        expectedNonce: req.session.nonce,
        expectedState: req.session.state,
      }
    );
    
    // Get user claims from ID token
    const claims = openidClient.getValidatedIdTokenClaims(tokens);
    
    // Store user info and tokens in session
    req.session.user = {
      name: claims.name,
      email: claims.email || claims.preferred_username,
      sub: claims.sub,
      oid: claims.oid,
    };
    req.session.tokens = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      idToken: tokens.id_token,
      expiresAt: tokens.expires_at,
    };
    req.session.authenticated = true;
    
    // Note: Token refresh is not implemented. When access token expires,
    // users will need to re-authenticate. To implement refresh:
    // 1. Check token expiry in a middleware before protected API calls
    // 2. Use openidClient.refreshTokenGrant() with the refresh token
    // 3. Update session with new tokens
    
    // Clean up temporary session data
    delete req.session.codeVerifier;
    delete req.session.state;
    delete req.session.nonce;
    
    console.log('✅ User authenticated:', req.session.user.email);
    
    // Redirect back to app
    res.redirect('/');
  } catch (error) {
    console.error('Callback error:', error);
    res.status(500).send(`Authentication failed: ${error.message}`);
  }
});

app.get('/auth/me', (req, res) => {
  if (req.session.authenticated && req.session.user) {
    // Generate CSRF token for logout (stored in session)
    if (!req.session.csrfToken) {
      req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    }
    
    res.json({
      authenticated: true,
      user: req.session.user,
      csrfToken: req.session.csrfToken, // Provide token to client for logout
    });
  } else {
    res.json({
      authenticated: false,
    });
  }
});

app.post('/auth/logout', async (req, res) => {
  // CSRF protection: validate token from request body or header
  const csrfToken = req.body.csrfToken || req.headers['x-csrf-token'];
  if (!req.session.csrfToken || csrfToken !== req.session.csrfToken) {
    console.error('❌ CSRF token mismatch on logout');
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }
  
  const idToken = req.session.tokens?.idToken;
  
  // Destroy session
  req.session.destroy((err) => {
    if (err) {
      console.error('Session destruction error:', err);
    }
  });
  
  // Clear session cookie
  res.clearCookie('session');
  
  // Build logout URL for Entra ID with id_token_hint for proper single logout
  let logoutUrl = `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/logout?post_logout_redirect_uri=${encodeURIComponent(config.baseUrl)}`;
  if (idToken) {
    logoutUrl += `&id_token_hint=${encodeURIComponent(idToken)}`;
  }
  
  console.log('👋 User logged out');
  res.json({ logoutUrl });
});

// Serve static files from the dist directory
app.use(express.static(join(__dirname, 'dist')));

// SPA fallback: serve index.html for all unmatched routes
// Note: This must come after API routes.
// Rate limiting is handled by the Azure App Service platform layer.
app.use((req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'));
});

app.listen(config.port, () => {
  console.log(`🚀 Server is running on port ${config.port}`);
  console.log(`   Visit ${config.baseUrl}`);
  console.log(`   Callback URL: ${config.baseUrl}${config.callbackPath}`);
});
