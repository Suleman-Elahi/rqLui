<template>
  <q-dialog :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)" persistent>
    <q-card style="min-width: 620px; max-width: 820px;">
      <q-card-section>
        <div class="text-h6">Map CSV Columns</div>
        <div class="text-caption text-grey-7">
          Map each CSV column to a table column. Unmapped columns will be skipped.
        </div>
      </q-card-section>

      <q-separator />

      <!-- NOT NULL warnings -->
      <q-banner
        v-if="unmappedRequiredColumns.length > 0"
        class="bg-warning text-dark q-px-md q-py-sm"
        dense
      >
        <template #avatar>
          <q-icon name="warning" />
        </template>
        <div class="text-caption">
          <strong>Required columns not mapped:</strong>
          {{ unmappedRequiredColumns.join(', ') }}
          <br />
          These columns have a NOT NULL constraint and no default value. Import will fail unless they are mapped or the table provides a default.
        </div>
      </q-banner>

      <q-card-section class="q-pa-none" style="max-height: 400px; overflow-y: auto;">
        <q-table
          :rows="mappingRows"
          :columns="mappingColumns"
          row-key="csvColumn"
          flat
          dense
          hide-bottom
          :pagination="{ rowsPerPage: 0 }"
        >
          <template #body-cell-tableColumn="cellProps">
            <q-td :props="cellProps">
              <q-select
                :model-value="columnMap[cellProps.row.csvColumn]"
                @update:model-value="updateMapping(cellProps.row.csvColumn, $event)"
                :options="availableColumnsMap[cellProps.row.csvColumn]"
                dense
                outlined
                clearable
                options-dense
                class="mapping-select"
              >
                <template #no-option>
                  <q-item>
                    <q-item-section class="text-grey">All columns mapped</q-item-section>
                  </q-item>
                </template>
              </q-select>
            </q-td>
          </template>

          <template #body-cell-preview="cellProps">
            <q-td :props="cellProps">
              <span class="text-caption text-grey-8 preview-cell">
                {{ cellProps.row.preview }}
              </span>
            </q-td>
          </template>
        </q-table>
      </q-card-section>

      <q-separator />

      <!-- Unmapped required table columns (NOT NULL, no default) -->
      <q-card-section v-if="tableSchema.length > 0" class="q-pa-none">
        <q-table
          :rows="unmappedTableRows"
          :columns="unmappedTableColumns"
          row-key="name"
          flat
          dense
          hide-bottom
          :pagination="{ rowsPerPage: 0 }"
        >
          <template #top>
            <div class="text-caption text-grey-7 q-pa-sm">
              Table columns not covered by mapping
            </div>
          </template>
          <template #body-cell-required="cellProps">
            <q-td :props="cellProps">
              <q-badge
                v-if="cellProps.row.required"
                color="negative"
                label="NOT NULL"
              />
              <q-badge
                v-else-if="cellProps.row.hasDefault"
                color="positive"
                :label="`DEFAULT: ${cellProps.row.defaultValue}`"
              />
              <span v-else class="text-grey-5 text-caption">nullable</span>
            </q-td>
          </template>
        </q-table>
      </q-card-section>

      <q-separator />

      <q-card-section class="q-py-sm">
        <div class="row items-center justify-between">
          <div class="text-caption text-grey-7">
            {{ mappedCount }} of {{ csvHeaders.length }} CSV columns mapped
          </div>
          <div class="q-gutter-xs">
            <q-btn flat dense label="Auto-match" icon="auto_fix_high" @click="autoMatch" size="sm" />
            <q-btn flat dense label="Clear All" icon="clear_all" @click="clearAll" size="sm" />
          </div>
        </div>
      </q-card-section>

      <q-separator />

      <q-card-actions align="right">
        <q-btn flat label="Cancel" @click="$emit('update:modelValue', false)" />
        <q-btn
          :color="unmappedRequiredColumns.length > 0 ? 'warning' : 'primary'"
          :label="unmappedRequiredColumns.length > 0 ? 'Import Anyway' : 'Import'"
          :disable="mappedCount === 0"
          @click="handleConfirm"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type { QTableColumn } from 'quasar';
import type { ColumnDef } from '../types/database';

export interface ColumnMapping {
  [csvColumn: string]: string;
}

type InternalMapping = Record<string, string | null>;

const props = defineProps<{
  modelValue: boolean;
  csvHeaders: string[];
  tableColumns: string[];
  tableSchema: ColumnDef[];
  previewRows: string[][];
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'confirm', mapping: ColumnMapping): void;
}>();

const columnMap = ref<InternalMapping>({});

const mappingColumns: QTableColumn[] = [
  { name: 'csvColumn', label: 'CSV Column', field: 'csvColumn', align: 'left', sortable: false },
  { name: 'tableColumn', label: 'Table Column', field: 'tableColumn', align: 'left', sortable: false },
  { name: 'preview', label: 'Sample Value', field: 'preview', align: 'left', sortable: false },
];

const unmappedTableColumns: QTableColumn[] = [
  { name: 'name', label: 'Column', field: 'name', align: 'left', sortable: false },
  { name: 'type', label: 'Type', field: 'type', align: 'left', sortable: false },
  { name: 'required', label: 'Constraint', field: 'required', align: 'left', sortable: false },
];

const mappingRows = computed(() =>
  props.csvHeaders.map((header, index) => ({
    csvColumn: header,
    tableColumn: columnMap.value[header] ?? null,
    preview: props.previewRows[0]?.[index] ?? '',
  }))
);

const mappedCount = computed(() =>
  Object.values(columnMap.value).filter((v) => v != null).length
);

/** Set of table columns currently mapped to a CSV column */
const mappedTableColumns = computed(() =>
  new Set(Object.values(columnMap.value).filter((v): v is string => v != null))
);

/** Table columns not covered by any CSV mapping */
const unmappedTableRows = computed(() =>
  props.tableSchema
    .filter((col) => !mappedTableColumns.value.has(col.name))
    .map((col) => ({
      name: col.name,
      type: col.type || 'TEXT',
      required: col.notNull && col.defaultValue == null && !col.primaryKey,
      hasDefault: col.defaultValue != null,
      defaultValue: col.defaultValue,
    }))
);

/** NOT NULL columns with no default that are not mapped — import will fail */
const unmappedRequiredColumns = computed(() =>
  unmappedTableRows.value
    .filter((row) => row.required)
    .map((row) => row.name)
);

// Auto-match when dialog opens
watch(
  () => props.modelValue,
  (isOpen) => {
    if (isOpen) {
      autoMatch();
    }
  }
);

/** Pre-computed available options per CSV column — avoids O(n²) in template */
const availableColumnsMap = computed(() => {
  const map: Record<string, string[]> = {};
  for (const csvCol of props.csvHeaders) {
    const usedByOthers = new Set(
      Object.entries(columnMap.value)
        .filter(([key, val]) => key !== csvCol && val != null)
        .map(([, val]) => val as string)
    );
    map[csvCol] = props.tableColumns.filter((col) => !usedByOthers.has(col));
  }
  return map;
});

function updateMapping(csvColumn: string, tableColumn: string | null) {
  columnMap.value = { ...columnMap.value, [csvColumn]: tableColumn };
}

function autoMatch() {
  const newMap: InternalMapping = {};
  const usedTableCols = new Set<string>();

  for (const csvCol of props.csvHeaders) {
    const normalized = csvCol.toLowerCase().replace(/[\s_-]+/g, '');
    const match = props.tableColumns.find((tableCol) => {
      if (usedTableCols.has(tableCol)) return false;
      const normalizedTable = tableCol.toLowerCase().replace(/[\s_-]+/g, '');
      return normalized === normalizedTable;
    });

    if (match) {
      newMap[csvCol] = match;
      usedTableCols.add(match);
    } else {
      newMap[csvCol] = null;
    }
  }

  columnMap.value = newMap;
}

function clearAll() {
  const newMap: InternalMapping = {};
  for (const header of props.csvHeaders) {
    newMap[header] = null;
  }
  columnMap.value = newMap;
}

function handleConfirm() {
  const finalMapping: ColumnMapping = {};
  for (const [csv, table] of Object.entries(columnMap.value)) {
    if (table != null) {
      finalMapping[csv] = table;
    }
  }
  emit('confirm', finalMapping);
  emit('update:modelValue', false);
}
</script>

<style scoped>
.mapping-select {
  min-width: 160px;
}
.preview-cell {
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: inline-block;
}
</style>
