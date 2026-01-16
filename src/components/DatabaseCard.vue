<template>
  <q-card class="database-card" bordered>
    <q-card-section class="cursor-pointer" @click="$emit('select', connection.id)">
      <div class="row items-center no-wrap">
        <q-icon name="storage" size="md" color="primary" class="q-mr-md" />
        <div class="col">
          <div class="text-h6 ellipsis">{{ connection.name }}</div>
          <div class="text-caption text-grey ellipsis">{{ connection.url }}</div>
        </div>
      </div>
    </q-card-section>

    <q-separator />

    <q-card-actions align="right">
      <q-btn
        flat
        dense
        icon="delete"
        color="negative"
        @click.stop="$emit('delete', connection.id)"
      >
        <q-tooltip>Delete connection</q-tooltip>
      </q-btn>
    </q-card-actions>
  </q-card>
</template>

<script setup lang="ts">
import type { DatabaseConnection } from '../types/database';

defineProps<{
  connection: DatabaseConnection;
}>();

defineEmits<{
  (e: 'select', id: string): void;
  (e: 'delete', id: string): void;
}>();
</script>

<style scoped>
.database-card {
  transition: transform 0.2s, box-shadow 0.2s;
}
.database-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}
</style>
