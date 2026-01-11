// =============================================================================
// STATE MODULE
// =============================================================================
// Simple module-level state. No reactive proxies - just plain objects.

let _storesDB = null;
let _storesIndex = null;
let _userStores = [];
let _selectedDate = new Date().toISOString().split('T')[0];
let _syncState = {
  lastSyncAt: null,
  isDirty: false,
  syncInProgress: false,
  error: null
};

function rebuildStoresIndex() {
  _storesIndex = new Map();
  if (_storesDB?.stores) {
    _storesDB.stores.forEach(s => _storesIndex.set(s.id, s));
  }
  _userStores.forEach(s => _storesIndex.set(s.id, s));
}

export const state = {
  // Stores database (loaded from JSON)
  get storesDB() { return _storesDB; },
  set storesDB(data) {
    _storesDB = data;
    rebuildStoresIndex();
  },

  // User-created stores (from IndexedDB)
  get userStores() { return _userStores; },
  set userStores(stores) {
    _userStores = stores || [];
    rebuildStoresIndex();
  },

  // Quick lookup for store by ID (checks both static and user stores)
  getStore(id) {
    return _storesIndex?.get(id) ?? null;
  },

  // Get all stores (static + user)
  getAllStores() {
    const staticStores = _storesDB?.stores || [];
    return [...staticStores, ..._userStores];
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
