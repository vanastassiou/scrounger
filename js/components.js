// =============================================================================
// REUSABLE UI COMPONENTS
// Consolidated patterns to DRY up the codebase
// =============================================================================

import { createModalController } from './ui.js';
import { $, sortData, emptyStateRow, escapeHtml, createSortableTable, createFilterButtons, updateSortIndicators, createMobileSortDropdown } from './utils.js';

// =============================================================================
// LAZY MODAL
// =============================================================================

/**
 * Create a lazily-initialized modal controller.
 * Replaces the repeated pattern of:
 *   let modal = null;
 *   function openModal() {
 *     if (!modal) modal = createModalController(dialog);
 *     modal.open();
 *   }
 *
 * @param {string} dialogSelector - CSS selector for the dialog element
 * @param {Object} options - Configuration options
 * @param {Function} [options.onOpen] - Called before modal opens with (dialog, data)
 * @param {Function} [options.onClose] - Called after modal closes
 * @returns {Object} { open(data), close(), isOpen(), dialog }
 */
export function createLazyModal(dialogSelector, options = {}) {
  let controller = null;

  function ensureController() {
    if (!controller) {
      const dialog = $(dialogSelector);
      if (!dialog) return null;
      controller = createModalController(dialog);
      if (options.onClose) {
        dialog.addEventListener('close', options.onClose);
      }
    }
    return controller;
  }

  return {
    open(data) {
      const ctrl = ensureController();
      if (!ctrl) return;
      if (options.onOpen) options.onOpen(ctrl.dialog, data);
      ctrl.open();
    },
    close() {
      controller?.close();
    },
    isOpen() {
      return controller?.dialog.open ?? false;
    },
    get dialog() {
      return controller?.dialog;
    }
  };
}

// =============================================================================
// TABLE CONTROLLER
// =============================================================================

/**
 * Create a unified table controller with filtering, sorting, rendering, and event binding.
 * Consolidates repeated patterns across inventory, stores, selling, visits modules.
 *
 * @param {Object} config
 * @param {string} config.tableSelector - CSS selector for table element
 * @param {string} config.tbodySelector - CSS selector for tbody element
 * @param {Function} config.getData - Returns array of data items
 * @param {Function} config.filterItem - (item, filters, searchTerm) => boolean
 * @param {Function} config.getColumnValue - (item, column) => sortable value
 * @param {Function} config.createRow - (item) => HTML string
 * @param {Object} config.emptyState - { colspan, icon, message }
 * @param {string} [config.searchSelector] - CSS selector for search input
 * @param {string} [config.countSelector] - CSS selector for count display
 * @param {string} [config.countTemplate] - Template like "{count} item{s}"
 * @param {Object} [config.defaultSort] - { column, direction }
 * @param {Array} [config.filterButtons] - Array of { selector, dataAttr, key }
 * @param {Array} [config.filterSelects] - Array of { selector, key, allValue? }
 * @param {Object<string, Function>} [config.clickHandlers] - Map of selector to handler function.
 *   Handler returns true to allow default behavior (e.g., external links), undefined/false to preventDefault.
 * @param {Function} [config.onRender] - Called after render with filtered data
 * @returns {Object} Controller API
 */
export function createTableController(config) {
  let filters = {};
  let searchTerm = '';
  let sortColumn = config.defaultSort?.column || null;
  let sortDirection = config.defaultSort?.direction || 'asc';
  let sortHandler = null;

  // Pagination state
  const pageSize = config.pageSize || 25; // Default page size
  let displayedCount = pageSize;

  function render() {
    const tbody = $(config.tbodySelector);
    if (!tbody) return [];

    let data = config.getData();

    // Apply filters
    if (config.filterItem) {
      data = data.filter(item => config.filterItem(item, filters, searchTerm));
    }

    // Sort
    if (sortColumn && config.getColumnValue) {
      sortData(data, sortColumn, sortDirection, config.getColumnValue);
    }

    // Paginate - only render up to displayedCount rows
    const totalCount = data.length;
    const paginatedData = data.slice(0, displayedCount);
    const hasMore = totalCount > displayedCount;

    // Render
    if (data.length === 0) {
      tbody.innerHTML = emptyStateRow(config.emptyState);
    } else {
      tbody.innerHTML = paginatedData.map(config.createRow).join('');
    }

    // Update sort indicators
    if (config.tableSelector) {
      const table = $(config.tableSelector);
      if (table) updateSortIndicators(table, sortColumn, sortDirection);
    }

    // Update count
    if (config.countSelector) {
      const countEl = $(config.countSelector);
      if (countEl) {
        const template = config.countTemplate || '{count} item{s}';
        const text = template
          .replace('{count}', totalCount)
          .replace('{s}', totalCount !== 1 ? 's' : '');
        countEl.textContent = text;
      }
    }

    // Handle "Load more" button
    updateLoadMoreButton(hasMore, totalCount, paginatedData.length);

    // Callback
    if (config.onRender) config.onRender(paginatedData);

    return paginatedData;
  }

  function updateLoadMoreButton(hasMore, totalCount, showingCount) {
    const table = $(config.tableSelector);
    if (!table) return;

    // Find or create load more container after table
    let loadMoreContainer = table.nextElementSibling;
    if (!loadMoreContainer?.classList.contains('load-more-container')) {
      loadMoreContainer = document.createElement('div');
      loadMoreContainer.className = 'load-more-container';
      table.parentNode.insertBefore(loadMoreContainer, table.nextSibling);
    }

    if (hasMore) {
      const remaining = totalCount - showingCount;
      loadMoreContainer.innerHTML = `
        <button class="btn btn--ghost load-more-btn">
          Load more (${remaining} remaining)
        </button>
      `;
      loadMoreContainer.querySelector('.load-more-btn').addEventListener('click', () => {
        displayedCount += pageSize;
        render();
      });
    } else if (totalCount > pageSize) {
      // Show "showing all" message if we loaded more than initial page
      loadMoreContainer.innerHTML = `<span class="text-muted">Showing all ${totalCount}</span>`;
    } else {
      loadMoreContainer.innerHTML = '';
    }
  }

  function setupEventHandlers() {
    // Search input
    if (config.searchSelector) {
      const searchInput = $(config.searchSelector);
      if (searchInput) {
        searchInput.addEventListener('input', (e) => {
          searchTerm = e.target.value.toLowerCase();
          displayedCount = pageSize; // Reset pagination when search changes
          render();
        });
      }
    }

    // Filter buttons
    if (config.filterButtons) {
      for (const fb of config.filterButtons) {
        createFilterButtons({
          selector: fb.selector,
          dataAttr: fb.dataAttr,
          onFilter: (value) => {
            filters[fb.key] = value;
            displayedCount = pageSize; // Reset pagination when filter changes
            render();
          }
        });
      }
    }

    // Filter selects (dropdowns)
    if (config.filterSelects) {
      for (const fs of config.filterSelects) {
        const select = $(fs.selector);
        if (select) {
          const allValue = fs.allValue || 'all';
          select.addEventListener('change', (e) => {
            const value = e.target.value;
            filters[fs.key] = value === allValue ? null : value;
            displayedCount = pageSize; // Reset pagination when filter changes
            render();
          });
        }
      }
    }

    // Table sorting and click delegation
    if (config.tableSelector) {
      const table = $(config.tableSelector);
      if (table) {
        // Create sort handler
        const sortConfig = {
          getState: () => ({ sortColumn, sortDirection }),
          setState: (s) => { sortColumn = s.sortColumn; sortDirection = s.sortDirection; },
          onSort: render
        };
        sortHandler = createSortableTable(sortConfig);

        // Create mobile sort dropdown for responsive tables
        if (table.classList.contains('table-responsive')) {
          createMobileSortDropdown(table, sortConfig);
        }

        // Click delegation
        table.addEventListener('click', (e) => {
          // Header sorting
          if (sortHandler(e)) return;

          // Custom click handlers
          if (config.clickHandlers) {
            for (const [selector, handler] of Object.entries(config.clickHandlers)) {
              const target = e.target.closest(selector);
              if (target) {
                const allowDefault = handler(target, e);
                if (!allowDefault) e.preventDefault();
                return;
              }
            }
          }
        });
      }
    }
  }

  // Return controller API
  const controller = {
    render,
    setupEventHandlers,
    init() {
      setupEventHandlers();
      render();
      return controller;
    },
    async refresh(newGetData) {
      if (newGetData) config.getData = newGetData;
      render();
    },
    setFilter(key, value) {
      filters[key] = value;
      render();
    },
    clearFilters() {
      filters = {};
      render();
    },
    setSearch(term) {
      searchTerm = term.toLowerCase();
      render();
    },
    setSorting(col, dir) {
      sortColumn = col;
      sortDirection = dir;
      render();
    },
    getState() {
      return { filters: { ...filters }, searchTerm, sortColumn, sortDirection };
    },
    getData: () => config.getData()
  };

  return controller;
}

// =============================================================================
// SUB-TAB CONTROLLER
// =============================================================================

/**
 * Create a sub-tab controller with localStorage persistence.
 * Replaces the repeated pattern of:
 *   function setupSubTabs() {
 *     const subTabs = $$('.sub-tab[data-xxx-view]');
 *     function activateView(view) {
 *       subTabs.forEach(t => t.classList.toggle('active', t.dataset.xxxView === view));
 *       localStorage.setItem('xxxSubTab', view);
 *       document.documentElement.dataset.xxxSub = view;
 *     }
 *   }
 *
 * @param {Object} config
 * @param {string} config.tabSelector - Selector for sub-tab buttons
 * @param {string} config.dataAttr - Data attribute name (e.g., 'invView')
 * @param {Object<string, string>} config.views - Map of viewId to viewSelector
 * @param {string} config.storageKey - localStorage key
 * @param {string} config.htmlDataAttr - HTML dataset attribute name (e.g., 'invSub')
 * @param {string} config.defaultView - Default view if none saved
 * @param {Function} [config.onActivate] - Called when view activates with (viewId)
 * @returns {Object} Controller with activate(viewId)
 */
export function createSubTabController(config) {
  const { tabSelector, dataAttr, views, storageKey, htmlDataAttr, defaultView, onActivate } = config;
  const tabs = document.querySelectorAll(tabSelector);

  function activate(viewId) {
    if (!views[viewId]) return;

    // Update tab active states
    tabs.forEach(t => t.classList.toggle('active', t.dataset[dataAttr] === viewId));

    // Update view visibility
    Object.entries(views).forEach(([id, selector]) => {
      const el = $(selector);
      if (el) el.classList.toggle('hidden', id !== viewId);
    });

    // Persist state
    localStorage.setItem(storageKey, viewId);
    document.documentElement.dataset[htmlDataAttr] = viewId;

    // Callback
    if (onActivate) onActivate(viewId);
  }

  // Setup click handlers
  tabs.forEach(tab => {
    tab.addEventListener('click', () => activate(tab.dataset[dataAttr]));
  });

  // Restore saved state
  const saved = localStorage.getItem(storageKey);
  const validViews = Object.keys(views);
  activate(saved && validViews.includes(saved) ? saved : defaultView);

  return { activate };
}

// =============================================================================
// STORE DROPDOWN (SINGLETON)
// =============================================================================

const initializedDropdowns = new Set();

/**
 * Initialize a chain/store dropdown pair (idempotent).
 * Replaces the repeated pattern of:
 *   let storeDropdownInitialized = false;
 *   function populateStoreSelect() {
 *     if (storeDropdownInitialized) return;
 *     storeDropdownInitialized = true;
 *     createChainStoreDropdown({...});
 *   }
 *
 * @param {Object} config - Same as createChainStoreDropdown
 * @param {Function} createFn - The createChainStoreDropdown function
 * @returns {boolean} true if newly initialized, false if already done
 */
export function initStoreDropdown(config, createFn) {
  const key = `${config.chainSelector}|${config.storeSelector}`;
  if (initializedDropdowns.has(key)) return false;
  initializedDropdowns.add(key);
  createFn(config);
  return true;
}

// =============================================================================
// DETAIL SECTION RENDERING
// =============================================================================

/**
 * Render a detail section with optional content types.
 * Replaces the repeated pattern of:
 *   sections.push(`
 *     <section class="detail-section">
 *       <h3 class="detail-section-title">Title</h3>
 *       <dl class="detail-grid">...</dl>
 *     </section>
 *   `);
 *
 * @param {string} title - Section title
 * @param {string|Array} content - HTML content or array of {dt, dd} pairs for grid
 * @returns {string} HTML string
 */
export function renderDetailSection(title, content) {
  let bodyHtml;

  if (Array.isArray(content)) {
    // Render as definition list, filtering out null/undefined/empty values
    const items = content
      .filter(item => item.dd != null && item.dd !== '')
      .map(item => `<dt>${escapeHtml(String(item.dt))}</dt><dd>${item.dd}</dd>`)
      .join('');
    bodyHtml = items ? `<dl class="detail-grid">${items}</dl>` : '';
  } else {
    bodyHtml = content;
  }

  if (!bodyHtml) return '';

  return `
    <section class="detail-section">
      <h3 class="detail-section-title">${escapeHtml(title)}</h3>
      ${bodyHtml}
    </section>
  `;
}

/**
 * Render multiple detail sections.
 * @param {Array<{title: string, content: string|Array}>} sections
 * @returns {string} Combined HTML
 */
export function renderDetailSections(sections) {
  return sections
    .map(s => renderDetailSection(s.title, s.content))
    .filter(Boolean)
    .join('');
}

// =============================================================================
// VISIBILITY HELPERS
// =============================================================================

/**
 * Toggle visibility using the .hidden class.
 * Replaces el.style.display = 'none'/'block' patterns.
 *
 * @param {Element|string} elOrSelector - Element or CSS selector
 * @param {boolean} visible - Whether element should be visible
 */
export function setVisible(elOrSelector, visible) {
  const el = typeof elOrSelector === 'string' ? $(elOrSelector) : elOrSelector;
  if (el) el.classList.toggle('hidden', !visible);
}

/**
 * Show an element (remove .hidden class).
 * @param {Element|string} elOrSelector
 */
export function show(elOrSelector) {
  setVisible(elOrSelector, true);
}

/**
 * Hide an element (add .hidden class).
 * @param {Element|string} elOrSelector
 */
export function hide(elOrSelector) {
  setVisible(elOrSelector, false);
}
