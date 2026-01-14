// =============================================================================
// STATE MODULE
// =============================================================================
// Simple module-level state. No reactive proxies - just plain objects.

let _stores = [];
let _storesIndex = null;
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
