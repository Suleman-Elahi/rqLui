/**
 * Export Service - Manages concurrent data fetching and worker-based formatting
 * Fetches data in parallel batches while worker formats output
 */

import type { ExportWorkerResponse } from '../workers/export-worker';
import { RqliteService } from './rqlite-service';

export interface ExportProgress {
  phase: 'fetching' | 'formatting' | 'complete' | 'error' | 'cancelled';
  rowsFetched: number;
  rowsFormatted: number;
  totalRows: number;
  error?: string;
}

export interface ExportOptions {
  tableName: string;
  connectionUrl: string;
  username?: string;
  password?: string;
  format: 'csv' | 'sql';
  pageSize?: number;
  concurrency?: number;
  onProgress?: (progress: ExportProgress) => void;
}

export class ExportService {
  private worker: Worker | null = null;
  private cancelled = false;

  async export(options: ExportOptions): Promise<Blob | null> {
    const {
      tableName,
      connectionUrl,
      username,
      password,
      format,
      pageSize = 5000,
      concurrency = 3,
      onProgress,
    } = options;

    this.cancelled = false;
    const rqlite = new RqliteService(
      connectionUrl,
      username && password ? { username, password } : undefined
    );

    // Get total count and schema
    const [totalRows, schema] = await Promise.all([
      rqlite.getTableCount(tableName),
      rqlite.getTableSchema(tableName),
    ]);

    if (totalRows === 0) {
      return null;
    }

    const headers = schema.map((col) => col.name);
    const chunks: string[] = [];
    let rowsFetched = 0;
    let rowsFormatted = 0;

    const progress: ExportProgress = {
      phase: 'fetching',
      rowsFetched: 0,
      rowsFormatted: 0,
      totalRows,
    };

    const updateProgress = (updates: Partial<ExportProgress>) => {
      Object.assign(progress, updates);
      onProgress?.(progress);
    };

    return new Promise((resolve, reject) => {
      // Create worker for formatting
      this.worker = new Worker(
        new URL('../workers/export-worker.ts', import.meta.url),
        { type: 'module' }
      );

      this.worker.onmessage = (e: MessageEvent<ExportWorkerResponse>) => {
        const msg = e.data;

        switch (msg.type) {
          case 'chunk':
            if (msg.chunk) {
              chunks.push(msg.chunk);
            }
            break;

          case 'progress':
            rowsFormatted = msg.totalFormatted || rowsFormatted;
            updateProgress({ phase: 'formatting', rowsFormatted });
            break;

          case 'complete': {
            this.cleanup();
            updateProgress({ phase: 'complete', rowsFormatted: msg.totalFormatted || rowsFormatted });
            const mimeType = format === 'csv' ? 'text/csv' : 'text/sql';
            resolve(new Blob(chunks, { type: mimeType }));
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

      // Initialize worker with format type
      this.worker.postMessage({
        type: format === 'csv' ? 'init-csv' : 'init-sql',
        headers,
        tableName,
        totalRows,
      });

      // Fetch data with controlled concurrency
      this.fetchWithConcurrency(
        rqlite,
        tableName,
        totalRows,
        pageSize,
        concurrency,
        (rows, fetched) => {
          rowsFetched = fetched;
          updateProgress({ phase: 'fetching', rowsFetched });
          
          // Send batch to worker for formatting
          this.worker?.postMessage({ type: 'batch', rows });
        }
      ).then(() => {
        if (!this.cancelled) {
          this.worker?.postMessage({ type: 'finish' });
        } else {
          this.cleanup();
          updateProgress({ phase: 'cancelled' });
          resolve(null);
        }
      }).catch((err: Error) => {
        this.cleanup();
        updateProgress({ phase: 'error', error: err.message });
        reject(err);
      });
    });
  }

  cancel() {
    this.cancelled = true;
    this.worker?.postMessage({ type: 'cancel' });
  }

  private async fetchWithConcurrency(
    rqlite: RqliteService,
    tableName: string,
    totalRows: number,
    pageSize: number,
    concurrency: number,
    onBatch: (rows: Record<string, unknown>[], totalFetched: number) => void
  ): Promise<void> {
    const totalPages = Math.ceil(totalRows / pageSize);
    let currentPage = 1;
    let totalFetched = 0;

    // Process pages in batches of `concurrency`
    while (currentPage <= totalPages && !this.cancelled) {
      const pagesToFetch: number[] = [];
      
      for (let i = 0; i < concurrency && currentPage <= totalPages; i++) {
        pagesToFetch.push(currentPage);
        currentPage++;
      }

      // Fetch pages concurrently
      const results = await Promise.all(
        pagesToFetch.map((page) =>
          rqlite.queryWithPagination(tableName, page, pageSize)
        )
      );

      // Process results in order
      for (const { result } of results) {
        if (this.cancelled) break;
        
        if (result.rows && result.rows.length > 0) {
          totalFetched += result.rows.length;
          onBatch(result.rows, totalFetched);
        }
      }
    }
  }

  private cleanup() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }
}
