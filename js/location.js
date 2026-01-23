// =============================================================================
// LOCATION MODULE - Geolocation utilities for trip start
// =============================================================================

// =============================================================================
// GEOLOCATION
// =============================================================================

/**
 * Check the current location permission state.
 * @returns {Promise<'granted'|'prompt'|'denied'|'unsupported'>}
 */
export async function checkLocationPermission() {
  if (!navigator.permissions) {
    // Permissions API not supported - assume we need to prompt
    return 'prompt';
  }

  try {
    const result = await navigator.permissions.query({ name: 'geolocation' });
    return result.state; // 'granted', 'prompt', or 'denied'
  } catch {
    // Some browsers don't support querying geolocation permission
    return 'prompt';
  }
}

/**
 * Get the current GPS position with timeout.
 * @param {number} timeout - Timeout in milliseconds (default 10000)
 * @returns {Promise<{lat: number, lng: number, accuracy: number}>}
 */
export function getCurrentPosition(timeout = 10000) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported'));
      return;
    }

    const timeoutId = setTimeout(() => {
      reject(new Error('Location request timed out'));
    }, timeout);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        clearTimeout(timeoutId);
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy
        });
      },
      (error) => {
        clearTimeout(timeoutId);
        switch (error.code) {
          case error.PERMISSION_DENIED:
            reject(new Error('Location permission denied'));
            break;
          case error.POSITION_UNAVAILABLE:
            reject(new Error('Location unavailable'));
            break;
          case error.TIMEOUT:
            reject(new Error('Location request timed out'));
            break;
          default:
            reject(new Error('Unknown location error'));
        }
      },
      {
        enableHighAccuracy: true,
        timeout: timeout,
        maximumAge: 60000 // Cache position for 1 minute
      }
    );
  });
}

// =============================================================================
// DISTANCE CALCULATIONS
// =============================================================================

/**
 * Calculate distance between two coordinates using Haversine formula.
 * @param {number} lat1 - Latitude of first point
 * @param {number} lng1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lng2 - Longitude of second point
 * @returns {number} Distance in meters
 */
export function getDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000; // Earth's radius in meters
  const toRad = (deg) => deg * (Math.PI / 180);

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Find saved stores within a given radius of coordinates.
 * @param {Array} stores - Array of store objects with lat/lng properties
 * @param {number} lat - Current latitude
 * @param {number} lng - Current longitude
 * @param {number} radiusMeters - Search radius in meters (default 500)
 * @returns {Array} Stores within radius, sorted by distance
 */
export function findNearbyStores(stores, lat, lng, radiusMeters = 500) {
  if (!stores || !Array.isArray(stores)) return [];

  const nearby = stores
    .filter(store => store.lat != null && store.lng != null)
    .map(store => ({
      ...store,
      distance: getDistance(lat, lng, store.lat, store.lng)
    }))
    .filter(store => store.distance <= radiusMeters)
    .sort((a, b) => a.distance - b.distance);

  return nearby;
}

// =============================================================================
// FORMATTING
// =============================================================================

/**
 * Format distance for display.
 * @param {number} meters - Distance in meters
 * @returns {string} Formatted distance (e.g., "150m" or "1.2km")
 */
export function formatDistance(meters) {
  if (meters < 1000) {
    return `${Math.round(meters)}m`;
  }
  return `${(meters / 1000).toFixed(1)}km`;
}

// =============================================================================
// PLACES API (Geoapify)
// =============================================================================

// Worker URL for places proxy - update after deployment
let placesWorkerUrl = null;

/**
 * Set the places worker URL.
 * @param {string} url - Worker URL
 */
export function setPlacesWorkerUrl(url) {
  placesWorkerUrl = url;
}

/**
 * Search for nearby places using Geoapify API via worker proxy.
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {number} radius - Search radius in meters (default 1000)
 * @returns {Promise<Array>} Array of places
 */
export async function searchNearbyPlaces(lat, lng, radius = 1000) {
  if (!placesWorkerUrl) {
    console.warn('Places worker URL not configured');
    return [];
  }

  try {
    const response = await fetch(placesWorkerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat, lng, radius })
    });

    if (!response.ok) {
      throw new Error(`Places API error: ${response.status}`);
    }

    const data = await response.json();
    return data.places || [];
  } catch (error) {
    console.error('Failed to search nearby places:', error);
    return [];
  }
}

// =============================================================================
// EXPORTS FOR TESTING
// =============================================================================

export const _test = {
  getDistance,
  findNearbyStores,
  formatDistance
};
