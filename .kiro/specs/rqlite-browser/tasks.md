# Implementation Plan: RQLite Browser

## Overview

Incremental implementation of the RQLite Browser application, starting with core types and services, then building UI components from the homepage outward to the data browser with tabbed interface.

## Tasks

- [x] 1. Set up project foundation
  - [x] 1.1 Install dependencies (axios, pinia for state management)
    - Run: `npm install axios pinia`
    - _Requirements: 4.1_
  - [x] 1.2 Create core type definitions
    - Create `src/types/database.ts` with DatabaseConnection, QueryResult, ColumnDef, PaginationState, TabState interfaces
    - Create `src/types/rqlite.ts` with RqliteQueryResponse, RqliteResult, RqliteExecuteResponse types
    - _Requirements: 1.1, 4.2, 5.1_

- [x] 2. Implement storage service
  - [x] 2.1 Create StorageService for local persistence
    - Create `src/services/storage-service.ts`
    - Implement saveConnections, loadConnections, addConnection, removeConnection methods
    - Use localStorage with key 'rqlite-browser-connections'
    - _Requirements: 7.1, 7.2, 7.3_
  - [ ]* 2.2 Write property test for storage round-trip
    - **Property 1: Connection Persistence Round Trip**
    - **Validates: Requirements 7.1, 7.2**

- [x] 3. Implement RQLite service
  - [x] 3.1 Create RqliteService with Axios
    - Create `src/services/rqlite-service.ts`
    - Implement constructor with axios instance creation
    - Implement query() method using GET /db/query?associative&level=none for fast reads
    - Implement request() method using POST /db/request?associative&db_timeout=5s for SQL console
    - Implement execute() method using POST /db/execute?redirect with parameterized statements
    - Implement executeBatch() for transaction support
    - Add checkResponseError() helper - CRITICAL: check for error key even on HTTP 200
    - Implement testConnection() using GET /status
    - _Requirements: 4.1, 4.2, 6.2_
  - [x] 3.2 Add schema operations to RqliteService
    - Implement getTables() using sqlite_master query with associative format
    - Implement getTableSchema() using PRAGMA table_info
    - Implement getTablePrimaryKey() from schema info
    - _Requirements: 2.2_
  - [x] 3.3 Add pagination support to RqliteService
    - Implement queryWithPagination() with LIMIT/OFFSET and associative format
    - Implement getTableCount() for total rows
    - _Requirements: 5.2, 5.3_

- [x] 4. Implement state management
  - [x] 4.1 Create connection store with Pinia
    - Create `src/stores/connection-store.ts`
    - Implement state: connections array, activeConnectionId
    - Implement actions: addConnection, removeConnection, setActiveConnection
    - Load from StorageService on initialization
    - _Requirements: 1.1, 1.3, 1.6_
  - [ ]* 4.2 Write property test for connection list integrity
    - **Property 5: Connection List Integrity**
    - **Validates: Requirements 1.3, 1.6**
  - [x] 4.3 Create tab store with Pinia
    - Create `src/stores/tab-store.ts`
    - Implement state: tabs map (connectionId -> TabState[]), activeTabId map
    - Implement actions: openTab, closeTab, setActiveTab
    - Ensure no duplicate tabs per table
    - _Requirements: 3.1, 3.3, 3.4, 3.5_
  - [ ]* 4.4 Write property test for tab uniqueness
    - **Property 2: Tab Uniqueness Per Table**
    - **Validates: Requirements 3.1, 3.3**

- [x] 5. Checkpoint - Core services complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Build Database List page
  - [x] 6.1 Create DatabaseCard component
    - Create `src/components/DatabaseCard.vue`
    - Display connection name, URL, created date
    - Emit 'select' and 'delete' events
    - Use q-card with q-btn for actions
    - _Requirements: 1.1_
  - [x] 6.2 Create AddDatabaseForm component
    - Create `src/components/AddDatabaseForm.vue`
    - Use q-dialog with q-form
    - Fields: name (text), url (text with validation)
    - Test connection before saving
    - Show loading state and errors
    - _Requirements: 1.2, 1.3, 1.4, 1.5_
  - [x] 6.3 Create DatabaseListPage
    - Create `src/pages/DatabaseListPage.vue`
    - Display DatabaseCard for each connection
    - Add q-page-sticky with q-btn (+ icon) at bottom right
    - Wire up AddDatabaseForm dialog
    - Navigate to DataBrowserPage on card select
    - _Requirements: 1.1, 1.2, 2.1_
  - [x] 6.4 Update router configuration
    - Update `src/router/routes.ts`
    - Set DatabaseListPage as home route (/)
    - Add DataBrowserPage route (/browser/:connectionId)
    - _Requirements: 2.1_

- [x] 7. Build Data Browser components
  - [x] 7.1 Create TablePanel component
    - Create `src/components/TablePanel.vue`
    - Use q-list with q-item for each table
    - Highlight active table
    - Emit 'select' event on click
    - _Requirements: 2.2, 2.3_
  - [x] 7.2 Create SqlBox component
    - Create `src/components/SqlBox.vue`
    - Use q-input with type="textarea"
    - Add execute button (q-btn)
    - Show loading state
    - v-model for SQL text
    - _Requirements: 4.1, 4.4_
  - [x] 7.3 Create DataGrid component
    - Create `src/components/DataGrid.vue`
    - Use q-table with server-side pagination
    - Dynamic columns from query result
    - Display pagination controls
    - Show loading state
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_
  - [x] 7.4 Add inline editing to DataGrid
    - Use q-popup-edit on each cell
    - Emit 'cell-edit' event with row, column, old/new values
    - Generate parameterized UPDATE statement (prevent SQL injection)
    - Show saving indicator during edit
    - Handle edit success/failure, check response for error key
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_
  - [ ]* 7.5 Write property test for edit SQL generation
    - **Property 4: Cell Edit Generates Valid SQL**
    - **Validates: Requirements 6.2**

- [x] 8. Build Query Tab and Data Browser page
  - [x] 8.1 Create QueryTab component
    - Create `src/components/QueryTab.vue`
    - Compose SqlBox and DataGrid
    - Manage local state: sql, data, loading, error, pagination
    - Execute initial SELECT * on mount
    - Handle SQL execution and pagination
    - Wire cell edits to RqliteService.execute()
    - _Requirements: 3.2, 4.1, 4.2, 4.3, 4.5, 6.2_
  - [x] 8.2 Create DataBrowserPage
    - Create `src/pages/DataBrowserPage.vue`
    - Layout: q-drawer (left) for TablePanel, main area for tabs
    - Use q-tabs and q-tab-panels for tabbed interface
    - Fetch tables on mount
    - Handle table selection -> open/switch tab
    - Handle tab close
    - Handle connection errors
    - _Requirements: 2.2, 2.3, 2.4, 3.1, 3.3, 3.4, 3.5_
  - [ ]* 8.3 Write property test for pagination consistency
    - **Property 3: Pagination Consistency**
    - **Validates: Requirements 5.2, 5.3, 5.4**

- [x] 9. Final integration and polish
  - [x] 9.1 Add error handling and notifications
    - Use q-notify for success/error toasts
    - Add error boundaries for connection failures
    - Implement retry logic for transient errors
    - _Requirements: 1.5, 2.4, 4.3, 6.4_
  - [x] 9.2 Update main layout
    - Update `src/layouts/MainLayout.vue` if needed
    - Ensure clean navigation between views
    - _Requirements: 2.1_

- [x] 10. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional property-based tests
- Axios is used for all HTTP communication with RQLite
- Pinia is used for state management
- Quasar components: q-table, q-popup-edit, q-tabs, q-drawer, q-dialog
- RQLite API endpoints:
  - GET /db/query?associative&level=none (fast reads for data grid)
  - POST /db/request?associative&db_timeout=5s (SQL console, auto-detects read/write)
  - POST /db/execute?redirect (writes with parameterized statements)
  - POST /db/execute?transaction&redirect (batch writes)
- CRITICAL: Always check for `error` key in response even on HTTP 200
- Use parameterized statements `[sql, ...params]` for all writes to prevent SQL injection
