import express from 'express';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import * as openidClient from 'openid-client';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import crypto from 'crypto';
import { createClient } from 'redis';
import { RedisStore } from 'connect-redis';

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
  redis: {
    enabled: process.env.REDIS_ENABLED === 'true',
    url: process.env.REDIS_URL,
    prefix: process.env.REDIS_PREFIX || 'sess:',
  },
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

// Initialize Redis client (if enabled)
let redisClient = null;
let sessionStore = null;

async function initializeRedis() {
  if (config.redis.enabled) {
    if (!config.redis.url) {
      console.warn('⚠️  WARNING: REDIS_ENABLED is true but REDIS_URL is not set.');
      console.warn('   Falling back to MemoryStore for session storage.');
      return;
    }
    
    let initialConnectionSucceeded = false;
    
    try {
      redisClient = createClient({
        url: config.redis.url,
        socket: {
          connectTimeout: 5000, // 5 second timeout for initial connection
          // Allow reconnection only after initial connection succeeds
          // This helps handle transient network issues in production
          reconnectStrategy: (retries) => {
            if (!initialConnectionSucceeded) {
              // Don't retry during initial connection
              return false;
            }
            // Retry up to 10 times with exponential backoff
            if (retries > 10) {
              console.error('❌ Redis reconnection attempts exhausted');
              return new Error('Too many retries');
            }
            const delay = Math.min(retries * 100, 3000);
            console.log(`🔄 Retrying Redis connection in ${delay}ms (attempt ${retries + 1})`);
            return delay;
          },
        },
      });

      redisClient.on('error', (err) => {
        console.error('❌ Redis client error:', err.message);
      });

      redisClient.on('connect', () => {
        console.log('🔗 Redis client connecting...');
      });

      redisClient.on('ready', () => {
        console.log('✅ Redis client connected and ready');
        initialConnectionSucceeded = true;
      });

      // Connect to Redis with timeout for initial connection
      await redisClient.connect();

      // Initialize RedisStore
      sessionStore = new RedisStore({
        client: redisClient,
        prefix: config.redis.prefix,
      });

      console.log(`✅ Redis session store initialized (prefix: ${config.redis.prefix})`);
    } catch (error) {
      console.error('❌ Failed to connect to Redis:', error.message);
      console.warn('⚠️  Falling back to MemoryStore for session storage.');
      
      // Clean up failed client
      if (redisClient) {
        try {
          await redisClient.quit();
        } catch (quitError) {
          // Ignore quit errors on failed connection
        }
      }
      
      redisClient = null;
      sessionStore = null;
    }
  }
  
  if (!sessionStore) {
    console.warn('ℹ️  Using MemoryStore for session storage (not suitable for production with multiple instances)');
  }
}

// Graceful shutdown handling
const shutdown = async (signal) => {
  console.log(`\n${signal} received, shutting down gracefully...`);
  
  if (redisClient) {
    try {
      await redisClient.quit();
      console.log('✅ Redis client disconnected');
    } catch (error) {
      console.error('⚠️  Error disconnecting Redis client:', error.message);
    }
  }
  
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Middleware
app.use(express.json());
app.use(cookieParser());

// Session configuration
// Using Redis if enabled, otherwise MemoryStore for development/single-instance
const sessionConfig = {
  store: sessionStore, // RedisStore or undefined (defaults to MemoryStore)
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  proxy: true,
  cookie: {
    httpOnly: true,
    // secure should be true for HTTPS (production) and false for HTTP (local dev)
    // BASE_URL should be set to https:// in production, even behind a terminating proxy
    secure: config.baseUrl.startsWith('https://'),
    sameSite: 'lax',
    path: '/',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  },
  name: 'session',
};

app.use(session(sessionConfig));

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

// Auth endpoints
// Note: Rate limiting is handled by Azure App Service platform layer.
// For local development or other deployment scenarios, consider adding
// express-rate-limit middleware to these endpoints.
app.get('/auth/sso', async (req, res) => {
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
    req.session.isSso = true; // Mark as SSO attempt
    
    await new Promise((resolve, reject) => {
      req.session.save((err) => (err ? reject(err) : resolve()));
    });
    
    // Build authorization URL with prompt=none for silent authentication
    const parameters = {
      redirect_uri: `${config.baseUrl}${config.callbackPath}`,
      scope: 'openid profile email User.Read',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state: state,
      nonce: nonce,
      prompt: 'none', // Silent authentication
    };
    
    const redirectTo = openidClient.buildAuthorizationUrl(config_oidc, parameters);
    
    console.log('🔄 Attempting silent SSO');
    res.redirect(redirectTo.href);
  } catch (error) {
    console.error('SSO error:', error);
    res.status(500).json({ error: 'Failed to initiate SSO' });
  }
});

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
    
    await new Promise((resolve, reject) => {
      req.session.save((err) => (err ? reject(err) : resolve()));
    });
    
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
    res.status(500).json({ error: 'Failed to initiate login' });
  }
});

app.get('/auth/callback', async (req, res) => {
  try {
    const config_oidc = await getOidcConfig();
    const currentUrl = new URL(`${config.baseUrl}${req.originalUrl}`);
    const isSso = req.session.isSso === true;
    
    // Check for error parameter (SSO failure)
    const error = currentUrl.searchParams.get('error');
    const errorDescription = currentUrl.searchParams.get('error_description');
    
    if (error) {
      console.log(`🔄 SSO failed: ${error} - ${errorDescription}`);
      
      // Clean up session data
      delete req.session.codeVerifier;
      delete req.session.state;
      delete req.session.nonce;
      delete req.session.isSso;
      
      // If this was an SSO attempt (prompt=none), redirect back to app
      // The frontend will show the manual login button
      if (isSso) {
        return res.redirect('/?sso_failed=true');
      }
      
      // For regular login failures, return JSON error (safe content-type)
      return res.status(400).json({ 
        error: 'Authentication failed',
        errorCode: error,
        errorDescription: errorDescription 
      });
    }
    
    // Validate state
    const state = currentUrl.searchParams.get('state');
    if (!req.session.state || state !== req.session.state) {
      console.error('❌ State mismatch');
      // Clean up session data
      delete req.session.codeVerifier;
      delete req.session.state;
      delete req.session.nonce;
      delete req.session.isSso;
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
    const claims = tokens.claims();
    
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
    delete req.session.isSso;
    
    if (isSso) {
      console.log('✅ SSO successful:', req.session.user.email);
    } else {
      console.log('✅ User authenticated:', req.session.user.email);
    }
    
    // Redirect back to app
    res.redirect('/');
  } catch (error) {
    console.error('Callback error:', error);
    
    // If this was an SSO attempt, redirect with error flag
    if (req.session.isSso) {
      delete req.session.codeVerifier;
      delete req.session.state;
      delete req.session.nonce;
      delete req.session.isSso;
      return res.redirect('/?sso_failed=true');
    }
    
    res.status(500).send('Authentication failed. Please try again.');
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

// Initialize and start server
async function startServer() {
  // Initialize Redis (if configured)
  await initializeRedis();
  
  // Initialize OIDC at startup
  await getOidcConfig().catch((err) => {
    console.error('Failed to initialize OIDC configuration:', err);
  });
  
  app.listen(config.port, () => {
    console.log(`🚀 Server is running on port ${config.port}`);
    console.log(`   Visit ${config.baseUrl}`);
    console.log(`   Callback URL: ${config.baseUrl}${config.callbackPath}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
