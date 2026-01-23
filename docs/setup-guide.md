# Setup & Installation Guide

A step-by-step guide for setting up the Bargain Huntress development environment.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Prerequisites](#prerequisites)
3. [Google OAuth Setup](#google-oauth-setup)
4. [Cloudflare Worker Setup](#cloudflare-worker-setup)
5. [HTTPS Setup (Optional)](#https-setup-optional)
6. [Mobile Testing](#mobile-testing)
7. [Troubleshooting](#troubleshooting)

---

## Quick Start

Get the app running in under a minute:

```bash
git clone <repository-url>
cd thrifting
npm install
npm start
```

Open [http://localhost:8080](http://localhost:8080) in your browser.

### What Works Without Configuration

The app is fully functional locally with these features:
- All inventory management (add, edit, delete items)
- Store browsing with 30+ pre-loaded locations
- Visit logging and history
- Sales pipeline tracking
- Reference data browsing (brands, platforms, trends)
- Offline support via service worker

### What Requires Configuration

| Feature | Requires |
|---------|----------|
| Google Drive sync | Google OAuth credentials |
| Chat advisor | Cloudflare Worker + Anthropic API key |
| PWA install on mobile | HTTPS (via Tailscale or local certs) |

---

## Prerequisites

### Required

- **Node.js 18+** — [Download](https://nodejs.org/)
  ```bash
  node --version  # Should be v18.0.0 or higher
  ```

- **npm** — Comes with Node.js
  ```bash
  npm --version
  ```

- **Git** — [Download](https://git-scm.com/)
  ```bash
  git --version
  ```

### For Google Drive Sync

- **Google Cloud account** — [Create free account](https://console.cloud.google.com/)

### For Chat Advisor

- **Cloudflare account** — [Create free account](https://dash.cloudflare.com/sign-up)
- **Anthropic API key** — [Get key](https://console.anthropic.com/)
- **Wrangler CLI** — Install globally:
  ```bash
  npm install -g wrangler
  ```

### For Mobile Testing

- **Tailscale account** — [Create free account](https://tailscale.com/)
- **Tailscale CLI** — [Download](https://tailscale.com/download/)

---

## Google OAuth Setup

Google Drive sync requires OAuth 2.0 credentials. This enables the app to save your inventory to your personal Google Drive.

### Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click the project dropdown (top-left, next to "Google Cloud")
3. Click **New Project**
4. Name it (e.g., "Thrifting App")
5. Click **Create**
6. Wait for the project to be created, then select it

### Step 2: Enable Required APIs

1. Go to **APIs & Services** > **Library**
2. Search for and enable:
   - **Google Drive API** — For file storage
   - **Google Picker API** — For folder selection UI

### Step 3: Configure OAuth Consent Screen

1. Go to **APIs & Services** > **OAuth consent screen**
2. Select **External** (unless you have Google Workspace)
3. Click **Create**
4. Fill in required fields:
   - **App name**: Bargain Huntress (or your choice)
   - **User support email**: Your email
   - **Developer contact**: Your email
5. Click **Save and Continue**
6. On **Scopes** screen:
   - Click **Add or Remove Scopes**
   - Find and check: `https://www.googleapis.com/auth/drive.file`
   - Click **Update**, then **Save and Continue**
7. On **Test users** screen:
   - Click **Add Users**
   - Add your Google account email
   - Click **Save and Continue**
8. Review and click **Back to Dashboard**

### Step 4: Create OAuth 2.0 Credentials

1. Go to **APIs & Services** > **Credentials**
2. Click **Create Credentials** > **OAuth client ID**
3. Select **Web application**
4. Name it (e.g., "Thrifting App Web")
5. Under **Authorized JavaScript origins**, add:
   ```
   http://localhost:8080
   https://localhost:8443
   ```
6. Under **Authorized redirect URIs**, add:
   ```
   http://localhost:8080/
   https://localhost:8443/
   ```
7. Click **Create**
8. **Copy the Client ID and Client Secret** — You'll need these

### Step 5: Create API Key (for Picker)

1. Still on **Credentials** page, click **Create Credentials** > **API key**
2. Copy the API key
3. (Optional) Click the key name to restrict it:
   - Under **API restrictions**, select **Restrict key**
   - Select only **Google Picker API**
   - Click **Save**

### Step 6: Configure the App

1. Copy the example config file:
   ```bash
   cp js/google-config.example.js js/google-config.js
   ```

2. Edit `js/google-config.js` with your credentials:
   ```javascript
   export const googleConfig = {
     clientId: 'YOUR_CLIENT_ID.apps.googleusercontent.com',
     clientSecret: 'YOUR_CLIENT_SECRET',
     apiKey: 'YOUR_API_KEY',
     redirectUri: window.location.origin + '/',
     scopes: [
       'https://www.googleapis.com/auth/drive.file'
     ]
   };
   ```

3. Add `js/google-config.js` to your `.gitignore` to avoid committing secrets

### Step 7: Verify Setup

1. Start the app: `npm start`
2. Open [http://localhost:8080](http://localhost:8080)
3. Go to the **Settings** tab
4. Click **Connect to Google**
5. Complete the OAuth flow
6. Select or create a sync folder

If you see "Connected" in the sync status, you're all set.

---

## Cloudflare Worker Setup

The chat advisor uses a Cloudflare Worker to securely proxy requests to the Claude API.

### Step 1: Install Dependencies

```bash
cd workers/claude-proxy
npm install
```

### Step 2: Login to Cloudflare

```bash
wrangler login
```

This opens a browser window for authentication.

### Step 3: Set Your API Key

```bash
wrangler secret put ANTHROPIC_API_KEY
```

When prompted, paste your Anthropic API key.

### Step 4: Configure Allowed Origins

Edit `workers/claude-proxy/wrangler.toml`:

```toml
[vars]
ALLOWED_ORIGINS = "http://localhost:8080,https://localhost:8443,https://your-domain.com"
```

Add any additional origins where you'll host the app.

### Step 5: Deploy the Worker

```bash
wrangler deploy
```

After deployment, you'll see a URL like:
```
https://thrifting-claude-proxy.<account>.workers.dev
```

### Step 6: Update the App

Edit `js/chat.js` and update the worker URL:

```javascript
const WORKER_URL = 'https://thrifting-claude-proxy.<account>.workers.dev';
```

### Step 7: Verify Setup

1. Start the app: `npm start`
2. Go to the **Chat** tab
3. Type a message and send
4. You should receive a response from the advisor

### Optional: Enable Rate Limiting with KV

For persistent rate limiting across worker restarts:

```bash
# Create a KV namespace
wrangler kv:namespace create "RATE_LIMIT"
```

Copy the namespace ID from the output, then edit `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "RATE_LIMIT"
id = "YOUR_KV_NAMESPACE_ID"
```

Redeploy:
```bash
wrangler deploy
```

### Configuration Options

| Variable | Default | Description |
|----------|---------|-------------|
| `ALLOWED_ORIGINS` | localhost only | Comma-separated allowed CORS origins |
| `RATE_LIMIT_REQUESTS` | `20` | Max requests per window |
| `RATE_LIMIT_WINDOW` | `60` | Rate limit window in seconds |

---

## HTTPS Setup (Optional)

HTTPS is required for:
- Google OAuth on some browsers (crypto.subtle API requires secure context)
- PWA installation prompts
- Mobile testing with Tailscale

### Option A: Local Certificates with mkcert

For desktop development:

1. Install mkcert:
   ```bash
   # macOS
   brew install mkcert

   # Windows (with Chocolatey)
   choco install mkcert

   # Linux
   # See https://github.com/FiloSottile/mkcert#installation
   ```

2. Generate certificates:
   ```bash
   npm run certs:generate
   ```

   This creates certificates in `.certs/` directory.

3. Start HTTPS server:
   ```bash
   npm run start:https
   ```

4. Open [https://localhost:8443](https://localhost:8443)

### Option B: Tailscale for Mobile Testing

For testing on mobile devices (recommended):

See [Mobile Testing](#mobile-testing) section below.

---

## Mobile Testing

Tailscale provides the easiest way to test on mobile devices with HTTPS.

### Initial Setup (One-Time)

1. **Install Tailscale on your development machine**
   - [Download for your OS](https://tailscale.com/download/)
   - Sign in to create your tailnet

2. **Install Tailscale on your mobile device**
   - Download from App Store (iOS) or Play Store (Android)
   - Sign in with the same account

3. **Enable HTTPS certificates**
   - Go to [Tailscale Admin Console](https://login.tailscale.com/admin/dns)
   - Under **HTTPS Certificates**, click **Enable HTTPS**

### Running

1. **Start your local server**
   ```bash
   npm start
   ```

2. **In a new terminal, expose via Tailscale**
   ```bash
   npm run start:tailscale
   ```
   Or manually:
   ```bash
   tailscale serve https / http://localhost:8080
   ```

3. **Find your Tailscale URL**
   ```bash
   tailscale status --json | jq '.Self.DNSName'
   ```
   Example: `v-desktop.tailc868a9.ts.net`

4. **Access on mobile**
   Open `https://<machine>.<tailnet>.ts.net` in your mobile browser

### Configure Google OAuth for Tailscale

Add your Tailscale URL to Google Cloud Console:

1. Go to **APIs & Services** > **Credentials**
2. Edit your OAuth 2.0 Client ID
3. Add to **Authorized JavaScript origins**:
   ```
   https://<machine>.<tailnet>.ts.net
   ```
4. Add to **Authorized redirect URIs**:
   ```
   https://<machine>.<tailnet>.ts.net/
   ```

### Installing as PWA on Mobile

**iOS (Safari):**
1. Open the Tailscale URL
2. Tap the Share button (box with arrow)
3. Scroll down, tap **Add to Home Screen**
4. Tap **Add**

**Android (Chrome):**
1. Open the Tailscale URL
2. Tap the three-dot menu
3. Tap **Install app** or **Add to Home Screen**
4. Tap **Install**

### Useful Tailscale Commands

```bash
# Check what's being served
tailscale serve status

# Stop serving
tailscale serve reset

# View logs
tailscale serve --bg  # Run in background
```

---

## Troubleshooting

### OAuth Issues

#### "Redirect URI mismatch" Error

**Cause:** The redirect URI in your code doesn't match what's registered in Google Cloud Console.

**Fix:**
1. Check your `js/google-config.js`:
   ```javascript
   redirectUri: window.location.origin + '/'
   ```
2. Ensure the **exact** URI is in Google Cloud Console under **Authorized redirect URIs**
3. Include the trailing slash if your code uses one

#### "Access blocked: This app's request is invalid" Error

**Cause:** Missing or incorrect OAuth consent screen configuration.

**Fix:**
1. Go to **OAuth consent screen** in Google Cloud Console
2. Ensure your email is added as a test user
3. Verify the `drive.file` scope is added

#### "crypto.subtle is undefined" Error

**Cause:** OAuth PKCE flow requires a secure context (HTTPS).

**Fix:**
- Use HTTPS locally: `npm run start:https`
- Or use Tailscale for mobile testing

### Worker Issues

#### CORS Errors

**Cause:** Origin not in allowed list.

**Fix:**
1. Edit `workers/claude-proxy/wrangler.toml`:
   ```toml
   ALLOWED_ORIGINS = "http://localhost:8080,https://your-origin.com"
   ```
2. Redeploy: `wrangler deploy`

#### 500 Error from Worker

**Cause:** Missing or invalid API key.

**Fix:**
1. Check the secret is set:
   ```bash
   wrangler secret list
   ```
2. Re-set if needed:
   ```bash
   wrangler secret put ANTHROPIC_API_KEY
   ```

#### Worker Not Responding

**Cause:** Worker not deployed or wrong URL.

**Fix:**
1. Check deployment:
   ```bash
   wrangler deployments list
   ```
2. View logs:
   ```bash
   wrangler tail
   ```

### Service Worker Issues

#### Old Files Being Served

**Cause:** Service worker cached stale files.

**Fix (Development):**
1. Open DevTools > **Application** > **Service Workers**
2. Check **Update on reload**
3. Click **Unregister**
4. Hard refresh: `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (Mac)

**Fix (Production):**
Increment the cache version in `sw.js`:
```javascript
const CACHE_VERSION = 'v2';  // Increment this
```

#### PWA Not Installing

**Cause:** Missing manifest requirements or not served over HTTPS.

**Fix:**
1. Verify HTTPS is working
2. Check manifest in DevTools > **Application** > **Manifest**
3. Look for errors in the **Installability** section

### Database Issues

#### Data Not Syncing

**Cause:** OAuth token expired or sync error.

**Fix:**
1. Go to **Settings** tab
2. Click **Disconnect**
3. Click **Connect to Google** again
4. Re-authorize access

#### Data Lost After Refresh

**Cause:** IndexedDB cleared (private browsing, manual clear, etc.)

**Fix:**
- If connected to Google Drive: Sync will restore from Drive
- If not syncing: Data is only stored locally and may be lost

### Testing Issues

#### Tests Failing with "IDBRequest error"

**Cause:** fake-indexeddb not properly polyfilled.

**Fix:**
1. Ensure `fake-indexeddb` is installed:
   ```bash
   npm install
   ```
2. Run tests:
   ```bash
   npm test
   ```

---

## Next Steps

- [User's Guide](users-guide.md) — Learn how to use the app
- [Developer's Guide](developers-guide.md) — Understand the codebase architecture
