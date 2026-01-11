// =============================================================================
// VISITS MODULE
// =============================================================================

import { state } from './state.js';
import { getAllVisits, createVisit, getInventoryForVisit } from './db.js';
import { showToast, createModalController } from './ui.js';
import { $, formatCurrency, formatDate, getTodayDate, capitalize } from './utils.js';

let visitsData = [];

// =============================================================================
// INITIALIZATION
// =============================================================================

export async function initVisits() {
  await loadVisits();
  setupEventHandlers();
}

export async function loadVisits() {
  visitsData = await getAllVisits();
  renderVisitsTable();
}

function setupEventHandlers() {
  // Visit form submission
  const form = $('#visit-form');
  if (form) {
    form.addEventListener('submit', handleVisitSubmit);
  }

  // Table click delegation for items link
  const table = $('#visits-table');
  if (table) {
    table.addEventListener('click', handleTableClick);
  }
}

// =============================================================================
// RENDERING
// =============================================================================

function renderVisitsTable() {
  const container = $('#visits-list');
  if (!container) return;

  if (visitsData.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">V</div>
        <p>No visits logged yet</p>
        <button class="btn btn--primary" id="empty-log-visit-btn">Log your first visit</button>
      </div>
    `;

    const btn = $('#empty-log-visit-btn');
    if (btn) {
      btn.addEventListener('click', openLogVisitModal);
    }
    return;
  }

  // Calculate summary
  const totalVisits = visitsData.length;
  const totalSpent = visitsData.reduce((sum, v) => sum + (v.total_spent || 0), 0);
  const totalItems = visitsData.reduce((sum, v) => sum + (v.purchases_count || 0), 0);

  // Sort by date descending
  const sorted = [...visitsData].sort((a, b) => b.date.localeCompare(a.date));

  container.innerHTML = `
    <div class="visits-summary">
      <div><span class="text-muted">Visits:</span> <strong>${totalVisits}</strong></div>
      <div><span class="text-muted">Spent:</span> <strong>${formatCurrency(totalSpent)}</strong></div>
      <div><span class="text-muted">Items:</span> <strong>${totalItems}</strong></div>
    </div>

    <div class="table-container">
      <table class="table" id="visits-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Store</th>
            <th>Items</th>
            <th>Spent</th>
          </tr>
        </thead>
        <tbody>
          ${sorted.map(visit => createVisitRow(visit)).join('')}
        </tbody>
      </table>
    </div>
    <div id="visits-count" class="text-muted">${totalVisits} visit${totalVisits !== 1 ? 's' : ''}</div>
  `;
}

function createVisitRow(visit) {
  const store = state.getStore(visit.store_id);
  const storeName = store?.name ?? visit.store_id;
  const hasItems = visit.purchases_count > 0;

  return `
    <tr data-visit-id="${visit.id}" data-store-id="${visit.store_id}" data-date="${visit.date}">
      <td>${formatDate(visit.date)}</td>
      <td>${escapeHtml(storeName)}</td>
      <td>
        ${hasItems
          ? `<a href="#" class="items-link" data-store-id="${visit.store_id}" data-date="${visit.date}">${visit.purchases_count} item${visit.purchases_count !== 1 ? 's' : ''}</a>`
          : `<span class="text-muted">0 items</span>`
        }
      </td>
      <td>${formatCurrency(visit.total_spent || 0)}</td>
    </tr>
  `;
}

async function handleTableClick(e) {
  const link = e.target.closest('.items-link');
  if (!link) return;

  e.preventDefault();

  const storeId = link.dataset.storeId;
  const date = link.dataset.date;

  await openVisitItemsModal(storeId, date);
}

// =============================================================================
// VISIT ITEMS MODAL
// =============================================================================

let visitItemsModal = null;

async function openVisitItemsModal(storeId, date) {
  const dialog = $('#visit-items-dialog');
  if (!dialog) return;

  if (!visitItemsModal) {
    visitItemsModal = createModalController(dialog);
  }

  // Get store name
  const store = state.getStore(storeId);
  const storeName = store?.name ?? storeId;

  // Get items for this visit
  const items = await getInventoryForVisit(storeId, date);

  // Update modal content
  const titleEl = $('#visit-items-title');
  if (titleEl) {
    titleEl.textContent = `${storeName} - ${formatDate(date)}`;
  }

  const tbody = $('#visit-items-tbody');
  if (tbody) {
    if (items.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4" class="empty-state">
            <p class="text-muted">No items recorded for this visit</p>
          </td>
        </tr>
      `;
    } else {
      tbody.innerHTML = items.map(item => `
        <tr>
          <td>${escapeHtml(item.title || '-')}</td>
          <td>${capitalize(item.category)}</td>
          <td>${escapeHtml(item.brand || '-')}</td>
          <td>${formatCurrency(item.purchase_price || 0)}</td>
        </tr>
      `).join('');
    }
  }

  // Update total
  const totalEl = $('#visit-items-total');
  if (totalEl) {
    const total = items.reduce((sum, item) => sum + (item.purchase_price || 0), 0);
    totalEl.textContent = formatCurrency(total);
  }

  visitItemsModal.open();
}

// =============================================================================
// LOG VISIT MODAL
// =============================================================================

let logVisitModal = null;

export function openLogVisitModal() {
  const dialog = $('#log-visit-dialog');
  if (!dialog) return;

  if (!logVisitModal) {
    logVisitModal = createModalController(dialog);
    populateStoreSelect();
  }

  // Reset form
  const form = $('#visit-form');
  if (form) {
    form.reset();
    $('#visit-date').value = getTodayDate();
    $('#visit-purchases').value = '0';
    $('#visit-spent').value = '0';
  }

  logVisitModal.open();
}

function populateStoreSelect() {
  const storeSelect = $('#visit-store');
  const allStores = state.getAllStores();
  if (!storeSelect || allStores.length === 0) return;

  storeSelect.innerHTML = '<option value="">Select store...</option>';

  // Sort stores alphabetically by name
  const sorted = [...allStores].sort((a, b) =>
    a.name.toLowerCase().localeCompare(b.name.toLowerCase())
  );

  sorted.forEach(store => {
    const opt = document.createElement('option');
    opt.value = store.id;
    opt.textContent = store.name;
    storeSelect.appendChild(opt);
  });
}

async function handleVisitSubmit(e) {
  e.preventDefault();

  const form = e.target;
  const formData = new FormData(form);

  const visit = {
    store_id: formData.get('store_id'),
    date: formData.get('date'),
    purchases_count: parseInt(formData.get('purchases_count')) || 0,
    total_spent: parseFloat(formData.get('total_spent')) || 0,
    notes: formData.get('notes')?.trim() || null
  };

  // Validation
  if (!visit.store_id) {
    showToast('Store is required');
    return;
  }
  if (!visit.date) {
    showToast('Date is required');
    return;
  }

  try {
    await createVisit(visit);
    showToast('Visit logged');
    logVisitModal.close();
    await loadVisits();
  } catch (err) {
    // Error already shown by db.js
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
