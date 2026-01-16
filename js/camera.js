// =============================================================================
// CAMERA MODULE
// Camera access, MediaStream viewfinder, and guided photo capture
// =============================================================================

import { getInventoryItem, getAttachmentsByItem, createAttachment } from './db.js';
import { showToast } from './ui.js';
import { $ } from './utils.js';
import { REQUIRED_PHOTO_TYPES, OPTIONAL_PHOTO_TYPES, PHOTO_TYPE_HINTS } from './config.js';
import { queueSync } from './sync.js';

// =============================================================================
// LOCAL VALIDATION (avoid circular dependency with photos.js)
// =============================================================================

/**
 * Simple local validation for guided capture.
 * @param {Object} item
 * @param {Array} attachments
 * @returns {{ valid: boolean, missing: string[] }}
 */
function validatePhotos(item, attachments) {
  const existingTypes = new Set(attachments.map(a => a.type).filter(Boolean));
  const required = [...REQUIRED_PHOTO_TYPES];
  if (item.flaws && item.flaws.length > 0) {
    required.push('flaw');
  }
  const missing = required.filter(t => !existingTypes.has(t));
  return { valid: missing.length === 0, missing };
}

// =============================================================================
// PLATFORM DETECTION
// =============================================================================

/**
 * Get platform information for camera handling.
 * @returns {Object} Platform info
 */
export function getPlatformInfo() {
  const ua = navigator.userAgent;

  return {
    isIOS: /iPhone|iPad|iPod/.test(ua),
    isAndroid: /Android/.test(ua),
    isSafari: /Safari/.test(ua) && !/Chrome/.test(ua),
    isChrome: /Chrome/.test(ua) && !/Edge/.test(ua),
    isFirefox: /Firefox/.test(ua),
    isEdge: /Edg/.test(ua),
    isPWA: window.matchMedia('(display-mode: standalone)').matches ||
           window.navigator.standalone === true,
    isMobile: /iPhone|iPad|iPod|Android/.test(ua)
  };
}

/**
 * Check if MediaStream camera API is supported.
 * @returns {boolean}
 */
export function isCameraSupported() {
  return !!(
    navigator.mediaDevices &&
    navigator.mediaDevices.getUserMedia &&
    navigator.mediaDevices.enumerateDevices
  );
}

/**
 * Check if a camera device is actually available.
 * @returns {Promise<boolean>}
 */
export async function hasCameraDevice() {
  if (!isCameraSupported()) return false;

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.some(device => device.kind === 'videoinput');
  } catch {
    return false;
  }
}

/**
 * Determine preferred capture method based on platform.
 * @returns {'viewfinder' | 'file-input'}
 */
export function getPreferredMethod() {
  const platform = getPlatformInfo();

  // iOS Safari outside PWA has issues with getUserMedia
  if (platform.isIOS && platform.isSafari && !platform.isPWA) {
    return 'file-input';
  }

  // Firefox on Android has limited support
  if (platform.isAndroid && platform.isFirefox) {
    return 'file-input';
  }

  // Use viewfinder on mobile if camera is supported
  if (isCameraSupported() && platform.isMobile) {
    return 'viewfinder';
  }

  // Desktop: use viewfinder if camera available
  if (isCameraSupported()) {
    return 'viewfinder';
  }

  return 'file-input';
}

/**
 * Check if guided capture should be available.
 * @returns {boolean}
 */
export function isGuidedCaptureSupported() {
  // Guided capture works with both viewfinder and file-input
  return true;
}

// =============================================================================
// CAMERA STREAM MANAGEMENT
// =============================================================================

let activeStream = null;

/**
 * Get platform-specific camera constraints.
 * @param {string} facingMode - 'environment' or 'user'
 * @returns {Object} MediaStreamConstraints.video
 */
function getCameraConstraints(facingMode = 'environment') {
  const platform = getPlatformInfo();
  const constraints = {
    facingMode: { ideal: facingMode },
    width: { ideal: 1920 },
    height: { ideal: 1080 }
  };

  if (platform.isIOS) {
    // iOS Safari requires specific aspect ratios
    constraints.aspectRatio = { ideal: 4/3 };
  } else if (platform.isAndroid) {
    // Android Chrome handles constraints well
    constraints.focusMode = { ideal: 'continuous' };
  } else {
    // Desktop: lower resolution, usually webcam
    constraints.width = { ideal: 1280 };
    constraints.height = { ideal: 720 };
    // Default to front camera on desktop
    if (facingMode === 'environment') {
      constraints.facingMode = { ideal: 'user' };
    }
  }

  return constraints;
}

/**
 * Open camera stream.
 * @param {string} facingMode - 'environment' or 'user'
 * @returns {Promise<MediaStream>}
 */
export async function openCamera(facingMode = 'environment') {
  // Close any existing stream
  closeCamera();

  const constraints = {
    video: getCameraConstraints(facingMode),
    audio: false
  };

  try {
    activeStream = await navigator.mediaDevices.getUserMedia(constraints);
    return activeStream;
  } catch (err) {
    throw new CameraError(err.name, getCameraErrorMessage(err));
  }
}

/**
 * Close active camera stream.
 */
export function closeCamera() {
  if (activeStream) {
    activeStream.getTracks().forEach(track => track.stop());
    activeStream = null;
  }
}

/**
 * Switch between front and back camera.
 * @param {string} currentFacing - Current facing mode
 * @returns {Promise<MediaStream>}
 */
export async function switchCamera(currentFacing) {
  const newFacing = currentFacing === 'environment' ? 'user' : 'environment';
  return openCamera(newFacing);
}

// =============================================================================
// ERROR HANDLING
// =============================================================================

class CameraError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = 'CameraError';
  }
}

function getCameraErrorMessage(err) {
  const messages = {
    NotAllowedError: 'Camera access was denied. Please allow camera access in your browser settings.',
    NotFoundError: 'No camera found on this device.',
    NotReadableError: 'Camera is already in use by another app.',
    OverconstrainedError: 'Camera does not support the requested settings.',
    SecurityError: 'Camera access requires HTTPS.',
    AbortError: 'Camera access was interrupted.'
  };

  return messages[err.name] || `Camera error: ${err.message}`;
}

// =============================================================================
// IMAGE CAPTURE AND COMPRESSION
// =============================================================================

/**
 * Capture a frame from video element and compress it.
 * @param {HTMLVideoElement} videoElement
 * @param {Object} options
 * @returns {Promise<Blob>}
 */
export async function captureFrame(videoElement, options = {}) {
  const { maxWidth = 1200, quality = 0.85 } = options;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  // Get actual video dimensions
  const videoWidth = videoElement.videoWidth;
  const videoHeight = videoElement.videoHeight;

  // Scale down if needed
  let width = videoWidth;
  let height = videoHeight;
  if (width > maxWidth) {
    height = (height * maxWidth) / width;
    width = maxWidth;
  }

  canvas.width = width;
  canvas.height = height;

  ctx.drawImage(videoElement, 0, 0, width, height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => blob ? resolve(blob) : reject(new Error('Capture failed')),
      'image/jpeg',
      quality
    );
  });
}

/**
 * Compress an image file.
 * @param {File} file
 * @param {number} maxWidth
 * @param {number} quality
 * @returns {Promise<Blob>}
 */
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
// GUIDED CAPTURE STATE
// =============================================================================

const GUIDED_STATES = {
  LOADING: 'loading',
  READY: 'ready',
  CAPTURING: 'capturing',
  PREVIEWING: 'previewing',
  SAVING: 'saving',
  OPTIONAL: 'optional',
  COMPLETE: 'complete'
};

let guidedState = {
  state: GUIDED_STATES.LOADING,
  item: null,
  attachments: [],
  requiredTypes: [],
  pendingTypes: [],
  currentIndex: 0,
  currentType: null,
  facingMode: 'environment',
  capturedBlob: null,
  capturedUrl: null,
  onCompleteCallback: null,
  useViewfinder: false,
  cameraError: null
};

/**
 * Initialize guided flow state for an item.
 * @param {Object} item
 * @param {Array} attachments
 */
function initGuidedFlow(item, attachments) {
  // Determine required types
  const required = [...REQUIRED_PHOTO_TYPES];
  if (item.flaws && item.flaws.length > 0) {
    required.push('flaw');
  }

  // Filter out already complete types
  const existingTypes = new Set(attachments.map(a => a.type).filter(Boolean));
  const pending = required.filter(t => !existingTypes.has(t));

  guidedState.item = item;
  guidedState.attachments = attachments;
  guidedState.requiredTypes = required;
  guidedState.pendingTypes = pending;
  guidedState.currentIndex = 0;
  guidedState.currentType = pending[0] || null;
  guidedState.capturedBlob = null;
  guidedState.capturedUrl = null;
  guidedState.useViewfinder = getPreferredMethod() === 'viewfinder';

  if (pending.length === 0) {
    guidedState.state = GUIDED_STATES.OPTIONAL;
  } else {
    guidedState.state = GUIDED_STATES.READY;
  }
}

/**
 * Advance to next required type.
 */
function advanceToNextType() {
  // Remove current type from pending
  if (guidedState.currentType) {
    guidedState.pendingTypes = guidedState.pendingTypes.filter(t => t !== guidedState.currentType);
  }

  if (guidedState.pendingTypes.length > 0) {
    guidedState.currentIndex++;
    guidedState.currentType = guidedState.pendingTypes[0];
    guidedState.state = GUIDED_STATES.READY;
  } else {
    // All required photos done, show optional
    guidedState.currentType = null;
    guidedState.state = GUIDED_STATES.OPTIONAL;
  }
}

// =============================================================================
// GUIDED CAPTURE UI
// =============================================================================

/**
 * Open guided capture for an item.
 * @param {string} itemId
 * @param {Object} options
 * @param {Function} options.onComplete - Callback when done
 */
export async function openGuidedCapture(itemId, options = {}) {
  const item = await getInventoryItem(itemId);
  if (!item) {
    showToast('Item not found');
    return;
  }

  const attachments = await getAttachmentsByItem(itemId);
  guidedState.onCompleteCallback = options.onComplete || null;

  initGuidedFlow(item, attachments);

  // Check if camera device is actually available
  const hasCamera = await hasCameraDevice();
  if (!hasCamera) {
    guidedState.useViewfinder = false;
    guidedState.cameraError = 'No camera detected; please upload a photo';
  }

  const dialog = $('#guided-capture-dialog');
  if (!dialog) {
    console.error('Guided capture dialog not found');
    return;
  }

  renderGuidedUI();
  setupGuidedEventListeners();
  dialog.showModal();

  // Start camera if using viewfinder and have pending required photos
  if (guidedState.useViewfinder && guidedState.state === GUIDED_STATES.READY) {
    await startViewfinder();
  }
}

/**
 * Close guided capture dialog.
 */
function closeGuidedCapture() {
  closeCamera();
  cleanupCapturedBlob();

  const dialog = $('#guided-capture-dialog');
  if (dialog) dialog.close();

  // Call completion callback
  if (guidedState.onCompleteCallback) {
    const validation = validatePhotos(guidedState.item, guidedState.attachments);
    guidedState.onCompleteCallback({
      complete: validation.valid,
      missing: validation.missing
    });
  }

  // Reset state
  guidedState = {
    state: GUIDED_STATES.LOADING,
    item: null,
    attachments: [],
    requiredTypes: [],
    pendingTypes: [],
    currentIndex: 0,
    currentType: null,
    facingMode: 'environment',
    capturedBlob: null,
    capturedUrl: null,
    onCompleteCallback: null,
    useViewfinder: false,
    cameraError: null
  };
}

function cleanupCapturedBlob() {
  if (guidedState.capturedUrl) {
    URL.revokeObjectURL(guidedState.capturedUrl);
    guidedState.capturedUrl = null;
  }
  guidedState.capturedBlob = null;
}

/**
 * Start the viewfinder camera stream.
 */
async function startViewfinder() {
  const video = $('#guided-viewfinder');
  if (!video) return;

  try {
    const stream = await openCamera(guidedState.facingMode);
    video.srcObject = stream;

    // iOS requires these attributes
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.muted = true;

    await video.play();
    guidedState.state = GUIDED_STATES.CAPTURING;
    guidedState.cameraError = null;
    renderGuidedUI();
  } catch (err) {
    console.warn('Viewfinder failed, falling back to file input:', err);
    guidedState.useViewfinder = false;
    guidedState.cameraError = err.code === 'NotFoundError'
      ? 'No camera detected; please upload a photo'
      : (err.message || 'Camera unavailable; please upload a photo');
    renderGuidedUI();
  }
}

/**
 * Stop the viewfinder.
 */
function stopViewfinder() {
  const video = $('#guided-viewfinder');
  if (video) {
    video.srcObject = null;
  }
  closeCamera();
}

// =============================================================================
// GUIDED CAPTURE RENDERING
// =============================================================================

function renderGuidedUI() {
  const dialog = $('#guided-capture-dialog');
  if (!dialog) return;

  // Render progress dots
  renderProgressDots();

  // Render step indicator
  renderStepIndicator();

  // Render prompt
  renderPrompt();

  // Show/hide sections based on state
  const viewfinderSection = dialog.querySelector('.guided-viewfinder-section');
  const previewSection = dialog.querySelector('.guided-preview-section');
  const optionalSection = dialog.querySelector('.guided-optional-section');
  const captureControls = dialog.querySelector('.guided-capture-controls');
  const previewControls = dialog.querySelector('.guided-preview-controls');

  // Hide all first
  if (viewfinderSection) viewfinderSection.classList.add('hidden');
  if (previewSection) previewSection.classList.add('hidden');
  if (optionalSection) optionalSection.classList.add('hidden');
  if (captureControls) captureControls.classList.add('hidden');
  if (previewControls) previewControls.classList.add('hidden');

  // Update overlay class
  const overlay = dialog.querySelector('.viewfinder-overlay');
  if (overlay) {
    overlay.className = 'viewfinder-overlay';
    if (guidedState.currentType) {
      overlay.classList.add(`viewfinder-overlay--${guidedState.currentType}`);
    }
  }

  // Show appropriate section based on state
  switch (guidedState.state) {
    case GUIDED_STATES.READY:
    case GUIDED_STATES.CAPTURING:
      if (guidedState.useViewfinder && viewfinderSection) {
        viewfinderSection.classList.remove('hidden');
      }
      if (captureControls) captureControls.classList.remove('hidden');
      break;

    case GUIDED_STATES.PREVIEWING:
      if (previewSection) {
        previewSection.classList.remove('hidden');
        const img = previewSection.querySelector('#guided-preview-img');
        if (img && guidedState.capturedUrl) {
          img.src = guidedState.capturedUrl;
        }
      }
      if (previewControls) previewControls.classList.remove('hidden');
      break;

    case GUIDED_STATES.OPTIONAL:
    case GUIDED_STATES.COMPLETE:
      if (optionalSection) {
        optionalSection.classList.remove('hidden');
        renderOptionalTypes();
      }
      break;
  }

  // Update dialog class for fallback mode
  if (!guidedState.useViewfinder) {
    dialog.classList.add('guided-fallback-mode');
  } else {
    dialog.classList.remove('guided-fallback-mode');
  }
}

function renderProgressDots() {
  const container = $('#guided-progress-dots');
  if (!container) return;

  const { requiredTypes, pendingTypes } = guidedState;
  const existingTypes = new Set(guidedState.attachments.map(a => a.type).filter(Boolean));

  container.innerHTML = requiredTypes.map(type => {
    const isComplete = existingTypes.has(type) || !pendingTypes.includes(type);
    const isCurrent = type === guidedState.currentType;
    let className = 'guided-dot';
    if (isComplete) className += ' guided-dot--complete';
    if (isCurrent) className += ' guided-dot--current';
    return `<span class="${className}" title="${type}"></span>`;
  }).join('');
}

function renderStepIndicator() {
  const el = $('#guided-step-text');
  if (!el) return;

  const { requiredTypes, pendingTypes, state } = guidedState;
  const completed = requiredTypes.length - pendingTypes.length;

  if (state === GUIDED_STATES.OPTIONAL || state === GUIDED_STATES.COMPLETE) {
    el.textContent = 'Add more photos';
  } else {
    el.textContent = `Step ${completed + 1} of ${requiredTypes.length}`;
  }
}

function renderPrompt() {
  const titleEl = $('#guided-prompt-title');
  const hintEl = $('#guided-prompt-hint');
  const errorEl = $('#guided-camera-error');
  if (!titleEl || !hintEl) return;

  const { currentType, state, cameraError } = guidedState;

  // Show/hide camera error message - hide when previewing or when error is cleared
  if (errorEl) {
    const showError = cameraError && !guidedState.useViewfinder && state !== GUIDED_STATES.PREVIEWING;
    if (showError) {
      errorEl.textContent = cameraError;
      errorEl.classList.remove('hidden');
    } else {
      errorEl.textContent = '';
      errorEl.classList.add('hidden');
    }
  }

  if (state === GUIDED_STATES.OPTIONAL || state === GUIDED_STATES.COMPLETE) {
    titleEl.textContent = 'Required photos complete!';
    hintEl.textContent = 'Add optional photos or tap Done to finish';
  } else if (state === GUIDED_STATES.PREVIEWING) {
    titleEl.textContent = `Save as ${formatType(currentType)} photo?`;
    hintEl.textContent = 'Tap Save to keep or Retake to try again';
  } else if (currentType) {
    titleEl.textContent = `Take ${formatType(currentType)} photo`;
    hintEl.textContent = PHOTO_TYPE_HINTS[currentType] || '';
  }
}

function renderOptionalTypes() {
  const container = $('#guided-optional-types');
  if (!container) return;

  const existingTypes = new Set(guidedState.attachments.map(a => a.type).filter(Boolean));

  container.innerHTML = OPTIONAL_PHOTO_TYPES.map(type => {
    const hasPhoto = existingTypes.has(type);
    const className = hasPhoto ? 'guided-optional-btn guided-optional-btn--complete' : 'guided-optional-btn';
    const check = hasPhoto ? '<span class="guided-optional-check">&#10003;</span>' : '';
    return `
      <button type="button" class="${className}" data-type="${type}">
        ${formatType(type)}${check}
      </button>
    `;
  }).join('');
}

function formatType(type) {
  if (!type) return '';
  return type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, ' ');
}

// =============================================================================
// GUIDED CAPTURE EVENT HANDLING
// =============================================================================

function setupGuidedEventListeners() {
  const dialog = $('#guided-capture-dialog');
  if (!dialog) return;

  // Close button
  const closeBtn = dialog.querySelector('#guided-close-btn');
  if (closeBtn) {
    closeBtn.onclick = closeGuidedCapture;
  }

  // Done button
  const doneBtn = dialog.querySelector('#guided-done-btn');
  if (doneBtn) {
    doneBtn.onclick = closeGuidedCapture;
  }

  // Capture button
  const captureBtn = dialog.querySelector('#guided-capture-btn');
  if (captureBtn) {
    captureBtn.onclick = handleCapture;
  }

  // Gallery button
  const galleryBtn = dialog.querySelector('#guided-gallery-btn');
  if (galleryBtn) {
    galleryBtn.onclick = () => triggerFileInput(false);
  }

  // Skip button
  const skipBtn = dialog.querySelector('#guided-skip-btn');
  if (skipBtn) {
    skipBtn.onclick = handleSkip;
  }

  // Retake button
  const retakeBtn = dialog.querySelector('#guided-retake-btn');
  if (retakeBtn) {
    retakeBtn.onclick = handleRetake;
  }

  // Save button
  const saveBtn = dialog.querySelector('#guided-save-btn');
  if (saveBtn) {
    saveBtn.onclick = handleSave;
  }

  // File input
  const fileInput = dialog.querySelector('#guided-file-input');
  if (fileInput) {
    fileInput.onchange = handleFileSelect;
  }

  // Optional type buttons - event delegation
  const optionalContainer = dialog.querySelector('#guided-optional-types');
  if (optionalContainer) {
    optionalContainer.onclick = handleOptionalTypeClick;
  }

  // Switch camera button
  const switchBtn = dialog.querySelector('#guided-switch-btn');
  if (switchBtn) {
    switchBtn.onclick = handleSwitchCamera;
  }

  // Backdrop click to close
  dialog.onclick = (e) => {
    if (e.target === dialog) {
      closeGuidedCapture();
    }
  };
}

async function handleCapture() {
  if (guidedState.useViewfinder) {
    // Capture from viewfinder
    const video = $('#guided-viewfinder');
    if (!video) return;

    try {
      const blob = await captureFrame(video);
      guidedState.capturedBlob = blob;
      guidedState.capturedUrl = URL.createObjectURL(blob);
      guidedState.state = GUIDED_STATES.PREVIEWING;
      stopViewfinder();
      renderGuidedUI();
    } catch (err) {
      console.error('Capture failed:', err);
      showToast('Failed to capture photo');
    }
  } else {
    // Trigger file input with capture
    triggerFileInput(true);
  }
}

function triggerFileInput(useCamera) {
  const fileInput = $('#guided-file-input');
  if (!fileInput) return;

  if (useCamera) {
    fileInput.setAttribute('capture', 'environment');
  } else {
    fileInput.removeAttribute('capture');
  }
  fileInput.click();
}

async function handleFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;

  e.target.value = ''; // Reset for next use

  try {
    const blob = await compressImage(file);
    guidedState.capturedBlob = blob;
    guidedState.capturedUrl = URL.createObjectURL(blob);
    guidedState.state = GUIDED_STATES.PREVIEWING;
    guidedState.cameraError = null; // Clear error once photo is selected
    renderGuidedUI();
  } catch (err) {
    console.error('Failed to process image:', err);
    showToast('Failed to process image');
  }
}

function handleSkip() {
  // Only allow skipping flaw if no flaws recorded
  if (guidedState.currentType === 'flaw') {
    advanceToNextType();
    cleanupCapturedBlob();

    if (guidedState.state === GUIDED_STATES.READY && guidedState.useViewfinder) {
      startViewfinder();
    } else {
      renderGuidedUI();
    }
  } else {
    showToast('Required photos cannot be skipped');
  }
}

async function handleRetake() {
  cleanupCapturedBlob();
  guidedState.state = GUIDED_STATES.READY;

  if (guidedState.useViewfinder) {
    renderGuidedUI();
    await startViewfinder();
  } else {
    renderGuidedUI();
  }
}

async function handleSave() {
  if (!guidedState.capturedBlob || !guidedState.currentType) return;

  guidedState.state = GUIDED_STATES.SAVING;
  renderGuidedUI();

  try {
    const filename = `${guidedState.currentType}_${Date.now()}.jpg`;

    await createAttachment(
      guidedState.item.id,
      filename,
      guidedState.capturedBlob,
      'image/jpeg',
      guidedState.currentType
    );

    // Refresh attachments
    guidedState.attachments = await getAttachmentsByItem(guidedState.item.id);

    showToast(`${formatType(guidedState.currentType)} photo saved`);
    queueSync();

    // Advance to next
    advanceToNextType();
    cleanupCapturedBlob();

    if (guidedState.state === GUIDED_STATES.READY && guidedState.useViewfinder) {
      renderGuidedUI();
      await startViewfinder();
    } else {
      renderGuidedUI();
    }
  } catch (err) {
    console.error('Failed to save photo:', err);
    showToast('Failed to save photo');
    guidedState.state = GUIDED_STATES.PREVIEWING;
    renderGuidedUI();
  }
}

function handleOptionalTypeClick(e) {
  const btn = e.target.closest('.guided-optional-btn');
  if (!btn) return;

  const type = btn.dataset.type;
  if (!type) return;

  // Set this as current type and go to capture
  guidedState.currentType = type;
  guidedState.state = GUIDED_STATES.READY;
  renderGuidedUI();

  if (guidedState.useViewfinder) {
    startViewfinder();
  }
}

async function handleSwitchCamera() {
  const platform = getPlatformInfo();

  // Only available on mobile with multiple cameras
  if (!platform.isMobile) {
    showToast('Camera switching only available on mobile');
    return;
  }

  try {
    guidedState.facingMode = guidedState.facingMode === 'environment' ? 'user' : 'environment';
    const video = $('#guided-viewfinder');
    if (video) {
      const stream = await switchCamera(guidedState.facingMode === 'environment' ? 'user' : 'environment');
      video.srcObject = stream;
      await video.play();
    }
  } catch (err) {
    console.error('Failed to switch camera:', err);
    showToast('Failed to switch camera');
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  GUIDED_STATES
};
