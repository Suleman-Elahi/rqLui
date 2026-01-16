<template>
  <div class="sql-box q-pa-sm">
    <q-input
      :model-value="modelValue"
      @update:model-value="$emit('update:modelValue', String($event ?? ''))"
      type="textarea"
      outlined
      dense
      placeholder="Enter SQL query..."
      :rows="3"
      class="sql-input"
      @keydown.ctrl.enter="$emit('execute')"
    >
      <template #append>
        <q-btn
          flat
          dense
          icon="play_arrow"
          color="primary"
          :loading="loading"
          @click="$emit('execute')"
        >
          <q-tooltip>Execute (Ctrl+Enter)</q-tooltip>
        </q-btn>
      </template>
    </q-input>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  modelValue: string;
  loading: boolean;
}>();

defineEmits<{
  (e: 'update:modelValue', value: string): void;
  (e: 'execute'): void;
}>();
</script>

<style scoped>
.sql-box {
  background: #f5f5f5;
  border-bottom: 1px solid #ddd;
}
.sql-input :deep(textarea) {
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 13px;
}
</style>
