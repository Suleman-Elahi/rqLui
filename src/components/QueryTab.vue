<template>
  <div class="query-tab column full-height">
    <SqlBox
      v-model="sql"
      :loading="loading"
      :consistency="consistency"
      @execute="executeQuery"
      @update:consistency="consistency = $event"
    />

    <div v-if="error" class="q-pa-sm bg-negative text-white">
      {{ error }}
    </div>

    <div v-if="queryTime !== null" class="q-pa-xs q-px-sm text-caption text-grey-7 bg-grey-2">
      Query time: {{ (queryTime * 1000).toFixed(2) }}ms
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
        @delete-row="handleDeleteRow"
        @import-csv="handleImportCsv"
        @import-sql="handleImportSql"
        @export-csv="handleExportCsv"
        @export-sql="handleExportSql"
        @export-ddl="handleExportDdl"
        @truncate-table="handleTruncateTable"
        @delete-table="handleDeleteTable"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, onUnmounted } from 'vue';
import { useQuasar } from 'quasar';
import SqlBox, { type ConsistencyLevel } from './SqlBox.vue';
import DataGrid from './DataGrid.vue';
import { RqliteService } from '../services/rqlite-service';
import { ImportService, type ImportProgress } from '../services/import-service';
import { ExportService, type ExportProgress } from '../services/export-service';
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
const queryTime = ref<number | null>(null);
const primaryKey = ref<string | null>(null);
const consistency = ref<ConsistencyLevel>('none');
const pagination = ref<PaginationState>({
  page: 1,
  rowsPerPage: 100,
  rowsNumber: 0,
});

let rqliteService: RqliteService;
let importService: ImportService | null = null;
let exportService: ExportService | null = null;

onMounted(async () => {
  rqliteService = new RqliteService(props.connectionUrl);
  await loadTableSchema();
  await loadData();
});

onUnmounted(() => {
  // Cancel any ongoing import/export when component unmounts
  if (importService) {
    importService.cancel();
  }
  if (exportService) {
    exportService.cancel();
  }
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
  queryTime.value = null;

  try {
    const { result, total, time } = await rqliteService.queryWithPagination(
      props.tableName,
      pagination.value.page,
      pagination.value.rowsPerPage
    );

    queryTime.value = time ?? null;

    rows.value = (result.rows || []).map((row, index) => ({
      ...row,
      __rowIndex: index,
    }));
    
    // IMPORTANT: Use columns from API response to preserve order
    if (result.columns && result.columns.length > 0) {
      columns.value = result.columns.map((col) => ({
        name: col,
        label: col,
        field: col,
        sortable: true,
        align: 'left' as const,
      }));
    } else if (result.rows && result.rows.length > 0) {
      // Fallback: derive from first row (but this may not preserve order)
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
    
    // Update pagination - create new object to ensure reactivity
    pagination.value = {
      ...pagination.value,
      rowsNumber: total
    };
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
  queryTime.value = null;

  try {
    const { result, time } = await rqliteService.requestWithTime(sql.value, consistency.value);

    queryTime.value = time ?? null;

    if ('rows' in result && result.rows) {
      // SELECT query
      rows.value = result.rows.map((row, index) => ({
        ...row,
        __rowIndex: index,
      }));
      
      // IMPORTANT: Use columns from API response to preserve order
      if (result.columns && result.columns.length > 0) {
        columns.value = result.columns.map((col) => ({
          name: col,
          label: col,
          field: col,
          sortable: true,
          align: 'left' as const,
        }));
      } else if (result.rows.length > 0) {
        // Fallback: derive from first row (but this may not preserve order)
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

function handleDeleteRow(row: Record<string, unknown>) {
  if (!primaryKey.value) {
    $q.notify({ type: 'negative', message: 'Cannot delete: no primary key' });
    return;
  }

  const pkValue = row[primaryKey.value];
  
  $q.dialog({
    title: 'Delete Row',
    message: `Are you sure you want to delete this row? This action cannot be undone.`,
    cancel: true,
    persistent: true,
    color: 'negative',
  }).onOk(() => {
    void (async () => {
      try {
        const statement: ParameterizedStatement = [
          `DELETE FROM "${props.tableName}" WHERE "${primaryKey.value}" = ?`,
          pkValue,
        ];

        await rqliteService.execute(statement);
        $q.notify({ type: 'positive', message: 'Row deleted' });
        await loadData();
      } catch (err) {
        $q.notify({
          type: 'negative',
          message: err instanceof Error ? err.message : 'Delete failed',
        });
      }
    })();
  });
}

async function handleExportCsv() {
  await runWorkerExport('csv');
}

async function handleExportSql() {
  await runWorkerExport('sql');
}

async function handleExportDdl() {
  try {
    loading.value = true;
    const ddl = await rqliteService.getTableDDL(props.tableName);
    
    const content = [
      `-- DDL for table "${props.tableName}"`,
      `-- Generated by rqLui on ${new Date().toISOString()}`,
      '',
      ddl,
      '',
    ].join('\n');

    const blob = new Blob([content], { type: 'text/sql' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${props.tableName}_ddl.sql`;
    a.click();
    URL.revokeObjectURL(url);

    $q.notify({ type: 'positive', message: 'DDL exported successfully' });
  } catch (err) {
    $q.notify({
      type: 'negative',
      message: err instanceof Error ? err.message : 'DDL export failed',
    });
  } finally {
    loading.value = false;
  }
}

async function runWorkerExport(format: 'csv' | 'sql') {
  const total = pagination.value.rowsNumber;

  if (total === 0) {
    $q.notify({ type: 'warning', message: 'No data to export' });
    return;
  }

  exportService = new ExportService();

  // Show progress dialog with cancel button
  const progressDialog = $q.dialog({
    title: `Exporting ${format.toUpperCase()}`,
    message: 'Starting export...',
    progress: true,
    persistent: true,
    cancel: 'Cancel',
  }).onCancel(() => {
    exportService?.cancel();
  });

  try {
    loading.value = true;

    const onProgress = (progress: ExportProgress) => {
      const percent = progress.totalRows > 0
        ? Math.round((progress.rowsFetched / progress.totalRows) * 100)
        : 0;

      let message = '';
      if (progress.phase === 'fetching') {
        message = `Fetching: ${progress.rowsFetched.toLocaleString()} / ${progress.totalRows.toLocaleString()} rows (${percent}%)`;
      } else if (progress.phase === 'formatting') {
        message = `Formatting: ${progress.rowsFormatted.toLocaleString()} / ${progress.totalRows.toLocaleString()} rows`;
      }

      progressDialog.update({ message });
    };

    const blob = await exportService.export({
      tableName: props.tableName,
      connectionUrl: props.connectionUrl,
      format,
      pageSize: 5000,
      concurrency: 3,
      onProgress,
    });

    progressDialog.hide();

    if (blob) {
      // Download the file
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${props.tableName}.${format}`;
      a.click();
      URL.revokeObjectURL(url);

      $q.notify({
        type: 'positive',
        message: `Successfully exported ${total.toLocaleString()} rows to ${format.toUpperCase()}`,
      });
    } else {
      $q.notify({ type: 'warning', message: 'Export cancelled' });
    }
  } catch (err) {
    progressDialog.hide();
    $q.notify({
      type: 'negative',
      message: err instanceof Error ? err.message : 'Export failed',
    });
  } finally {
    loading.value = false;
    exportService = null;
  }
}

function handleImportCsv() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.csv';
  input.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    await runWorkerImport(file, 'csv');
  };
  input.click();
}

function handleImportSql() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.sql';
  input.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    await runWorkerImport(file, 'sql');
  };
  input.click();
}

async function runWorkerImport(file: File, type: 'csv' | 'sql') {
  importService = new ImportService();
  
  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Show progress dialog with cancel button
  const progressDialog = $q.dialog({
    title: `Importing ${type.toUpperCase()}`,
    message: 'Starting import...',
    progress: true,
    persistent: true,
    cancel: 'Cancel',
  }).onCancel(() => {
    importService?.cancel();
  });

  try {
    loading.value = true;

    const onProgress = (progress: ImportProgress) => {
      const percent = progress.totalBytes > 0 
        ? Math.round((progress.bytesProcessed / progress.totalBytes) * 100) 
        : 0;
      
      let message = '';
      if (progress.phase === 'parsing') {
        message = `Parsing: ${formatBytes(progress.bytesProcessed)} / ${formatBytes(progress.totalBytes)} (${percent}%)\n`;
        message += `Rows parsed: ${progress.rowsParsed.toLocaleString()}`;
        if (progress.rowsInserted > 0) {
          message += ` | Inserted: ${progress.rowsInserted.toLocaleString()}`;
        }
      } else if (progress.phase === 'inserting') {
        message = `Inserting rows: ${progress.rowsInserted.toLocaleString()} / ${progress.rowsParsed.toLocaleString()}`;
      }
      
      progressDialog.update({ message });
    };

    const result = await (type === 'csv' 
      ? importService.importCSV({
          file,
          tableName: props.tableName,
          connectionUrl: props.connectionUrl,
          batchSize: 1000,
          onProgress,
        })
      : importService.importSQL({
          file,
          tableName: props.tableName,
          connectionUrl: props.connectionUrl,
          batchSize: 500,
          onProgress,
        })
    );

    progressDialog.hide();

    if (result.phase === 'cancelled') {
      $q.notify({ 
        type: 'warning', 
        message: `Import cancelled. ${result.rowsInserted.toLocaleString()} rows were inserted.` 
      });
    } else if (result.phase === 'complete') {
      $q.notify({ 
        type: 'positive', 
        message: `Successfully imported ${result.rowsInserted.toLocaleString()} rows` 
      });
    }

    await loadData();
  } catch (err) {
    progressDialog.hide();
    $q.notify({
      type: 'negative',
      message: err instanceof Error ? err.message : 'Import failed',
    });
  } finally {
    loading.value = false;
    importService = null;
  }
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
