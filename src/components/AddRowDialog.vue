<template>
  <q-dialog :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)">
    <q-card style="min-width: 400px;">
      <q-card-section>
        <div class="text-h6">Add Row</div>
      </q-card-section>

      <q-card-section class="q-pt-none">
        <div v-for="col in columns" :key="col.name" class="q-mb-md">
          <q-input
            v-model="rowData[col.name]"
            :label="col.label + (col.primaryKey ? ' (PK)' : '')"
            outlined
            dense
            :hint="col.type"
          />
        </div>
      </q-card-section>

      <q-card-actions align="right">
        <q-btn flat label="Cancel" @click="$emit('update:modelValue', false)" />
        <q-btn color="primary" label="Insert" @click="handleInsert" :loading="loading" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, watch, reactive } from 'vue';
import type { ColumnDef } from '../types/database';

const props = defineProps<{
  modelValue: boolean;
  columns: ColumnDef[];
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'insert', data: Record<string, unknown>): void;
}>();

const rowData = reactive<Record<string, string>>({});
const loading = ref(false);

watch(() => props.modelValue, (isOpen) => {
  if (isOpen) {
    // Reset form
    for (const col of props.columns) {
      rowData[col.name] = '';
    }
  }
});

function handleInsert() {
  emit('insert', { ...rowData });
  emit('update:modelValue', false);
}
</script>
