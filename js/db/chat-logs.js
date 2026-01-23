// =============================================================================
// CHAT LOGS DATABASE OPERATIONS
// =============================================================================

import {
  getAllFromStore,
  getByKey,
  putRecord
} from './core.js';
import { generateId, nowISO, handleError } from '../utils.js';
import { showToast } from '../ui.js';

// =============================================================================
// CHAT LOGS CRUD
// =============================================================================

/**
 * Get chat log for a specific date.
 * @param {string} dateStr - ISO date (YYYY-MM-DD)
 */
export async function getChatLog(dateStr) {
  try {
    return await getByKey('chatLogs', dateStr);
  } catch (err) {
    return handleError(err, `Failed to get chat log for ${dateStr}`, null);
  }
}

/**
 * Get or create chat log for a date.
 */
export async function getOrCreateChatLog(dateStr) {
  const existing = await getChatLog(dateStr);
  if (existing) return existing;

  const newLog = {
    date: dateStr,
    conversations: [],
    created_at: nowISO(),
    updated_at: nowISO(),
    unsynced: false
  };
  await putRecord('chatLogs', newLog);
  return newLog;
}

/**
 * Append a conversation to a daily log.
 * @param {string} dateStr - ISO date
 * @param {Object} conversation - { id, started, ended?, messages[], linkedItems[], tripId?, extractedKnowledge[] }
 */
export async function appendConversation(dateStr, conversation) {
  try {
    const log = await getOrCreateChatLog(dateStr);

    const conv = {
      ...conversation,
      id: conversation.id || generateId(),
      started: conversation.started || nowISO()
    };

    const existingIndex = log.conversations.findIndex(c => c.id === conv.id);
    if (existingIndex >= 0) {
      log.conversations[existingIndex] = conv;
    } else {
      log.conversations.push(conv);
    }

    log.updated_at = nowISO();
    log.unsynced = true;

    await putRecord('chatLogs', log);
    return conv;
  } catch (err) {
    console.error('Failed to append conversation:', err);
    showToast('Failed to save conversation');
    throw err;
  }
}

/**
 * Get all conversations for a date.
 */
export async function getConversationsByDate(dateStr) {
  const log = await getChatLog(dateStr);
  return log?.conversations || [];
}

/**
 * Get a specific conversation by ID.
 */
export async function getConversation(conversationId) {
  // Extract date from ID format: chat-2025-01-21-001
  const match = conversationId.match(/chat-(\d{4}-\d{2}-\d{2})-/);
  if (!match) return null;

  const dateStr = match[1];
  const log = await getChatLog(dateStr);
  return log?.conversations.find(c => c.id === conversationId) || null;
}

/**
 * Get recent chat logs (last N days).
 */
export async function getRecentChatLogs(days = 7) {
  try {
    const logs = await getAllFromStore('chatLogs');
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().split('T')[0];

    return logs
      .filter(log => log.date >= cutoffStr)
      .sort((a, b) => b.date.localeCompare(a.date));
  } catch (err) {
    return handleError(err, 'Failed to get recent chat logs', []);
  }
}

// =============================================================================
// UNSYNCED TRACKING
// =============================================================================

export async function getUnsyncedChatLogs() {
  const logs = await getAllFromStore('chatLogs');
  return logs.filter(log => log.unsynced);
}

export async function markChatLogSynced(dateStr) {
  const log = await getChatLog(dateStr);
  if (log) {
    log.unsynced = false;
    log.synced_at = nowISO();
    await putRecord('chatLogs', log);
  }
}

/**
 * Import chat log from Drive (merge conversations by ID).
 */
export async function importChatLog(dateStr, remoteData) {
  const local = await getOrCreateChatLog(dateStr);

  const merged = new Map();
  for (const conv of local.conversations) {
    merged.set(conv.id, conv);
  }
  for (const conv of (remoteData.conversations || [])) {
    merged.set(conv.id, conv);
  }

  local.conversations = Array.from(merged.values())
    .sort((a, b) => (a.started || '').localeCompare(b.started || ''));
  local.updated_at = nowISO();
  local.unsynced = false;
  local.synced_at = nowISO();

  await putRecord('chatLogs', local);
  return local;
}
