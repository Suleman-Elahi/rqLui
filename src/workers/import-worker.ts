/**
 * Web Worker for parsing CSV/SQL files off the main thread
 * Handles streaming file parsing and sends batches back to main thread
 */

export interface ImportWorkerMessage {
  type: 'parse-csv' | 'parse-sql' | 'cancel';
  file?: File;
  tableName?: string;
  batchSize?: number;
}

export interface ImportWorkerResponse {
  type: 'batch' | 'progress' | 'complete' | 'error' | 'headers';
  batch?: string[][];  // Array of rows, each row is array of values
  headers?: string[];
  totalRows?: number;
  bytesProcessed?: number;
  totalBytes?: number;
  error?: string;
}

let cancelled = false;

self.onmessage = async (e: MessageEvent<ImportWorkerMessage>) => {
  const { type, file, batchSize = 1000 } = e.data;

  if (type === 'cancel') {
    cancelled = true;
    return;
  }

  cancelled = false;

  if (!file) {
    postResponse({ type: 'error', error: 'No file provided' });
    return;
  }

  try {
    if (type === 'parse-csv') {
      await parseCSV(file, batchSize);
    } else if (type === 'parse-sql') {
      await parseSQL(file, batchSize);
    }
  } catch (err) {
    postResponse({ 
      type: 'error', 
      error: err instanceof Error ? err.message : 'Unknown error' 
    });
  }
};

function postResponse(response: ImportWorkerResponse) {
  self.postMessage(response);
}

async function parseCSV(file: File, batchSize: number) {
  const reader = file.stream().getReader();
  const decoder = new TextDecoder();
  
  let lineBuffer = '';
  let isFirstLine = true;
  let headers: string[] = [];
  let currentBatch: string[][] = [];
  let totalRows = 0;
  let bytesProcessed = 0;
  const totalBytes = file.size;

  while (!cancelled) {
    const { done, value } = await reader.read();
    
    if (done) break;

    bytesProcessed += value.byteLength;
    lineBuffer += decoder.decode(value, { stream: true });
    
    const lines = lineBuffer.split('\n');
    lineBuffer = lines.pop() || '';

    for (const line of lines) {
      if (cancelled) break;
      
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (isFirstLine) {
        headers = parseCSVLine(trimmed);
        postResponse({ type: 'headers', headers });
        isFirstLine = false;
        continue;
      }

      const values = parseCSVLine(trimmed);
      currentBatch.push(values);
      totalRows++;

      if (currentBatch.length >= batchSize) {
        postResponse({ 
          type: 'batch', 
          batch: currentBatch,
          totalRows,
          bytesProcessed,
          totalBytes
        });
        currentBatch = [];
      }
    }

    // Send progress update
    postResponse({ 
      type: 'progress', 
      bytesProcessed, 
      totalBytes,
      totalRows 
    });
  }

  // Process remaining buffer
  if (!cancelled && lineBuffer.trim()) {
    const values = parseCSVLine(lineBuffer.trim());
    currentBatch.push(values);
    totalRows++;
  }

  // Flush remaining batch
  if (!cancelled && currentBatch.length > 0) {
    postResponse({ 
      type: 'batch', 
      batch: currentBatch,
      totalRows,
      bytesProcessed: totalBytes,
      totalBytes
    });
  }

  if (!cancelled) {
    postResponse({ type: 'complete', totalRows });
  }
}

function parseCSVLine(line: string): string[] {
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
}

async function parseSQL(file: File, batchSize: number) {
  const reader = file.stream().getReader();
  const decoder = new TextDecoder();
  
  let statementBuffer = '';
  let currentBatch: string[][] = [];
  let totalRows = 0;
  let bytesProcessed = 0;
  const totalBytes = file.size;

  while (!cancelled) {
    const { done, value } = await reader.read();
    
    if (done) break;

    bytesProcessed += value.byteLength;
    statementBuffer += decoder.decode(value, { stream: true });

    // Split by semicolons
    let semicolonIndex: number;
    while ((semicolonIndex = statementBuffer.indexOf(';')) !== -1) {
      if (cancelled) break;
      
      const statement = statementBuffer.substring(0, semicolonIndex).trim();
      statementBuffer = statementBuffer.substring(semicolonIndex + 1);

      if (!statement || statement.startsWith('--')) continue;

      // Only process INSERT statements
      if (statement.toUpperCase().startsWith('INSERT')) {
        currentBatch.push([statement]);
        totalRows++;

        if (currentBatch.length >= batchSize) {
          postResponse({ 
            type: 'batch', 
            batch: currentBatch,
            totalRows,
            bytesProcessed,
            totalBytes
          });
          currentBatch = [];
        }
      }
    }

    // Send progress update
    postResponse({ 
      type: 'progress', 
      bytesProcessed, 
      totalBytes,
      totalRows 
    });
  }

  // Process remaining buffer
  if (!cancelled && statementBuffer.trim()) {
    const statement = statementBuffer.trim();
    if (statement.toUpperCase().startsWith('INSERT')) {
      currentBatch.push([statement]);
      totalRows++;
    }
  }

  // Flush remaining batch
  if (!cancelled && currentBatch.length > 0) {
    postResponse({ 
      type: 'batch', 
      batch: currentBatch,
      totalRows,
      bytesProcessed: totalBytes,
      totalBytes
    });
  }

  if (!cancelled) {
    postResponse({ type: 'complete', totalRows });
  }
}
