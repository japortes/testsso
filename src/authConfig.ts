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
    clientId: "40599c5a-156b-447f-a9f3-2f58016c4ec7",
    authority: "https://login.microsoftonline.com/1f868b4f-c295-4511-b724-3aacc6d3d2c7",
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
