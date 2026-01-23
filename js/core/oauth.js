/**
 * OAuth2 handler with PKCE flow for client-side authentication
 * Ported from seneschal core
 */

/**
 * OAuth configuration for supported providers
 */
const OAUTH_CONFIG = {
  google: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: {
      drive: 'https://www.googleapis.com/auth/drive.file'
    }
  }
};

/**
 * Generate a random string for PKCE
 */
function generateRandomString(length) {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const values = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(values).map((v) => charset[v % charset.length]).join('');
}

/**
 * Generate PKCE code verifier and challenge
 */
async function generatePKCE() {
  const verifier = generateRandomString(64);

  // SHA-256 hash
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);

  // Base64url encode
  const challenge = btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return { verifier, challenge };
}

/**
 * Store OAuth state
 */
function saveOAuthState(provider, state, verifier) {
  localStorage.setItem(`oauth-${provider}`, JSON.stringify({
    state,
    verifier,
    timestamp: Date.now()
  }));
}

/**
 * Retrieve OAuth state
 */
function getOAuthState(provider) {
  const data = localStorage.getItem(`oauth-${provider}`);
  if (!data) return null;

  const parsed = JSON.parse(data);

  // Expire after 10 minutes
  if (Date.now() - parsed.timestamp > 10 * 60 * 1000) {
    localStorage.removeItem(`oauth-${provider}`);
    return null;
  }

  return parsed;
}

/**
 * Store access token securely
 * - Uses sessionStorage (cleared when browser closes, not accessible across tabs)
 * - Does NOT store refresh tokens client-side (security best practice)
 */
function saveToken(provider, token) {
  const expiry = Date.now() + (token.expires_in || 3600) * 1000;
  // Use sessionStorage for access tokens - cleared on browser close
  // Refresh tokens should NEVER be stored client-side
  sessionStorage.setItem(`token-${provider}`, JSON.stringify({
    accessToken: token.access_token,
    expiry
  }));
}

/**
 * Get stored token from sessionStorage
 */
export function getToken(provider) {
  const data = sessionStorage.getItem(`token-${provider}`);
  if (!data) return null;

  try {
    const parsed = JSON.parse(data);

    // Check expiry (with 5 minute buffer)
    if (Date.now() > parsed.expiry - 5 * 60 * 1000) {
      // Token expired - clear and return null
      // User will need to re-authenticate (no client-side refresh token)
      sessionStorage.removeItem(`token-${provider}`);
      return null;
    }

    return parsed.accessToken;
  } catch {
    // Invalid token data
    sessionStorage.removeItem(`token-${provider}`);
    return null;
  }
}

/**
 * Check if user is authenticated with provider
 */
export function isAuthenticated(provider) {
  return getToken(provider) !== null;
}

/**
 * Clear authentication for provider
 */
export function logout(provider) {
  sessionStorage.removeItem(`token-${provider}`);
  localStorage.removeItem(`oauth-${provider}`);
  localStorage.removeItem(`userinfo-${provider}`);
}

/**
 * Start OAuth flow
 * @param {string} provider - Provider name (google)
 * @param {string} clientId - OAuth client ID
 * @param {string[]} scopes - Requested scopes
 * @param {string} redirectUri - OAuth redirect URI
 */
export async function startAuth(provider, clientId, scopes, redirectUri) {
  const config = OAUTH_CONFIG[provider];
  if (!config) {
    throw new Error(`Unknown provider: ${provider}`);
  }

  // Generate PKCE
  const { verifier, challenge } = await generatePKCE();

  // Generate state
  const state = generateRandomString(32);

  // Save for callback
  saveOAuthState(provider, state, verifier);

  // Build auth URL
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes.join(' '),
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    access_type: 'offline',
    prompt: 'consent'
  });

  // Redirect to auth page
  window.location.href = `${config.authUrl}?${params}`;
}

/**
 * Handle OAuth callback
 * @param {string} provider - Provider name
 * @param {string} clientId - OAuth client ID
 * @param {string} redirectUri - OAuth redirect URI
 * @param {string} clientSecret - OAuth client secret (optional)
 */
export async function handleCallback(provider, clientId, redirectUri, clientSecret) {
  const config = OAUTH_CONFIG[provider];
  if (!config) {
    throw new Error(`Unknown provider: ${provider}`);
  }

  // Parse URL
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const state = params.get('state');
  const error = params.get('error');

  if (error) {
    throw new Error(`OAuth error: ${error}`);
  }

  if (!code || !state) {
    throw new Error('Missing code or state parameter');
  }

  // Verify state
  const savedState = getOAuthState(provider);
  if (!savedState || savedState.state !== state) {
    throw new Error('Invalid state parameter');
  }

  // Exchange code for token
  const tokenParams = {
    client_id: clientId,
    code,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
    code_verifier: savedState.verifier
  };

  if (clientSecret) {
    tokenParams.client_secret = clientSecret;
  }

  const tokenResponse = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams(tokenParams)
  });

  if (!tokenResponse.ok) {
    const errorData = await tokenResponse.json();
    throw new Error(`Token exchange failed: ${errorData.error_description || errorData.error}`);
  }

  const token = await tokenResponse.json();

  // Save token
  saveToken(provider, token);

  // Clean up
  localStorage.removeItem(`oauth-${provider}`);

  // Clear URL
  window.history.replaceState({}, '', window.location.pathname);

  return true;
}

/**
 * Check if there's an OAuth callback in the URL
 */
export function hasOAuthCallback() {
  const params = new URLSearchParams(window.location.search);
  return params.has('code') && params.has('state');
}

/**
 * Get user info from Google
 * @param {string} provider - Provider name (google)
 * @returns {Promise<{email: string, name?: string} | null>}
 */
export async function getUserInfo(provider) {
  const token = getToken(provider);
  if (!token) return null;

  // Check cache first
  const cached = localStorage.getItem(`userinfo-${provider}`);
  if (cached) {
    return JSON.parse(cached);
  }

  try {
    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!response.ok) return null;

    const data = await response.json();
    const userInfo = { email: data.email, name: data.name };

    // Cache it
    localStorage.setItem(`userinfo-${provider}`, JSON.stringify(userInfo));

    return userInfo;
  } catch {
    return null;
  }
}

/**
 * Clear user info cache
 */
export function clearUserInfo(provider) {
  localStorage.removeItem(`userinfo-${provider}`);
}
