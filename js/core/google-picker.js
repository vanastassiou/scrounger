/**
 * Google Picker API integration for folder selection
 * Ported from seneschal core
 */

import { getToken } from './oauth.js';

let pickerApiLoaded = false;

/**
 * Load the Google Picker API script
 */
function loadPickerApi() {
  return new Promise((resolve, reject) => {
    if (pickerApiLoaded) {
      resolve();
      return;
    }

    if (window.google?.picker) {
      pickerApiLoaded = true;
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.async = true;
    script.defer = true;

    script.onload = () => {
      window.gapi.load('picker', () => {
        pickerApiLoaded = true;
        resolve();
      });
    };

    script.onerror = () => {
      reject(new Error('Failed to load Google Picker API'));
    };

    document.head.appendChild(script);
  });
}

/**
 * Open the Google Drive folder picker
 * @param {string} clientId - Google OAuth client ID
 * @param {string} apiKey - Google API key
 * @param {string} title - Picker dialog title
 * @returns {Promise<{id: string, name: string} | null>} Selected folder or null
 */
export async function pickFolder(clientId, apiKey, title = 'Select a folder') {
  const token = getToken('google');
  if (!token) {
    throw new Error('Not authenticated with Google');
  }

  if (!apiKey) {
    throw new Error('Google API key not configured');
  }

  await loadPickerApi();

  return new Promise((resolve) => {
    // Use DocsView with folder navigation (hierarchical tree view)
    const view = new google.picker.DocsView()
      .setIncludeFolders(true)
      .setSelectFolderEnabled(true)
      .setMimeTypes('application/vnd.google-apps.folder')
      .setParent('root');

    const picker = new google.picker.PickerBuilder()
      .setAppId(clientId.split('-')[0])
      .setOAuthToken(token)
      .setDeveloperKey(apiKey)
      .addView(view)
      .setTitle(title)
      .enableFeature(google.picker.Feature.NAV_HIDDEN) // Hide side nav for cleaner look
      .setCallback((data) => {
        if (data.action === google.picker.Action.PICKED) {
          const folder = data.docs[0];
          resolve({
            id: folder.id,
            name: folder.name
          });
        } else if (data.action === google.picker.Action.CANCEL) {
          resolve(null);
        }
      })
      .build();

    picker.setVisible(true);
  });
}

/**
 * Get saved folder from settings
 * @param {string} domain - Domain name for settings key
 * @returns {{id: string, name: string} | null}
 */
export function getSavedFolder(domain) {
  try {
    const settings = JSON.parse(localStorage.getItem(`${domain}-settings`) || '{}');
    if (settings.syncFolder?.id) {
      return settings.syncFolder;
    }
  } catch {
    // Ignore parse errors
  }
  return null;
}

/**
 * Save folder to settings
 * @param {string} domain - Domain name for settings key
 * @param {{id: string, name: string}} folder
 */
export function saveFolder(domain, folder) {
  try {
    const settings = JSON.parse(localStorage.getItem(`${domain}-settings`) || '{}');
    settings.syncFolder = folder;
    localStorage.setItem(`${domain}-settings`, JSON.stringify(settings));
  } catch {
    // Ignore errors
  }
}

/**
 * Clear saved folder
 * @param {string} domain - Domain name for settings key
 */
export function clearFolder(domain) {
  try {
    const settings = JSON.parse(localStorage.getItem(`${domain}-settings`) || '{}');
    delete settings.syncFolder;
    localStorage.setItem(`${domain}-settings`, JSON.stringify(settings));
  } catch {
    // Ignore errors
  }
}

/**
 * Create a new folder in Google Drive
 * @param {string} name - Folder name
 * @param {string} parentId - Parent folder ID (optional)
 * @returns {Promise<{id: string, name: string}>} Created folder
 */
export async function createFolder(name, parentId = null) {
  const token = getToken('google');
  if (!token) {
    throw new Error('Not authenticated with Google');
  }

  const metadata = {
    name: name,
    mimeType: 'application/vnd.google-apps.folder'
  };

  if (parentId) {
    metadata.parents = [parentId];
  }

  const response = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(metadata)
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || 'Failed to create folder');
  }

  const result = await response.json();
  return {
    id: result.id,
    name: result.name
  };
}

/**
 * Find a folder by name, or create it
 * @param {string} name - Folder name to find or create
 * @param {string} [parentId] - Parent folder ID (defaults to 'root')
 * @returns {Promise<{id: string, name: string}>} Found or created folder
 */
export async function findOrCreateFolderByName(name, parentId = 'root') {
  const token = getToken('google');
  if (!token) {
    throw new Error('Not authenticated with Google');
  }

  // Search for existing folder by name in parent
  const query = `name='${name}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`;
  const searchResponse = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`,
    {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    }
  );

  if (!searchResponse.ok) {
    const error = await searchResponse.json().catch(() => ({}));
    throw new Error(error.error?.message || 'Failed to search for folder');
  }

  const searchResult = await searchResponse.json();

  // If folder exists, return it
  if (searchResult.files && searchResult.files.length > 0) {
    return {
      id: searchResult.files[0].id,
      name: searchResult.files[0].name
    };
  }

  // Otherwise create it in the specified parent
  return createFolder(name, parentId === 'root' ? null : parentId);
}
