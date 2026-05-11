/**
 * Import Service - Manages Web Worker for file imports
 * Provides a clean API for importing CSV/SQL files with progress tracking
 */

import type { ImportWorkerResponse } from '../workers/import-worker';
import type { ParameterizedStatement } from '../types/rqlite';
import { RqliteService } from './rqlite-service';

export interface ImportProgress {
  phase: 'parsing' | 'inserting' | 'complete' | 'error' | 'cancelled';
  rowsParsed: number;
  rowsInserted: number;
  bytesProcessed: number;
  totalBytes: number;
  error?: string;
}

export interface ImportOptions {
  file: File;
  tableName: string;
  connectionUrl: string;
  username?: string;
  password?: string;
  batchSize?: number;
  columnMapping?: Record<string, string>;
  onProgress?: (progress: ImportProgress) => void;
}

export class ImportService {
  private worker: Worker | null = null;
  private cancelled = false;

  /**
   * Parse only the header row and a few preview rows from a CSV file.
   * Reads only the first chunk of the file for performance.
   */
  static async parseCSVPreview(
    file: File,
    maxRows = 3
  ): Promise<{ headers: string[]; previewRows: string[][] }> {
    const PREVIEW_BYTES = 8192; // Read at most 8KB for preview
    const slice = file.slice(0, Math.min(file.size, PREVIEW_BYTES));
    const text = await slice.text();
    const lines = text.split('\n').filter((l) => l.trim());

    if (lines.length === 0) {
      return { headers: [], previewRows: [] };
    }

    const parseCSVLine = (line: string): string[] => {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const nextChar = line[i + 1];

        if (inQuotes) {
          if (char === '"' && nextChar === '"') {
            current += '"';
            i++;
          } else if (char === '"') {
            inQuotes = false;
          } else {
            current += char;
          }
        } else {
          if (char === '"') {
            inQuotes = true;
          } else if (char === ',') {
            result.push(current.trim());
            current = '';
          } else {
            current += char;
          }
        }
      }
      result.push(current.trim());
      return result;
    };

    const headers = parseCSVLine(lines[0]!);
    const previewRows: string[][] = [];

    for (let i = 1; i < lines.length && previewRows.length < maxRows; i++) {
      previewRows.push(parseCSVLine(lines[i]!));
    }

    return { headers, previewRows };
  }

  async importCSV(options: ImportOptions): Promise<ImportProgress> {
    return this.runImport('parse-csv', options);
  }

  async importSQL(options: ImportOptions): Promise<ImportProgress> {
    return this.runImport('parse-sql', options);
  }

  cancel() {
    this.cancelled = true;
    if (this.worker) {
      this.worker.postMessage({ type: 'cancel' });
    }
  }

  private async runImport(
    type: 'parse-csv' | 'parse-sql',
    options: ImportOptions
  ): Promise<ImportProgress> {
    const { file, tableName, connectionUrl, username, password, batchSize = 1000, columnMapping, onProgress } = options;
    
    this.cancelled = false;
    const rqlite = new RqliteService(
      connectionUrl,
      username && password ? { username, password } : undefined
    );
    
    let headers: (string | null)[] = [];
    let mappedIndices: number[] = [];
    let mappedTableColumns: string[] = [];
    let rowsParsed = 0;
    let rowsInserted = 0;
    let bytesProcessed = 0;
    const totalBytes = file.size;

    // Queue for batches waiting to be inserted
    const batchQueue: (string | null)[][][] = [];
    let isInserting = false;

    const progress: ImportProgress = {
      phase: 'parsing',
      rowsParsed: 0,
      rowsInserted: 0,
      bytesProcessed: 0,
      totalBytes,
    };

    const updateProgress = (updates: Partial<ImportProgress>) => {
      Object.assign(progress, updates);
      onProgress?.(progress);
    };

    // Process batch queue - runs concurrently with parsing
    const processBatchQueue = async () => {
      if (isInserting || batchQueue.length === 0 || this.cancelled) return;
      
      isInserting = true;
      
      while (batchQueue.length > 0 && !this.cancelled) {
        const batch = batchQueue.shift()!;
        
        if (type === 'parse-csv') {
          // Use mapped columns if mapping is provided, otherwise use all headers
          const targetColumns = mappedTableColumns.length > 0 ? mappedTableColumns : headers;
          const useMapping = mappedIndices.length > 0;

          const statements: ParameterizedStatement[] = batch.map(values => {
            const rowValues = useMapping
              ? mappedIndices.map(i => values[i])
              : values;
            const placeholders = targetColumns.map(() => '?').join(', ');
            return [
              `INSERT INTO "${tableName}" (${targetColumns.map(h => `"${h}"`).join(', ')}) VALUES (${placeholders})`,
              ...rowValues,
            ] as ParameterizedStatement;
          });
          await rqlite.executeBatch(statements);
        } else {
          // SQL import - statements are already complete
          const statements: ParameterizedStatement[] = batch.map(
            row => [row[0]] as ParameterizedStatement
          );
          await rqlite.executeBatch(statements);
        }
        
        rowsInserted += batch.length;
        updateProgress({ 
          phase: 'inserting', 
          rowsInserted 
        });
      }
      
      isInserting = false;
    };

    return new Promise((resolve, reject) => {
      // Create worker
      this.worker = new Worker(
        new URL('../workers/import-worker.ts', import.meta.url),
        { type: 'module' }
      );

      this.worker.onmessage = (e: MessageEvent<ImportWorkerResponse>) => {
        const msg = e.data;

        switch (msg.type) {
          case 'headers':
            headers = msg.headers || [];
            // Build mapping indices if column mapping is provided
            if (columnMapping && type === 'parse-csv') {
              mappedIndices = [];
              mappedTableColumns = [];
              for (let i = 0; i < headers.length; i++) {
                const header = headers[i];
                if (header == null) continue;
                const tableCol = columnMapping[header];
                if (tableCol) {
                  mappedIndices.push(i);
                  mappedTableColumns.push(tableCol);
                }
              }
            }
            break;

          case 'batch':
            if (msg.batch) {
              rowsParsed = msg.totalRows || rowsParsed;
              bytesProcessed = msg.bytesProcessed || bytesProcessed;
              
              batchQueue.push(msg.batch);
              updateProgress({ 
                phase: 'parsing', 
                rowsParsed, 
                bytesProcessed 
              });
              
              // Start processing queue (non-blocking)
              processBatchQueue().catch((err: Error) => {
                this.cancel();
                updateProgress({ phase: 'error', error: err.message });
                reject(err);
              });
            }
            break;

          case 'progress':
            bytesProcessed = msg.bytesProcessed || bytesProcessed;
            rowsParsed = msg.totalRows || rowsParsed;
            updateProgress({ bytesProcessed, rowsParsed });
            break;

          case 'complete': {
            // Wait for all batches to finish inserting
            const waitForInserts = async () => {
              while (batchQueue.length > 0 || isInserting) {
                await new Promise(r => setTimeout(r, 100));
                await processBatchQueue();
              }
              
              this.cleanup();
              
              if (this.cancelled) {
                updateProgress({ phase: 'cancelled' });
              } else {
                updateProgress({ 
                  phase: 'complete', 
                  rowsParsed: msg.totalRows || rowsParsed,
                  rowsInserted 
                });
              }
              resolve(progress);
            };
            waitForInserts().catch((err: Error) => reject(err));
            break;
          }

          case 'error':
            this.cleanup();
            updateProgress({ phase: 'error', error: msg.error || 'Unknown error' });
            reject(new Error(msg.error));
            break;
        }
      };

      this.worker.onerror = (err) => {
        this.cleanup();
        updateProgress({ phase: 'error', error: err.message });
        reject(new Error(err.message));
      };

      // Start parsing
      this.worker.postMessage({
        type,
        file,
        tableName,
        batchSize,
      });
    });
  }

  private cleanup() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }
}
