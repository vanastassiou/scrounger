/**
 * Google Drive sync provider
 * Ported from seneschal core
 */

import { getToken, startAuth, handleCallback, isAuthenticated, logout, getUserInfo, clearUserInfo } from './oauth.js';
import { getSavedFolder, pickFolder, saveFolder, clearFolder, findOrCreateFolderByName, createFolder } from './google-picker.js';

const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/userinfo.email'
];

const API_BASE = 'https://www.googleapis.com';

/**
 * Create a Google Drive provider for a specific domain
 * @param {Object} config - Provider configuration
 * @param {string} config.domain - Domain name (thrifting)
 * @param {string} config.clientId - Google OAuth client ID
 * @param {string} config.apiKey - Google API key (for picker)
 * @param {string} config.redirectUri - OAuth redirect URI
 * @param {string} [config.clientSecret] - OAuth client secret (optional)
 */
export function createGoogleDriveProvider(config) {
  const { domain, clientId, apiKey, redirectUri, clientSecret } = config;

  const DATA_FILE = `${domain}-data.json`;

  let fileId = null;
  let attachmentsFolderId = null;
  let backupsFolderId = null;

  /**
   * Check if connected to Google Drive
   */
  function isConnected() {
    return isAuthenticated('google');
  }

  /**
   * Start OAuth flow
   */
  async function connect() {
    await startAuth('google', clientId, SCOPES, redirectUri);
  }

  /**
   * Handle OAuth callback
   */
  async function handleAuthCallback() {
    return handleCallback('google', clientId, redirectUri, clientSecret);
  }

  /**
   * Disconnect from Google Drive
   */
  function disconnect() {
    logout('google');
    clearUserInfo('google');
    clearFolder(domain);
    fileId = null;
    attachmentsFolderId = null;
    backupsFolderId = null;
  }

  /**
   * Get the connected user's email
   */
  async function getAccountEmail() {
    const info = await getUserInfo('google');
    return info?.email || null;
  }

  /**
   * Check if a folder is configured for sync
   */
  function isFolderConfigured() {
    return getSavedFolder(domain) !== null;
  }

  /**
   * Open folder picker
   */
  async function selectFolder() {
    const folder = await pickFolder(clientId, apiKey, `Select folder for ${domain} sync`);
    if (folder) {
      saveFolder(domain, folder);
      // Reset cached IDs when folder changes
      fileId = null;
      attachmentsFolderId = null;
      backupsFolderId = null;
    }
    return folder;
  }

  /**
   * Set folder by name (finds existing or creates new)
   * @param {string} folderName - Name of folder to use
   * @param {string} [parentId] - Parent folder ID (defaults to root)
   */
  async function setFolderByName(folderName, parentId) {
    const folder = await findOrCreateFolderByName(folderName, parentId);
    saveFolder(domain, folder);
    // Reset cached IDs when folder changes
    fileId = null;
    attachmentsFolderId = null;
    return folder;
  }

  /**
   * Pick a folder (without setting it as sync folder)
   * Used for selecting a parent folder
   */
  async function pickParentFolder() {
    return pickFolder(clientId, apiKey, 'Select parent folder');
  }

  /**
   * Get current folder
   */
  function getFolder() {
    return getSavedFolder(domain);
  }

  /**
   * Clear folder selection
   */
  function removeFolder() {
    clearFolder(domain);
    fileId = null;
    attachmentsFolderId = null;
  }

  /**
   * Make authenticated API request
   */
  async function apiRequest(path, options = {}) {
    const token = getToken('google');
    if (!token) {
      throw new Error('Not authenticated with Google');
    }

    const response = await window.fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        ...options.headers
      }
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || 'API request failed');
    }

    const text = await response.text();
    if (!text) {
      return null;
    }

    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  /**
   * Find or create the data file
   */
  async function getOrCreateDataFile() {
    if (fileId) return fileId;

    const folder = getSavedFolder(domain);
    if (!folder) {
      throw new Error('No folder selected. Please select a folder in Settings.');
    }

    const query = `name='${DATA_FILE}' and '${folder.id}' in parents and trashed=false`;
    const searchResult = await apiRequest(
      `/drive/v3/files?q=${encodeURIComponent(query)}`
    );

    if (searchResult?.files?.length > 0) {
      fileId = searchResult.files[0].id;
      return fileId;
    }

    const metadata = {
      name: DATA_FILE,
      parents: [folder.id],
      mimeType: 'application/json'
    };

    const createResult = await apiRequest('/drive/v3/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(metadata)
    });

    fileId = createResult.id;
    return fileId;
  }

  /**
   * Find or create the inventory folder for item artifacts
   */
  async function getOrCreateInventoryFolder() {
    if (attachmentsFolderId) return attachmentsFolderId;

    const folder = getSavedFolder(domain);
    if (!folder) {
      throw new Error('No folder selected. Please select a folder in Settings.');
    }

    // Find or create 'inventory' folder directly under selected folder
    const query = `name='inventory' and '${folder.id}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const result = await apiRequest(
      `/drive/v3/files?q=${encodeURIComponent(query)}`
    );

    if (result?.files?.length > 0) {
      attachmentsFolderId = result.files[0].id;
    } else {
      const createResult = await apiRequest('/drive/v3/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'inventory',
          parents: [folder.id],
          mimeType: 'application/vnd.google-apps.folder'
        })
      });
      attachmentsFolderId = createResult.id;
    }

    return attachmentsFolderId;
  }

  /**
   * Find or create the backups folder
   * Structure: {selected-folder}/backups/
   */
  async function getOrCreateBackupsFolder() {
    if (backupsFolderId) return backupsFolderId;

    const folder = getSavedFolder(domain);
    if (!folder) {
      throw new Error('No folder selected. Please select a folder in Settings.');
    }

    // Find or create 'backups' folder directly under selected folder
    const query = `name='backups' and '${folder.id}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const result = await apiRequest(
      `/drive/v3/files?q=${encodeURIComponent(query)}`
    );

    if (result?.files?.length > 0) {
      backupsFolderId = result.files[0].id;
    } else {
      const createResult = await apiRequest('/drive/v3/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'backups',
          parents: [folder.id],
          mimeType: 'application/vnd.google-apps.folder'
        })
      });
      backupsFolderId = createResult.id;
    }

    return backupsFolderId;
  }

  /**
   * Upload a backup file to the backups folder
   * @param {string} filename - Backup filename
   * @param {Blob} blob - File data
   * @returns {Promise<string>} Google Drive file ID
   */
  async function uploadBackup(filename, blob) {
    const folderId = await getOrCreateBackupsFolder();

    const metadata = {
      name: filename,
      parents: [folderId],
      mimeType: 'application/json'
    };

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', blob);

    const result = await apiRequest(
      '/upload/drive/v3/files?uploadType=multipart',
      { method: 'POST', body: form }
    );

    return result.id;
  }

  /**
   * List backup files in the backups folder
   * @returns {Promise<Array>} List of backup files
   */
  async function listBackups() {
    const folderId = await getOrCreateBackupsFolder();

    const query = `'${folderId}' in parents and mimeType='application/json' and trashed=false`;
    const result = await apiRequest(
      `/drive/v3/files?q=${encodeURIComponent(query)}&orderBy=createdTime desc&fields=files(id,name,createdTime,size)`
    );

    return result.files || [];
  }

  /**
   * List JSON files in the root sync folder (for importing inventory/stores)
   * @returns {Promise<Array>} List of JSON files
   */
  async function listRootFiles() {
    const folder = getSavedFolder(domain);
    if (!folder) return [];

    const query = `'${folder.id}' in parents and mimeType='application/json' and trashed=false`;
    const result = await apiRequest(
      `/drive/v3/files?q=${encodeURIComponent(query)}&orderBy=name&fields=files(id,name,createdTime,size)`
    );

    return result.files || [];
  }

  /**
   * Download a file by ID
   * @param {string} fileId - Google Drive file ID
   * @returns {Promise<Object>} Parsed JSON data
   */
  async function downloadFile(fileId) {
    const response = await apiRequest(`/drive/v3/files/${fileId}?alt=media`);
    return response;
  }

  // Cache for item folder IDs
  const itemFolderCache = new Map();

  /**
   * Get or create a folder for an item's artifacts (photos, documents, etc).
   * Structure: {selected-folder}/inventory/{item-id}/
   * @param {string} itemId - Item ID (used as folder name)
   * @returns {Promise<string>} Folder ID
   */
  async function getOrCreateItemFolder(itemId) {
    // Check cache first
    if (itemFolderCache.has(itemId)) {
      return itemFolderCache.get(itemId);
    }

    const inventoryFolderId = await getOrCreateInventoryFolder();

    // Search for existing item folder
    const query = `name='${itemId}' and '${inventoryFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const result = await apiRequest(
      `/drive/v3/files?q=${encodeURIComponent(query)}`
    );

    let folderId;
    if (result?.files?.length > 0) {
      folderId = result.files[0].id;
    } else {
      // Create new folder for item
      const createResult = await apiRequest('/drive/v3/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: itemId,
          parents: [inventoryFolderId],
          mimeType: 'application/vnd.google-apps.folder'
        })
      });
      folderId = createResult.id;
    }

    // Cache the folder ID
    itemFolderCache.set(itemId, folderId);
    return folderId;
  }

  /**
   * Fetch data from Google Drive
   */
  async function fetch() {
    const id = await getOrCreateDataFile();

    try {
      const response = await apiRequest(`/drive/v3/files/${id}?alt=media`);
      if (!response || typeof response !== 'object') {
        return { data: null, lastModified: null };
      }

      // Handle both formats for backward compatibility:
      // - Old format: { domain, version, data: {...}, lastModified }
      // - New format: { version, exported_at, inventory, stores, archive }
      if (response.data && response.lastModified) {
        // Old wrapped format
        return { data: response.data, lastModified: response.lastModified };
      }

      // New clean format - data IS the response
      return { data: response, lastModified: response.exported_at || null };
    } catch (err) {
      return { data: null, lastModified: null };
    }
  }

  /**
   * Push data to Google Drive
   * @param {Object} syncData - Data to sync
   * @param {*} syncData.data - Domain-specific data (clean format from exportAllData)
   * @param {string} syncData.lastModified - ISO timestamp
   */
  async function push(syncData) {
    const id = await getOrCreateDataFile();

    // Save the data directly in clean format (no wrapper)
    // syncData.data contains the clean format from exportAllData():
    // { version, exported_at, inventory, stores, archive }
    const payload = syncData.data;

    const metadata = {
      mimeType: 'application/json'
    };

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', new Blob([JSON.stringify(payload)], { type: 'application/json' }));

    const token = getToken('google');
    const response = await window.fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=multipart`,
      {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}` },
        body: form
      }
    );

    if (!response.ok) {
      throw new Error('Failed to upload data to Google Drive');
    }

    return true;
  }

  /**
   * Upload attachment to Google Drive.
   * If itemId is provided, uploads to item folder with clean filename.
   * Otherwise uses legacy flat structure with attachmentId prefix.
   *
   * @param {string} attachmentId - Attachment ID
   * @param {string} filename - Original filename (e.g., "front.jpg")
   * @param {Blob} blob - File data
   * @param {string} mimeType - MIME type
   * @param {string} [itemId] - Item ID for folder-based organization
   * @returns {Promise<string>} Google Drive file ID
   */
  async function uploadAttachment(attachmentId, filename, blob, mimeType, itemId = null) {
    let folderId;
    let uploadName;

    if (itemId) {
      // Folder-based structure: inventory/{item-id}/{filename}
      folderId = await getOrCreateItemFolder(itemId);
      uploadName = filename; // Clean filename like "front.jpg"
    } else {
      // Legacy flat structure: inventory/{attachmentId}-{filename}
      folderId = await getOrCreateInventoryFolder();
      uploadName = `${attachmentId}-${filename}`;
    }

    const metadata = {
      name: uploadName,
      parents: [folderId],
      mimeType: mimeType || 'application/octet-stream'
    };

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', blob);

    const token = getToken('google');
    const response = await window.fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: form
      }
    );

    if (!response.ok) {
      throw new Error('Failed to upload attachment');
    }

    const result = await response.json();
    return result.id;
  }

  /**
   * Download attachment from Google Drive
   */
  async function downloadAttachment(remoteId) {
    const token = getToken('google');
    const response = await window.fetch(
      `https://www.googleapis.com/drive/v3/files/${remoteId}?alt=media`,
      {
        headers: { 'Authorization': `Bearer ${token}` }
      }
    );

    if (!response.ok) {
      throw new Error('Failed to download attachment');
    }

    return response.blob();
  }

  /**
   * Delete attachment from Google Drive
   */
  async function deleteAttachment(remoteId) {
    await apiRequest(`/drive/v3/files/${remoteId}`, {
      method: 'DELETE'
    });
  }

  /**
   * List all attachments from inventory/{item-id}/ folder structure.
   * Returns attachments with itemId derived from parent folder name.
   */
  async function listAttachments() {
    const inventoryFolderId = await getOrCreateInventoryFolder();
    const attachments = [];

    // List item folders inside inventory/
    const foldersQuery = `'${inventoryFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const foldersResult = await apiRequest(
      `/drive/v3/files?q=${encodeURIComponent(foldersQuery)}&fields=files(id,name)`
    );

    // For each item folder, list files inside
    for (const folder of foldersResult.files || []) {
      const itemId = folder.name;
      const filesQuery = `'${folder.id}' in parents and trashed=false`;
      const filesResult = await apiRequest(
        `/drive/v3/files?q=${encodeURIComponent(filesQuery)}&fields=files(id,name,mimeType,size)`
      );

      for (const file of filesResult.files || []) {
        attachments.push({
          id: `${itemId}-${file.name}`, // Composite ID for deduplication
          itemId,
          remoteId: file.id,
          filename: file.name,
          mimeType: file.mimeType,
          size: parseInt(file.size, 10)
        });
      }
    }

    return attachments;
  }

  // Return provider interface
  return {
    name: 'google-drive',
    domain,
    isConnected,
    isFolderConfigured,
    connect,
    handleAuthCallback,
    disconnect,
    getAccountEmail,
    selectFolder,
    pickParentFolder,
    setFolderByName,
    getFolder,
    removeFolder,
    fetch,
    push,
    uploadAttachment,
    downloadAttachment,
    deleteAttachment,
    listAttachments,
    uploadBackup,
    listBackups,
    listRootFiles,
    downloadFile
  };
}

export default createGoogleDriveProvider;
