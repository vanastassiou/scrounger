// =============================================================================
// SELLING MODULE
// =============================================================================

import { state } from './state.js';
import {
  getInventoryInPipeline,
  getSellingAnalytics,
  markItemAsSold,
  getInventoryItem,
  updateInventoryItem
} from './db.js';
import { showToast, createModalController } from './ui.js';
import {
  $,
  $$,
  formatCurrency,
  formatDate,
  capitalize,
  formatStatus,
  calculateProfit,
  formatProfitDisplay
} from './utils.js';
import { RESALE_PLATFORMS, PIPELINE_STATUSES } from './config.js';

// =============================================================================
// STATE
// =============================================================================

let pipelineData = [];
let sortColumn = 'status';
let sortDirection = 'asc';
let filterStatus = null;
let filterPlatform = null;
let dateRangeFilter = 'all';
let searchTerm = '';
let currentSoldItem = null;

// =============================================================================
// INITIALIZATION
// =============================================================================

export async function initSelling() {
  await loadPipeline();
  setupEventHandlers();
  await renderAnalytics();
}

async function loadPipeline() {
  pipelineData = await getInventoryInPipeline();
  renderPipelineTable();
}

function setupEventHandlers() {
  // Status filter buttons
  const statusBtns = $$('.filter-btn[data-status]');
  statusBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      statusBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const status = btn.dataset.status;
      filterStatus = status === 'all' ? null : status;
      renderPipelineTable();
    });
  });

  // Platform filter
  const platformFilter = $('#platform-filter');
  if (platformFilter) {
    platformFilter.addEventListener('change', (e) => {
      filterPlatform = e.target.value === 'all' ? null : e.target.value;
      renderPipelineTable();
      renderAnalytics();
    });
  }

  // Date range filter
  const dateFilter = $('#date-range-filter');
  if (dateFilter) {
    dateFilter.addEventListener('change', (e) => {
      dateRangeFilter = e.target.value;
      renderAnalytics();
    });
  }

  // Search
  const searchInput = $('#selling-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchTerm = e.target.value.toLowerCase();
      renderPipelineTable();
    });
  }

  // Table sorting and actions
  const table = $('#selling-table');
  if (table) {
    table.addEventListener('click', (e) => {
      // Header sorting
      const th = e.target.closest('th[data-sort]');
      if (th) {
        const col = th.dataset.sort;
        if (sortColumn === col) {
          sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
          sortColumn = col;
          sortDirection = 'asc';
        }
        renderPipelineTable();
        return;
      }

      // Mark as sold button
      const markSoldBtn = e.target.closest('.mark-sold-btn');
      if (markSoldBtn) {
        e.preventDefault();
        const itemId = parseInt(markSoldBtn.dataset.id);
        openMarkAsSoldModal(itemId);
        return;
      }

      // Quick status update
      const statusBtn = e.target.closest('.status-next-btn');
      if (statusBtn) {
        e.preventDefault();
        const itemId = parseInt(statusBtn.dataset.id);
        const nextStatus = statusBtn.dataset.nextStatus;
        updateItemStatus(itemId, nextStatus);
      }
    });
  }

  // Mark-as-sold form
  const markSoldForm = $('#mark-sold-form');
  if (markSoldForm) {
    markSoldForm.addEventListener('submit', handleMarkAsSoldSubmit);

    // Real-time profit preview
    const priceInputs = ['#sold-price', '#shipping-cost', '#platform-fees'];
    priceInputs.forEach(selector => {
      const input = $(selector);
      if (input) {
        input.addEventListener('input', updateProfitPreview);
      }
    });
  }
}

// =============================================================================
// ANALYTICS
// =============================================================================

async function renderAnalytics() {
  const dateRange = getDateRange();
  const analytics = await getSellingAnalytics(dateRange);

  // Update stat cards
  const revenueEl = $('#selling-stat-revenue');
  const profitEl = $('#selling-stat-profit');
  const marginEl = $('#selling-stat-margin');
  const soldEl = $('#selling-stat-sold');

  if (revenueEl) revenueEl.textContent = formatCurrency(analytics.totalRevenue);
  if (profitEl) {
    const { formatted, className } = formatProfitDisplay(analytics.totalProfit);
    profitEl.textContent = formatted;
    profitEl.className = `stat-value ${className}`;
  }
  if (marginEl) marginEl.textContent = `${analytics.profitMargin.toFixed(1)}%`;
  if (soldEl) soldEl.textContent = analytics.itemsSold;
}

function getDateRange() {
  if (dateRangeFilter === 'all') return null;

  const now = new Date();
  let startDate;

  switch (dateRangeFilter) {
    case '7d':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '30d':
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case '90d':
      startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    case 'ytd':
      startDate = new Date(now.getFullYear(), 0, 1);
      break;
    default:
      return null;
  }

  return { startDate, endDate: now };
}

// =============================================================================
// RENDERING
// =============================================================================

function renderPipelineTable() {
  const tbody = $('#selling-tbody');
  if (!tbody) return;

  // Filter data
  let filtered = pipelineData;

  // Filter by status
  if (filterStatus) {
    filtered = filtered.filter(item => item.status === filterStatus);
  }

  // Filter by platform (only for sold items)
  if (filterPlatform && filterPlatform !== 'all') {
    filtered = filtered.filter(item =>
      item.status === 'sold' && item.sold_platform === filterPlatform
    );
  }

  // Filter by search
  if (searchTerm) {
    filtered = filtered.filter(item => {
      const title = (item.title || '').toLowerCase();
      const brand = (item.brand || '').toLowerCase();
      const description = (item.description || '').toLowerCase();
      return title.includes(searchTerm) || brand.includes(searchTerm) || description.includes(searchTerm);
    });
  }

  // Sort data
  filtered.sort((a, b) => {
    let aVal, bVal;

    switch (sortColumn) {
      case 'title':
        aVal = (a.title || '').toLowerCase();
        bVal = (b.title || '').toLowerCase();
        break;
      case 'category':
        aVal = a.category || '';
        bVal = b.category || '';
        break;
      case 'status':
        aVal = PIPELINE_STATUSES.indexOf(a.status);
        bVal = PIPELINE_STATUSES.indexOf(b.status);
        break;
      case 'purchase_price':
        aVal = a.purchase_price || 0;
        bVal = b.purchase_price || 0;
        break;
      case 'sold_price':
        aVal = a.sold_price || 0;
        bVal = b.sold_price || 0;
        break;
      case 'profit':
        aVal = calculateProfit(a).profit;
        bVal = calculateProfit(b).profit;
        break;
      case 'sold_platform':
        aVal = a.sold_platform || '';
        bVal = b.sold_platform || '';
        break;
      default:
        aVal = a.created_at;
        bVal = b.created_at;
    }

    if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  // Render rows
  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="empty-state">
          <div class="empty-icon">💰</div>
          <p>No items in pipeline</p>
        </td>
      </tr>
    `;
  } else {
    tbody.innerHTML = filtered.map(item => renderPipelineRow(item)).join('');
  }

  // Update count
  const countEl = $('#selling-count');
  if (countEl) {
    countEl.textContent = `Showing ${filtered.length} of ${pipelineData.length} items`;
  }
}

function renderPipelineRow(item) {
  const { profit, margin } = calculateProfit(item);
  const { formatted: profitDisplay, className: profitClass } = formatProfitDisplay(profit);

  const cost = (item.purchase_price || 0) + (item.tax_paid || 0);
  const price = item.sold_price || item.estimated_resale_value || 0;
  const platform = item.sold_platform ? capitalize(item.sold_platform.replace('_', ' ')) : '-';

  // Determine action button
  let actionButton = '';
  if (item.status === 'confirmed_received') {
    actionButton = `<button class="btn btn--sm btn--primary mark-sold-btn" data-id="${item.id}">Mark sold</button>`;
  } else if (item.status !== 'sold') {
    const nextStatus = getNextStatus(item.status);
    if (nextStatus) {
      actionButton = `<button class="btn btn--sm status-next-btn" data-id="${item.id}" data-next-status="${nextStatus}">${capitalize(nextStatus.replace('_', ' '))}</button>`;
    }
  }

  return `
    <tr data-id="${item.id}">
      <td>
        <div class="item-title">${item.title || 'Untitled'}</div>
        ${item.brand ? `<div class="text-muted">${item.brand}</div>` : ''}
      </td>
      <td>${capitalize(item.category || '')}</td>
      <td><span class="status-badge status--${item.status}">${formatStatus(item.status)}</span></td>
      <td>${formatCurrency(cost)}</td>
      <td>${price > 0 ? formatCurrency(price) : '-'}</td>
      <td class="${profitClass}">${item.status === 'sold' ? profitDisplay : '-'}</td>
      <td>${platform}</td>
      <td class="table-actions">${actionButton}</td>
    </tr>
  `;
}

function getNextStatus(currentStatus) {
  const statusOrder = [
    'unlisted',
    'photographed',
    'listed',
    'pending_sale',
    'packaged',
    'shipped',
    'confirmed_received'
  ];

  const currentIndex = statusOrder.indexOf(currentStatus);
  if (currentIndex === -1 || currentIndex === statusOrder.length - 1) {
    return null;
  }

  return statusOrder[currentIndex + 1];
}

// =============================================================================
// MARK AS SOLD MODAL
// =============================================================================

const markSoldModal = createModalController($('#mark-sold-dialog'));

export async function openMarkAsSoldModal(itemId) {
  const item = await getInventoryItem(itemId);
  if (!item) {
    showToast('Item not found', 'error');
    return;
  }

  currentSoldItem = item;

  // Populate form
  $('#sold-item-id').value = itemId;
  $('#sold-item-title').textContent = item.title || 'Untitled';
  $('#sold-date').value = new Date().toISOString().split('T')[0];
  $('#sold-price').value = item.estimated_resale_value || '';
  $('#sold-platform').value = '';
  $('#shipping-cost').value = '';
  $('#platform-fees').value = '';

  updateProfitPreview();
  markSoldModal.open();
}

function updateProfitPreview() {
  if (!currentSoldItem) return;

  const soldPrice = parseFloat($('#sold-price').value) || 0;
  const shippingCost = parseFloat($('#shipping-cost').value) || 0;
  const platformFees = parseFloat($('#platform-fees').value) || 0;

  const purchaseCost = (currentSoldItem.purchase_price || 0) + (currentSoldItem.tax_paid || 0);
  const repairCosts = currentSoldItem.repairs_completed?.reduce((sum, r) => sum + (r.repair_cost || 0), 0) || 0;
  const expenses = shippingCost + platformFees;
  const totalCost = purchaseCost + repairCosts;
  const profit = soldPrice - totalCost - expenses;

  // Update summary
  $('#summary-price').textContent = formatCurrency(soldPrice);
  $('#summary-cost').textContent = formatCurrency(totalCost);
  $('#summary-expenses').textContent = formatCurrency(expenses);

  const profitEl = $('#summary-profit');
  const { formatted, className } = formatProfitDisplay(profit);
  profitEl.textContent = formatted;
  profitEl.className = `${className}`;
}

async function handleMarkAsSoldSubmit(e) {
  e.preventDefault();

  const formData = new FormData(e.target);
  const soldData = {
    sold_date: formData.get('sold_date'),
    sold_price: parseFloat(formData.get('sold_price')),
    sold_platform: formData.get('sold_platform'),
    shipping_cost: parseFloat(formData.get('shipping_cost')) || 0,
    platform_fees: parseFloat(formData.get('platform_fees')) || 0
  };

  const itemId = parseInt(formData.get('item_id'));

  try {
    await markItemAsSold(itemId, soldData);
    showToast('Item marked as sold', 'success');
    markSoldModal.close();
    await loadPipeline();
    await renderAnalytics();
    currentSoldItem = null;
  } catch (err) {
    console.error('Failed to mark item as sold:', err);
    showToast('Failed to mark item as sold', 'error');
  }
}

// =============================================================================
// STATUS UPDATES
// =============================================================================

async function updateItemStatus(itemId, newStatus) {
  try {
    await updateInventoryItem(itemId, { status: newStatus });
    showToast(`Status updated to ${formatStatus(newStatus)}`, 'success');
    await loadPipeline();
  } catch (err) {
    console.error('Failed to update status:', err);
    showToast('Failed to update status', 'error');
  }
}
