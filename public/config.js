// Runtime MSAL configuration
// This file is loaded by index.html before the app boots
// Replace these placeholders with actual values in your Azure App Service configuration

window.msalConfig = {
  auth: {
    clientId: "YOUR_CLIENT_ID_HERE", // Replace with your Azure AD app client ID
    authority: "https://login.microsoftonline.com/YOUR_TENANT_ID_HERE", // Replace with your tenant ID or 'common'
    redirectUri: window.location.origin, // Dynamically set based on current origin
  },
  cache: {
    cacheLocation: "localStorage", // Use localStorage to persist session across tabs
    storeAuthStateInCookie: false, // Set to true for IE11 support
  }
};

// Scopes for the application
window.loginRequest = {
  scopes: ["User.Read"] // Request access to read user profile
};
