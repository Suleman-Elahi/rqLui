<template>
  <div class="query-tab column full-height">
    <SqlBox
      v-model="sql"
      :loading="loading"
      @execute="executeQuery"
    />

    <div v-if="error" class="q-pa-sm bg-negative text-white">
      {{ error }}
    </div>

    <div class="col relative-position">
      <DataGrid
        :columns="columns"
        :rows="rows"
        :loading="loading"
        :pagination="pagination"
        :primary-key="primaryKey"
        @update:pagination="handlePaginationChange"
        @cell-edit="handleCellEdit"
        @insert-row="handleInsertRow"
        @import-csv="handleImportCsv"
        @import-sql="handleImportSql"
        @export-csv="handleExportCsv"
        @export-sql="handleExportSql"
        @truncate-table="handleTruncateTable"
        @delete-table="handleDeleteTable"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { useQuasar } from 'quasar';
import SqlBox from './SqlBox.vue';
import DataGrid from './DataGrid.vue';
import { RqliteService } from '../services/rqlite-service';
import type { ColumnDef, PaginationState, CellEditPayload } from '../types/database';
import type { ParameterizedStatement } from '../types/rqlite';

const props = defineProps<{
  connectionUrl: string;
  tableName: string;
}>();

const emit = defineEmits<{
  (e: 'table-deleted'): void;
}>();

const $q = useQuasar();

const sql = ref(`SELECT * FROM "${props.tableName}"`);
const columns = ref<ColumnDef[]>([]);
const rows = ref<Record<string, unknown>[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const primaryKey = ref<string | null>(null);
const pagination = ref<PaginationState>({
  page: 1,
  rowsPerPage: 25,
  rowsNumber: 0,
});

let rqliteService: RqliteService;

onMounted(async () => {
  rqliteService = new RqliteService(props.connectionUrl);
  await loadTableSchema();
  await loadData();
});

watch(() => props.tableName, async () => {
  sql.value = `SELECT * FROM "${props.tableName}"`;
  await loadTableSchema();
  await loadData();
});

async function loadTableSchema() {
  try {
    columns.value = await rqliteService.getTableSchema(props.tableName);
    primaryKey.value = await rqliteService.getTablePrimaryKey(props.tableName);
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load schema';
  }
}

async function loadData() {
  loading.value = true;
  error.value = null;

  try {
    const { result, total } = await rqliteService.queryWithPagination(
      props.tableName,
      pagination.value.page,
      pagination.value.rowsPerPage
    );

    rows.value = (result.rows || []).map((row, index) => ({
      ...row,
      __rowIndex: index,
    }));
    
    // Update columns from query result or derive from first row
    if (result.columns && result.columns.length > 0) {
      columns.value = result.columns.map((col) => ({
        name: col,
        label: col,
        field: col,
        sortable: true,
        align: 'left' as const,
      }));
    } else if (result.rows && result.rows.length > 0) {
      const firstRow = result.rows[0];
      if (firstRow) {
        const colNames = Object.keys(firstRow).filter(k => !k.startsWith('__'));
        columns.value = colNames.map((col) => ({
          name: col,
          label: col,
          field: col,
          sortable: true,
          align: 'left' as const,
        }));
      }
    }
    
    pagination.value.rowsNumber = total;
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Query failed';
    rows.value = [];
  } finally {
    loading.value = false;
  }
}

async function executeQuery() {
  loading.value = true;
  error.value = null;

  try {
    const result = await rqliteService.request(sql.value);

    if ('rows' in result && result.rows) {
      // SELECT query - derive columns from the first row if columns array not provided
      rows.value = result.rows.map((row, index) => ({
        ...row,
        __rowIndex: index,
      }));
      
      // Use columns from response, or derive from first row keys
      if (result.columns && result.columns.length > 0) {
        columns.value = result.columns.map((col) => ({
          name: col,
          label: col,
          field: col,
          sortable: true,
          align: 'left' as const,
        }));
      } else if (result.rows.length > 0) {
        // Derive columns from first row keys (excluding internal __rowIndex)
        const firstRow = result.rows[0];
        if (firstRow) {
          const colNames = Object.keys(firstRow).filter(k => !k.startsWith('__'));
          columns.value = colNames.map((col) => ({
            name: col,
            label: col,
            field: col,
            sortable: true,
            align: 'left' as const,
          }));
        }
      }
      pagination.value.rowsNumber = rows.value.length;
    } else {
      // INSERT/UPDATE/DELETE
      $q.notify({
        type: 'positive',
        message: `Query executed. Rows affected: ${result.rows_affected || 0}`,
      });
      await loadData();
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Query failed';
  } finally {
    loading.value = false;
  }
}

function handlePaginationChange(newPagination: PaginationState) {
  pagination.value = newPagination;
  void loadData();
}

async function handleCellEdit(payload: CellEditPayload) {
  if (!primaryKey.value) {
    $q.notify({ type: 'negative', message: 'Cannot edit: no primary key' });
    return;
  }

  try {
    const statement: ParameterizedStatement = [
      `UPDATE "${props.tableName}" SET "${payload.column}" = ? WHERE "${payload.primaryKey}" = ?`,
      payload.newValue,
      payload.primaryKeyValue,
    ];

    await rqliteService.execute(statement);
    $q.notify({ type: 'positive', message: 'Cell updated' });
    await loadData(); // Reload to show updated value
  } catch (err) {
    $q.notify({
      type: 'negative',
      message: err instanceof Error ? err.message : 'Update failed',
    });
    await loadData(); // Revert by reloading
  }
}

async function handleInsertRow(data: Record<string, string>) {
  const cols = Object.keys(data).filter((k) => data[k] !== '');
  const values = cols.map((k) => data[k]);
  
  if (cols.length === 0) {
    $q.notify({ type: 'negative', message: 'Please fill at least one field' });
    return;
  }

  try {
    const placeholders = cols.map(() => '?').join(', ');
    const statement: ParameterizedStatement = [
      `INSERT INTO "${props.tableName}" (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${placeholders})`,
      ...values,
    ];

    await rqliteService.execute(statement);
    $q.notify({ type: 'positive', message: 'Row inserted' });
    await loadData();
  } catch (err) {
    $q.notify({
      type: 'negative',
      message: err instanceof Error ? err.message : 'Insert failed',
    });
  }
}

async function handleExportCsv() {
  const PAGE_SIZE = 5000;
  let totalExported = 0;
  const total = pagination.value.rowsNumber;

  if (total === 0) {
    $q.notify({ type: 'warning', message: 'No data to export' });
    return;
  }

  // Show progress dialog
  const progressDialog = $q.dialog({
    title: 'Exporting CSV',
    message: 'Starting export...',
    progress: true,
    persistent: true,
    ok: false,
  });

  try {
    loading.value = true;
    
    // Get column names
    const headers = columns.value.map((c) => c.name);
    const csvParts: string[] = [headers.join(',')];

    // Fetch and process in pages
    let page = 1;
    while (totalExported < total) {
      const { result } = await rqliteService.queryWithPagination(
        props.tableName,
        page,
        PAGE_SIZE
      );

      if (!result.rows || result.rows.length === 0) break;

      for (const row of result.rows) {
        const csvRow = headers.map((h) => {
          const val = row[h];
          if (val === null || val === undefined) return '';
          if (typeof val === 'object') return `"${JSON.stringify(val).replace(/"/g, '""')}"`;
          const str = typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean' 
            ? String(val) 
            : JSON.stringify(val);
          return str.includes(',') || str.includes('"') || str.includes('\n') 
            ? `"${str.replace(/"/g, '""')}"` 
            : str;
        }).join(',');
        csvParts.push(csvRow);
      }

      totalExported += result.rows.length;
      progressDialog.update({ message: `Exported ${totalExported.toLocaleString()} / ${total.toLocaleString()} rows...` });
      page++;
    }

    // Create and download file
    const csv = csvParts.join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${props.tableName}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    progressDialog.hide();
    $q.notify({ type: 'positive', message: `Successfully exported ${totalExported.toLocaleString()} rows to CSV` });
  } catch (err) {
    progressDialog.hide();
    $q.notify({
      type: 'negative',
      message: err instanceof Error ? err.message : 'Export failed',
    });
  } finally {
    loading.value = false;
  }
}

async function handleExportSql() {
  const PAGE_SIZE = 5000;
  let totalExported = 0;
  const total = pagination.value.rowsNumber;

  if (total === 0) {
    $q.notify({ type: 'warning', message: 'No data to export' });
    return;
  }

  // Show progress dialog
  const progressDialog = $q.dialog({
    title: 'Exporting SQL',
    message: 'Starting export...',
    progress: true,
    persistent: true,
    ok: false,
  });

  try {
    loading.value = true;
    
    // Get column names
    const colNames = columns.value.map((c) => c.name);
    const sqlParts: string[] = [
      `-- Export of table "${props.tableName}"`,
      `-- Generated by rqLui on ${new Date().toISOString()}`,
      `-- Total rows: ${total}`,
      '',
    ];

    // Fetch and process in pages
    let page = 1;
    while (totalExported < total) {
      const { result } = await rqliteService.queryWithPagination(
        props.tableName,
        page,
        PAGE_SIZE
      );

      if (!result.rows || result.rows.length === 0) break;

      for (const row of result.rows) {
        const values = colNames.map((col) => {
          const val = row[col];
          if (val === null || val === undefined) return 'NULL';
          if (typeof val === 'number') return String(val);
          if (typeof val === 'boolean') return val ? '1' : '0';
          if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
          // For string and other primitives
          const strVal = typeof val === 'string' ? val : JSON.stringify(val);
          return `'${strVal.replace(/'/g, "''")}'`;
        });
        
        sqlParts.push(
          `INSERT INTO "${props.tableName}" (${colNames.map((c) => `"${c}"`).join(', ')}) VALUES (${values.join(', ')});`
        );
      }

      totalExported += result.rows.length;
      progressDialog.update({ message: `Exported ${totalExported.toLocaleString()} / ${total.toLocaleString()} rows...` });
      page++;
    }

    // Create and download file
    const sql = sqlParts.join('\n');
    const blob = new Blob([sql], { type: 'text/sql' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${props.tableName}.sql`;
    a.click();
    URL.revokeObjectURL(url);

    progressDialog.hide();
    $q.notify({ type: 'positive', message: `Successfully exported ${totalExported.toLocaleString()} rows to SQL` });
  } catch (err) {
    progressDialog.hide();
    $q.notify({
      type: 'negative',
      message: err instanceof Error ? err.message : 'Export failed',
    });
  } finally {
    loading.value = false;
  }
}

function handleImportCsv() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.csv';
  input.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    const BATCH_SIZE = 1000;
    let totalImported = 0;
    let headers: string[] = [];
    let currentBatch: ParameterizedStatement[] = [];
    let lineBuffer = '';
    let isFirstLine = true;

    // Show progress dialog
    const progressDialog = $q.dialog({
      title: 'Importing CSV',
      message: 'Starting import...',
      progress: true,
      persistent: true,
      ok: false,
    });

    const reader = file.stream().getReader();
    const decoder = new TextDecoder();

    try {
      loading.value = true;

      const processLine = (line: string) => {
        if (!line.trim()) return;
        
        if (isFirstLine) {
          headers = parseCSVLine(line);
          isFirstLine = false;
          return;
        }

        const values = parseCSVLine(line);
        const placeholders = headers.map(() => '?').join(', ');
        currentBatch.push([
          `INSERT INTO "${props.tableName}" (${headers.map((h) => `"${h}"`).join(', ')}) VALUES (${placeholders})`,
          ...values,
        ] as ParameterizedStatement);
      };

      const flushBatch = async () => {
        if (currentBatch.length === 0) return;
        await rqliteService.executeBatch(currentBatch);
        totalImported += currentBatch.length;
        progressDialog.update({ message: `Imported ${totalImported.toLocaleString()} rows...` });
        currentBatch = [];
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        lineBuffer += decoder.decode(value, { stream: true });
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop() || '';

        for (const line of lines) {
          processLine(line);
          if (currentBatch.length >= BATCH_SIZE) {
            await flushBatch();
          }
        }
      }

      // Process remaining buffer
      if (lineBuffer.trim()) {
        processLine(lineBuffer);
      }
      await flushBatch();

      progressDialog.hide();
      $q.notify({ type: 'positive', message: `Successfully imported ${totalImported.toLocaleString()} rows` });
      await loadData();
    } catch (err) {
      progressDialog.hide();
      $q.notify({
        type: 'negative',
        message: err instanceof Error ? err.message : 'Import failed',
      });
    } finally {
      loading.value = false;
    }
  };
  input.click();
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

function handleImportSql() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.sql';
  input.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    const BATCH_SIZE = 500;
    let totalExecuted = 0;
    let currentBatch: ParameterizedStatement[] = [];
    let statementBuffer = '';

    // Show progress dialog
    const progressDialog = $q.dialog({
      title: 'Importing SQL',
      message: 'Starting import...',
      progress: true,
      persistent: true,
      ok: false,
    });

    const reader = file.stream().getReader();
    const decoder = new TextDecoder();

    try {
      loading.value = true;

      const processStatement = (stmt: string) => {
        const trimmed = stmt.trim();
        if (!trimmed || trimmed.startsWith('--')) return;
        
        // Only process INSERT statements
        if (trimmed.toUpperCase().startsWith('INSERT')) {
          currentBatch.push([trimmed] as ParameterizedStatement);
        }
      };

      const flushBatch = async () => {
        if (currentBatch.length === 0) return;
        await rqliteService.executeBatch(currentBatch);
        totalExecuted += currentBatch.length;
        progressDialog.update({ message: `Executed ${totalExecuted.toLocaleString()} statements...` });
        currentBatch = [];
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        statementBuffer += decoder.decode(value, { stream: true });
        
        // Split by semicolons (simple SQL statement separator)
        let semicolonIndex: number;
        while ((semicolonIndex = statementBuffer.indexOf(';')) !== -1) {
          const statement = statementBuffer.substring(0, semicolonIndex);
          statementBuffer = statementBuffer.substring(semicolonIndex + 1);
          
          processStatement(statement);
          
          if (currentBatch.length >= BATCH_SIZE) {
            await flushBatch();
          }
        }
      }

      // Process remaining buffer
      if (statementBuffer.trim()) {
        processStatement(statementBuffer);
      }
      await flushBatch();

      progressDialog.hide();
      $q.notify({ type: 'positive', message: `Successfully executed ${totalExecuted.toLocaleString()} INSERT statements` });
      await loadData();
    } catch (err) {
      progressDialog.hide();
      $q.notify({
        type: 'negative',
        message: err instanceof Error ? err.message : 'SQL import failed',
      });
    } finally {
      loading.value = false;
    }
  };
  input.click();
}

function handleTruncateTable() {
  $q.dialog({
    title: 'Truncate Table',
    message: `Are you sure you want to delete ALL rows from "${props.tableName}"? This action cannot be undone.`,
    cancel: true,
    persistent: true,
    color: 'negative',
  }).onOk(() => {
    void (async () => {
      try {
        loading.value = true;
        await rqliteService.request(`DELETE FROM "${props.tableName}"`);
        $q.notify({ type: 'positive', message: `Table "${props.tableName}" truncated` });
        await loadData();
      } catch (err) {
        $q.notify({
          type: 'negative',
          message: err instanceof Error ? err.message : 'Truncate failed',
        });
      } finally {
        loading.value = false;
      }
    })();
  });
}

function handleDeleteTable() {
  $q.dialog({
    title: 'Delete Table',
    message: `Are you sure you want to DELETE the table "${props.tableName}"? This will remove the table and all its data permanently.`,
    cancel: true,
    persistent: true,
    color: 'negative',
  }).onOk(() => {
    void (async () => {
      try {
        loading.value = true;
        await rqliteService.request(`DROP TABLE "${props.tableName}"`);
        $q.notify({ type: 'positive', message: `Table "${props.tableName}" deleted` });
        emit('table-deleted');
      } catch (err) {
        $q.notify({
          type: 'negative',
          message: err instanceof Error ? err.message : 'Delete table failed',
        });
      } finally {
        loading.value = false;
      }
    })();
  });
}
</script>

<style scoped>
.query-tab {
  height: 100%;
}
</style>
