// =============================================================================
// DATA INTEGRITY CHECKSUMS
// =============================================================================
// Provides SHA-256 checksums for verifying data integrity during sync

/**
 * Compute SHA-256 checksum of data
 * Uses the Web Crypto API for secure hashing
 * @param {Object|Array|string} data - Data to hash
 * @returns {Promise<string>} Hex-encoded SHA-256 hash
 */
export async function computeChecksum(data) {
  // Convert data to a stable JSON string
  const json = typeof data === 'string' ? data : JSON.stringify(data);
  const encoder = new TextEncoder();
  const buffer = encoder.encode(json);

  // Use crypto.subtle if available (requires secure context)
  if (crypto.subtle) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    return bufferToHex(hashBuffer);
  }

  // Fallback: simple hash for non-secure contexts (development)
  return simpleHash(json);
}

/**
 * Convert ArrayBuffer to hex string
 * @param {ArrayBuffer} buffer - Buffer to convert
 * @returns {string} Hex-encoded string
 */
function bufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Simple string hash fallback for non-secure contexts
 * NOT cryptographically secure - only for development/testing
 * @param {string} str - String to hash
 * @returns {string} Hex-encoded hash
 */
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  // Return as hex with padding
  return Math.abs(hash).toString(16).padStart(8, '0') + '-fallback';
}

/**
 * Verify checksum matches data
 * @param {Object|Array|string} data - Data to verify
 * @param {string} expectedChecksum - Expected checksum
 * @returns {Promise<{valid: boolean, actual: string}>}
 */
export async function verifyChecksum(data, expectedChecksum) {
  const actual = await computeChecksum(data);
  return {
    valid: actual === expectedChecksum,
    actual
  };
}

/**
 * Add checksum to a data payload for syncing
 * @param {Object} payload - Data payload
 * @returns {Promise<Object>} Payload with _checksum field
 */
export async function addChecksumToPayload(payload) {
  // Create a copy without any existing checksum
  const { _checksum, ...data } = payload;
  const checksum = await computeChecksum(data);
  return {
    ...data,
    _checksum: checksum
  };
}

/**
 * Validate checksum on a received payload
 * Logs warning if checksum is missing or invalid (backward compatibility)
 * @param {Object} payload - Received data payload
 * @param {string} [source] - Source identifier for logging
 * @returns {Promise<{valid: boolean, hasChecksum: boolean}>}
 */
export async function validatePayloadChecksum(payload, source = 'unknown') {
  const { _checksum, ...data } = payload;

  if (!_checksum) {
    // No checksum present - backward compatibility with old data
    console.warn(`[Checksum] No checksum in payload from ${source} - skipping validation`);
    return { valid: true, hasChecksum: false };
  }

  const result = await verifyChecksum(data, _checksum);

  if (!result.valid) {
    console.warn(`[Checksum] Mismatch for ${source}:`, {
      expected: _checksum,
      actual: result.actual
    });
  }

  return { valid: result.valid, hasChecksum: true };
}
