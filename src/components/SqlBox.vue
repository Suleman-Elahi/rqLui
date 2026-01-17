<template>
  <div class="sql-box q-pa-sm">
    <div class="row items-start q-gutter-sm">
      <q-input
        :model-value="modelValue"
        @update:model-value="$emit('update:modelValue', String($event ?? ''))"
        type="textarea"
        outlined
        dense
        placeholder="Enter SQL query..."
        :rows="3"
        class="sql-input col"
        @keydown.ctrl.enter="$emit('execute')"
      />
      <div class="column q-gutter-xs">
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
        <q-btn-dropdown
          flat
          dense
          dropdown-icon="tune"
          :label="consistencyLabel"
          size="sm"
          class="consistency-btn"
        >
          <q-list dense>
            <q-item-label header>Read Consistency</q-item-label>
            <q-item 
              v-for="opt in consistencyOptions" 
              :key="opt.value"
              clickable 
              v-close-popup 
              @click="$emit('update:consistency', opt.value)"
            >
              <q-item-section>
                <q-item-label>{{ opt.label }}</q-item-label>
                <q-item-label caption>{{ opt.description }}</q-item-label>
              </q-item-section>
              <q-item-section side v-if="consistency === opt.value">
                <q-icon name="check" color="primary" />
              </q-item-section>
            </q-item>
          </q-list>
        </q-btn-dropdown>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

export type ConsistencyLevel = 'none' | 'weak' | 'linearizable' | 'strong';

const props = defineProps<{
  modelValue: string;
  loading: boolean;
  consistency: ConsistencyLevel;
}>();

defineEmits<{
  (e: 'update:modelValue', value: string): void;
  (e: 'execute'): void;
  (e: 'update:consistency', value: ConsistencyLevel): void;
}>();

const consistencyOptions = [
  { value: 'none' as const, label: 'None', description: 'Fastest, may be stale' },
  { value: 'weak' as const, label: 'Weak', description: 'Default, checks leadership' },
  { value: 'linearizable' as const, label: 'Linearizable', description: 'Guaranteed fresh' },
  { value: 'strong' as const, label: 'Strong', description: 'Slowest, for testing' },
];

const consistencyLabel = computed(() => {
  const opt = consistencyOptions.find(o => o.value === props.consistency);
  return opt?.label.charAt(0) || 'N';
});
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
.consistency-btn {
  font-size: 10px;
}
</style>
