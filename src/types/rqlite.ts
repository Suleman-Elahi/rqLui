// Response when using associative format (key-value pairs per row)
export interface RqliteAssociativeResponse {
  results: RqliteAssociativeResult[];
  time?: number;
}

export interface RqliteAssociativeResult {
  columns?: string[];
  types?: string[];
  rows?: Record<string, unknown>[]; // associative format returns rows as objects
  error?: string;
  rows_affected?: number;
  last_insert_id?: number;
  time?: number; // query execution time in seconds
}

// Response when using array format (preserves column order)
export interface RqliteArrayResponse {
  results: RqliteArrayResult[];
  time?: number;
}

export interface RqliteArrayResult {
  columns?: string[];
  types?: string[];
  values?: unknown[][]; // array format returns rows as arrays
  error?: string;
  rows_affected?: number;
  last_insert_id?: number;
  time?: number; // query execution time in seconds
}

// Response for execute operations
export interface RqliteExecuteResponse {
  results: RqliteExecuteResult[];
  time?: number;
}

export interface RqliteExecuteResult {
  rows_affected?: number;
  last_insert_id?: number;
  raft_index?: number; // returned when raft_index param is used
  error?: string;
}

// Parameterized statement format for safe SQL execution
// Format: [sql, ...params] e.g., ["UPDATE t SET x = ? WHERE id = ?", "value", 1]
export type ParameterizedStatement = [string, ...unknown[]];

// RQLite status response for connection testing
export interface RqliteStatusResponse {
  build?: {
    version?: string;
  };
  store?: {
    leader?: string;
  };
}

// Custom error class for RQLite errors
export class RqliteError extends Error {
  constructor(
    message: string,
    public sqlError?: string
  ) {
    super(message);
    this.name = 'RqliteError';
  }
}
