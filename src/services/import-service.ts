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
  onProgress?: (progress: ImportProgress) => void;
}

export class ImportService {
  private worker: Worker | null = null;
  private cancelled = false;

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
    const { file, tableName, connectionUrl, username, password, batchSize = 1000, onProgress } = options;
    
    this.cancelled = false;
    const rqlite = new RqliteService(
      connectionUrl,
      username && password ? { username, password } : undefined
    );
    
    let headers: string[] = [];
    let rowsParsed = 0;
    let rowsInserted = 0;
    let bytesProcessed = 0;
    const totalBytes = file.size;

    // Queue for batches waiting to be inserted
    const batchQueue: string[][][] = [];
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
          const statements: ParameterizedStatement[] = batch.map(values => {
            const placeholders = headers.map(() => '?').join(', ');
            return [
              `INSERT INTO "${tableName}" (${headers.map(h => `"${h}"`).join(', ')}) VALUES (${placeholders})`,
              ...values,
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
