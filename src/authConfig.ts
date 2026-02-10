import type { Configuration, PopupRequest } from "@azure/msal-browser";

// Declare window properties for runtime config
declare global {
  interface Window {
    msalConfig: Configuration;
    loginRequest: PopupRequest;
  }
}

// Export the MSAL configuration loaded from window
export const msalConfig: Configuration = window.msalConfig || {
  auth: {
    clientId: "YOUR_CLIENT_ID_HERE",
    authority: "https://login.microsoftonline.com/YOUR_TENANT_ID_HERE",
    redirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: "localStorage",
    storeAuthStateInCookie: false,
  },
};

// Scopes for login request
export const loginRequest: PopupRequest = window.loginRequest || {
  scopes: ["User.Read"],
};
