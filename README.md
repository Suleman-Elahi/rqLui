# rqLui - RQLite Database Browser

A modern, high-performance web UI for browsing and managing [RQLite](https://rqlite.io/) distributed SQLite databases. Built with Vue 3, Quasar Framework, and TypeScript.

## Features

### Core Features
- **Multi-Database Support** - Connect to and manage multiple RQLite database instances from a single interface
- **Tabbed Data Browser** - Open multiple tables simultaneously in separate tabs for easy comparison and navigation
- **SQL Console** - Execute raw SQL queries with Ctrl+Enter shortcut
- **Inline Cell Editing** - Click any cell to edit values directly in the data grid using Quasar's popup edit
- **Pagination** - Efficiently browse large tables with server-side pagination using LIMIT/OFFSET
- **Connection Persistence** - Database connections are saved to localStorage and restored on app reload

### Table Management
- **Create Table** - Visual table builder with column definitions (name, type, primary key, nullable) or raw SQL mode
- **Truncate Table** - Delete all rows from a table with confirmation dialog
- **Delete Table** - Drop table entirely with confirmation dialog

### Large-Scale Data Import (1M+ rows supported)
- **Chunked CSV Import** - Stream-based file processing that handles massive CSV files without browser memory issues
  - Uses `ReadableStream` API to process files in chunks
  - Batches of 1,000 rows per RQLite request
  - Real-time progress dialog showing imported row count
  - Proper RFC 4180 CSV parsing (handles quoted fields, escaped quotes, commas in values)
  
- **SQL File Import** - Import `.sql` files containing INSERT statements
  - Stream-based parsing for large SQL dumps
  - Batches of 500 INSERT statements per request
  - Filters and executes only INSERT statements (ignores comments, DDL)
  - Progress tracking with statement count

### Data Export (1M+ rows supported)
- **CSV Export** - Paginated export that fetches data in batches of 5,000 rows
  - Progress dialog showing export progress
  - Proper RFC 4180 CSV formatting with escaped quotes and newlines
  
- **SQL Export** - Export table as INSERT INTO statements
  - Paginated fetching for large tables
  - Proper SQL escaping (single quotes, NULL handling)
  - Includes header comments with table name and timestamp
  - Progress tracking with row count

### Performance Optimizations
- **RQLite API Best Practices** - Uses optimized endpoints and parameters:
  - `associative` format for direct q-table compatibility
  - `level=none` for fastest reads (bypasses Raft consensus)
  - `redirect` parameter for automatic leader routing on writes
  - `transaction` batching for bulk operations
- **SQL Injection Protection** - All write operations use parameterized statements `[sql, ...params]`

## How It Works

### Homepage - Database Connections

When you open the app, you'll see a list of your saved database connections. Click the **+** button in the bottom-right corner to add a new connection:

1. Enter a friendly name for the connection
2. Enter the RQLite URL (e.g., `http://localhost:4001`)
3. The app will test the connection before saving

Click any connection card to open the Data Browser.

### Data Browser

The Data Browser has three main areas:

1. **Left Panel (Tables)** - Shows all tables in the database. Click a table to open it in a new tab.

2. **SQL Box (Top)** - A text area where you can write and execute SQL queries. Press **Ctrl+Enter** or click the play button to execute.

3. **Data Grid (Center)** - Displays query results or table data with:
   - Column headers
   - Pagination controls
   - Inline editing (click any cell to edit)

### Tabbed Interface

- Each table opens in its own tab
- Selecting an already-open table switches to its existing tab (no duplicates)
- Close tabs with the X button
- Each tab maintains its own SQL query and pagination state

## Tech Stack

- **Vue 3** - Composition API with `<script setup>`
- **Quasar Framework** - UI components (q-table, q-dialog, q-tabs, q-popup-edit)
- **TypeScript** - Full type safety
- **Pinia** - State management for connections and tabs
- **Axios** - HTTP client for RQLite API calls

## RQLite API Integration

The app uses RQLite's REST API with optimized parameters:

| Feature | Endpoint | Parameters | Notes |
|---------|----------|------------|-------|
| Data Grid | `GET /db/query` | `associative`, `level=none` | Fastest reads, returns key-value rows |
| SQL Console | `POST /db/request` | `associative`, `db_timeout=5s` | Auto-detects read vs write |
| Cell Editing | `POST /db/execute` | `redirect`, parameterized JSON | Leader routing, SQL injection safe |
| Bulk Import | `POST /db/execute` | `transaction`, `redirect` | Batched writes in single Raft entry |
| Schema Info | `GET /db/query` | `PRAGMA table_info()` | Column metadata |

### Why These Parameters Matter

- **`associative`** - Returns rows as `{column: value}` objects instead of arrays, directly compatible with Quasar's q-table
- **`level=none`** - Reads directly from local SQLite without Raft consensus check (fastest possible reads)
- **`redirect`** - Automatically redirects writes to cluster leader, returns 301 with leader address
- **`transaction`** - Wraps batch operations in single Raft log entry for atomicity and performance
- **`db_timeout`** - Prevents runaway queries from blocking the database

## Installation

```bash
# Install dependencies
bun install

# Start development server
bun run dev

# Build for production
bun run build

# Lint files
bun run lint
```

## Project Structure

```
src/
├── components/
│   ├── DatabaseCard.vue      # Connection card on homepage
│   ├── AddDatabaseForm.vue   # Dialog for adding connections
│   ├── TablePanel.vue        # Left sidebar with table list
│   ├── SqlBox.vue            # SQL input with execute button
│   ├── DataGrid.vue          # Paginated table with inline edit, import/export
│   ├── QueryTab.vue          # Combines SqlBox + DataGrid + import logic
│   └── CreateTableDialog.vue # Table creation with builder/SQL modes
├── pages/
│   ├── DatabaseListPage.vue  # Homepage with connections
│   └── DataBrowserPage.vue   # Main browser with tabs
├── services/
│   ├── rqlite-service.ts     # RQLite API client with all endpoints
│   └── storage-service.ts    # localStorage persistence
├── stores/
│   ├── connection-store.ts   # Pinia store for connections
│   └── tab-store.ts          # Pinia store for tabs
└── types/
    ├── database.ts           # Core type definitions
    └── rqlite.ts             # RQLite API response types
```

## Technical Details

### Chunked Import Architecture

The import system is designed to handle millions of rows without browser crashes:

```
File (1M rows) → ReadableStream → Chunk Decoder → Line Parser → Batch Buffer → RQLite API
                     ↓                                              ↓
              ~64KB chunks                                   1000 rows/batch
```

1. **Stream Reading** - Uses `file.stream().getReader()` to read file in ~64KB chunks
2. **Incremental Decoding** - `TextDecoder` with `{ stream: true }` handles UTF-8 across chunk boundaries
3. **Line Buffering** - Accumulates partial lines until newline is found
4. **Batch Accumulation** - Collects 1,000 parsed rows before sending to RQLite
5. **Progress Feedback** - Updates dialog with row count after each batch

### CSV Parser

Custom RFC 4180-compliant parser handles:
- Quoted fields with commas: `"Hello, World"`
- Escaped quotes: `"Say ""Hello"""`
- Mixed quoted/unquoted fields
- Preserves data types as strings (RQLite handles conversion)

### Paginated Export Architecture

The export system fetches data in pages to handle large tables:

```
RQLite API → Page 1 (5000 rows) → Format → Accumulate
           → Page 2 (5000 rows) → Format → Accumulate
           → ...                          → Download File
```

1. **Paginated Fetching** - Uses `LIMIT/OFFSET` to fetch 5,000 rows per request
2. **Progress Tracking** - Updates dialog with exported row count after each page
3. **Memory Efficient** - Accumulates formatted strings, not raw objects
4. **SQL Export** - Generates proper INSERT statements with:
   - NULL handling for undefined values
   - Single quote escaping (`'` → `''`)
   - Numeric values without quotes
   - Boolean to integer conversion (true → 1, false → 0)

## Requirements

- Node.js 20+ or Bun
- RQLite database instance with CORS enabled

### Starting RQLite with CORS

RQLite must be started with CORS headers enabled to allow browser requests.

**Using Docker:**
```bash
docker run -p 4001:4001 rqlite/rqlite -http-allow-origin "*"
```

**Using binary:**
```bash
rqlited -http-allow-origin "*" /path/to/data
```

Without the `-http-allow-origin` flag, browser requests will be blocked by CORS policy.

## License

MIT
