<template>
  <q-dialog :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)" persistent>
    <q-card style="min-width: 640px; max-width: 92vw;">
      <q-card-section class="row items-center q-pb-none">
        <div class="text-h6">Alter Table <span class="text-primary">{{ tableName }}</span></div>
        <q-space />
        <q-btn flat round dense icon="close" @click="close" :disable="loading" />
      </q-card-section>

      <q-card-section v-if="loadError" class="text-negative">
        {{ loadError }}
      </q-card-section>

      <q-card-section v-else-if="schemaLoading" class="flex flex-center q-py-xl">
        <q-spinner-gears size="40px" color="primary" />
      </q-card-section>

      <template v-else>
        <!-- Rename table -->
        <q-card-section class="q-pb-none">
          <div class="text-subtitle2 q-mb-sm">Table Name</div>
          <q-input
            v-model="newTableName"
            outlined
            dense
            :hint="newTableName !== tableName ? `Will rename to: ${newTableName}` : ''"
          />
        </q-card-section>

        <!-- Columns -->
        <q-card-section>
          <div class="text-subtitle2 q-mb-sm">Columns</div>

          <div
            v-for="(col, index) in editedColumns"
            :key="col._id"
            class="row q-gutter-sm q-mb-xs items-center"
            :class="{ 'dropped-col': col._drop }"
          >
            <!-- Existing column indicator -->
            <q-icon
              :name="col._isNew ? 'add_circle_outline' : 'drag_indicator'"
              :color="col._isNew ? 'positive' : 'grey-5'"
              size="18px"
            />

            <q-input
              v-model="col.name"
              label="Name"
              outlined
              dense
              class="col"
              :disable="col._drop"
              hide-bottom-space
              :bg-color="col._isNew ? 'green-1' : col.name !== col._originalName && !col._isNew ? 'blue-1' : undefined"
            >
              <template v-if="!col._drop && !col._isNew && col.name !== col._originalName" #append>
                <q-icon name="edit" size="14px" color="primary">
                  <q-tooltip>Renamed from: {{ col._originalName }}</q-tooltip>
                </q-icon>
              </template>
            </q-input>

            <q-select
              v-model="col.type"
              :options="columnTypes"
              label="Type"
              outlined
              dense
              style="width: 120px"
              :disable="col._drop || !!col._originalPk"
              hide-bottom-space
            />

            <q-checkbox
              v-model="col.notNull"
              label="NOT NULL"
              dense
              :disable="col._drop || !!col._originalPk"
            />

            <q-chip
              v-if="col._originalPk"
              dense
              color="amber-2"
              text-color="amber-9"
              icon="key"
              label="PK"
              class="q-ma-none"
            />

            <q-btn
              v-if="!col._originalPk"
              flat round dense size="sm"
              :icon="col._drop ? 'undo' : 'delete'"
              :color="col._drop ? 'grey' : 'negative'"
              @click="toggleDrop(index)"
            >
              <q-tooltip>{{ col._drop ? 'Restore column' : 'Drop column' }}</q-tooltip>
            </q-btn>
            <div v-else style="width: 28px" />
          </div>

          <q-btn flat color="positive" icon="add" label="Add Column" @click="addColumn" class="q-mt-xs" />
        </q-card-section>

        <!-- Preview -->
        <q-card-section class="q-pt-none">
          <div class="text-subtitle2 q-mb-xs">
            Statements to execute
            <q-chip
              dense
              :color="pendingStatements.length ? 'primary' : 'grey-4'"
              :text-color="pendingStatements.length ? 'white' : 'grey-7'"
              :label="String(pendingStatements.length)"
              size="sm"
              class="q-ml-xs"
            />
          </div>
          <div v-if="pendingStatements.length === 0" class="text-grey-6 text-caption">
            No changes detected.
          </div>
          <pre v-else class="bg-grey-2 q-pa-sm rounded-borders text-caption" style="overflow-x: auto; white-space: pre-wrap;">{{ pendingStatements.join(';\n') }};</pre>
        </q-card-section>

        <q-card-section v-if="execError" class="q-pt-none">
          <q-banner dense rounded class="bg-negative text-white">{{ execError }}</q-banner>
        </q-card-section>
      </template>

      <q-card-actions align="right" class="q-pa-md">
        <q-btn flat label="Cancel" @click="close" :disable="loading" />
        <q-btn
          color="primary"
          label="Apply Changes"
          :loading="loading"
          :disable="pendingStatements.length === 0 || schemaLoading"
          @click="applyChanges"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { RqliteService } from '../services/rqlite-service';

interface EditedColumn {
  _id: number;          // stable identity
  _originalName: string | null;  // null = new column
  _originalPk: boolean;
  _isNew: boolean;
  _drop: boolean;
  name: string;
  type: string;
  notNull: boolean;
}

const props = defineProps<{
  modelValue: boolean;
  tableName: string;
  connectionUrl: string;
  username?: string;
  password?: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'altered', newTableName: string): void;
}>();

const columnTypes = ['INTEGER', 'TEXT', 'REAL', 'BLOB', 'NUMERIC'];

const schemaLoading = ref(false);
const loadError = ref<string | null>(null);
const loading = ref(false);
const execError = ref<string | null>(null);

const newTableName = ref('');
const editedColumns = ref<EditedColumn[]>([]);
let nextId = 0;

// ── Load schema when dialog opens ──────────────────────────────────────────

watch(() => props.modelValue, async (open) => {
  if (!open) return;
  execError.value = null;
  loadError.value = null;
  await loadSchema();
});

async function loadSchema() {
  schemaLoading.value = true;
  loadError.value = null;
  try {
    const svc = makeService();
    const schema = await svc.getTableSchema(props.tableName);
    newTableName.value = props.tableName;
    editedColumns.value = schema.map(col => ({
      _id: nextId++,
      _originalName: col.name,
      _originalPk: !!col.primaryKey,
      _isNew: false,
      _drop: false,
      name: col.name,
      type: col.type || 'TEXT',
      notNull: !!col.notNull,
    }));
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : 'Failed to load schema';
  } finally {
    schemaLoading.value = false;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function makeService() {
  return new RqliteService(
    props.connectionUrl,
    props.username && props.password
      ? { username: props.username, password: props.password }
      : undefined
  );
}

function addColumn() {
  editedColumns.value.push({
    _id: nextId++,
    _originalName: null,
    _originalPk: false,
    _isNew: true,
    _drop: false,
    name: '',
    type: 'TEXT',
    notNull: false,
  });
}

function toggleDrop(index: number) {
  const col = editedColumns.value[index];
  if (!col) return;
  if (col._isNew) {
    editedColumns.value.splice(index, 1);
  } else {
    col._drop = !col._drop;
  }
}


// ── Compute pending ALTER TABLE statements ─────────────────────────────────

const pendingStatements = computed((): string[] => {
  const stmts: string[] = [];
  const t = props.tableName; // always use original name for ALTER statements

  // 1. Rename columns
  for (const col of editedColumns.value) {
    if (col._isNew || col._drop || col._originalPk) continue;
    if (col.name && col.name !== col._originalName) {
      stmts.push(`ALTER TABLE "${t}" RENAME COLUMN "${col._originalName}" TO "${col.name}"`);
    }
  }

  // 2. Drop columns
  for (const col of editedColumns.value) {
    if (!col._drop || col._isNew) continue;
    stmts.push(`ALTER TABLE "${t}" DROP COLUMN "${col._originalName}"`);
  }

  // 3. Add new columns
  for (const col of editedColumns.value) {
    if (!col._isNew || col._drop || !col.name) continue;
    const notNull = col.notNull ? ' NOT NULL' : '';
    stmts.push(`ALTER TABLE "${t}" ADD COLUMN "${col.name}" ${col.type}${notNull}`);
  }

  // 4. Rename table (must be last so prior statements use original name)
  if (newTableName.value && newTableName.value !== props.tableName) {
    stmts.push(`ALTER TABLE "${t}" RENAME TO "${newTableName.value}"`);
  }

  return stmts;
});

// ── Apply ──────────────────────────────────────────────────────────────────

async function applyChanges() {
  if (pendingStatements.value.length === 0) return;
  execError.value = null;
  loading.value = true;

  try {
    const svc = makeService();
    // Execute each statement individually — ALTER TABLE can't be batched in a transaction
    for (const stmt of pendingStatements.value) {
      await svc.execute([stmt]);
    }
    const finalName = newTableName.value !== props.tableName
      ? newTableName.value
      : props.tableName;
    emit('altered', finalName);
    emit('update:modelValue', false);
  } catch (err) {
    execError.value = err instanceof Error ? err.message : 'Failed to apply changes';
  } finally {
    loading.value = false;
  }
}

function close() {
  if (loading.value) return;
  emit('update:modelValue', false);
}
</script>

<style scoped>
.dropped-col {
  opacity: 0.45;
}
.rounded-borders {
  border-radius: 4px;
}
</style>
