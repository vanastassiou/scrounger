// =============================================================================
// RATE LIMITING - IP-based request throttling with KV persistence
// =============================================================================

// In-memory fallback for local development (when KV is not configured)
const rateLimitMap = new Map();

/**
 * Check if an IP address has exceeded the rate limit
 * Uses KV storage if available, falls back to in-memory Map
 * @param {string} ip - Client IP address
 * @param {number} limit - Maximum requests allowed in window
 * @param {number} windowSec - Time window in seconds
 * @param {Object} kvNamespace - Optional Cloudflare KV namespace binding
 * @returns {Promise<{ limited: boolean, remaining: number, resetIn: number }>}
 */
export async function checkRateLimit(ip, limit, windowSec, kvNamespace = null) {
  // Reject requests without a valid IP (prevent shared bucket bypass)
  if (!ip || ip === 'unknown') {
    return {
      limited: true,
      remaining: 0,
      resetIn: windowSec,
      error: 'Client IP required for rate limiting'
    };
  }

  // Use KV storage if available, otherwise fall back to in-memory
  if (kvNamespace) {
    return checkRateLimitKV(ip, limit, windowSec, kvNamespace);
  }
  return checkRateLimitMemory(ip, limit, windowSec);
}

/**
 * KV-based rate limiting (persistent across worker instances)
 */
async function checkRateLimitKV(ip, limit, windowSec, kv) {
  const now = Date.now();
  const windowMs = windowSec * 1000;
  const key = `ratelimit:${ip}`;

  try {
    // Get current record from KV
    const stored = await kv.get(key, { type: 'json' });

    if (!stored || now - stored.windowStart > windowMs) {
      // New window - reset count
      const record = { count: 1, windowStart: now };
      // Store with TTL equal to window duration
      await kv.put(key, JSON.stringify(record), { expirationTtl: windowSec });
      return {
        limited: false,
        remaining: limit - 1,
        resetIn: windowSec
      };
    }

    // Existing window - increment count
    const newCount = stored.count + 1;
    const record = { count: newCount, windowStart: stored.windowStart };
    const remainingTtl = Math.ceil((stored.windowStart + windowMs - now) / 1000);

    // Update KV with remaining TTL
    await kv.put(key, JSON.stringify(record), { expirationTtl: Math.max(remainingTtl, 1) });

    return {
      limited: newCount > limit,
      remaining: Math.max(0, limit - newCount),
      resetIn: remainingTtl
    };
  } catch (err) {
    // KV error - log and allow request (fail open for availability)
    console.error('Rate limit KV error:', err);
    return {
      limited: false,
      remaining: limit,
      resetIn: windowSec,
      error: 'Rate limit check failed'
    };
  }
}

/**
 * In-memory rate limiting (for local development)
 * Note: Resets on worker restart, not shared across instances
 */
function checkRateLimitMemory(ip, limit, windowSec) {
  const now = Date.now();
  const windowMs = windowSec * 1000;

  let record = rateLimitMap.get(ip);

  if (!record || now - record.windowStart > windowMs) {
    // New window
    record = { count: 1, windowStart: now };
    rateLimitMap.set(ip, record);
    return {
      limited: false,
      remaining: limit - 1,
      resetIn: windowSec
    };
  }

  record.count++;
  rateLimitMap.set(ip, record);

  const resetIn = Math.ceil((record.windowStart + windowMs - now) / 1000);

  return {
    limited: record.count > limit,
    remaining: Math.max(0, limit - record.count),
    resetIn
  };
}

/**
 * Clean up expired rate limit entries (for in-memory storage only)
 * KV entries auto-expire via TTL
 * @param {number} windowSec - Time window in seconds
 */
export function cleanupExpiredEntries(windowSec) {
  const now = Date.now();
  const windowMs = windowSec * 1000;

  for (const [ip, record] of rateLimitMap.entries()) {
    if (now - record.windowStart > windowMs) {
      rateLimitMap.delete(ip);
    }
  }
}

/**
 * Get current rate limit stats (for debugging/monitoring)
 * @returns {{ activeClients: number, entries: Array }}
 */
export function getRateLimitStats() {
  return {
    activeClients: rateLimitMap.size,
    entries: Array.from(rateLimitMap.entries()).map(([ip, record]) => ({
      ip: ip.substring(0, 8) + '...', // Partial IP for privacy
      count: record.count,
      windowStart: record.windowStart
    }))
  };
}
