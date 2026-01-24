// =============================================================================
// UI PATTERNS
// =============================================================================

/**
 * Create a tab controller for tab-based navigation.
 * @param {string} tabsSelector - Selector for tab elements
 * @param {string} pagesSelector - Selector for page elements
 * @param {Object} options - Configuration options
 * @returns {Object} Tab controller with activate method
 */
export function createTabController(tabsSelector, pagesSelector, options = {}) {
  const {
    storageKey = null,
    tabAttr = 'data-tab',
    onActivate = null
  } = options;

  const tabs = document.querySelectorAll(tabsSelector);
  const pages = document.querySelectorAll(pagesSelector);

  function activate(targetId) {
    tabs.forEach(t => t.classList.remove('active'));
    pages.forEach(p => p.classList.remove('active'));

    const tab = document.querySelector(`${tabsSelector}[${tabAttr}="${targetId}"]`);
    const page = document.getElementById(targetId);

    if (page) {
      if (tab) {
        tab.classList.add('active');
      }
      page.classList.add('active');

      // Update html data-tab attribute for inline CSS
      document.documentElement.dataset.tab = targetId;

      if (storageKey) {
        localStorage.setItem(storageKey, targetId);
      }

      if (onActivate) {
        onActivate(targetId);
      }
    }
  }

  // Restore saved state or activate first tab
  if (storageKey) {
    const savedTab = localStorage.getItem(storageKey);
    const defaultTab = tabs[0]?.getAttribute(tabAttr);
    activate(savedTab || defaultTab);
  }

  // Bind click handlers
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetId = tab.getAttribute(tabAttr);
      activate(targetId);
    });
  });

  return { activate };
}

/**
 * Create a modal controller wrapping native <dialog> element.
 * @param {HTMLDialogElement} dialog - The dialog element
 * @returns {Object} Modal controller with open, close methods
 */
export function createModalController(dialog) {
  function open() {
    dialog.showModal();
  }

  function close() {
    dialog.close();
  }

  // Close on backdrop click
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) {
      close();
    }
  });

  // Close button handler
  const closeBtn = dialog.querySelector('.modal-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', close);
  }

  return { open, close, dialog };
}

/**
 * Show a toast notification.
 * @param {string} message - Message to display
 * @param {number} duration - Duration in milliseconds
 */
export function showToast(message, duration = 3500) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.classList.add('visible');

  setTimeout(() => {
    toast.classList.remove('visible');
  }, duration);
}

/**
 * Update sync status indicator in header.
 * @param {Object} syncState
 */
export function updateSyncStatus(syncState) {
  const el = document.getElementById('sync-status');
  if (!el) return;

  el.className = 'sync-status';

  if (syncState.syncInProgress) {
    el.classList.add('sync-status--syncing');
    el.textContent = 'Syncing...';
  } else if (syncState.error) {
    el.classList.add('sync-status--error');
    el.textContent = 'Sync error';
  } else if (syncState.lastSyncAt) {
    el.textContent = 'Synced';
  } else {
    el.textContent = 'Not synced';
  }
}
