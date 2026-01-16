<template>
  <q-dialog :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)" persistent>
    <q-card style="min-width: 600px; max-width: 90vw;">
      <q-card-section class="row items-center">
        <div class="text-h6">Create Table</div>
        <q-space />
        <q-btn flat round dense icon="close" @click="$emit('update:modelValue', false)" />
      </q-card-section>

      <q-tabs v-model="activeTab" dense align="left" class="bg-grey-2">
        <q-tab name="builder" label="Builder" />
        <q-tab name="sql" label="SQL" />
      </q-tabs>

      <q-tab-panels v-model="activeTab" animated>
        <q-tab-panel name="builder" class="q-pa-md">
          <q-input
            v-model="tableName"
            label="Table Name"
            outlined
            dense
            class="q-mb-md"
            :rules="[(v) => !!v || 'Table name is required']"
          />

          <div class="text-subtitle2 q-mb-sm">Columns</div>
          <div v-for="(col, index) in columns" :key="index" class="row q-gutter-sm q-mb-sm items-center">
            <q-input v-model="col.name" label="Name" outlined dense class="col" />
            <q-select
              v-model="col.type"
              :options="columnTypes"
              label="Type"
              outlined
              dense
              class="col"
            />
            <q-checkbox v-model="col.primaryKey" label="PK" dense />
            <q-checkbox v-model="col.notNull" label="NOT NULL" dense />
            <q-btn flat round dense icon="delete" color="negative" @click="removeColumn(index)" :disable="columns.length <= 1" />
          </div>

          <q-btn flat color="primary" icon="add" label="Add Column" @click="addColumn" class="q-mt-sm" />

          <div class="q-mt-md text-caption text-grey-7">
            Generated SQL:
            <pre class="bg-grey-2 q-pa-sm q-mt-xs" style="font-size: 12px; overflow-x: auto;">{{ generatedSql }}</pre>
          </div>
        </q-tab-panel>

        <q-tab-panel name="sql" class="q-pa-md">
          <q-input
            v-model="rawSql"
            type="textarea"
            label="CREATE TABLE SQL"
            outlined
            :rows="8"
            placeholder="CREATE TABLE my_table (id INTEGER PRIMARY KEY, name TEXT NOT NULL);"
            class="sql-input"
          />
        </q-tab-panel>
      </q-tab-panels>

      <q-card-actions align="right" class="q-pa-md">
        <q-btn flat label="Cancel" @click="$emit('update:modelValue', false)" :disable="loading" />
        <q-btn color="primary" label="Create Table" @click="handleCreate" :loading="loading" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'created'): void;
}>();

const activeTab = ref('builder');
const tableName = ref('');
const rawSql = ref('');
const loading = ref(false);
const error = ref<string | null>(null);

interface ColumnDef {
  name: string;
  type: string;
  primaryKey: boolean;
  notNull: boolean;
}

const columns = ref<ColumnDef[]>([
  { name: 'id', type: 'INTEGER', primaryKey: true, notNull: true },
]);

const columnTypes = ['INTEGER', 'TEXT', 'REAL', 'BLOB', 'NUMERIC'];

const generatedSql = computed(() => {
  if (!tableName.value) return '-- Enter table name';
  
  const colDefs = columns.value
    .filter((c) => c.name)
    .map((c) => {
      let def = `"${c.name}" ${c.type}`;
      if (c.primaryKey) def += ' PRIMARY KEY';
      if (c.notNull && !c.primaryKey) def += ' NOT NULL';
      return def;
    });

  if (colDefs.length === 0) return '-- Add at least one column';
  return `CREATE TABLE "${tableName.value}" (\n  ${colDefs.join(',\n  ')}\n);`;
});

function addColumn() {
  columns.value.push({ name: '', type: 'TEXT', primaryKey: false, notNull: false });
}

function removeColumn(index: number) {
  columns.value.splice(index, 1);
}

function resetForm() {
  tableName.value = '';
  rawSql.value = '';
  columns.value = [{ name: 'id', type: 'INTEGER', primaryKey: true, notNull: true }];
  activeTab.value = 'builder';
  error.value = null;
}

watch(() => props.modelValue, (isOpen) => {
  if (isOpen) resetForm();
});

function handleCreate() {
  const sql = activeTab.value === 'builder' ? generatedSql.value : rawSql.value;
  
  if (!sql || sql.startsWith('--')) {
    error.value = 'Please provide valid SQL';
    return;
  }

  emit('created');
  emit('update:modelValue', false);
}

defineExpose({ getSql: () => activeTab.value === 'builder' ? generatedSql.value : rawSql.value });
</script>

<style scoped>
.sql-input :deep(textarea) {
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 13px;
}
</style>
