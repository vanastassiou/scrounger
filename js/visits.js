// =============================================================================
// VISITS MODULE
// =============================================================================

import { state } from './state.js';
import { computeVisitsFromInventory, getInventoryForVisit, deleteInventoryItem } from './db.js';
import { showToast, createModalController } from './ui.js';
import {
  $, formatCurrency, formatDate, getTodayDate, capitalize, formatStatus, escapeHtml,
  createChainStoreDropdown, createSortableTable, sortData, updateSortIndicators
} from './utils.js';
import { initStoreDropdown } from './components.js';
import { openAddItemModal, openEditItemModal, openViewItemModal } from './inventory.js';
import { openViewStoreModal } from './stores.js';

let visitsData = [];
let sortColumn = 'date';
let sortDirection = 'desc';

// =============================================================================
// VISIT WORKFLOW STATE
// =============================================================================

let visitWorkflow = {
  step: 1,
  storeId: null,
  date: null,
  items: []
};

// =============================================================================
// INITIALIZATION
// =============================================================================

export async function initVisits() {
  await loadVisits();
  setupEventHandlers();
}

export async function loadVisits() {
  visitsData = await computeVisitsFromInventory();
  renderVisitsTable();
}

// Sort handler for visits table (created once, used by delegation)
const visitsSortHandler = createSortableTable({
  getState: () => ({ sortColumn, sortDirection }),
  setState: (s) => { sortColumn = s.sortColumn; sortDirection = s.sortDirection; },
  onSort: renderVisitsTable
});

function setupEventHandlers() {
  // Step 1 form submission
  const step1Form = $('#visit-step1-form');
  if (step1Form) {
    step1Form.addEventListener('submit', handleStep1Submit);
  }

  // Table click delegation for items link and sorting (delegate from container since table is dynamic)
  const container = $('#visits-list');
  if (container) {
    container.addEventListener('click', (e) => {
      // Handle sorting
      if (visitsSortHandler(e)) return;
      // Handle items link
      handleTableClick(e);
    });
  }

  // Visit workflow buttons
  $('#visit-back-btn')?.addEventListener('click', () => showStep(1));
  $('#visit-add-item-btn')?.addEventListener('click', handleAddItemFromVisit);
  $('#visit-empty-add-btn')?.addEventListener('click', handleAddItemFromVisit);
  $('#visit-cancel-btn')?.addEventListener('click', handleCancelVisit);
  $('#visit-complete-btn')?.addEventListener('click', handleCompleteVisit);

  // Spreadsheet click delegation for edit/delete
  const spreadsheet = $('#visit-spreadsheet');
  if (spreadsheet) {
    spreadsheet.addEventListener('click', handleSpreadsheetClick);
  }
}

// =============================================================================
// VISITS TABLE RENDERING
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

  // Sort visits
  const sorted = [...visitsData];
  sortData(sorted, sortColumn, sortDirection, (visit, col) => {
    switch (col) {
      case 'date': return visit.date;
      case 'store': return state.getStore(visit.store_id)?.name?.toLowerCase() || '';
      case 'items': return visit.purchases_count || 0;
      case 'spent': return visit.total_spent || 0;
      default: return visit.date;
    }
  });

  const totalVisits = sorted.length;

  container.innerHTML = `
    <div class="table-container">
      <table class="table table-responsive table--compact" id="visits-table">
        <thead>
          <tr>
            <th data-sort="date">Date</th>
            <th data-sort="store">Store</th>
            <th data-sort="items">Items</th>
            <th data-sort="spent">Spent</th>
          </tr>
        </thead>
        <tbody>
          ${sorted.map(visit => createVisitRow(visit)).join('')}
        </tbody>
      </table>
    </div>
    <div id="visits-count" class="text-muted">${totalVisits} visit${totalVisits !== 1 ? 's' : ''}</div>
  `;

  // Update sort indicators
  const table = $('#visits-table');
  if (table) updateSortIndicators(table, sortColumn, sortDirection);
}

function createVisitRow(visit) {
  const store = state.getStore(visit.store_id);
  const storeName = store?.name ?? visit.store_id;
  const hasItems = visit.purchases_count > 0;
  const visitKey = `${visit.store_id}__${visit.date}`;

  return `
    <tr data-visit-key="${visitKey}" data-store-id="${visit.store_id}" data-date="${visit.date}">
      <td>${formatDate(visit.date)}</td>
      <td data-label="Store"><a href="#" class="table-link store-link" data-store-id="${visit.store_id}">${escapeHtml(storeName)}</a></td>
      <td data-label="Items">
        ${hasItems
          ? `<a href="#" class="table-link" data-store-id="${visit.store_id}" data-date="${visit.date}">${visit.purchases_count} item${visit.purchases_count !== 1 ? 's' : ''}</a>`
          : `<span class="text-muted">0 items</span>`
        }
      </td>
      <td data-label="Spent">${formatCurrency(visit.total_spent || 0)}</td>
    </tr>
  `;
}

async function handleTableClick(e) {
  const link = e.target.closest('.table-link');
  if (!link) return;

  e.preventDefault();

  const storeId = link.dataset.storeId;
  const date = link.dataset.date;

  // Store link (no date) - open store detail modal
  if (link.classList.contains('store-link')) {
    openViewStoreModal(storeId);
    return;
  }

  // Items link - open visit items modal
  await openVisitItemsModal(storeId, date);
}

// =============================================================================
// VISIT ITEMS MODAL (read-only view)
// =============================================================================

let visitItemsModal = null;

async function openVisitItemsModal(storeId, date) {
  const dialog = $('#visit-items-dialog');
  if (!dialog) return;

  if (!visitItemsModal) {
    visitItemsModal = createModalController(dialog);

    // Add click handler for item links (once)
    const contentEl = $('#visit-items-content');
    if (contentEl) {
      contentEl.addEventListener('click', (e) => {
        const link = e.target.closest('.table-link');
        if (link) {
          e.preventDefault();
          const itemId = link.dataset.id;
          openViewItemModal(itemId);
        }
      });
    }
  }

  // Get store name
  const store = state.getStore(storeId);
  const storeName = store?.name ?? storeId;

  // Get items for this visit
  const items = await getInventoryForVisit(storeId, date);

  // Update modal title
  const titleEl = $('#visit-items-title');
  if (titleEl) {
    titleEl.textContent = `${storeName} - ${formatDate(date)}`;
  }

  // Render content
  const contentEl = $('#visit-items-content');
  if (contentEl) {
    contentEl.innerHTML = renderVisitItemsDetails(store, items);
  }

  visitItemsModal.open();
}

function renderVisitItemsDetails(store, items) {
  const sections = [];

  // Items section
  if (items.length > 0) {
    const total = items.reduce((sum, item) => sum + (item.purchase_price || 0), 0);

    let itemsHtml = '<div class="table-container"><table class="table table-responsive table--compact"><thead><tr>';
    itemsHtml += '<th>Item</th><th>Category</th><th>Brand</th><th>Cost</th>';
    itemsHtml += '</tr></thead><tbody>';

    for (const item of items) {
      const title = item.title || 'Untitled item';
      const category = capitalize(item.category);
      const brand = item.brand || '-';
      const price = formatCurrency(item.purchase_price || 0);
      itemsHtml += `<tr>`;
      itemsHtml += `<td><a href="#" class="table-link" data-id="${item.id}">${escapeHtml(title)}</a></td>`;
      itemsHtml += `<td data-label="Category">${category}</td>`;
      itemsHtml += `<td data-label="Brand">${escapeHtml(brand)}</td>`;
      itemsHtml += `<td data-label="Cost">${price}</td>`;
      itemsHtml += `</tr>`;
    }

    itemsHtml += '</tbody><tfoot><tr>';
    itemsHtml += `<td colspan="3" class="text-muted">Total</td>`;
    itemsHtml += `<td><strong>${formatCurrency(total)}</strong></td>`;
    itemsHtml += '</tr></tfoot></table></div>';

    sections.push(`<section class="detail-section"><h3 class="detail-section-title">Items (${items.length})</h3>${itemsHtml}</section>`);
  } else {
    sections.push(`<section class="detail-section"><h3 class="detail-section-title">Items</h3><p class="text-muted">No items recorded for this visit.</p></section>`);
  }

  return sections.join('');
}

// =============================================================================
// LOG VISIT MODAL (Multi-Step Workflow)
// =============================================================================

let logVisitModal = null;

export function openLogVisitModal() {
  const dialog = $('#log-visit-dialog');
  if (!dialog) return;

  if (!logVisitModal) {
    logVisitModal = createModalController(dialog);
    populateStoreSelect();
  }

  // Reset workflow
  resetVisitWorkflow();

  // Reset form and show step 1
  const form = $('#visit-step1-form');
  if (form) {
    form.reset();
    $('#visit-date').value = getTodayDate();
  }

  showStep(1);
  logVisitModal.open();
}

function populateStoreSelect() {
  initStoreDropdown({
    chainSelector: '#visit-chain',
    storeSelector: '#visit-store',
    getAllStores: () => state.getAllStores()
  }, createChainStoreDropdown);
}

// =============================================================================
// STEP NAVIGATION
// =============================================================================

function showStep(stepNumber) {
  const step1 = $('#visit-step-1');
  const step2 = $('#visit-step-2');

  if (stepNumber === 1) {
    step1.hidden = false;
    step2.hidden = true;
    $('#visit-modal-title').textContent = 'Log visit';
  } else {
    step1.hidden = true;
    step2.hidden = false;
    updateStep2Header();
  }

  visitWorkflow.step = stepNumber;
}

function updateStep2Header() {
  const store = state.getStore(visitWorkflow.storeId);
  const storeName = store?.name || visitWorkflow.storeId;
  $('#visit-context-label').textContent = `${storeName} - ${formatDate(visitWorkflow.date)}`;
  $('#visit-modal-title').textContent = `Visit: ${storeName}`;
}

// =============================================================================
// STEP 1: Store/Date Selection
// =============================================================================

async function handleStep1Submit(e) {
  e.preventDefault();

  const formData = new FormData(e.target);
  visitWorkflow.storeId = formData.get('store_id');
  visitWorkflow.date = formData.get('date');

  if (!visitWorkflow.storeId) {
    showToast('Store is required');
    return;
  }
  if (!visitWorkflow.date) {
    showToast('Date is required');
    return;
  }

  // Load existing items for this store/date
  await refreshVisitItems();

  // Show step 2
  showStep(2);
  renderSpreadsheet();
}

// =============================================================================
// STEP 2: Item Spreadsheet
// =============================================================================

async function refreshVisitItems() {
  visitWorkflow.items = await getInventoryForVisit(visitWorkflow.storeId, visitWorkflow.date);
}

function renderSpreadsheet() {
  const tbody = $('#visit-spreadsheet-tbody');
  const container = $('#visit-spreadsheet-container');
  const emptyState = $('#visit-empty-state');
  const completeBtn = $('#visit-complete-btn');

  const hasItems = visitWorkflow.items.length > 0;

  // Toggle visibility
  if (container) container.hidden = !hasItems;
  if (emptyState) emptyState.hidden = hasItems;
  if (completeBtn) completeBtn.disabled = !hasItems;

  if (!hasItems) {
    if (tbody) tbody.innerHTML = '';
    return;
  }

  tbody.innerHTML = visitWorkflow.items.map(item => `
    <tr data-item-id="${item.id}">
      <td><a href="#" class="table-link" data-id="${item.id}">${escapeHtml(item.title || '-')}</a></td>
      <td data-label="Category">${capitalize(item.category)}</td>
      <td data-label="Brand">${escapeHtml(item.brand || '-')}</td>
      <td data-label="Cost">${formatCurrency(item.purchase_price || 0)}</td>
      <td class="table-actions">
        <button class="btn btn--sm edit-item-btn" data-id="${item.id}">Edit</button>
        <button class="btn btn--sm btn--danger delete-item-btn" data-id="${item.id}">Delete</button>
      </td>
    </tr>
  `).join('');

  // Update total
  const total = visitWorkflow.items.reduce((sum, i) => sum + (i.purchase_price || 0), 0);
  const totalEl = $('#visit-spreadsheet-total');
  if (totalEl) {
    totalEl.innerHTML = `<strong>${formatCurrency(total)}</strong>`;
  }
}

// =============================================================================
// SPREADSHEET ACTIONS
// =============================================================================

async function handleSpreadsheetClick(e) {
  const itemLink = e.target.closest('.table-link');
  const editBtn = e.target.closest('.edit-item-btn');
  const deleteBtn = e.target.closest('.delete-item-btn');

  if (itemLink) {
    e.preventDefault();
    const itemId = itemLink.dataset.id;
    openViewItemModal(itemId);
    return;
  }

  if (editBtn) {
    const itemId = editBtn.dataset.id;
    openEditItemModal(itemId, {
      lockStoreDate: true,
      onSave: async () => {
        await refreshVisitItems();
        renderSpreadsheet();
      }
    });
  }

  if (deleteBtn) {
    const itemId = deleteBtn.dataset.id;
    if (confirm('Delete this item?')) {
      try {
        await deleteInventoryItem(itemId);
        await refreshVisitItems();
        renderSpreadsheet();
        showToast('Item deleted');
      } catch (err) {
        showToast('Failed to delete item');
      }
    }
  }
}

function handleAddItemFromVisit() {
  openAddItemModal({
    storeId: visitWorkflow.storeId,
    date: visitWorkflow.date,
    onSave: async () => {
      await refreshVisitItems();
      renderSpreadsheet();
    }
  });
}

// =============================================================================
// COMPLETE/CANCEL VISIT
// =============================================================================

function handleCompleteVisit() {
  const itemCount = visitWorkflow.items.length;
  showToast(`Visit completed: ${itemCount} item${itemCount !== 1 ? 's' : ''}`);
  logVisitModal.close();
  loadVisits();
  resetVisitWorkflow();
}

function handleCancelVisit() {
  logVisitModal.close();
  resetVisitWorkflow();
}

function resetVisitWorkflow() {
  visitWorkflow = {
    step: 1,
    storeId: null,
    date: null,
    items: []
  };
}
