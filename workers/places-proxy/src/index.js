// =============================================================================
// GEOAPIFY PLACES PROXY WORKER - Main entry point
// =============================================================================

import { checkRateLimit, cleanupExpiredEntries } from './rate-limit.js';

// =============================================================================
// CONFIGURATION
// =============================================================================

const GEOAPIFY_API_URL = 'https://api.geoapify.com/v2/places';

// Categories for thrift stores
const PLACE_CATEGORIES = [
  'commercial.second_hand',
  'commercial.clothing',
  'commercial.charity'
].join(',');

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

    try {
      // Validate origin
      const origin = request.headers.get('Origin');
      const allowedOrigins = (env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim());

      if (!origin || !allowedOrigins.includes(origin)) {
        return jsonError('Forbidden', 403);
      }

      // Check rate limit
      const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
      const rateLimit = parseInt(env.RATE_LIMIT_REQUESTS || '30', 10);
      const rateWindow = parseInt(env.RATE_LIMIT_WINDOW || '60', 10);

      const rateLimitResult = checkRateLimit(clientIp, rateLimit, rateWindow);

      if (rateLimitResult.limited) {
        return jsonError('Rate limited', 429, {
          retryAfter: rateLimitResult.resetIn,
          remaining: 0
        });
      }

      // Periodic cleanup (non-blocking)
      ctx.waitUntil(Promise.resolve().then(() => cleanupExpiredEntries(rateWindow)));

      // Parse request body
      let body;
      try {
        body = await request.json();
      } catch {
        return jsonError('Invalid JSON body', 400);
      }

      // Validate request structure
      if (typeof body.lat !== 'number' || typeof body.lng !== 'number') {
        return jsonError('Invalid request: lat and lng required', 400);
      }

      const { lat, lng, radius = 1000 } = body;

      // Check for API key
      if (!env.GEOAPIFY_API_KEY) {
        return jsonError('Server configuration error: API key not set', 500);
      }

      // Build Geoapify URL
      const params = new URLSearchParams({
        categories: PLACE_CATEGORIES,
        filter: `circle:${lng},${lat},${radius}`,
        limit: '10',
        apiKey: env.GEOAPIFY_API_KEY
      });

      const geoapifyUrl = `${GEOAPIFY_API_URL}?${params.toString()}`;

      // Make request to Geoapify
      const geoapifyResponse = await fetch(geoapifyUrl, {
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!geoapifyResponse.ok) {
        const errorText = await geoapifyResponse.text();
        console.error('Geoapify API error:', geoapifyResponse.status, errorText);

        return jsonError('Upstream error', 502, {
          details: `Geoapify API returned ${geoapifyResponse.status}`
        });
      }

      const data = await geoapifyResponse.json();

      // Transform response to simpler format
      const places = (data.features || []).map(feature => {
        const props = feature.properties || {};
        const coords = feature.geometry?.coordinates || [];

        return {
          name: props.name || props.street || 'Unknown',
          address: formatAddress(props),
          lat: coords[1] || null,
          lng: coords[0] || null,
          distance: props.distance || null,
          category: props.category || null
        };
      });

      // Return response with CORS headers
      return new Response(
        JSON.stringify({ places }),
        {
          headers: {
            ...getCorsHeaders(origin),
            'Content-Type': 'application/json',
            'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
            'X-RateLimit-Reset': rateLimitResult.resetIn.toString()
          }
        }
      );

    } catch (error) {
      console.error('Worker error:', error);
      return jsonError('Internal error', 500);
    }
  }
};

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Format address from Geoapify properties
 */
function formatAddress(props) {
  const parts = [];

  if (props.housenumber && props.street) {
    parts.push(`${props.housenumber} ${props.street}`);
  } else if (props.street) {
    parts.push(props.street);
  } else if (props.address_line1) {
    parts.push(props.address_line1);
  }

  if (props.city) {
    parts.push(props.city);
  }

  if (props.postcode) {
    parts.push(props.postcode);
  }

  return parts.join(', ') || props.formatted || null;
}

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
 * Return a JSON error response
 */
function jsonError(message, status, extra = {}) {
  return new Response(
    JSON.stringify({ error: message, ...extra }),
    {
      status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*' // Allow error responses from any origin
      }
    }
  );
}
