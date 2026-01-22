// =============================================================================
// STATE MODULE
// =============================================================================
// Simple module-level state. No reactive proxies - just plain objects.

let _stores = [];
let _storesIndex = null;
let _trips = [];
let _tripsIndex = null;
let _selectedDate = new Date().toISOString().split('T')[0];
let _syncState = {
  lastSyncAt: null,
  isDirty: false,
  syncInProgress: false,
  error: null
};

function rebuildStoresIndex() {
  _storesIndex = new Map();
  _stores.forEach(s => _storesIndex.set(s.id, s));
}

function rebuildTripsIndex() {
  _tripsIndex = new Map();
  _trips.forEach(t => _tripsIndex.set(t.id, t));
}

export const state = {
  // All stores (from IndexedDB, synced from Google Drive)
  get stores() { return _stores; },
  set stores(data) {
    _stores = data || [];
    rebuildStoresIndex();
  },

  // Legacy aliases for compatibility
  get storesDB() { return { stores: _stores }; },
  set storesDB(data) {
    // Accept both { stores: [...] } format and raw array
    _stores = Array.isArray(data) ? data : (data?.stores || []);
    rebuildStoresIndex();
  },
  get userStores() { return _stores; },
  set userStores(stores) {
    _stores = stores || [];
    rebuildStoresIndex();
  },

  // Quick lookup for store by ID
  getStore(id) {
    return _storesIndex?.get(id) ?? null;
  },

  // Get all stores
  getAllStores() {
    return _stores;
  },

  // All trips (from IndexedDB, synced from Google Drive)
  get trips() { return _trips; },
  set trips(data) {
    _trips = data || [];
    rebuildTripsIndex();
  },

  // Quick lookup for trip by ID
  getTrip(id) {
    return _tripsIndex?.get(id) ?? null;
  },

  // Get all trips
  getAllTrips() {
    return _trips;
  },

  // Selected date for visit logging
  get selectedDate() { return _selectedDate; },
  set selectedDate(d) { _selectedDate = d; },

  // Sync state
  get syncState() { return _syncState; },
  set syncState(s) { _syncState = { ..._syncState, ...s }; },

  // Access token for Google Drive
  get accessToken() {
    return localStorage.getItem('google_access_token');
  },
  set accessToken(token) {
    if (token) {
      localStorage.setItem('google_access_token', token);
    } else {
      localStorage.removeItem('google_access_token');
    }
  }
};

// =============================================================================
// MODULE STATE FACTORY
// =============================================================================

/**
 * Create encapsulated module state with optional change notification.
 * Replaces scattered module-level let variables with a consistent pattern.
 *
 * Usage:
 *   const moduleState = createModuleState({
 *     data: [],
 *     sortColumn: 'title',
 *     sortDirection: 'asc',
 *     filterCategory: null,
 *     searchTerm: ''
 *   }, () => renderTable());
 *
 *   moduleState.set({ searchTerm: 'query' }); // triggers onChange
 *   moduleState.get('sortColumn'); // returns 'title'
 *   moduleState.get(); // returns full state object
 *
 * @param {Object} initialState - Default state values
 * @param {Function} [onChange] - Called when state changes with (newState, prevState)
 * @returns {Object} State controller with get, set, reset methods
 */
export function createModuleState(initialState, onChange = null) {
  let currentState = { ...initialState };

  return {
    /**
     * Get state value(s).
     * @param {string} [key] - Specific key to get, or undefined for full state
     * @returns {*} Value or full state object (copy)
     */
    get(key) {
      if (key !== undefined) {
        return currentState[key];
      }
      return { ...currentState };
    },

    /**
     * Update state with partial values.
     * @param {Object} updates - Key-value pairs to update
     * @returns {Object} Updated full state (copy)
     */
    set(updates) {
      const prevState = { ...currentState };
      Object.assign(currentState, updates);
      if (onChange) onChange(currentState, prevState);
      return { ...currentState };
    },

    /**
     * Reset state to initial values.
     */
    reset() {
      const prevState = { ...currentState };
      currentState = { ...initialState };
      if (onChange) onChange(currentState, prevState);
    },

    /**
     * Check if state has a specific key.
     * @param {string} key
     * @returns {boolean}
     */
    has(key) {
      return key in currentState;
    }
  };
}
