// =============================================================================
// EXPENSES DATABASE OPERATIONS
// =============================================================================

import {
  openDB,
  promisify,
  getStore,
  getAllFromStore,
  getByKey,
  addRecord,
  deleteRecord
} from './core.js';
import { generateId, nowISO, handleError } from '../utils.js';
import { showToast } from '../ui.js';

// =============================================================================
// EXPENSES CRUD
// =============================================================================

/**
 * Expense record schema:
 * @typedef {Object} Expense
 * @property {string} id - Auto-generated unique ID
 * @property {string} date - ISO date string (YYYY-MM-DD)
 * @property {string} category - Expense category: fuel | packaging | shipping_supplies | platform_fees | repairs | storage | other
 * @property {number} amount - Expense amount in CAD
 * @property {string} [tripId] - Optional linked trip ID
 * @property {string} [itemId] - Optional linked inventory item ID
 * @property {string} [notes] - Optional notes/description for the expense
 * @property {string} created_at - Auto-set creation timestamp
 * @property {string} updated_at - Auto-set update timestamp
 * @property {boolean} unsynced - Sync status flag
 */

/**
 * Create a new expense record.
 * @param {Partial<Expense>} data - Expense data (id, timestamps, unsynced auto-set)
 * @returns {Promise<Expense>} Created expense
 */
export async function createExpense(data) {
  try {
    const now = nowISO();
    const expense = {
      ...data,
      id: generateId(),
      created_at: now,
      updated_at: now,
      unsynced: true
    };
    await addRecord('expenses', expense);
    return expense;
  } catch (err) {
    console.error('Failed to create expense:', err);
    showToast('Failed to save expense');
    throw err;
  }
}

export async function updateExpense(id, updates) {
  try {
    const store = await getStore('expenses', 'readwrite');
    const existing = await promisify(store.get(id));
    if (!existing) throw new Error('Expense not found');

    const updated = {
      ...existing,
      ...updates,
      updated_at: nowISO(),
      unsynced: true
    };
    await promisify(store.put(updated));
    return updated;
  } catch (err) {
    console.error('Failed to update expense:', err);
    showToast('Failed to update expense');
    throw err;
  }
}

export async function deleteExpense(id) {
  try {
    await deleteRecord('expenses', id);
  } catch (err) {
    console.error('Failed to delete expense:', err);
    showToast('Failed to delete expense');
    throw err;
  }
}

export async function getExpense(id) {
  try {
    return await getByKey('expenses', id);
  } catch (err) {
    return handleError(err, `Failed to get expense ${id}`, null);
  }
}

export async function getAllExpenses() {
  try {
    const expenses = await getAllFromStore('expenses');
    return expenses.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  } catch (err) {
    return handleError(err, 'Failed to get expenses', []);
  }
}

export async function getExpensesByCategory(category) {
  try {
    const store = await getStore('expenses');
    const index = store.index('category');
    return promisify(index.getAll(category));
  } catch (err) {
    return handleError(err, `Failed to get expenses for category ${category}`, []);
  }
}

export async function getExpensesByTrip(tripId) {
  try {
    const store = await getStore('expenses');
    const index = store.index('tripId');
    return promisify(index.getAll(tripId));
  } catch (err) {
    return handleError(err, `Failed to get expenses for trip ${tripId}`, []);
  }
}

export async function getExpensesByItem(itemId) {
  try {
    const store = await getStore('expenses');
    const index = store.index('itemId');
    return promisify(index.getAll(itemId));
  } catch (err) {
    return handleError(err, `Failed to get expenses for item ${itemId}`, []);
  }
}

export async function getExpensesByDateRange(startDate, endDate) {
  try {
    const expenses = await getAllFromStore('expenses');
    return expenses.filter(e => {
      const date = e.date;
      return date && date >= startDate && date <= endDate;
    }).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  } catch (err) {
    return handleError(err, 'Failed to get expenses by date range', []);
  }
}

// =============================================================================
// UNSYNCED TRACKING
// =============================================================================

export async function getUnsyncedExpenses() {
  const expenses = await getAllFromStore('expenses');
  return expenses.filter(e => e.unsynced);
}

export async function markExpensesSynced(ids) {
  const db = await openDB();
  const tx = db.transaction('expenses', 'readwrite');
  const store = tx.objectStore('expenses');

  for (const id of ids) {
    const expense = await promisify(store.get(id));
    if (expense) {
      expense.unsynced = false;
      expense.synced_at = nowISO();
      store.put(expense);
    }
  }

  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}
