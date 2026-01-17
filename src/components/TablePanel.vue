<template>
  <div class="table-panel">
    <q-toolbar class="bg-grey-3 table-toolbar">
      <q-toolbar-title class="text-subtitle1">Tables</q-toolbar-title>
      <q-btn flat dense round icon="add" size="sm" color="primary" @click="$emit('create')">
        <q-tooltip>Create table</q-tooltip>
      </q-btn>
      <q-btn flat dense round icon="refresh" size="sm" @click="$emit('refresh')">
        <q-tooltip>Refresh tables</q-tooltip>
      </q-btn>
    </q-toolbar>
    <q-separator />
    
    <q-list dense>
      <q-item
        v-for="table in tables"
        :key="table"
        clickable
        :active="table === activeTable"
        active-class="bg-primary text-white"
        @click="$emit('select', table)"
        class="table-item"
      >
        <q-item-section avatar>
          <q-icon name="table_chart" />
        </q-item-section>
        <q-item-section>
          <q-item-label class="table-name">{{ table }}</q-item-label>
        </q-item-section>
      </q-item>
    </q-list>

    <div v-if="tables.length === 0" class="text-center q-pa-md text-grey-6">
      No tables found
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  tables: string[];
  activeTable: string | null;
}>();

defineEmits<{
  (e: 'select', tableName: string): void;
  (e: 'create'): void;
  (e: 'refresh'): void;
}>();
</script>

<style scoped>
.table-panel {
  height: 100%;
  overflow-y: auto;
  padding-top: 50px; /* Account for main header */
}

.table-toolbar {
  min-height: 40px !important;
  height: 40px !important;
}

.table-item {
  padding-left: 8px !important;
  padding-right: 8px !important;
}

.table-item :deep(.q-item__section--avatar) {
  min-width: 32px !important;
  padding-right: 0 !important;
}

.table-name {
  font-weight: 600;
}
</style>
