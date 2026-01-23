// =============================================================================
// SELLING MODULE
// =============================================================================

import {
  getInventoryInPipeline,
  getItemsNotInPipeline,
  markItemAsSold,
  getInventoryItem,
  updateInventoryItem,
  archiveItem
} from './db.js';
import { showToast } from './ui.js';
import {
  $,
  formatCurrency,
  capitalize,
  formatStatus,
  calculateProfit,
  formatProfitDisplay,
  renderProfitWaterfall,
  escapeHtml,
  createFormHandler,
  getItemTitle
} from './utils.js';
import {
  RESALE_PLATFORMS,
  PIPELINE_STATUSES,
  getStatusSortOrder,
  CARRIER_TRACKING_URLS,
  REQUIRED_PHOTO_TYPES,
  CONDITIONS_REQUIRING_FLAWS
} from './config.js';
import { getAttachmentsByItem, createAttachment } from './db.js';
import { openViewItemModal, openEditItemModal } from './inventory.js';
import { openPhotoManager } from './photos.js';
import { initFees, calculatePlatformFees, calculateEstimatedReturns } from './fees.js';
import { show, hide, createLazyModal, createTableController } from './components.js';

// =============================================================================
// STATE
// =============================================================================

let pipelineData = [];
let nonPipelineData = [];
let archiveData = [];
let pipelineTableCtrl = null;
let archiveTableCtrl = null;
let currentSoldItem = null;
let currentShipItem = null;
let currentPhotoItem = null;
let currentListedItem = null;
let currentDeliveryItem = null;
let feesManuallyEdited = false;
let currentFeeResult = null; // Track fee calculation result for waterfall display
let pendingDeliveryScreenshot = null;
let isValidatingPhotos = false; // Guard against recursive photo validation calls

// =============================================================================
// VALIDATION FUNCTIONS
// =============================================================================

/**
 * Validate item has required data before entering the selling pipeline.
 * @param {Object} item - Inventory item
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validatePipelineEntry(item) {
  const errors = [];

  if (!item.brand) {
    errors.push('Brand is required');
  }
  if (!item.category?.secondary) {
    errors.push('Item type is required');
  }
  if (!item.colour?.primary) {
    errors.push('Primary colour is required');
  }
  if (!item.condition?.overall_condition) {
    errors.push('Condition is required');
  }
  if (!item.material?.primary) {
    errors.push('Primary material is required');
  }

  // Check for sizing (labeled_size OR at least one measurement)
  const hasMeasurements = item.size?.measurements && Object.values(item.size.measurements).some(v => v && v > 0);
  if (!item.size?.label?.value && !hasMeasurements) {
    errors.push('Size (labeled or measurements) is required');
  }

  // If condition warrants flaws, require them
  if (CONDITIONS_REQUIRING_FLAWS.includes(item.condition?.overall_condition)) {
    if (!item.condition?.flaws || item.condition.flaws.length === 0) {
      errors.push(`Flaws must be documented for "${item.condition.overall_condition}" condition`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate that required photos exist for an item.
 * @param {Object} item - Inventory item
 * @param {Array} attachments - Item attachments
 * @returns {{ valid: boolean, missing: string[] }}
 */
export function validatePhotosComplete(item, attachments) {
  const missing = [];

  // Get photo types from attachments
  const existingTypes = new Set(
    attachments
      .filter(a => a.type)
      .map(a => a.type)
  );

  // Check required types
  for (const requiredType of REQUIRED_PHOTO_TYPES) {
    if (!existingTypes.has(requiredType)) {
      missing.push(requiredType);
    }
  }

  // Check flaw photos if item has flaws
  if (item.condition?.flaws && item.condition.flaws.length > 0) {
    if (!existingTypes.has('flaw')) {
      missing.push('flaw');
    }
  }

  return { valid: missing.length === 0, missing };
}

/**
 * Validate listing data for the listed transition.
 * @param {Object} data - Form data object
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateListingData(data) {
  const errors = [];

  if (!data.list_platform) {
    errors.push('Platform is required');
  }
  if (!data.list_date) {
    errors.push('List date is required');
  }
  if (!data.listed_price || data.listed_price <= 0) {
    errors.push('Listed price is required');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate shipping data for the shipped transition.
 * @param {Object} data - Form data object
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateShippingData(data) {
  const errors = [];

  if (!data.recipient_address || data.recipient_address.trim() === '') {
    errors.push('Recipient address is required');
  }
  if (!data.shipping_carrier) {
    errors.push('Carrier is required');
  }
  if (!data.tracking_number || data.tracking_number.trim() === '') {
    errors.push('Tracking number is required');
  }
  if (!data.ship_date) {
    errors.push('Ship date is required');
  }
  if (!data.estimated_delivery) {
    errors.push('Estimated delivery date is required');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate delivery confirmation data.
 * @param {Object} data - Form data object
 * @param {boolean} hasScreenshot - Whether a screenshot is attached
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateDeliveryConfirmation(data, hasScreenshot) {
  const errors = [];

  if (!data.received_date) {
    errors.push('Confirmation date is required');
  }
  if (!hasScreenshot) {
    errors.push('Delivery confirmation screenshot is required');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Generate tracking URL for a carrier.
 * @param {string} carrier - Carrier code
 * @param {string} trackingNumber - Tracking number
 * @returns {string|null} - Tracking URL or null if not available
 */
export function getTrackingUrl(carrier, trackingNumber) {
  const template = CARRIER_TRACKING_URLS[carrier];
  if (!template || !trackingNumber) return null;
  return template.replace('{tracking}', encodeURIComponent(trackingNumber));
}

// =============================================================================
// INITIALIZATION
// =============================================================================

export async function initSelling() {
  await initFees();
  setupTableController();
  setupArchiveTableController();
  await loadPipeline();
  setupEventHandlers();
}

export async function loadPipeline() {
  const allPipelineItems = await getInventoryInPipeline();
  // Separate archived items (confirmed_received) from active pipeline
  pipelineData = allPipelineItems.filter(item => item.metadata?.status !== 'confirmed_received');
  archiveData = allPipelineItems.filter(item => item.metadata?.status === 'confirmed_received');
  nonPipelineData = await getItemsNotInPipeline();
  if (pipelineTableCtrl) {
    pipelineTableCtrl.render();
  }
  if (archiveTableCtrl) {
    archiveTableCtrl.render();
  }
}

function updateItemCount(filteredData) {
  const countEl = $('#selling-count');
  if (countEl) {
    const totalItems = pipelineData.length + nonPipelineData.length;
    countEl.textContent = `Showing ${filteredData.length} of ${totalItems} items`;
  }
}

function setupTableController() {
  pipelineTableCtrl = createTableController({
    tableSelector: '#selling-table',
    tbodySelector: '#selling-tbody',
    getData: () => pipelineData,
    filterItem: (item, filters, search) => {
      // Filter by status
      if (filters.status && item.metadata?.status !== filters.status) return false;
      // Filter by platform (only for sold items)
      if (filters.platform && filters.platform !== 'all') {
        if (item.metadata?.status !== 'sold' || item.listing_status?.sold_platform !== filters.platform) return false;
      }
      // Filter by search
      if (search) {
        const title = getItemTitle(item).toLowerCase();
        const brand = (item.brand || '').toLowerCase();
        const description = (item.description || '').toLowerCase();
        return title.includes(search) || brand.includes(search) || description.includes(search);
      }
      return true;
    },
    getColumnValue: (item, col) => {
      switch (col) {
        case 'title': return getItemTitle(item).toLowerCase();
        case 'category': return item.category?.primary || '';
        case 'status': return getStatusSortOrder(item.metadata?.status);
        case 'purchase_price': return item.metadata?.acquisition?.price || 0;
        case 'sold_price': return item.listing_status?.sold_price || 0;
        case 'profit': return calculateProfit(item).profit;
        case 'sold_platform': return item.listing_status?.sold_platform || '';
        default: return item.metadata?.created;
      }
    },
    createRow: renderPipelineRow,
    emptyState: { colspan: 6, icon: '💰', message: 'No items in pipeline' },
    searchSelector: '#selling-search',
    defaultSort: { column: 'status', direction: 'asc' },
    filterSelects: [
      { selector: '#status-filter', key: 'status' },
      { selector: '#platform-filter', key: 'platform' }
    ],
    clickHandlers: {
      '.table-link': (el) => {
        openViewItemModal(el.dataset.id);
      },
      '.edit-item-btn': (el) => {
        openEditItemModal(el.dataset.id, {
          onSave: async () => {
            await loadPipeline();
          }
        });
      },
      '.mark-sold-btn': (el) => {
        openMarkAsSoldModal(el.dataset.id);
      },
      '.manage-photos-btn': (el) => {
        openPhotoUploadModal(el.dataset.id);
      },
      '.ready-to-list-btn': async (el) => {
        await updateItemStatus(el.dataset.id, 'unlisted');
        showToast('Item ready to list');
      },
      '.status-next-btn': (el) => {
        const itemId = el.dataset.id;
        const nextStatus = el.dataset.nextStatus;
        if (nextStatus === 'listed') {
          openMarkAsListedModal(itemId);
        } else if (nextStatus === 'shipped') {
          openShipItemModal(itemId);
        } else if (nextStatus === 'confirmed_received') {
          openConfirmDeliveryModal(itemId);
        } else {
          updateItemStatus(itemId, nextStatus);
        }
      },
      '.list-for-sale-btn': (el) => {
        listItemForSale(el.dataset.id);
      },
      '.delist-btn': (el) => {
        openDelistItemModal(el.dataset.id);
      },
      '.edit-listing-link': (el) => {
        openEditListingModal(el.dataset.id);
      }
    },
    onRender: updateItemCount
  }).init();
}

function setupArchiveTableController() {
  archiveTableCtrl = createTableController({
    tableSelector: '#archive-table',
    tbodySelector: '#archive-tbody',
    getData: () => archiveData,
    filterItem: (item, filters, search) => {
      if (search) {
        const title = getItemTitle(item).toLowerCase();
        const brand = (item.brand || '').toLowerCase();
        return title.includes(search) || brand.includes(search);
      }
      return true;
    },
    getColumnValue: (item, col) => {
      switch (col) {
        case 'title': return getItemTitle(item).toLowerCase();
        case 'sold_date': return item.listing_status?.sold_date || '';
        case 'sold_platform': return item.listing_status?.sold_platform || '';
        case 'profit': return calculateProfit(item).profit;
        default: return item.listing_status?.sold_date || item.metadata?.created;
      }
    },
    createRow: renderArchiveRow,
    emptyState: { colspan: 4, icon: '📦', message: 'No archived items' },
    searchSelector: '#archive-search',
    defaultSort: { column: 'sold_date', direction: 'desc' },
    clickHandlers: {
      '.table-link': (el) => {
        openViewItemModal(el.dataset.id);
      },
      '.edit-item-btn': (el) => {
        openEditItemModal(el.dataset.id, {
          onSave: async () => {
            await loadPipeline();
          }
        });
      }
    },
    onRender: (filteredData) => {
      const countEl = $('#archive-count');
      if (countEl) {
        countEl.textContent = `${filteredData.length} archived items`;
      }
    }
  }).init();
}

function renderArchiveRow(item) {
  const { profit } = calculateProfit(item);
  const { formatted: profitDisplay, className: profitClass } = formatProfitDisplay(profit);
  const soldDate = item.listing_status?.sold_date ? new Date(item.listing_status.sold_date).toLocaleDateString() : '-';
  const platform = item.listing_status?.sold_platform ? capitalize(item.listing_status.sold_platform.replace('_', ' ')) : '-';

  return `
    <tr data-id="${item.id}">
      <td>
        <a href="#" class="table-link" data-id="${item.id}">${escapeHtml(getItemTitle(item))}</a>
        <button class="btn-icon edit-item-btn" data-id="${item.id}" aria-label="Go to Collection">✏️</button>
      </td>
      <td data-label="Sold">${soldDate}</td>
      <td data-label="Platform">${platform}</td>
      <td data-label="Profit" class="${profitClass}">${profitDisplay}</td>
    </tr>
  `;
}

function setupEventHandlers() {
  // Ship item form
  createFormHandler({
    formSelector: '#ship-item-form',
    transform: (formData) => ({
      itemId: formData.get('item_id'),
      shipData: {
        metadata: { status: 'shipped' },
        listing_status: {
          recipient_address: formData.get('recipient_address'),
          shipping_carrier: formData.get('shipping_carrier'),
          tracking_number: formData.get('tracking_number'),
          ship_date: formData.get('ship_date'),
          estimated_delivery: formData.get('estimated_delivery'),
          shipping_cost: parseFloat(formData.get('shipping_cost')) || 0
        }
      }
    }),
    validate: (formData) => {
      const data = {
        recipient_address: formData.get('recipient_address'),
        shipping_carrier: formData.get('shipping_carrier'),
        tracking_number: formData.get('tracking_number'),
        ship_date: formData.get('ship_date'),
        estimated_delivery: formData.get('estimated_delivery')
      };
      return validateShippingData(data);
    },
    onSubmit: async ({ itemId, shipData }) => {
      await updateInventoryItem(itemId, shipData);
    },
    onSuccess: async () => {
      showToast('Item marked as shipped');
      shipItemModal.close();
      await loadPipeline();
      currentShipItem = null;
    },
    onError: (err) => showToast(err.message || 'Failed to ship item'),
    resetOnSuccess: false
  });

  // Mark-as-sold form
  createFormHandler({
    formSelector: '#mark-sold-form',
    transform: (formData) => ({
      itemId: formData.get('item_id'),
      soldData: {
        metadata: { status: 'shipped' },
        listing_status: {
          sold_date: formData.get('sold_date'),
          sold_price: parseFloat(formData.get('sold_price')),
          sold_platform: formData.get('sold_platform'),
          purchaser_username: formData.get('purchaser_username') || null,
          shipping_cost: parseFloat(formData.get('shipping_cost')) || 0,
          platform_fees: parseFloat(formData.get('platform_fees')) || 0,
          recipient_address: formData.get('recipient_address') || null,
          tracking_url: formData.get('tracking_url') || null,
          ship_date: formData.get('sold_date') // Use sale date as ship date
        }
      }
    }),
    onSubmit: async ({ itemId, soldData }) => {
      await updateInventoryItem(itemId, soldData);
    },
    onSuccess: async () => {
      showToast('Item marked as sold and shipped');
      markSoldModal.close();
      await loadPipeline();
      currentSoldItem = null;
    },
    onError: () => showToast('Failed to mark item as sold'),
    resetOnSuccess: false
  });

  // Mark-as-listed form
  createFormHandler({
    formSelector: '#mark-listed-form',
    transform: (formData) => ({
      itemId: formData.get('item_id'),
      listingData: {
        metadata: { status: 'listed' },
        listing_status: {
          list_platform: formData.get('list_platform'),
          list_date: formData.get('list_date'),
          listed_price: parseFloat(formData.get('listed_price')),
          listing_url: formData.get('listing_url') || null
        }
      }
    }),
    validate: (formData) => {
      const data = {
        list_platform: formData.get('list_platform'),
        list_date: formData.get('list_date'),
        listed_price: parseFloat(formData.get('listed_price'))
      };
      return validateListingData(data);
    },
    onSubmit: async ({ itemId, listingData }) => {
      await updateInventoryItem(itemId, listingData);
    },
    onSuccess: async () => {
      showToast('Item marked as listed');
      markAsListedModal.close();
      await loadPipeline();
      currentListedItem = null;
    },
    onError: (err) => showToast(err.message || 'Failed to mark item as listed'),
    resetOnSuccess: false
  });

  // Mark-sold form real-time listeners
  const markSoldForm = $('#mark-sold-form');
  if (markSoldForm) {
    // Real-time profit preview
    const priceInputs = ['#sold-price', '#shipping-cost', '#platform-fees'];
    priceInputs.forEach(selector => {
      const input = $(selector);
      if (input) {
        input.addEventListener('input', updateProfitPreview);
      }
    });

    // Auto-calculate fees when platform or price changes
    const soldPriceInput = $('#sold-price');
    const soldPlatformSelect = $('#sold-platform');
    const platformFeesInput = $('#platform-fees');

    if (soldPriceInput) {
      soldPriceInput.addEventListener('input', () => {
        if (!feesManuallyEdited) {
          updateFeeCalculation();
        }
      });
    }

    if (soldPlatformSelect) {
      soldPlatformSelect.addEventListener('change', () => {
        if (!feesManuallyEdited) {
          updateFeeCalculation();
        }
      });
    }

    // Track manual edits to platform fees
    if (platformFeesInput) {
      platformFeesInput.addEventListener('input', () => {
        feesManuallyEdited = true;
        show('#reset-fees-btn');
      });
    }

    // Reset fees button
    const resetFeesBtn = $('#reset-fees-btn');
    if (resetFeesBtn) {
      resetFeesBtn.addEventListener('click', (e) => {
        e.preventDefault();
        feesManuallyEdited = false;
        hide(resetFeesBtn);
        updateFeeCalculation();
      });
    }
  }

  // Validation error modal - edit button
  const validationEditBtn = $('#validation-edit-btn');
  if (validationEditBtn) {
    validationEditBtn.addEventListener('click', () => {
      const itemId = validationEditBtn.dataset.id;
      validationErrorModal.close();
      openEditItemModal(itemId, {
        onSave: async () => {
          await loadPipeline();
        }
      });
    });
  }

  // Photo upload form handlers
  const photoUploadInput = $('#photo-upload-input');
  const photoTypeSelect = $('#photo-type-select');
  if (photoUploadInput && photoTypeSelect) {
    photoUploadInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      const photoType = photoTypeSelect.value;
      if (file && photoType) {
        await handlePhotoUpload(file, photoType);
        photoUploadInput.value = '';
      }
    });
  }

  const photoCompleteBtn = $('#photo-complete-btn');
  if (photoCompleteBtn) {
    photoCompleteBtn.addEventListener('click', completePhotoUpload);
  }

  // Delivery confirmation form handlers
  const deliveryScreenshotInput = $('#delivery-screenshot-input');
  if (deliveryScreenshotInput) {
    deliveryScreenshotInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        handleDeliveryScreenshot(file);
      }
    });
  }

  const deliveryConfirmBtn = $('#delivery-confirm-btn');
  if (deliveryConfirmBtn) {
    deliveryConfirmBtn.addEventListener('click', completeDeliveryConfirmation);
  }

  // Delist confirmation handlers
  const delistConfirmBtn = $('#delist-confirm-btn');
  if (delistConfirmBtn) {
    delistConfirmBtn.addEventListener('click', delistItem);
  }

  const delistCancelBtn = $('#delist-cancel-btn');
  if (delistCancelBtn) {
    delistCancelBtn.addEventListener('click', () => {
      const dialog = document.getElementById('delist-item-dialog');
      if (dialog) dialog.close();
    });
  }
}

// =============================================================================
// RENDERING
// =============================================================================

function renderPipelineRow(item) {
  const { profit, margin } = calculateProfit(item);
  const { formatted: profitDisplay, className: profitClass } = formatProfitDisplay(profit);
  const status = item.metadata?.status;

  const price = item.listing_status?.sold_price || item.listing_status?.listed_price || item.pricing?.estimated_resale_value || 0;
  const selectedPlatform = item.listing_status?.sold_platform || item.listing_status?.list_platform;
  const platformName = selectedPlatform ? capitalize(selectedPlatform.replace('_', ' ')) : '-';

  // Platform display: link to listing if URL exists, with edit option for listed items
  let platformDisplay = platformName;
  const canEditListing = status === 'listed' || item.listing_status?.list_platform;
  if (item.listing_status?.listing_url) {
    platformDisplay = `<a href="${escapeHtml(item.listing_status.listing_url)}" target="_blank" rel="noopener">${platformName}</a>`;
    if (canEditListing) {
      platformDisplay += ` <button class="btn-icon edit-listing-link" data-id="${item.id}" aria-label="Edit listing">✏️</button>`;
    }
  } else if (canEditListing) {
    platformDisplay = `<a href="#" class="edit-listing-link" data-id="${item.id}">${platformName}</a>`;
  }

  // Calculate estimated return only when platform is selected
  let estReturnHtml = '-';
  if (status !== 'sold' && item.pricing?.estimated_resale_value > 0 && selectedPlatform) {
    const estimates = calculateEstimatedReturns(item);
    const platformEstimate = estimates.find(e => e.platformId === selectedPlatform);
    if (platformEstimate) {
      const profitClass = platformEstimate.profit >= 0 ? 'value--positive' : 'value--negative';
      estReturnHtml = `<span class="${profitClass}">${formatCurrency(platformEstimate.profit)}</span>`;
    }
  }

  // Descriptive labels for next step
  const nextStepLabels = {
    'needs_photo': 'Add photos',
    'unlisted': 'List item',
    'listed': 'Mark sold',
    'shipped': 'Confirm receipt'
  };
  const nextStepDisplay = nextStepLabels[status] || '-';

  // Determine action button
  let actionButton = '';
  const isInPipeline = PIPELINE_STATUSES.includes(status);

  if (!isInPipeline) {
    actionButton = `<button class="btn btn--sm btn--cta list-for-sale-btn" data-id="${item.id}">List for sale</button>`;
  } else if (status === 'needs_photo') {
    // Two buttons: manage photos + advance when ready
    actionButton = `
      <button class="btn btn--sm btn--cta manage-photos-btn" data-id="${item.id}">Photos</button>
      <button class="btn btn--sm btn--ghost ready-to-list-btn" data-id="${item.id}">Ready to list</button>
    `;
  } else if (status === 'listed') {
    actionButton = `<button class="btn btn--sm btn--cta mark-sold-btn" data-id="${item.id}">Mark sold</button>`;
  } else if (status === 'shipped') {
    actionButton = `<button class="btn btn--sm btn--cta status-next-btn" data-id="${item.id}" data-next-status="confirmed_received">Confirm receipt</button>`;
  } else {
    const nextStatus = getNextStatus(status);
    if (nextStatus) {
      const label = nextStepLabels[status] || capitalize(nextStatus.replace('_', ' '));
      actionButton = `<button class="btn btn--sm btn--cta status-next-btn" data-id="${item.id}" data-next-status="${nextStatus}">${label}</button>`;
    }
  }

  // Delist button - only for pre-sold pipeline statuses
  const delistableStatuses = ['needs_photo', 'unlisted', 'listed'];
  const delistButton = delistableStatuses.includes(status)
    ? `<button class="btn btn--sm btn--ghost delist-btn" data-id="${item.id}">Don't sell</button>`
    : '';

  return `
    <tr data-id="${item.id}">
      <td>
        <a href="#" class="table-link" data-id="${item.id}">${escapeHtml(getItemTitle(item))}</a>
        <button class="btn-icon edit-item-btn" data-id="${item.id}" aria-label="Go to Collection">✏️</button>
      </td>
      <td data-label="Next">${actionButton}${delistButton}</td>
      <td data-label="Price">${price > 0 ? formatCurrency(price) : '-'}</td>
      <td data-label="Est.&#10;Return">${estReturnHtml}</td>
      <td data-label="Platform">${platformDisplay}</td>
      <td data-label="Profit"${status === 'sold' ? ` class="${profitClass}"` : ''}>${status === 'sold' ? profitDisplay : '-'}</td>
    </tr>
  `;
}

function getNextStatus(currentStatus) {
  const statusOrder = [
    'needs_photo',
    'unlisted',
    'listed',
    'sold',
    'packaged',
    'shipped',
    'confirmed_received'
  ];

  const currentIndex = statusOrder.indexOf(currentStatus);
  if (currentIndex === -1 || currentIndex === statusOrder.length - 1) {
    return null;
  }

  // Skip 'sold' - that's handled by the Mark Sold modal
  const nextStatus = statusOrder[currentIndex + 1];
  if (nextStatus === 'sold') {
    return null; // Mark sold button is shown instead
  }

  return nextStatus;
}

// =============================================================================
// MARK AS SOLD MODAL
// =============================================================================

const markSoldModal = createLazyModal('#mark-sold-dialog', {
  onOpen: (dialog, { item }) => {
    currentSoldItem = item;
    feesManuallyEdited = false;

    // Populate form
    const itemIdInput = dialog.querySelector('#sold-item-id');
    const titleEl = dialog.querySelector('#sold-item-title');
    const dateInput = dialog.querySelector('#sold-date');
    const priceInput = dialog.querySelector('#sold-price');
    const platformSelect = dialog.querySelector('#sold-platform');
    const purchaserInput = dialog.querySelector('#purchaser-username');
    const shippingInput = dialog.querySelector('#shipping-cost');
    const feesInput = dialog.querySelector('#platform-fees');
    const addressInput = dialog.querySelector('#sold-recipient-address');
    const trackingInput = dialog.querySelector('#sold-tracking-url');

    if (itemIdInput) itemIdInput.value = item.id;

    // Set up title link to open view modal
    if (titleEl) {
      titleEl.textContent = getItemTitle(item);
      titleEl.onclick = (e) => {
        e.preventDefault();
        markSoldModal.close();
        openViewItemModal(item.id);
      };
    }

    if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
    // Pre-populate price from listing price if available
    if (priceInput) priceInput.value = item.listing_status?.listed_price || item.pricing?.estimated_resale_value || '';
    // Pre-populate platform from listing platform if available
    if (platformSelect) platformSelect.value = item.listing_status?.list_platform || '';
    if (purchaserInput) purchaserInput.value = item.listing_status?.purchaser_username || '';
    if (shippingInput) shippingInput.value = '';
    if (feesInput) feesInput.value = '';
    if (addressInput) addressInput.value = '';
    if (trackingInput) trackingInput.value = '';

    // Reset fee state
    hide('#reset-fees-btn');
    currentFeeResult = null;

    updateFeeCalculation();
  }
});

export async function openMarkAsSoldModal(itemId) {
  const item = await getInventoryItem(itemId);
  if (!item) {
    showToast('Item not found');
    return;
  }

  markSoldModal.open({ item });
}

function updateProfitPreview() {
  if (!currentSoldItem) return;

  const soldPrice = parseFloat($('#sold-price').value) || 0;
  const shippingCost = parseFloat($('#shipping-cost').value) || 0;
  const platformFees = parseFloat($('#platform-fees').value) || 0;

  const purchasePrice = currentSoldItem.metadata?.acquisition?.price || 0;
  const taxPaid = currentSoldItem.metadata?.acquisition?.tax_paid || 0;
  const repairCosts = currentSoldItem.condition?.repairs_completed?.reduce((sum, r) => sum + (r.repair_cost || 0), 0) || 0;

  // Cost includes everything you spent: purchase + tax + repairs + shipping
  const costBasis = purchasePrice + taxPaid + repairCosts + shippingCost;
  // Payout is what you receive after platform fees
  const payout = soldPrice - platformFees;
  // Profit is payout minus your costs
  const profit = payout - costBasis;

  // Update flow header values
  const flowSale = $('#flow-sale');
  const flowFees = $('#flow-fees');
  const flowPayout = $('#flow-payout');
  const flowCost = $('#flow-cost');
  const flowProfit = $('#flow-profit');

  if (flowSale) flowSale.textContent = formatCurrency(soldPrice);
  if (flowFees) flowFees.textContent = formatCurrency(-platformFees);
  if (flowPayout) flowPayout.textContent = formatCurrency(payout);
  if (flowCost) flowCost.textContent = formatCurrency(-costBasis);

  if (flowProfit) {
    flowProfit.textContent = formatCurrency(profit);
    flowProfit.classList.remove('value--positive', 'value--negative');
    flowProfit.classList.add(profit >= 0 ? 'value--positive' : 'value--negative');
  }
}

function updateFeeCalculation() {
  const platform = $('#sold-platform').value;
  const salePrice = parseFloat($('#sold-price').value) || 0;

  if (!platform || !salePrice) {
    currentFeeResult = null;
    updateProfitPreview();
    return;
  }

  const result = calculatePlatformFees(platform, salePrice);
  if (result) {
    $('#platform-fees').value = result.totalFees.toFixed(2);
    currentFeeResult = result;
  } else {
    currentFeeResult = null;
  }
  updateProfitPreview();
}

// =============================================================================
// STATUS UPDATES
// =============================================================================

async function updateItemStatus(itemId, newStatus) {
  try {
    await updateInventoryItem(itemId, { metadata: { status: newStatus } });
    showToast(`Status updated to ${formatStatus(newStatus)}`);
    await loadPipeline();
  } catch (err) {
    console.error('Failed to update status:', err);
    showToast('Failed to update status');
  }
}

// =============================================================================
// SHIP ITEM MODAL
// =============================================================================

const shipItemModal = createLazyModal('#ship-item-dialog', {
  onOpen: (dialog, { item }) => {
    currentShipItem = item;

    // Populate form
    const itemIdInput = dialog.querySelector('#ship-item-id');
    const titleEl = dialog.querySelector('#ship-item-title');
    const dateInput = dialog.querySelector('#ship-date');
    const carrierSelect = dialog.querySelector('#shipping-carrier');
    const trackingInput = dialog.querySelector('#tracking-number');
    const shippingCostInput = dialog.querySelector('#ship-shipping-cost');

    if (itemIdInput) itemIdInput.value = item.id;
    if (titleEl) titleEl.textContent = getItemTitle(item);
    if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
    if (carrierSelect) carrierSelect.value = '';
    if (trackingInput) trackingInput.value = '';
    if (shippingCostInput) shippingCostInput.value = item.listing_status?.shipping_cost || '';
  }
});

async function openShipItemModal(itemId) {
  const item = await getInventoryItem(itemId);
  if (!item) {
    showToast('Item not found');
    return;
  }

  shipItemModal.open({ item });
}

// =============================================================================
// LIST FOR SALE (with validation)
// =============================================================================

async function listItemForSale(itemId) {
  try {
    const item = await getInventoryItem(itemId);
    if (!item) {
      showToast('Item not found');
      return;
    }

    // Validate item before entering pipeline
    const validation = validatePipelineEntry(item);
    if (!validation.valid) {
      openValidationErrorModal(item, validation.errors);
      return;
    }

    // Enter pipeline at needs_photo status
    await updateInventoryItem(itemId, { metadata: { status: 'needs_photo' } });
    showToast('Item added to selling pipeline');
    await loadPipeline();
  } catch (err) {
    console.error('Failed to list item for sale:', err);
    showToast('Failed to list item for sale');
  }
}

// =============================================================================
// VALIDATION ERROR MODAL
// =============================================================================

const validationErrorModal = createLazyModal('#validation-error-dialog', {
  onOpen: (dialog, { item, errors }) => {
    const titleEl = dialog.querySelector('#validation-error-title');
    const listEl = dialog.querySelector('#validation-error-list');
    const editBtn = dialog.querySelector('#validation-edit-btn');

    if (titleEl) titleEl.textContent = getItemTitle(item);
    if (listEl) {
      listEl.innerHTML = errors.map(err => `<li>${escapeHtml(err)}</li>`).join('');
    }
    if (editBtn) {
      editBtn.dataset.id = item.id;
    }
  }
});

function openValidationErrorModal(item, errors) {
  validationErrorModal.open({ item, errors });
}

// =============================================================================
// PHOTO UPLOAD MODAL
// =============================================================================

let pendingPhotos = [];

const photoUploadModal = createLazyModal('#photo-upload-dialog', {
  onOpen: async (dialog, { item, attachments }) => {
    currentPhotoItem = item;
    pendingPhotos = [];

    const titleEl = dialog.querySelector('#photo-upload-title');
    const gridEl = dialog.querySelector('#photo-requirements-grid');
    const previewEl = dialog.querySelector('#photo-preview-grid');
    const completeBtn = dialog.querySelector('#photo-complete-btn');

    if (titleEl) titleEl.textContent = getItemTitle(item);

    // Determine required photo types
    const requiredTypes = [...REQUIRED_PHOTO_TYPES];
    if (item.condition?.flaws && item.condition.flaws.length > 0) {
      requiredTypes.push('flaw');
    }

    // Check which types exist
    const existingTypes = new Set(attachments.filter(a => a.type).map(a => a.type));

    if (gridEl) {
      gridEl.innerHTML = requiredTypes.map(type => {
        const hasType = existingTypes.has(type);
        const icon = hasType ? '✓' : '✗';
        const className = hasType ? 'photo-req--complete' : 'photo-req--missing';
        return `<div class="photo-req ${className}" data-type="${type}">
          <span class="photo-req-icon">${icon}</span>
          <span class="photo-req-label">${capitalize(type)}</span>
        </div>`;
      }).join('');
    }

    if (previewEl) previewEl.innerHTML = '';
    updatePhotoCompleteBtn(completeBtn, requiredTypes, existingTypes);
  },
  onClose: () => {
    pendingPhotos = [];
    currentPhotoItem = null;
  }
});

async function openPhotoUploadModal(itemId) {
  const item = await getInventoryItem(itemId);
  if (!item) {
    showToast('Item not found');
    return;
  }

  // Always open photo manager - user controls when to advance
  await openPhotoManager(itemId, {
    onComplete: async () => {
      await loadPipeline();
    }
  });
}

function updatePhotoCompleteBtn(btn, requiredTypes, existingTypes) {
  if (!btn) return;
  const allComplete = requiredTypes.every(type => existingTypes.has(type));
  btn.disabled = !allComplete;
}

async function handlePhotoUpload(file, photoType) {
  if (!currentPhotoItem) return;

  try {
    // Compress image
    const compressedBlob = await compressImage(file);
    const filename = `${photoType}_${file.name}`;

    // Save attachment
    await createAttachment(
      currentPhotoItem.id,
      filename,
      compressedBlob,
      'image/jpeg',
      photoType
    );

    // Refresh modal
    const attachments = await getAttachmentsByItem(currentPhotoItem.id);
    const dialog = photoUploadModal.dialog;
    if (dialog) {
      photoUploadModal.close();
      photoUploadModal.open({ item: currentPhotoItem, attachments });
    }

    showToast(`${capitalize(photoType)} photo saved`);
  } catch (err) {
    console.error('Failed to upload photo:', err);
    showToast('Failed to save photo');
  }
}

async function completePhotoUpload() {
  if (!currentPhotoItem) return;

  try {
    await updateInventoryItem(currentPhotoItem.id, { metadata: { status: 'unlisted' } });
    showToast('Photos complete - item ready to list');
    photoUploadModal.close();
    await loadPipeline();
    currentPhotoItem = null;
  } catch (err) {
    console.error('Failed to complete photo upload:', err);
    showToast('Failed to update item');
  }
}

// Simple image compression
async function compressImage(file, maxWidth = 1200, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;

      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(resolve, 'image/jpeg', quality);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

// =============================================================================
// PHOTO REQUIRED MODAL
// =============================================================================

const photoRequiredModal = createLazyModal('#photo-required-dialog', {
  onOpen: (dialog, { item, missing, onAddPhotos }) => {
    const titleEl = dialog.querySelector('#photo-required-title');
    const listEl = dialog.querySelector('#photo-required-list');
    const addBtn = dialog.querySelector('#photo-required-add');
    const cancelBtn = dialog.querySelector('#photo-required-cancel');

    if (titleEl) titleEl.textContent = getItemTitle(item);
    if (listEl) {
      listEl.innerHTML = missing.map(type => `<li>${capitalize(type)}</li>`).join('');
    }

    // Set up button handlers (clone to remove old listeners)
    if (addBtn) {
      const newAddBtn = addBtn.cloneNode(true);
      addBtn.parentNode.replaceChild(newAddBtn, addBtn);
      newAddBtn.addEventListener('click', () => {
        photoRequiredModal.close();
        if (onAddPhotos) onAddPhotos();
      });
    }

    if (cancelBtn) {
      const newCancelBtn = cancelBtn.cloneNode(true);
      cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
      newCancelBtn.addEventListener('click', () => {
        photoRequiredModal.close();
      });
    }
  }
});

function showPhotoRequiredModal(item, missing, onAddPhotos) {
  photoRequiredModal.open({ item, missing, onAddPhotos });
}

// =============================================================================
// MARK AS LISTED MODAL
// =============================================================================

const markAsListedModal = createLazyModal('#mark-listed-dialog', {
  onOpen: (dialog, { item }) => {
    currentListedItem = item;

    const itemIdInput = dialog.querySelector('#listed-item-id');
    const titleEl = dialog.querySelector('#listed-item-title');
    const dateInput = dialog.querySelector('#list-date');
    const platformSelect = dialog.querySelector('#list-platform');
    const priceInput = dialog.querySelector('#listed-price');
    const urlInput = dialog.querySelector('#listing-url');

    if (itemIdInput) itemIdInput.value = item.id;
    if (titleEl) titleEl.textContent = getItemTitle(item);
    // Pre-populate with existing values if editing, otherwise use defaults
    if (dateInput) dateInput.value = item.listing_status?.list_date || new Date().toISOString().split('T')[0];
    if (platformSelect) platformSelect.value = item.listing_status?.list_platform || '';
    if (priceInput) priceInput.value = item.listing_status?.listed_price || item.pricing?.estimated_resale_value || '';
    if (urlInput) urlInput.value = item.listing_status?.listing_url || '';
  },
  onClose: () => {
    currentListedItem = null;
  }
});

async function openMarkAsListedModal(itemId, options = {}) {
  const { skipValidation = false } = options;

  // Guard against recursive calls from photo validation callbacks
  if (isValidatingPhotos) {
    return;
  }

  const item = await getInventoryItem(itemId);
  if (!item) {
    showToast('Item not found');
    return;
  }

  // Skip validation if editing an already-listed item
  if (!skipValidation && item.metadata?.status !== 'listed') {
    // Validate photos before allowing listing
    const attachments = await getAttachmentsByItem(itemId);
    const photoValidation = validatePhotosComplete(item, attachments);

    if (!photoValidation.valid) {
      isValidatingPhotos = true;
      // Show photo required modal
      showPhotoRequiredModal(item, photoValidation.missing, async () => {
        await openPhotoManager(itemId, {
          onComplete: async (status) => {
            isValidatingPhotos = false;
            if (status.complete) {
              // Re-attempt listing after photos complete
              await openMarkAsListedModal(itemId, { skipValidation: true });
            }
          }
        });
      });
      return;
    }
  }

  isValidatingPhotos = false;
  markAsListedModal.open({ item });
}

async function openEditListingModal(itemId) {
  await openMarkAsListedModal(itemId, { skipValidation: true });
}

// =============================================================================
// CONFIRM DELIVERY MODAL
// =============================================================================

const confirmDeliveryModal = createLazyModal('#confirm-delivery-dialog', {
  onOpen: (dialog, { item }) => {
    currentDeliveryItem = item;
    pendingDeliveryScreenshot = null;

    const itemIdInput = dialog.querySelector('#delivery-item-id');
    const titleEl = dialog.querySelector('#delivery-item-title');
    const dateInput = dialog.querySelector('#received-date');
    const trackingLinkEl = dialog.querySelector('#tracking-link');
    const previewEl = dialog.querySelector('#delivery-screenshot-preview');
    const confirmBtn = dialog.querySelector('#delivery-confirm-btn');

    if (itemIdInput) itemIdInput.value = item.id;
    if (titleEl) titleEl.textContent = getItemTitle(item);
    if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];

    // Show tracking URL if available
    if (trackingLinkEl) {
      // Prefer direct tracking_url, fall back to generated URL
      const url = item.listing_status?.tracking_url || getTrackingUrl(item.listing_status?.shipping_carrier, item.listing_status?.tracking_number);
      if (url) {
        trackingLinkEl.href = url;
        trackingLinkEl.textContent = item.listing_status?.tracking_url ? 'View tracking' : `Track on ${capitalize(item.listing_status?.shipping_carrier || 'carrier')}`;
        show(trackingLinkEl);
      } else {
        hide(trackingLinkEl);
      }
    }

    if (previewEl) previewEl.innerHTML = '';
    if (confirmBtn) confirmBtn.disabled = true;
  },
  onClose: () => {
    currentDeliveryItem = null;
    pendingDeliveryScreenshot = null;
  }
});

async function openConfirmDeliveryModal(itemId) {
  const item = await getInventoryItem(itemId);
  if (!item) {
    showToast('Item not found');
    return;
  }

  confirmDeliveryModal.open({ item });
}

function handleDeliveryScreenshot(file) {
  pendingDeliveryScreenshot = file;

  const previewEl = $('#delivery-screenshot-preview');
  const confirmBtn = $('#delivery-confirm-btn');

  if (previewEl && file) {
    const img = document.createElement('img');
    img.src = URL.createObjectURL(file);
    img.className = 'screenshot-preview';
    previewEl.innerHTML = '';
    previewEl.appendChild(img);
  }

  if (confirmBtn) {
    confirmBtn.disabled = !file;
  }
}

async function completeDeliveryConfirmation() {
  if (!currentDeliveryItem || !pendingDeliveryScreenshot) return;

  const receivedDate = $('#received-date')?.value;

  // Validate
  const validation = validateDeliveryConfirmation(
    { received_date: receivedDate },
    !!pendingDeliveryScreenshot
  );

  if (!validation.valid) {
    showToast(validation.errors[0]);
    return;
  }

  try {
    // Save screenshot as attachment
    const compressedBlob = await compressImage(pendingDeliveryScreenshot);
    await createAttachment(
      currentDeliveryItem.id,
      'delivery_confirmation.jpg',
      compressedBlob,
      'image/jpeg',
      'delivery_confirmation'
    );

    // Update item status and archive
    await updateInventoryItem(currentDeliveryItem.id, {
      metadata: { status: 'confirmed_received' },
      listing_status: { received_date: receivedDate }
    });
    await archiveItem(currentDeliveryItem.id);

    showToast('Delivery confirmed and archived');
    confirmDeliveryModal.close();
    await loadPipeline();
    currentDeliveryItem = null;
    pendingDeliveryScreenshot = null;
  } catch (err) {
    console.error('Failed to confirm delivery:', err);
    showToast('Failed to confirm delivery');
  }
}

// =============================================================================
// DELIST ITEM MODAL
// =============================================================================

let currentDelistItem = null;

const delistItemModal = createLazyModal('#delist-item-dialog', {
  onOpen: (dialog, { item }) => {
    currentDelistItem = item;

    const titleEl = dialog.querySelector('#delist-item-title');
    const warningEl = dialog.querySelector('#delist-listed-warning');
    const platformEl = dialog.querySelector('#delist-platform-name');

    if (titleEl) titleEl.textContent = getItemTitle(item);

    // Show warning if item is currently listed on a platform
    if (item.metadata?.status === 'listed' && item.listing_status?.list_platform) {
      if (warningEl) warningEl.hidden = false;
      if (platformEl) platformEl.textContent = capitalize(item.listing_status.list_platform.replace(/_/g, ' '));
    } else {
      if (warningEl) warningEl.hidden = true;
    }
  },
  onClose: () => {
    currentDelistItem = null;
  }
});

async function openDelistItemModal(itemId) {
  const item = await getInventoryItem(itemId);
  if (!item) {
    showToast('Item not found');
    return;
  }

  // Validate item can be delisted
  const delistableStatuses = ['needs_photo', 'unlisted', 'listed'];
  if (!delistableStatuses.includes(item.metadata?.status)) {
    showToast('Item cannot be delisted from current status');
    return;
  }

  delistItemModal.open({ item });
}

async function delistItem() {
  if (!currentDelistItem) return;

  try {
    // Only update status - preserve all listing data
    await updateInventoryItem(currentDelistItem.id, {
      metadata: { status: 'in_collection' }
    });

    showToast('Item returned to collection');
    delistItemModal.close();
    await loadPipeline();
    currentDelistItem = null;
  } catch (err) {
    console.error('Failed to delist item:', err);
    showToast('Failed to return item to collection');
  }
}

export {
  openShipItemModal,
  listItemForSale,
  nonPipelineData,
  openPhotoUploadModal,
  openMarkAsListedModal,
  openConfirmDeliveryModal,
  handlePhotoUpload,
  completePhotoUpload,
  handleDeliveryScreenshot,
  completeDeliveryConfirmation,
  openDelistItemModal,
  delistItem
};
