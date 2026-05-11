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
  batch?: (string | null)[][];  // Array of rows, each row is array of values (null = SQL NULL)
  headers?: (string | null)[];
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
  
  let buffer = '';
  let isFirstLine = true;
  let headers: (string | null)[] = [];
  let currentBatch: (string | null)[][] = [];
  let totalRows = 0;
  let bytesProcessed = 0;
  const totalBytes = file.size;

  // Extract complete CSV rows respecting quoted fields (which may contain newlines)
  const extractRows = (flush = false): string[] => {
    const rows: string[] = [];
    let inQuotes = false;
    let rowStart = 0;

    for (let i = 0; i < buffer.length; i++) {
      const char = buffer[i];
      if (char === '"') {
        // Toggle quote state, handling escaped quotes ""
        if (inQuotes && buffer[i + 1] === '"') {
          i++; // skip escaped quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === '\n' && !inQuotes) {
        rows.push(buffer.slice(rowStart, i));
        rowStart = i + 1;
      }
    }

    if (flush) {
      // On flush, take whatever remains
      if (rowStart < buffer.length) {
        rows.push(buffer.slice(rowStart));
      }
      buffer = '';
    } else {
      // Keep the incomplete last row in the buffer
      buffer = buffer.slice(rowStart);
    }

    return rows;
  };

  while (!cancelled) {
    const { done, value } = await reader.read();
    
    if (done) break;

    bytesProcessed += value.byteLength;
    buffer += decoder.decode(value, { stream: true });
    
    const rows = extractRows();

    for (const row of rows) {
      if (cancelled) break;
      
      const trimmed = row.trim();
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

  // Flush remaining buffer
  const remaining = extractRows(true);
  for (const row of remaining) {
    if (cancelled) break;
    const trimmed = row.trim();
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

function parseCSVLine(line: string): (string | null)[] {
  const result: (string | null)[] = [];
  let current = '';
  let inQuotes = false;
  let wasQuoted = false;
  
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
        wasQuoted = true;
      } else if (char === ',') {
        // Unquoted empty field = NULL; quoted empty field = empty string
        result.push(!wasQuoted && current === '' ? null : current);
        current = '';
        wasQuoted = false;
      } else {
        current += char;
      }
    }
  }
  result.push(!wasQuoted && current === '' ? null : current);
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

      if (!statement) continue;

      // Remove comments from the statement
      const cleanedStatement = statement
        .split('\n')
        .filter(line => !line.trim().startsWith('--'))
        .join('\n')
        .trim();

      if (!cleanedStatement) continue;

      // Only process INSERT statements
      if (cleanedStatement.toUpperCase().startsWith('INSERT')) {
        currentBatch.push([cleanedStatement]);
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
    const cleanedStatement = statement
      .split('\n')
      .filter(line => !line.trim().startsWith('--'))
      .join('\n')
      .trim();
      
    if (cleanedStatement && cleanedStatement.toUpperCase().startsWith('INSERT')) {
      currentBatch.push([cleanedStatement]);
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
