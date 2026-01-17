<template>
  <q-table
    :rows="allRows"
    :columns="tableColumns"
    :loading="loading"
    v-model:pagination="tablePagination"
    :rows-per-page-options="[100, 250, 500, 1000]"
    row-key="__rowIndex"
    flat
    bordered
    dense
    separator="cell"
    class="data-grid"
    @request="onRequest"
  >
    <template #top-left>
      <q-btn 
        v-if="!isAddingRow" 
        flat 
        dense
        color="primary" 
        icon="add" 
        label="Add Row" 
        @click="startAddRow" 
        class="q-mr-sm"
      />
      <q-btn 
        flat 
        dense
        color="secondary" 
        icon="file_upload" 
        label="Import" 
        class="q-mr-sm"
      >
        <q-menu>
          <q-list dense style="min-width: 150px">
            <q-item clickable v-close-popup @click="$emit('import-csv')">
              <q-item-section avatar>
                <q-icon name="description" />
              </q-item-section>
              <q-item-section>Import CSV</q-item-section>
            </q-item>
            <q-item clickable v-close-popup @click="$emit('import-sql')">
              <q-item-section avatar>
                <q-icon name="code" />
              </q-item-section>
              <q-item-section>Import SQL</q-item-section>
            </q-item>
          </q-list>
        </q-menu>
      </q-btn>
      <q-btn 
        flat 
        dense
        color="secondary" 
        icon="file_download" 
        label="Export" 
        class="q-mr-sm"
      >
        <q-menu>
          <q-list dense style="min-width: 150px">
            <q-item clickable v-close-popup @click="$emit('export-csv')">
              <q-item-section avatar>
                <q-icon name="description" />
              </q-item-section>
              <q-item-section>Export CSV</q-item-section>
            </q-item>
            <q-item clickable v-close-popup @click="$emit('export-sql')">
              <q-item-section avatar>
                <q-icon name="code" />
              </q-item-section>
              <q-item-section>Export SQL</q-item-section>
            </q-item>
            <q-item clickable v-close-popup @click="$emit('export-ddl')">
              <q-item-section avatar>
                <q-icon name="schema" />
              </q-item-section>
              <q-item-section>Export DDL</q-item-section>
            </q-item>
          </q-list>
        </q-menu>
      </q-btn>
      <q-btn 
        flat 
        dense
        color="negative" 
        icon="delete_sweep" 
        label="Truncate" 
        @click="$emit('truncate-table')" 
        class="q-mr-sm"
      >
        <q-tooltip>Delete all rows from this table</q-tooltip>
      </q-btn>
      <q-btn 
        flat 
        dense
        color="negative" 
        icon="delete_forever" 
        label="Delete Table" 
        @click="$emit('delete-table')"
      >
        <q-tooltip>Permanently delete this table and all its data</q-tooltip>
      </q-btn>
    </template>

    <template #body="props">
      <q-tr :props="props" :class="{ 'bg-blue-1': props.row.__isNew }">
        <q-td v-for="col in props.cols" :key="col.name" :props="props">
          <!-- Actions column with delete button -->
          <template v-if="col.name === '__actions' && !props.row.__isNew">
            <q-btn
              flat
              dense
              round
              size="sm"
              icon="delete"
              color="negative"
              @click="handleDeleteRow(props.row)"
              class="delete-btn"
            >
              <q-tooltip>Delete row</q-tooltip>
            </q-btn>
          </template>
          
          <!-- New row input -->
          <template v-else-if="props.row.__isNew && col.name !== '__actions'">
            <q-input
              v-model="newRowData[col.field]"
              dense
              borderless
              :placeholder="col.label"
              class="new-row-input"
            />
          </template>
          
          <!-- Regular data cell -->
          <template v-else-if="col.name !== '__actions'">
            <span class="cell-content">{{ formatValue(col.value) }}</span>
            <q-popup-edit
              v-if="primaryKey"
              :model-value="props.row[col.field]"
              :title="col.name"
              buttons
              label-set="Set"
              label-cancel="Cancel"
              @save="(val: unknown, initialVal: unknown) => handleCellEdit(props.row, col.field, initialVal, val)"
              v-slot="scope"
            >
              <q-input 
                v-model="scope.value" 
                dense 
                autofocus 
                @keyup.enter="scope.set"
              />
            </q-popup-edit>
          </template>
        </q-td>
        
        <!-- Save/Cancel buttons for new row -->
        <q-td v-if="props.row.__isNew" auto-width>
          <q-btn flat dense color="positive" icon="check" @click="saveNewRow" />
          <q-btn flat dense color="negative" icon="close" @click="cancelAddRow" />
        </q-td>
      </q-tr>
    </template>

    <template #loading>
      <q-inner-loading showing>
        <q-spinner-gears size="50px" color="primary" />
      </q-inner-loading>
    </template>

    <template #no-data>
      <div v-if="!isAddingRow" class="full-width column items-center q-pa-lg text-grey-6">
        <q-icon name="table_rows" size="48px" class="q-mb-md" />
        <div>No data available</div>
        <q-btn flat color="primary" icon="add" label="Add First Row" class="q-mt-md" @click="startAddRow" />
      </div>
    </template>
  </q-table>
</template>

<script setup lang="ts">
import { ref, computed, reactive, watch } from 'vue';
import type { QTableColumn } from 'quasar';
import type { ColumnDef, PaginationState, CellEditPayload } from '../types/database';

const props = defineProps<{
  columns: ColumnDef[];
  rows: Record<string, unknown>[];
  loading: boolean;
  pagination: PaginationState;
  primaryKey?: string | null;
}>();

const emit = defineEmits<{
  (e: 'update:pagination', value: PaginationState): void;
  (e: 'cell-edit', payload: CellEditPayload): void;
  (e: 'insert-row', data: Record<string, string>): void;
  (e: 'delete-row', row: Record<string, unknown>): void;
  (e: 'import-csv'): void;
  (e: 'import-sql'): void;
  (e: 'export-csv'): void;
  (e: 'export-sql'): void;
  (e: 'export-ddl'): void;
  (e: 'truncate-table'): void;
  (e: 'delete-table'): void;
}>();

const isAddingRow = ref(false);
const newRowData = reactive<Record<string, string>>({});

const tableColumns = computed<QTableColumn[]>(() => {
  const cols: QTableColumn[] = [];
  
  // Add delete action column as first column
  if (props.primaryKey) {
    cols.push({
      name: '__actions',
      label: '',
      field: '__actions',
      align: 'center',
      sortable: false,
      headerClasses: 'text-bold',
      style: 'width: 50px',
    });
  }
  
  // Add data columns
  cols.push(...props.columns.map((col) => ({
    name: col.name,
    label: col.name,
    field: col.field,
    sortable: col.sortable,
    align: col.align,
    headerClasses: 'text-bold',
  })));
  
  return cols;
});

const tablePagination = ref({
  page: 1,
  rowsPerPage: 100,
  rowsNumber: 0,
});

// Watch for prop changes and update local pagination
watch(() => props.pagination, (newPagination) => {
  tablePagination.value = {
    page: newPagination.page,
    rowsPerPage: newPagination.rowsPerPage,
    rowsNumber: newPagination.rowsNumber,
  };
}, { immediate: true, deep: true });

const allRows = computed(() => {
  if (isAddingRow.value) {
    const newRow: Record<string, unknown> = { __isNew: true, __rowIndex: -1 };
    for (const col of props.columns) {
      newRow[col.name] = '';
    }
    return [newRow, ...props.rows];
  }
  return props.rows;
});

function startAddRow() {
  for (const col of props.columns) {
    newRowData[col.name] = '';
  }
  isAddingRow.value = true;
}

function cancelAddRow() {
  isAddingRow.value = false;
}

function saveNewRow() {
  emit('insert-row', { ...newRowData });
  isAddingRow.value = false;
}

function formatValue(value: unknown): string {
  if (value === null) return 'NULL';
  if (value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value);
}

function onRequest(requestProps: { pagination: { page: number; rowsPerPage: number } }) {
  emit('update:pagination', {
    page: requestProps.pagination.page,
    rowsPerPage: requestProps.pagination.rowsPerPage,
    rowsNumber: props.pagination.rowsNumber,
  });
}

function handleCellEdit(
  row: Record<string, unknown>,
  column: string,
  oldValue: unknown,
  newValue: unknown
) {
  if (!props.primaryKey) return;
  
  emit('cell-edit', {
    row,
    column,
    oldValue,
    newValue,
    primaryKey: props.primaryKey,
    primaryKeyValue: row[props.primaryKey],
  });
}

function handleDeleteRow(row: Record<string, unknown>) {
  emit('delete-row', row);
}
</script>

<style scoped>
.data-grid {
  height: 100%;
}
.cell-content {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: inline-block;
}
.new-row-input {
  min-width: 80px;
}
.delete-btn {
  opacity: 0;
  transition: opacity 0.2s;
}
.q-tr:hover .delete-btn {
  opacity: 1;
}
</style>
