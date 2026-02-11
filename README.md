# React SPA with BFF-based Microsoft Entra ID Authentication

A Vite-based React Single Page Application (SPA) with a Backend-for-Frontend (BFF) pattern for secure authentication with Microsoft Entra ID (formerly Azure AD).

## Architecture

This application uses a **BFF (Backend-for-Frontend) pattern** for authentication:

- **Express BFF Server**: Handles OIDC Authorization Code + PKCE flow with Microsoft Entra ID
- **Server-Side Sessions**: Uses secure HttpOnly cookies to maintain user sessions
- **Token Management**: Access and refresh tokens are stored server-side (never exposed to browser)
- **React SPA**: Calls BFF endpoints for authentication status, login, and logout

### Why BFF?

The BFF pattern provides enhanced security compared to SPA-only authentication:
- Tokens are never exposed to the browser (prevents XSS attacks)
- Client secret can be used securely on the server
- HttpOnly cookies prevent JavaScript access (prevents token theft)
- Server-side session management with better control

## Features

- 🔐 Microsoft Entra ID authentication using BFF pattern (Authorization Code + PKCE)
- 🔒 Server-side session management with secure HttpOnly cookies
- ⚡ Built with Vite for fast development
- ⚛️ React 19 with TypeScript
- 🎨 Modern UI with authentication status display
- 🚀 Production-ready Express server for Azure App Service
- 🔧 CI/CD with GitHub Actions

## Prerequisites

- Node.js 20.x or higher
- npm or yarn
- An Azure subscription
- A Microsoft Entra ID (Azure AD) app registration

## Azure AD App Registration Setup

1. Go to [Azure Portal](https://portal.azure.com) > Microsoft Entra ID > App registrations
2. Create a new registration:
   - Name: Your app name (e.g., "Test SSO App")
   - Supported account types: Choose based on your needs
   - Redirect URIs:
     - Type: **Web** (not Single-page application)
     - For development: `http://localhost:8080/auth/callback`
     - For production: `https://your-app.azurewebsites.net/auth/callback`
3. Note the **Application (client) ID** and **Directory (tenant) ID**
4. Under "Certificates & secrets", create a new **client secret**:
   - Add description (e.g., "BFF Server Secret")
   - Choose expiration period
   - **Copy the secret value immediately** (you won't be able to see it again)
5. Under "Authentication":
   - Ensure redirect URIs are configured as Web platform (not SPA)
   - Enable ID tokens (optional, but recommended)
6. Under "API permissions", ensure `User.Read` is granted

### Azure AD B2C and External ID Considerations

This application is configured for **Microsoft Entra ID (workforce)** authentication. If you're using **Azure AD B2C** or **Microsoft Entra External ID** (formerly Azure AD for customers) instead, be aware of the following differences:

#### Discovery and Issuer Endpoints

- **Entra ID (workforce)**: Uses a standard discovery endpoint:
  ```
  https://login.microsoftonline.com/{TENANT_ID}/v2.0/.well-known/openid-configuration
  ```
  
- **Azure AD B2C**: Discovery endpoints are **policy-specific** (user-flow or custom policy):
  ```
  https://{tenant-name}.b2clogin.com/{tenant-name}.onmicrosoft.com/{policy-name}/v2.0/.well-known/openid-configuration
  ```
  Example: `https://contoso.b2clogin.com/contoso.onmicrosoft.com/B2C_1_signupsignin/v2.0/.well-known/openid-configuration`

- **External ID**: Uses a tenant-specific endpoint similar to B2C:
  ```
  https://{tenant-name}.ciamlogin.com/{tenant-id}/v2.0/.well-known/openid-configuration
  ```

**Current Implementation**: The code in `server.js` assumes the standard Entra ID (workforce) discovery endpoint at `https://login.microsoftonline.com/{TENANT_ID}/v2.0`. To use B2C or External ID, you would need to modify the discovery URL initialization in `server.js` (lines 75-76).

#### Claims Differences

- **Standard Entra ID**: Claims include `oid` (object ID), `name`, `email`, `preferred_username`
- **B2C/External ID**: May have different claim names depending on user flow/policy configuration:
  - B2C often uses custom claims configured in the user flow
  - `oid` may not be present; use `sub` as the unique identifier
  - Email claims depend on identity provider configuration

#### Scopes

- **Entra ID (workforce)**: Supports Microsoft Graph scopes like `User.Read`
- **B2C**: Typically uses custom API scopes (e.g., `https://{tenant}.onmicrosoft.com/{api-name}/{scope-name}`)
- **External ID**: Similar to B2C, with custom API scopes for your backend APIs

The current configuration requests `openid profile email User.Read` scopes, which work for Entra ID workforce scenarios.

#### Silent SSO with `prompt=none`

- **Entra ID (workforce)**: Silent SSO (`prompt=none`) works reliably when a user has an active session
- **B2C**: Silent SSO behavior may vary depending on:
  - Identity provider configuration (local accounts vs. social providers)
  - Session management settings in the user flow
  - Social provider session state
- **External ID**: Similar considerations as B2C

The `/auth/sso` endpoint uses `prompt=none` for silent authentication. If it fails, the app falls back to showing the manual "Sign In" button.

#### Logout Endpoints

- **Entra ID (workforce)**: 
  ```
  https://login.microsoftonline.com/{TENANT_ID}/oauth2/v2.0/logout
  ```
  
- **B2C**: Policy-specific logout endpoint:
  ```
  https://{tenant-name}.b2clogin.com/{tenant-name}.onmicrosoft.com/{policy-name}/oauth2/v2.0/logout
  ```

- **External ID**: Tenant-specific logout:
  ```
  https://{tenant-name}.ciamlogin.com/{tenant-id}/oauth2/v2.0/logout
  ```

The current logout implementation (line 334 in `server.js`) uses the standard Entra ID logout URL.

#### Migration Path

To adapt this application for B2C or External ID:
1. Update the discovery URL in `server.js` to use the policy-specific or tenant-specific endpoint
2. Adjust the logout URL construction to match your identity provider
3. Update requested scopes to match your API requirements
4. Review and adjust claim mapping based on your user flow configuration
5. Test silent SSO behavior with your identity provider

**Note**: This documentation is for reference only. The current code is designed for Microsoft Entra ID (workforce) and would require modifications for B2C or External ID scenarios.

## Configuration

### Environment Variables

The BFF server requires the following environment variables:

| Variable | Description | Example |
|----------|-------------|---------|
| `TENANT_ID` | Your Azure AD tenant ID | `1f868b4f-c295-4511-b724-3aacc6d3d2c7` |
| `CLIENT_ID` | Your Azure AD app client ID | `40599c5a-156b-447f-a9f3-2f58016c4ec7` |
| `CLIENT_SECRET` | Your Azure AD app client secret | `your-secret-value` |
| `BASE_URL` | Base URL of your application | `http://localhost:8080` or `https://your-app.azurewebsites.net` |
| `SESSION_SECRET` | Secret for session encryption | Generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `PORT` | Server port (optional) | `8080` (default) |

### Local Development Configuration

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` with your Azure AD app values:
   ```bash
   TENANT_ID=your-tenant-id-here
   CLIENT_ID=your-client-id-here
   CLIENT_SECRET=your-client-secret-here
   BASE_URL=http://localhost:8080
   SESSION_SECRET=generate-a-random-secret
   ```

3. Load environment variables (the server reads them automatically):
   ```bash
   # On Linux/Mac
   export $(cat .env | xargs)
   
   # Or use a tool like dotenv-cli
   npm install -g dotenv-cli
   dotenv npm start
   ```

### Azure App Service Configuration

Configure environment variables in Azure Portal:
1. Go to Azure Portal > App Service > Configuration > Application settings
2. Add each environment variable as a new application setting:
   - `TENANT_ID`: Your tenant ID
   - `CLIENT_ID`: Your app client ID
   - `CLIENT_SECRET`: Your client secret
   - `BASE_URL`: `https://your-app.azurewebsites.net`
   - `SESSION_SECRET`: Generate a strong random secret
3. Save and restart the app service

## Installation

```bash
npm install
```

## Development

For development, you have two options:

### Option 1: Vite Dev Server (Frontend Only - No Auth)
```bash
npm run dev
```
The app will be available at `http://localhost:5173/` but authentication will not work as it requires the BFF server.

### Option 2: Production Mode with BFF (Recommended for Testing Auth)
```bash
# Build the app
npm run build

# Start the BFF server with environment variables
export TENANT_ID=your-tenant-id
export CLIENT_ID=your-client-id
export CLIENT_SECRET=your-client-secret
export BASE_URL=http://localhost:8080
export SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

npm start
```
The app will be available at `http://localhost:8080/` with full authentication.

## Build

Build the production bundle:

```bash
npm run build
```

This compiles TypeScript and bundles the app into the `dist/` directory.

## Production Server

Start the Express server (after building):

```bash
npm start
```

The server will run on port 8080 (or `PORT` environment variable) and serve the built SPA from `dist/`.

## Project Structure

```
├── .github/
│   └── workflows/
│       └── deploy-appservice.yml    # GitHub Actions deployment workflow
├── public/
│   ├── config.js                     # (Legacy - not used in BFF mode)
│   └── vite.svg
├── src/
│   ├── App.tsx                       # Main app component with BFF auth
│   ├── App.css                       # App styles
│   ├── authConfig.ts                 # (Legacy MSAL config - not imported)
│   ├── msalInstance.ts               # (Legacy MSAL instance - not imported)
│   ├── main.tsx                      # App entry point (no MSAL provider)
│   └── index.css                     # Global styles
├── server.js                         # Express BFF server with OIDC auth
├── .env.example                      # Example environment variables
├── index.html                        # HTML entry point
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## Deployment to Azure App Service

### Prerequisites

1. Create an Azure App Service (Linux, Node 20)
2. In GitHub repository settings > Secrets and variables > Actions:
   - Add `AZURE_WEBAPP_PUBLISH_PROFILE` secret with the publish profile from Azure

### Automatic Deployment

The GitHub Actions workflow (`.github/workflows/deploy-appservice.yml`) automatically:
1. Builds the application
2. Deploys to Azure App Service named `mosaikreacttst`

Trigger deployment by pushing to the `main` branch or manually via GitHub Actions.

## How It Works

### Authentication Flow

1. **Initial Load**: SPA calls `GET /auth/me` to check if user is authenticated
2. **Silent SSO Attempt** (if not authenticated):
   - SPA automatically attempts silent SSO by redirecting to `/auth/sso`
   - BFF generates PKCE challenge and redirects to Microsoft Entra ID with `prompt=none`
   - If user has an active session with Entra ID, they are silently authenticated
   - If SSO fails (no active session, interaction required, etc.), Entra ID returns an error
   - On SSO failure, user is redirected back to `/?sso_failed=true`
   - SPA sets a flag in sessionStorage to prevent SSO retry loops
   - User sees the manual "Sign In" button
3. **Interactive Login Flow** (if SSO fails or user clicks "Sign In"):
   - User clicks "Sign In" → navigate to `/auth/login`
   - BFF generates PKCE challenge and redirects to Microsoft Entra ID (without `prompt=none`)
   - User authenticates with Microsoft (may see login UI)
   - Microsoft redirects back to `/auth/callback` with authorization code
   - BFF exchanges code for tokens, validates state/nonce
   - BFF creates server-side session with user info
   - User redirected back to `/` (SPA homepage)
4. **Authenticated State**: SPA displays user info fetched from session
5. **Logout Flow**:
   - User clicks "Sign Out" → SPA calls `POST /auth/logout`
   - BFF destroys session and returns Entra logout URL
   - SPA redirects to Entra logout URL
   - User redirected back to app (unauthenticated)

### Security Features

- **HttpOnly Cookies**: Session cookie not accessible via JavaScript
- **Secure Flag**: Cookies only sent over HTTPS in production
- **SameSite=Lax**: Protection against CSRF attacks
- **CSRF Token**: Logout endpoint protected with CSRF token validation
- **Server-Side Tokens**: Access/refresh tokens never exposed to browser
- **PKCE**: Proof Key for Code Exchange prevents authorization code interception
- **State & Nonce**: Validates auth responses to prevent CSRF and replay attacks
- **Rate Limiting**: Handled at Azure App Service platform layer (configure in Azure Portal)

### Rate Limiting

For Azure App Service deployments, rate limiting should be configured at the platform level:
- Azure Front Door with WAF policies
- Azure App Service rate limiting rules
- API Management (if used)

For other deployment scenarios, add rate limiting middleware such as `express-rate-limit` to the auth endpoints.

### Key Components

- **`server.js`**: Express BFF with OIDC client and session management
  - `/auth/sso`: Initiates silent SSO flow with PKCE and `prompt=none`
  - `/auth/login`: Initiates interactive OIDC flow with PKCE
  - `/auth/callback`: Handles code exchange and session creation
  - `/auth/me`: Returns current session status
  - `/auth/logout`: Destroys session and returns logout URL
- **`App.tsx`**: React component that calls BFF endpoints
- **`main.tsx`**: Simple React app entry (no MSAL provider)

## Troubleshooting

### Redirect URI Mismatch

Ensure the redirect URIs in Azure AD app registration exactly match:
- Development: `http://localhost:8080/auth/callback`
- Production: `https://your-app.azurewebsites.net/auth/callback`

Note: The redirect URI must be registered as a **Web** platform (not Single-page application).

### State Mismatch Error

This indicates a possible CSRF attack or session issue:
- Ensure cookies are enabled in browser
- Check that `SESSION_SECRET` is set and consistent
- Verify `trust proxy` is set to 1 for Azure App Service

### Session Not Persisting

- Check cookie settings in browser developer tools
- Ensure `Secure` flag is only enabled in production (HTTPS)
- For Azure App Service, verify `trust proxy` is enabled
- Consider using a persistent session store (Redis, Azure Blob) for multiple instances

### Authentication Not Working Locally

- Verify all environment variables are set correctly
- Check that `BASE_URL` matches the URL you're accessing
- Ensure client secret is correct and not expired
- Check browser console and server logs for errors

## Tech Stack

- **Frontend Framework**: React 19
- **Build Tool**: Vite
- **Language**: TypeScript
- **Authentication**: OpenID Connect (OIDC) via openid-client
- **Server**: Express 5
- **Session Management**: express-session with MemoryStore (suitable for single-instance deployments)
- **Deployment**: Azure App Service (Linux)
- **CI/CD**: GitHub Actions

## Production Considerations

### Session Storage

The current implementation uses the default MemoryStore for sessions, which is suitable for:
- Development environments
- Single-instance deployments
- Testing

For production environments with multiple server instances or high availability requirements, consider implementing a persistent session store:
- **Redis**: Use `connect-redis` package
- **Azure Blob Storage**: Use custom or third-party session store
- **Azure Cosmos DB**: Use `connect-cosmosdb` package

Note: Session store configuration is intentionally kept simple in this implementation to minimize complexity. Choose and implement a persistent store based on your specific deployment requirements.

## License

MIT
