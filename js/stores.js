// =============================================================================
// STORES MODULE
// =============================================================================

import { state } from './state.js';
import { getAllStoreStats, getAllUserStores, createUserStore } from './db.js';
import { showToast, createModalController } from './ui.js';
import { $, $$ } from './utils.js';

let storesData = [];
let userStoresData = [];
let statsMap = new Map();
let filterTier = null;
let sortColumn = 'name';
let sortDirection = 'asc';

// =============================================================================
// INITIALIZATION
// =============================================================================

export async function initStores() {
  await loadStores();
  setupEventHandlers();
}

export async function loadStores() {
  // Load static stores
  if (!state.storesDB) {
    try {
      const response = await fetch('data/stores.json');
      state.storesDB = await response.json();
    } catch (err) {
      console.error('Failed to load stores:', err);
      return;
    }
  }

  // Load user-created stores
  userStoresData = await getAllUserStores();
  state.userStores = userStoresData;

  // Merge static and user stores
  const staticStores = state.storesDB.stores || [];
  storesData = [...staticStores, ...userStoresData];

  statsMap = await getAllStoreStats();
  renderStoresTable();
}

function setupEventHandlers() {
  // Tier filter buttons
  const filterBtns = $$('.filter-btn[data-tier]');
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tier = btn.dataset.tier;
      filterTier = tier === 'all' ? null : tier;
      renderStoresTable();
    });
  });

  // Table header sorting
  const table = $('#stores-table');
  if (table) {
    table.addEventListener('click', (e) => {
      const th = e.target.closest('th[data-sort]');
      if (th) {
        const col = th.dataset.sort;
        if (sortColumn === col) {
          sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
          sortColumn = col;
          sortDirection = 'asc';
        }
        renderStoresTable();
      }
    });
  }

  // Add store button
  const addBtn = $('#add-store-btn');
  if (addBtn) {
    addBtn.addEventListener('click', openAddStoreModal);
  }

  // Store form submission
  const form = $('#store-form');
  if (form) {
    form.addEventListener('submit', handleStoreSubmit);
  }
}

// =============================================================================
// RENDERING
// =============================================================================

function renderStoresTable() {
  const tbody = $('#stores-tbody');
  if (!tbody) return;

  // Filter by tier
  let filtered = storesData;
  if (filterTier) {
    filtered = filtered.filter(s => s.tier === filterTier);
  }

  // Sort
  filtered = [...filtered].sort((a, b) => {
    const statsA = statsMap.get(a.id);
    const statsB = statsMap.get(b.id);

    let aVal, bVal;

    switch (sortColumn) {
      case 'name':
        aVal = a.name.toLowerCase();
        bVal = b.name.toLowerCase();
        break;
      case 'tier':
        // S < A < B < C (S is best)
        const tierOrder = { S: 0, A: 1, B: 2, C: 3 };
        aVal = tierOrder[a.tier] ?? 99;
        bVal = tierOrder[b.tier] ?? 99;
        break;
      case 'visits':
        aVal = statsA?.total_visits ?? 0;
        bVal = statsB?.total_visits ?? 0;
        break;
      case 'hit_rate':
        aVal = statsA?.hit_rate ?? 0;
        bVal = statsB?.hit_rate ?? 0;
        break;
      default:
        aVal = a.name.toLowerCase();
        bVal = b.name.toLowerCase();
    }

    if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" class="empty-state">
          <div class="empty-icon">S</div>
          <p>No stores found</p>
        </td>
      </tr>
    `;
    updateStoreCount(0);
    return;
  }

  tbody.innerHTML = filtered.map(store => createStoreRow(store, statsMap.get(store.id))).join('');

  updateStoreCount(filtered.length);
}

function createStoreRow(store, stats) {
  const visitCount = stats?.total_visits ?? 0;
  const hitRate = stats ? `${Math.round(stats.hit_rate * 100)}%` : '-';

  return `
    <tr data-store-id="${store.id}">
      <td>
        <div class="store-info">
          <span class="store-name">${escapeHtml(store.name)}</span>
          <span class="store-address">${escapeHtml(store.address || '')}</span>
        </div>
      </td>
      <td><span class="tier tier--${store.tier}">${store.tier}</span></td>
      <td>${visitCount}</td>
      <td>${hitRate}</td>
    </tr>
  `;
}

function updateStoreCount(count) {
  const countEl = $('#store-count');
  if (countEl) {
    countEl.textContent = `${count} store${count !== 1 ? 's' : ''}`;
  }
}

export function renderStoreCount() {
  const countEl = $('#stat-stores-visited');
  if (countEl) {
    // Count stores with at least one visit
    let visitedCount = 0;
    for (const stats of statsMap.values()) {
      if (stats.total_visits > 0) visitedCount++;
    }
    countEl.textContent = visitedCount;
  }
}

// =============================================================================
// ADD STORE MODAL
// =============================================================================

let addStoreModal = null;

function openAddStoreModal() {
  const dialog = $('#add-store-dialog');
  if (!dialog) return;

  if (!addStoreModal) {
    addStoreModal = createModalController(dialog);
  }

  // Reset form
  const form = $('#store-form');
  if (form) {
    form.reset();
  }

  addStoreModal.open();
}

async function handleStoreSubmit(e) {
  e.preventDefault();

  const form = e.target;
  const formData = new FormData(form);

  const store = {
    name: formData.get('name')?.trim(),
    address: formData.get('address')?.trim() || null,
    tier: formData.get('tier'),
    phone: formData.get('phone')?.trim() || null,
    notes: formData.get('notes')?.trim() || null
  };

  // Validation
  if (!store.name) {
    showToast('Name is required');
    return;
  }
  if (!store.tier) {
    showToast('Tier is required');
    return;
  }

  try {
    await createUserStore(store);
    showToast('Store saved');
    addStoreModal.close();
    await loadStores();
  } catch (err) {
    console.error('Failed to save store:', err);
  }
}

// =============================================================================
// UTILITIES
// =============================================================================

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
