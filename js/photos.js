// =============================================================================
// PHOTO MANAGER MODULE
// Centralized photo management with multiple entry points
// =============================================================================

import { getInventoryItem, getAttachmentsByItem, createAttachment, deleteAttachment } from './db.js';
import { showToast } from './ui.js';
import { $, capitalize, escapeHtml, getItemTitle } from './utils.js';
import { createLazyModal } from './components.js';
import { REQUIRED_PHOTO_TYPES } from './config.js';
import { queueSync } from './sync.js';
import { openGuidedCapture, isGuidedCaptureSupported } from './camera.js';

// =============================================================================
// CONSTANTS
// =============================================================================

const PHOTO_TYPES = ['front', 'back', 'label', 'flaw', 'detail', 'hallmark', 'closure', 'measurement', 'styled'];

// =============================================================================
// STATE
// =============================================================================

let currentItem = null;
let existingAttachments = [];
let onCompleteCallback = null;
let pendingFile = null;

// =============================================================================
// PHOTO VALIDATION (shared with selling.js)
// =============================================================================

/**
 * Validate whether an item has all required photos.
 * @param {Object} item - Inventory item
 * @param {Array} attachments - Item attachments
 * @returns {{ valid: boolean, missing: string[], complete: string[] }}
 */
export function validatePhotosComplete(item, attachments) {
  const missing = [];
  const complete = [];

  // Get photo types from attachments
  const existingTypes = new Set(
    attachments
      .filter(a => a.type)
      .map(a => a.type)
  );

  // Check required types
  for (const requiredType of REQUIRED_PHOTO_TYPES) {
    if (existingTypes.has(requiredType)) {
      complete.push(requiredType);
    } else {
      missing.push(requiredType);
    }
  }

  // Check flaw photos if item has flaws
  if (item.flaws && item.flaws.length > 0) {
    if (existingTypes.has('flaw')) {
      complete.push('flaw');
    } else {
      missing.push('flaw');
    }
  }

  return { valid: missing.length === 0, missing, complete };
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Get photo status for an item (for indicators).
 * @param {string} itemId - Item ID
 * @returns {Promise<Object>} Photo status object
 */
export async function getPhotoStatus(itemId) {
  const item = await getInventoryItem(itemId);
  if (!item) return { total: 0, required: 3, complete: false, missing: [], types: [] };

  const attachments = await getAttachmentsByItem(itemId);
  const validation = validatePhotosComplete(item, attachments);
  const requiredCount = REQUIRED_PHOTO_TYPES.length + (item.flaws?.length > 0 ? 1 : 0);

  return {
    total: attachments.length,
    required: requiredCount,
    complete: validation.valid,
    missing: validation.missing,
    completeTypes: validation.complete,
    types: attachments.map(a => a.type).filter(Boolean)
  };
}

/**
 * Get photo status synchronously from pre-loaded data.
 * @param {Object} item - Item object
 * @param {Array} attachments - Attachments array
 * @returns {Object} Photo status object
 */
export function getPhotoStatusSync(item, attachments) {
  const validation = validatePhotosComplete(item, attachments);
  const requiredCount = REQUIRED_PHOTO_TYPES.length + (item.flaws?.length > 0 ? 1 : 0);

  return {
    total: attachments.length,
    required: requiredCount,
    complete: validation.valid,
    missing: validation.missing,
    completeTypes: validation.complete,
    types: attachments.map(a => a.type).filter(Boolean)
  };
}

/**
 * Open the photo manager modal.
 * @param {string} itemId - Item ID
 * @param {Object} options - Options
 * @param {boolean} [options.guided=true] - Use guided capture when photos are missing
 * @param {Function} [options.onComplete] - Callback when photos are done
 */
export async function openPhotoManager(itemId, options = {}) {
  const { guided = true, onComplete } = options;

  const item = await getInventoryItem(itemId);
  if (!item) {
    showToast('Item not found');
    return;
  }

  const attachments = await getAttachmentsByItem(itemId);
  const validation = validatePhotosComplete(item, attachments);

  // Use guided capture if photos are missing and guided mode is enabled
  if (guided && !validation.valid && isGuidedCaptureSupported()) {
    await openGuidedCapture(itemId, { onComplete });
    return;
  }

  // Fall back to standard photo manager modal
  photoManagerModal.open({
    item,
    attachments,
    onComplete
  });
}

// =============================================================================
// IMAGE COMPRESSION
// =============================================================================

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

      canvas.toBlob(
        blob => {
          URL.revokeObjectURL(img.src);
          resolve(blob);
        },
        'image/jpeg',
        quality
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error('Failed to load image'));
    };
    img.src = URL.createObjectURL(file);
  });
}

// =============================================================================
// PHOTO UPLOAD/DELETE
// =============================================================================

async function handlePhotoUpload(file, photoType) {
  if (!currentItem) return;

  try {
    const compressedBlob = await compressImage(file);
    const filename = `${currentItem.id}-${photoType}.jpg`;

    await createAttachment(
      currentItem.id,
      filename,
      compressedBlob,
      'image/jpeg',
      photoType
    );

    // Refresh modal
    existingAttachments = await getAttachmentsByItem(currentItem.id);
    renderModalContent();

    showToast(`${capitalize(photoType)} photo saved`);
    queueSync();
  } catch (err) {
    console.error('Failed to upload photo:', err);
    showToast('Failed to save photo');
  }
}

async function handlePhotoDelete(attachmentId) {
  if (!currentItem) return;

  try {
    await deleteAttachment(attachmentId);
    existingAttachments = await getAttachmentsByItem(currentItem.id);
    renderModalContent();
    showToast('Photo deleted');
    queueSync();
  } catch (err) {
    console.error('Failed to delete photo:', err);
    showToast('Failed to delete photo');
  }
}

// =============================================================================
// MODAL CONTROLLER
// =============================================================================

const photoManagerModal = createLazyModal('#photo-manager-dialog', {
  onOpen: async (dialog, { item, attachments, onComplete }) => {
    currentItem = item;
    existingAttachments = attachments || [];
    onCompleteCallback = onComplete || null;
    pendingFile = null;
    renderModalContent();
    setupEventListeners(dialog);
  },
  onClose: () => {
    currentItem = null;
    existingAttachments = [];
    onCompleteCallback = null;
    pendingFile = null;
    // Revoke any object URLs
    const previewEl = $('#photo-capture-preview');
    if (previewEl) previewEl.innerHTML = '';
  }
});

function setupEventListeners(dialog) {
  // Camera button - trigger file input with capture
  const captureBtn = dialog.querySelector('#photo-capture-btn');
  const galleryBtn = dialog.querySelector('#photo-gallery-btn');
  const fileInput = dialog.querySelector('#photo-manager-input');
  const cancelBtn = dialog.querySelector('#photo-manager-cancel');
  const doneBtn = dialog.querySelector('#photo-manager-done');

  // Remove old listeners by cloning
  if (captureBtn) {
    const newCaptureBtn = captureBtn.cloneNode(true);
    captureBtn.parentNode.replaceChild(newCaptureBtn, captureBtn);
    newCaptureBtn.addEventListener('click', () => {
      if (fileInput) {
        fileInput.setAttribute('capture', 'environment');
        fileInput.click();
      }
    });
  }

  if (galleryBtn) {
    const newGalleryBtn = galleryBtn.cloneNode(true);
    galleryBtn.parentNode.replaceChild(newGalleryBtn, galleryBtn);
    newGalleryBtn.addEventListener('click', () => {
      if (fileInput) {
        fileInput.removeAttribute('capture');
        fileInput.click();
      }
    });
  }

  if (fileInput) {
    const newFileInput = fileInput.cloneNode(true);
    fileInput.parentNode.replaceChild(newFileInput, fileInput);
    newFileInput.addEventListener('change', handleFileSelect);
  }

  if (cancelBtn) {
    const newCancelBtn = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
    newCancelBtn.addEventListener('click', () => photoManagerModal.close());
  }

  if (doneBtn) {
    const newDoneBtn = doneBtn.cloneNode(true);
    doneBtn.parentNode.replaceChild(newDoneBtn, doneBtn);
    newDoneBtn.addEventListener('click', handleDone);
  }

  // Photo type buttons - use event delegation
  const typeButtonsContainer = dialog.querySelector('#photo-type-buttons');
  if (typeButtonsContainer) {
    typeButtonsContainer.addEventListener('click', handleTypeButtonClick);
  }

  // Checklist items - use event delegation
  const checklistContainer = dialog.querySelector('#photo-checklist');
  if (checklistContainer) {
    checklistContainer.addEventListener('click', handleChecklistClick);
  }

  // Photo delete buttons - use event delegation
  const galleryContainer = dialog.querySelector('#photo-existing-grid');
  if (galleryContainer) {
    galleryContainer.addEventListener('click', handleGalleryClick);
  }
}

function handleFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;

  pendingFile = file;
  e.target.value = ''; // Reset input

  // Show preview and type selector
  showPhotoPreview(file);
  showTypeSelector();
}

function showPhotoPreview(file) {
  const previewEl = $('#photo-capture-preview');
  if (!previewEl) return;

  const url = URL.createObjectURL(file);
  previewEl.innerHTML = `
    <div class="photo-preview-container">
      <img src="${url}" alt="Preview" class="photo-preview-img">
    </div>
  `;
}

function showTypeSelector() {
  const selectorEl = $('#photo-type-selector');
  if (selectorEl) {
    selectorEl.classList.remove('hidden');
  }
}

function hideTypeSelector() {
  const selectorEl = $('#photo-type-selector');
  if (selectorEl) {
    selectorEl.classList.add('hidden');
  }
  const previewEl = $('#photo-capture-preview');
  if (previewEl) {
    previewEl.innerHTML = '';
  }
  pendingFile = null;
}

function handleTypeButtonClick(e) {
  const btn = e.target.closest('.photo-type-btn');
  if (!btn || !pendingFile) return;

  const photoType = btn.dataset.type;
  handlePhotoUpload(pendingFile, photoType);
  hideTypeSelector();
}

function handleChecklistClick(e) {
  const item = e.target.closest('.photo-checklist-item');
  if (!item) return;

  const photoType = item.dataset.type;
  const isComplete = item.classList.contains('photo-checklist-item--complete');

  if (!isComplete) {
    // Trigger file input for this specific type
    const fileInput = $('#photo-manager-input');
    if (fileInput) {
      fileInput.setAttribute('capture', 'environment');
      fileInput.dataset.targetType = photoType;
      fileInput.click();
    }
  }
}

function handleGalleryClick(e) {
  const deleteBtn = e.target.closest('.photo-existing-delete');
  if (!deleteBtn) return;

  const attachmentId = deleteBtn.dataset.id;
  if (attachmentId) {
    handlePhotoDelete(attachmentId);
  }
}

async function handleDone() {
  const status = getPhotoStatusSync(currentItem, existingAttachments);

  photoManagerModal.close();

  if (onCompleteCallback) {
    await onCompleteCallback(status);
  }
}

// =============================================================================
// MODAL RENDERING
// =============================================================================

function renderModalContent() {
  const dialog = photoManagerModal.dialog;
  if (!dialog || !currentItem) return;

  const status = getPhotoStatusSync(currentItem, existingAttachments);

  // Title
  const titleEl = dialog.querySelector('#photo-manager-title');
  if (titleEl) titleEl.textContent = getItemTitle(currentItem);

  // Meta
  const metaEl = dialog.querySelector('#photo-manager-meta');
  if (metaEl) {
    metaEl.textContent = `${currentItem.brand || ''} ${currentItem.category?.primary || ''}`.trim() || '';
  }

  // Progress bar
  const progressFill = dialog.querySelector('#photo-progress-fill');
  const progressText = dialog.querySelector('#photo-progress-text');
  const completedCount = status.completeTypes.length;
  const requiredCount = status.required;
  const percentage = requiredCount > 0 ? (completedCount / requiredCount) * 100 : 0;

  if (progressFill) progressFill.style.width = `${percentage}%`;
  if (progressText) {
    progressText.textContent = status.complete
      ? 'All required photos complete'
      : `${completedCount} of ${requiredCount} required`;
  }

  // Checklist
  renderChecklist(dialog, status);

  // Type buttons
  renderTypeButtons(dialog, status);

  // Gallery
  renderGallery(dialog);

  // Photo count
  const countEl = dialog.querySelector('#photo-count');
  if (countEl) countEl.textContent = existingAttachments.length;

  // Done button
  const doneBtn = dialog.querySelector('#photo-manager-done');
  if (doneBtn) {
    doneBtn.disabled = false; // Always allow closing, validation happens elsewhere
    doneBtn.textContent = status.complete ? 'Done' : 'Done';
  }

  // Hide type selector initially
  hideTypeSelector();
}

function renderChecklist(dialog, status) {
  const checklistEl = dialog.querySelector('#photo-checklist');
  if (!checklistEl) return;

  // Determine required types
  const requiredTypes = [...REQUIRED_PHOTO_TYPES];
  if (currentItem.flaws && currentItem.flaws.length > 0) {
    requiredTypes.push('flaw');
  }

  checklistEl.innerHTML = requiredTypes.map(type => {
    const isComplete = status.completeTypes.includes(type);
    const className = isComplete ? 'photo-checklist-item--complete' : 'photo-checklist-item--required';
    const icon = isComplete ? '&#10003;' : '';

    return `
      <button type="button" class="photo-checklist-item ${className}" data-type="${type}">
        <span class="photo-checklist-icon">${icon}</span>
        <span class="photo-checklist-label">${capitalize(type)}</span>
      </button>
    `;
  }).join('');
}

function renderTypeButtons(dialog, status) {
  const buttonsEl = dialog.querySelector('#photo-type-buttons');
  if (!buttonsEl) return;

  // Show required types first, then optional
  const requiredTypes = [...REQUIRED_PHOTO_TYPES];
  if (currentItem.flaws && currentItem.flaws.length > 0) {
    requiredTypes.push('flaw');
  }
  const optionalTypes = PHOTO_TYPES.filter(t => !requiredTypes.includes(t));
  const orderedTypes = [...requiredTypes, ...optionalTypes];

  buttonsEl.innerHTML = orderedTypes.map(type => {
    const isRequired = requiredTypes.includes(type);
    const hasPhoto = status.types.includes(type);
    const className = hasPhoto ? 'photo-type-btn--complete' : (isRequired ? 'photo-type-btn--required' : '');

    return `
      <button type="button" class="photo-type-btn ${className}" data-type="${type}">
        ${capitalize(type)}
        ${hasPhoto ? '<span class="photo-type-check">&#10003;</span>' : ''}
      </button>
    `;
  }).join('');
}

function renderGallery(dialog) {
  const galleryEl = dialog.querySelector('#photo-existing-grid');
  if (!galleryEl) return;

  if (existingAttachments.length === 0) {
    galleryEl.innerHTML = '<p class="text-muted text-center">No photos yet</p>';
    return;
  }

  galleryEl.innerHTML = existingAttachments.map(att => {
    const url = URL.createObjectURL(att.blob);
    const typeLabel = att.type ? capitalize(att.type) : 'Photo';

    return `
      <div class="photo-existing-item">
        <img src="${url}" alt="${escapeHtml(typeLabel)}">
        <button type="button" class="photo-existing-delete" data-id="${att.id}" aria-label="Delete">&times;</button>
        <span class="photo-existing-type">${escapeHtml(typeLabel)}</span>
      </div>
    `;
  }).join('');
}

// =============================================================================
// INITIALIZATION
// =============================================================================

export function initPhotos() {
  // Nothing to initialize - modal is lazy
}
