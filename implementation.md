# Bargain Huntress Tracker — Requirements Brief

## Overview

Mobile-first web app for tracking personal thrifting inventory. Part of the Seneschal ecosystem.

## Core Decisions

### Storage Architecture: Local-First with Drive Sync

- **Primary store:** IndexedDB (via Dexie.js or similar) for instant reads/writes
- **Sync target:** Single JSON file in Seneschal-managed Google Drive folder
- **Conflict strategy:** Last-write-wins (single user, phone-primary use case)
- **Sync pattern:** Sync-on-open + sync-on-change with local dirty flag

### Why Not Google Sheets Direct

- Network-bound writes are too slow for mobile data entry at thrift stores
- JSON schemas don't map cleanly to row/column model
- Sheets API rate limits and complexity aren't justified for single-user

## Technical Requirements

### Data Layer

- Store data locally in IndexedDB
- JSON schemas already defined (reference existing schema files)
- Background sync to Google Drive without blocking UI
- Handle offline gracefully — queue changes, sync when connectivity returns

### View Layer

- Spreadsheet-style view for inventory browsing/editing
- Use a JS table component (TanStack Table, Handsontable, or AG Grid)
- Not actual Excel export — view-only is sufficient

### Auth

- Use Seneschal project's existing OAuth flow
- No additional auth implementation needed

### Platform

- Mobile-first responsive design
- PWA recommended for offline capability
- Primary device: phone
- Secondary: occasional desktop access

## Sync Service Behavior

1. **On app open:** Pull latest JSON from Drive, merge with local (Drive wins if local isn't dirty)
2. **On local change:** Mark dirty, write to IndexedDB immediately, queue background sync
3. **Background sync:** Push local state to Drive, clear dirty flag on success
4. **Offline:** Continue working locally, sync when back online

## Out of Scope

- Multi-user collaboration
- Real-time sync
- Excel/CSV export
- Google Sheets as primary datastore

## Open Questions

- Specific IndexedDB library preference?
- Spreadsheet component preference?
- Existing JSON schema location to reference?
