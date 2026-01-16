<template>
  <q-page class="q-pa-md">
    <div class="text-h4 q-mb-lg">Database Connections</div>

    <div v-if="connectionStore.connections.length === 0" class="text-center q-pa-xl">
      <q-icon name="storage" size="64px" color="grey-5" />
      <div class="text-h6 text-grey-7 q-mt-md">No connections yet</div>
      <div class="text-body2 text-grey-6">
        Click the + button to add your first RQLite database
      </div>
    </div>

    <div v-else class="row q-col-gutter-md">
      <div
        v-for="connection in connectionStore.connections"
        :key="connection.id"
        class="col-12 col-sm-6 col-md-4 col-lg-3"
      >
        <DatabaseCard
          :connection="connection"
          @select="handleSelect"
          @delete="handleDelete"
        />
      </div>
    </div>

    <!-- Add button -->
    <q-page-sticky position="bottom-right" :offset="[18, 18]">
      <q-btn fab icon="add" color="primary" @click="showAddDialog = true">
        <q-tooltip>Add database connection</q-tooltip>
      </q-btn>
    </q-page-sticky>

    <!-- Add dialog -->
    <AddDatabaseForm
      v-model="showAddDialog"
      @saved="handleSaved"
    />
  </q-page>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useConnectionStore } from '../stores/connection-store';
import type { DatabaseConnection } from '../types/database';
import DatabaseCard from '../components/DatabaseCard.vue';
import AddDatabaseForm from '../components/AddDatabaseForm.vue';

const router = useRouter();
const $q = useQuasar();
const connectionStore = useConnectionStore();

const showAddDialog = ref(false);

function handleSelect(id: string) {
  connectionStore.setActiveConnection(id);
  void router.push(`/browser/${id}`);
}

function handleDelete(id: string) {
  $q.dialog({
    title: 'Delete Connection',
    message: 'Are you sure you want to delete this connection?',
    cancel: true,
    persistent: true,
  }).onOk(() => {
    connectionStore.removeConnection(id);
    $q.notify({
      type: 'positive',
      message: 'Connection deleted',
    });
  });
}

function handleSaved(connection: DatabaseConnection) {
  connectionStore.addConnection(connection);
  $q.notify({
    type: 'positive',
    message: 'Connection added successfully',
  });
}
</script>
