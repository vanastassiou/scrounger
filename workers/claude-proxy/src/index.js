// =============================================================================
// CLAUDE API PROXY WORKER - Main entry point
// =============================================================================

import { checkRateLimit, cleanupExpiredEntries } from './rate-limit.js';
import { buildSystemPrompt } from './system-prompt.js';

// =============================================================================
// CONFIGURATION
// =============================================================================

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL = 'claude-sonnet-4-20250514';
const CLAUDE_MAX_TOKENS = 1024;
const ANTHROPIC_VERSION = '2023-06-01';
const UPSTREAM_TIMEOUT_MS = 25000; // 25 seconds (less than client's 30s)

// =============================================================================
// MAIN HANDLER
// =============================================================================

export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return handleCors(request, env);
    }

    // Only allow POST
    if (request.method !== 'POST') {
      return jsonError('Method not allowed', 405);
    }

    // Validate origin early so we can include it in error responses
    const origin = request.headers.get('Origin');

    // Explicitly reject requests without Origin header (CORS requirement)
    if (!origin) {
      return jsonError('Origin header required', 400, {}, null);
    }

    const allowedOrigins = (env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean);
    const validOrigin = allowedOrigins.includes(origin) ? origin : null;

    try {
      if (!validOrigin) {
        return jsonError('Origin not allowed', 403, {}, null);
      }

      // Check rate limit (uses KV if available, falls back to in-memory)
      const clientIp = request.headers.get('CF-Connecting-IP');
      const rateLimit = parseInt(env.RATE_LIMIT_REQUESTS || '20', 10);
      const rateWindow = parseInt(env.RATE_LIMIT_WINDOW || '60', 10);

      // Pass KV namespace if configured (env.RATE_LIMIT binding from wrangler.toml)
      const rateLimitResult = await checkRateLimit(clientIp, rateLimit, rateWindow, env.RATE_LIMIT);

      if (rateLimitResult.limited) {
        return jsonError('Rate limited', 429, {
          retryAfter: rateLimitResult.resetIn
        }, validOrigin);
      }

      // Periodic cleanup (non-blocking)
      ctx.waitUntil(Promise.resolve().then(() => cleanupExpiredEntries(rateWindow)));

      // Validate request size before parsing (prevent CPU exhaustion)
      const MAX_BODY_SIZE = 100 * 1024; // 100KB limit
      const contentLength = parseInt(request.headers.get('Content-Length') || '0', 10);
      if (contentLength > MAX_BODY_SIZE) {
        return jsonError('Request too large', 413, {}, validOrigin);
      }

      // Parse request body
      let body;
      try {
        const bodyText = await request.text();
        if (bodyText.length > MAX_BODY_SIZE) {
          return jsonError('Request too large', 413, {}, validOrigin);
        }
        body = JSON.parse(bodyText);
      } catch {
        return jsonError('Invalid JSON body', 400, {}, validOrigin);
      }

      // Validate request structure
      if (!body.messages || !Array.isArray(body.messages)) {
        return jsonError('Invalid request: messages array required', 400, {}, validOrigin);
      }

      // Validate array size before processing (prevent CPU exhaustion from large arrays)
      const MAX_INPUT_MESSAGES = 100;
      if (body.messages.length > MAX_INPUT_MESSAGES) {
        return jsonError('Too many messages', 400, {}, validOrigin);
      }

      // Build system prompt with context
      const systemPrompt = buildSystemPrompt(body.context || {});

      // Check for API key
      if (!env.ANTHROPIC_API_KEY) {
        return jsonError('Server configuration error: API key not set', 500, {}, validOrigin);
      }

      // Forward to Claude API with streaming and timeout
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

      let claudeResponse;
      try {
        claudeResponse = await fetch(CLAUDE_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': env.ANTHROPIC_API_KEY,
            'anthropic-version': ANTHROPIC_VERSION
          },
          body: JSON.stringify({
            model: CLAUDE_MODEL,
            max_tokens: CLAUDE_MAX_TOKENS,
            stream: true,
            system: systemPrompt,
            messages: sanitizeMessages(body.messages)
          }),
          signal: controller.signal
        });
      } catch (err) {
        if (err.name === 'AbortError') {
          // Log details server-side, return generic message to client
          console.error('Upstream timeout after', UPSTREAM_TIMEOUT_MS, 'ms');
          return jsonError('Service temporarily unavailable', 503, {}, validOrigin);
        }
        throw err;
      } finally {
        clearTimeout(timeout);
      }

      // Check for upstream errors
      if (!claudeResponse.ok) {
        const errorText = await claudeResponse.text();
        // Log details server-side only
        console.error('Claude API error:', claudeResponse.status, errorText);
        // Return generic error to client (no status codes or internal details)
        return jsonError('Service temporarily unavailable', 503, {}, validOrigin);
      }

      // Forward the stream to client with CORS headers
      return new Response(claudeResponse.body, {
        headers: {
          ...getCorsHeaders(validOrigin),
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
          'X-RateLimit-Reset': rateLimitResult.resetIn.toString()
        }
      });

    } catch (error) {
      console.error('Worker error:', error);
      return jsonError('Internal error', 500, {}, validOrigin);
    }
  }
};

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Handle CORS preflight requests
 */
function handleCors(request, env) {
  const origin = request.headers.get('Origin');
  const allowedOrigins = (env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim());

  if (origin && allowedOrigins.includes(origin)) {
    return new Response(null, {
      status: 204,
      headers: {
        ...getCorsHeaders(origin),
        'Access-Control-Max-Age': '86400'
      }
    });
  }

  return new Response(null, { status: 403 });
}

/**
 * Get CORS headers for a given origin
 */
function getCorsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}

/**
 * Return a JSON error response with proper CORS headers
 * @param {string} message - Error message
 * @param {number} status - HTTP status code
 * @param {Object} extra - Additional response data
 * @param {string|null} origin - Validated origin for CORS (null = no CORS header)
 */
function jsonError(message, status, extra = {}, origin = null) {
  const headers = {
    'Content-Type': 'application/json'
  };

  // Only add CORS header for validated origins
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
  }

  return new Response(
    JSON.stringify({ error: message, ...extra }),
    { status, headers }
  );
}

/**
 * Sanitize and validate messages array
 * Only keep role and content, limit message count
 */
function sanitizeMessages(messages) {
  const MAX_MESSAGES = 20;
  const MAX_CONTENT_LENGTH = 4000;

  return messages
    .slice(-MAX_MESSAGES)
    .filter(msg => msg.role && msg.content)
    .map(msg => ({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: typeof msg.content === 'string'
        ? msg.content.slice(0, MAX_CONTENT_LENGTH)
        : String(msg.content).slice(0, MAX_CONTENT_LENGTH)
    }));
}
