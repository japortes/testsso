# React SPA with Microsoft Entra ID Authentication

A Vite-based React Single Page Application (SPA) that authenticates users with Microsoft Entra ID (formerly Azure AD) using MSAL.js v2.

## Features

- 🔐 Microsoft Entra ID authentication using MSAL.js v2 (Authorization Code + PKCE)
- ⚡ Built with Vite for fast development
- ⚛️ React 19 with TypeScript
- 🎨 Modern UI with authentication status display
- 🔄 Automatic silent sign-in for existing sessions
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
     - For development: `http://localhost:5173/`
     - For production: `https://mosaikreacttst.azurewebsites.net/`
3. Note the **Application (client) ID** and **Directory (tenant) ID**
4. Under "Authentication", enable:
   - Access tokens
   - ID tokens
5. Under "API permissions", ensure `User.Read` is granted

## Configuration

### Development & Production Configuration

The application loads MSAL configuration at runtime from `public/config.js`. This allows you to deploy once and configure per environment.

**For local development**, edit `public/config.js`:

```javascript
window.msalConfig = {
  auth: {
    clientId: "YOUR_CLIENT_ID_HERE",
    authority: "https://login.microsoftonline.com/YOUR_TENANT_ID_HERE",
    redirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: "localStorage",
    storeAuthStateInCookie: false,
  }
};
```

**For Azure App Service production**, configure via Azure App Service Configuration:
- In Azure Portal > App Service > Configuration > Application settings
- Override the config.js file with environment-specific values or use App Service configuration to inject values

## Installation

```bash
npm install
```

## Development

Start the Vite development server:

```bash
npm run dev
```

The app will be available at `http://localhost:5173/`

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
│   ├── config.js                     # Runtime MSAL configuration
│   └── vite.svg
├── src/
│   ├── App.tsx                       # Main app component with auth UI
│   ├── App.css                       # App styles
│   ├── authConfig.ts                 # MSAL configuration
│   ├── msalInstance.ts               # MSAL instance setup
│   ├── main.tsx                      # App entry point with MsalProvider
│   └── index.css                     # Global styles
├── server.js                         # Express server for production
├── index.html                        # HTML entry point
├── package.json
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
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

1. **Silent Sign-In**: On app load, MSAL attempts silent authentication (SSO) if a session exists
2. **Interactive Sign-In**: If no session, user clicks "Sign In" button → redirected to Microsoft login
3. **Post-Authentication**: After successful auth, user is redirected back and their profile is displayed
4. **Sign Out**: User can sign out, which clears the local session

### Key Components

- **`msalInstance.ts`**: Creates and configures the MSAL PublicClientApplication
- **`authConfig.ts`**: Defines MSAL configuration loaded from `window.msalConfig`
- **`main.tsx`**: Wraps the app with `MsalProvider` to enable MSAL hooks
- **`App.tsx`**: Uses `useIsAuthenticated`, `useMsal` hooks to manage auth state and UI
- **`server.js`**: Express server with SPA fallback routing for client-side routing support

## Troubleshooting

### Redirect URI Mismatch

Ensure the redirect URIs in Azure AD app registration exactly match:
- Development: `http://localhost:5173/`
- Production: `https://mosaikreacttst.azurewebsites.net/`

### CORS Issues

Microsoft Entra ID authentication doesn't have CORS issues as it uses redirect flow.

### Silent Sign-In Not Working

- Check browser console for errors
- Verify `cacheLocation` is set to `localStorage` in config.js
- Ensure cookies are enabled in browser

## Tech Stack

- **Frontend Framework**: React 19
- **Build Tool**: Vite
- **Language**: TypeScript
- **Authentication**: @azure/msal-browser, @azure/msal-react
- **Server**: Express 5
- **Deployment**: Azure App Service (Linux)
- **CI/CD**: GitHub Actions

## License

MIT
