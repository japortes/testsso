import express from 'express';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import { Issuer, generators } from 'openid-client';
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
  sessionSecret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  callbackPath: '/auth/callback',
};

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
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
    name: 'session',
  })
);

// OIDC client setup
let oidcClient = null;

async function getOidcClient() {
  if (oidcClient) return oidcClient;

  try {
    const issuer = await Issuer.discover(
      `https://login.microsoftonline.com/${config.tenantId}/v2.0`
    );
    
    oidcClient = new issuer.Client({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uris: [`${config.baseUrl}${config.callbackPath}`],
      response_types: ['code'],
    });

    console.log('✅ OIDC client initialized successfully');
    return oidcClient;
  } catch (error) {
    console.error('❌ Failed to initialize OIDC client:', error.message);
    throw error;
  }
}

// Initialize OIDC client at startup
getOidcClient().catch((err) => {
  console.error('Failed to initialize OIDC client:', err);
});

// Auth endpoints
app.get('/auth/login', async (req, res) => {
  try {
    const client = await getOidcClient();
    
    // Generate PKCE verifier and challenge
    const codeVerifier = generators.codeVerifier();
    const codeChallenge = generators.codeChallenge(codeVerifier);
    
    // Generate state and nonce for security
    const state = generators.state();
    const nonce = generators.nonce();
    
    // Store in session for verification in callback
    req.session.codeVerifier = codeVerifier;
    req.session.state = state;
    req.session.nonce = nonce;
    
    await new Promise((resolve) => req.session.save(resolve));
    
    // Build authorization URL
    const authorizationUrl = client.authorizationUrl({
      scope: 'openid profile email User.Read',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state: state,
      nonce: nonce,
    });
    
    console.log('🔐 Redirecting to login:', authorizationUrl);
    res.redirect(authorizationUrl);
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Failed to initiate login', message: error.message });
  }
});

app.get('/auth/callback', async (req, res) => {
  try {
    const client = await getOidcClient();
    const params = client.callbackParams(req);
    
    // Validate state
    if (!req.session.state || params.state !== req.session.state) {
      console.error('❌ State mismatch');
      return res.status(400).send('State mismatch - possible CSRF attack');
    }
    
    // Exchange code for tokens
    const tokenSet = await client.callback(
      `${config.baseUrl}${config.callbackPath}`,
      params,
      {
        code_verifier: req.session.codeVerifier,
        state: req.session.state,
        nonce: req.session.nonce,
      }
    );
    
    // Get user claims from ID token
    const claims = tokenSet.claims();
    
    // Store user info and tokens in session
    req.session.user = {
      name: claims.name,
      email: claims.email || claims.preferred_username,
      sub: claims.sub,
      oid: claims.oid,
    };
    req.session.tokens = {
      accessToken: tokenSet.access_token,
      refreshToken: tokenSet.refresh_token,
      idToken: tokenSet.id_token,
      expiresAt: tokenSet.expires_at,
    };
    req.session.authenticated = true;
    
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
    res.json({
      authenticated: true,
      user: req.session.user,
    });
  } else {
    res.json({
      authenticated: false,
    });
  }
});

app.post('/auth/logout', async (req, res) => {
  const idToken = req.session.tokens?.idToken;
  
  // Destroy session
  req.session.destroy((err) => {
    if (err) {
      console.error('Session destruction error:', err);
    }
  });
  
  // Clear session cookie
  res.clearCookie('session');
  
  // Build logout URL for Entra ID
  const logoutUrl = `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/logout?post_logout_redirect_uri=${encodeURIComponent(config.baseUrl)}`;
  
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
