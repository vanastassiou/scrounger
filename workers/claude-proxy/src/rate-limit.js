// =============================================================================
// RATE LIMITING - IP-based request throttling
// =============================================================================

// In-memory rate limit tracking
// Note: Resets on worker restart. For production, consider Cloudflare KV or Durable Objects.
const rateLimitMap = new Map();

/**
 * Check if an IP address has exceeded the rate limit
 * @param {string} ip - Client IP address
 * @param {number} limit - Maximum requests allowed in window
 * @param {number} windowSec - Time window in seconds
 * @returns {{ limited: boolean, remaining: number, resetIn: number }}
 */
export function checkRateLimit(ip, limit, windowSec) {
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
 * Clean up expired rate limit entries (call periodically to prevent memory bloat)
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
