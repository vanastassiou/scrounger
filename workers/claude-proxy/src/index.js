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
    const allowedOrigins = (env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim());
    const validOrigin = origin && allowedOrigins.includes(origin) ? origin : null;

    try {
      if (!validOrigin) {
        return jsonError('Forbidden', 403, {}, null);
      }

      // Check rate limit
      const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
      const rateLimit = parseInt(env.RATE_LIMIT_REQUESTS || '20', 10);
      const rateWindow = parseInt(env.RATE_LIMIT_WINDOW || '60', 10);

      const rateLimitResult = checkRateLimit(clientIp, rateLimit, rateWindow);

      if (rateLimitResult.limited) {
        return jsonError('Rate limited', 429, {
          retryAfter: rateLimitResult.resetIn,
          remaining: 0
        }, validOrigin);
      }

      // Periodic cleanup (non-blocking)
      ctx.waitUntil(Promise.resolve().then(() => cleanupExpiredEntries(rateWindow)));

      // Parse request body
      let body;
      try {
        body = await request.json();
      } catch {
        return jsonError('Invalid JSON body', 400, {}, validOrigin);
      }

      // Validate request structure
      if (!body.messages || !Array.isArray(body.messages)) {
        return jsonError('Invalid request: messages array required', 400, {}, validOrigin);
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
          return jsonError('Upstream timeout', 504, {
            details: 'Claude API did not respond in time'
          }, validOrigin);
        }
        throw err;
      } finally {
        clearTimeout(timeout);
      }

      // Check for upstream errors
      if (!claudeResponse.ok) {
        const errorText = await claudeResponse.text();
        console.error('Claude API error:', claudeResponse.status, errorText);

        return jsonError('Upstream error', 502, {
          details: `Claude API returned ${claudeResponse.status}`
        }, validOrigin);
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
