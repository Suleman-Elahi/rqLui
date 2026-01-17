import axios, { type AxiosInstance } from 'axios';
import type { ColumnDef } from '../types/database';
import {
  type RqliteAssociativeResult,
  type RqliteArrayResponse,
  type RqliteArrayResult,
  type RqliteExecuteResponse,
  type RqliteExecuteResult,
  type ParameterizedStatement,
  RqliteError,
} from '../types/rqlite';

export class RqliteService {
  private client: AxiosInstance;

  constructor(baseUrl: string) {
    this.client = axios.create({
      baseURL: baseUrl.replace(/\/$/, ''), // Remove trailing slash
      timeout: 30000,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /**
   * Check for error in response payload
   * CRITICAL: RQLite returns HTTP 200 even for SQL errors
   */
  private checkResponseError(result: { error?: string }): void {
    if (result.error) {
      throw new RqliteError(result.error, result.error);
    }
  }

  /**
   * Convert array format to associative format while preserving column order
   */
  private arrayToAssociative(arrayResult: RqliteArrayResult): RqliteAssociativeResult {
    const { columns, types, values, time, error, rows_affected, last_insert_id } = arrayResult;
    
    if (!values || !columns) {
      return { 
        ...(columns && { columns }),
        ...(types && { types }),
        rows: [],
        ...(time !== undefined && { time }),
        ...(error && { error }),
        ...(rows_affected !== undefined && { rows_affected }),
        ...(last_insert_id !== undefined && { last_insert_id })
      };
    }

    // Convert array rows to objects using column order
    const rows = values.map(valueArray => {
      const row: Record<string, unknown> = {};
      columns.forEach((col, index) => {
        row[col] = valueArray[index];
      });
      return row;
    });

    return { 
      columns,
      ...(types && { types }),
      rows,
      ...(time !== undefined && { time }),
      ...(error && { error }),
      ...(rows_affected !== undefined && { rows_affected }),
      ...(last_insert_id !== undefined && { last_insert_id })
    };
  }

  /**
   * Data Grid Browsing - Fast reads with array format (preserves column order)
   * Endpoint: GET /db/query?level=none&timings
   */
  async queryWithTime(sql: string): Promise<{ result: RqliteAssociativeResult; time?: number }> {
    const response = await this.client.get<RqliteArrayResponse>(
      '/db/query',
      {
        params: {
          q: sql,
          timings: '',
          level: 'none',
        },
      }
    );

    const arrayResult = response.data.results[0];
    if (arrayResult) {
      this.checkResponseError(arrayResult);
    }
    
    const result = arrayResult 
      ? this.arrayToAssociative(arrayResult)
      : { rows: [] };
    
    return { 
      result,
      ...(result.time !== undefined && { time: result.time })
    };
  }

  /**
   * Data Grid Browsing - Fast reads with associative format
   * Endpoint: GET /db/query?associative&level=none
   */
  async query(sql: string): Promise<RqliteAssociativeResult> {
    const { result } = await this.queryWithTime(sql);
    return result;
  }


  /**
   * Raw SQL Console - Auto-detects read vs write (with timing)
   * Endpoint: POST /db/request?db_timeout=5s&timings
   * @param sql - SQL query to execute
   * @param level - Read consistency level (none, weak, linearizable, strong)
   */
  async requestWithTime(
    sql: string,
    level: 'none' | 'weak' | 'linearizable' | 'strong' = 'none'
  ): Promise<{ result: RqliteAssociativeResult | RqliteExecuteResult; time?: number }> {
    const response = await this.client.post<RqliteArrayResponse>(
      '/db/request',
      [sql],
      {
        params: {
          db_timeout: '5s',
          timings: '',
          level,
        },
      }
    );

    const arrayResult = response.data.results[0];
    if (arrayResult) {
      this.checkResponseError(arrayResult);
    }
    
    // Check if it's a SELECT query (has values) or write operation (has rows_affected)
    const result = arrayResult && 'values' in arrayResult
      ? this.arrayToAssociative(arrayResult)
      : (arrayResult || {});
    
    return { 
      result,
      ...(result.time !== undefined && { time: result.time })
    };
  }

  /**
   * Raw SQL Console - Auto-detects read vs write
   * Endpoint: POST /db/request?associative&db_timeout=5s
   * @param sql - SQL query to execute
   * @param level - Read consistency level (none, weak, linearizable, strong)
   */
  async request(
    sql: string,
    level: 'none' | 'weak' | 'linearizable' | 'strong' = 'none'
  ): Promise<RqliteAssociativeResult | RqliteExecuteResult> {
    const { result } = await this.requestWithTime(sql, level);
    return result;
  }

  /**
   * Inline Cell Editing - Parameterized writes
   * Endpoint: POST /db/execute?redirect
   */
  async execute(statement: ParameterizedStatement): Promise<RqliteExecuteResult> {
    const response = await this.client.post<RqliteExecuteResponse>(
      '/db/execute',
      [statement],
      {
        params: {
          redirect: '',
        },
      }
    );

    const result = response.data.results[0];
    if (result) {
      this.checkResponseError(result);
    }
    return result || {};
  }

  /**
   * Batch Updates - Transaction support
   * Endpoint: POST /db/execute?transaction&redirect
   */
  async executeBatch(
    statements: ParameterizedStatement[]
  ): Promise<RqliteExecuteResult[]> {
    const response = await this.client.post<RqliteExecuteResponse>(
      '/db/execute',
      statements,
      {
        params: {
          transaction: '',
          redirect: '',
        },
      }
    );

    for (const result of response.data.results) {
      this.checkResponseError(result);
    }
    return response.data.results;
  }

  /**
   * Connection Test
   * Endpoint: GET /status
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.client.get('/status');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get all tables from the database
   * Uses sqlite_master to list tables
   */
  async getTables(): Promise<string[]> {
    const result = await this.query(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    );
    return (result.rows || []).map((row) => row.name as string);
  }

  /**
   * Get table schema using PRAGMA table_info
   */
  async getTableSchema(table: string): Promise<ColumnDef[]> {
    const result = await this.query(`PRAGMA table_info("${table}")`);
    return (result.rows || []).map((row) => ({
      name: row.name as string,
      label: row.name as string,
      field: row.name as string,
      sortable: true,
      align: 'left' as const,
      type: row.type as string,
      primaryKey: row.pk === 1,
    }));
  }

  /**
   * Get primary key column for a table
   */
  async getTablePrimaryKey(table: string): Promise<string | null> {
    const schema = await this.getTableSchema(table);
    const pkColumn = schema.find((col) => col.primaryKey);
    return pkColumn?.name || null;
  }

  /**
   * Get CREATE TABLE DDL statement for a table
   * Uses sqlite_master to get the original DDL
   */
  async getTableDDL(table: string): Promise<string> {
    const result = await this.query(
      `SELECT sql FROM sqlite_master WHERE type='table' AND name="${table}"`
    );
    const firstRow = result.rows?.[0];
    if (firstRow && firstRow.sql) {
      return firstRow.sql as string;
    }
    // Fallback: generate DDL from schema if not found
    return this.generateTableDDL(table);
  }

  /**
   * Generate CREATE TABLE DDL from schema info
   * Used as fallback if sqlite_master doesn't have the DDL
   */
  private async generateTableDDL(table: string): Promise<string> {
    const schema = await this.getTableSchema(table);
    const columnDefs = schema.map((col) => {
      let def = `"${col.name}" ${col.type || 'TEXT'}`;
      if (col.primaryKey) {
        def += ' PRIMARY KEY';
      }
      return def;
    });
    return `CREATE TABLE "${table}" (\n  ${columnDefs.join(',\n  ')}\n);`;
  }

  /**
   * Get total row count for a table
   */
  async getTableCount(table: string): Promise<number> {
    const result = await this.query(`SELECT COUNT(*) FROM "${table}"`);
    const row = result.rows?.[0];
    
    if (row) {
      // The first (and only) value in the row is the count
      const firstValue = Object.values(row)[0];
      if (typeof firstValue === 'number') return firstValue;
      // Try parsing as number if it's a string
      if (typeof firstValue === 'string') {
        const parsed = parseInt(firstValue, 10);
        if (!isNaN(parsed)) return parsed;
      }
    }
    
    return 0;
  }

  /**
   * Query with pagination using LIMIT/OFFSET (with timing)
   */
  async queryWithPagination(
    table: string,
    page: number,
    pageSize: number
  ): Promise<{ result: RqliteAssociativeResult; total: number; time?: number }> {
    const offset = (page - 1) * pageSize;
    const [queryResult, total] = await Promise.all([
      this.queryWithTime(`SELECT * FROM "${table}" LIMIT ${pageSize} OFFSET ${offset}`),
      this.getTableCount(table),
    ]);
    
    return { 
      result: queryResult.result, 
      total,
      ...(queryResult.time !== undefined && { time: queryResult.time })
    };
  }
}
