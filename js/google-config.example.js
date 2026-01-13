/**
 * Google API Configuration - EXAMPLE FILE
 *
 * Copy this file to google-config.js and fill in your credentials.
 * DO NOT commit google-config.js to version control.
 *
 * Setup instructions:
 * 1. Go to https://console.cloud.google.com/
 * 2. Create a new project or select existing
 * 3. Enable the Google Drive API
 * 4. Enable the Google Picker API (for folder selection)
 * 5. Create OAuth 2.0 credentials (Web application)
 * 6. Add authorized JavaScript origins: http://localhost:8080
 * 7. Add authorized redirect URIs: http://localhost:8080/
 * 8. Copy the Client ID and Client Secret below
 * 9. Create an API key (for Picker API)
 */

export const googleConfig = {
  // OAuth 2.0 Client ID from Google Cloud Console
  clientId: 'YOUR_CLIENT_ID.apps.googleusercontent.com',

  // OAuth 2.0 Client Secret (optional for PKCE flow, but improves security)
  clientSecret: 'YOUR_CLIENT_SECRET',

  // API Key for Google Picker (from Google Cloud Console)
  apiKey: 'YOUR_API_KEY',

  // Redirect URI - must match exactly what's configured in Google Cloud Console
  redirectUri: window.location.origin + '/',

  // OAuth scopes
  scopes: [
    'https://www.googleapis.com/auth/drive.file'
  ]
};

export default googleConfig;
