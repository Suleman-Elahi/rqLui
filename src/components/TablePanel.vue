<template>
  <div class="table-panel">
    <q-toolbar class="bg-grey-3">
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
      >
        <q-item-section avatar>
          <q-icon name="table_chart" size="sm" />
        </q-item-section>
        <q-item-section>
          <q-item-label>{{ table }}</q-item-label>
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
</style>
