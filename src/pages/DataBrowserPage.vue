<template>
  <q-layout view="hHh LpR fFf" class="data-browser-layout">
    <q-drawer
      v-model="drawerOpen"
      side="left"
      bordered
      :width="220"
      :breakpoint="500"
      class="bg-grey-1"
    >
      <TablePanel
        :tables="tables"
        :active-table="activeTable"
        @select="handleTableSelect"
        @create="showCreateDialog = true"
        @refresh="loadTables"
      />
    </q-drawer>

    <q-page-container>
      <q-page class="column">
        <div v-if="loading" class="flex flex-center col">
          <q-spinner-gears size="50px" color="primary" />
        </div>

        <div v-else-if="error" class="flex flex-center col column">
          <q-icon name="error" size="64px" color="negative" />
          <div class="text-h6 q-mt-md">{{ error }}</div>
          <q-btn flat color="primary" label="Back to connections" @click="router.push('/')" class="q-mt-md" />
        </div>

        <template v-else>
          <div class="row items-center q-pa-xs bg-grey-2 header-bar">
            <q-btn flat dense icon="menu" @click="drawerOpen = !drawerOpen" />
            <div class="text-subtitle2 q-ml-sm">{{ connection?.name }}</div>
            <q-space />
            <q-btn flat dense icon="home" @click="router.push('/')">
              <q-tooltip>Back to connections</q-tooltip>
            </q-btn>
          </div>

          <q-tabs
            v-if="tabs.length > 0"
            v-model="activeTabId"
            dense
            align="left"
            class="bg-grey-3 text-grey-7"
            active-color="primary"
            indicator-color="primary"
            narrow-indicator
          >
            <q-tab
              v-for="tab in tabs"
              :key="tab.id"
              :name="tab.id"
              :label="tab.tableName"
              no-caps
            >
              <q-btn
                flat
                dense
                round
                size="xs"
                icon="close"
                class="q-ml-xs"
                @click.stop="handleCloseTab(tab.id)"
              />
            </q-tab>
          </q-tabs>

          <q-tab-panels v-model="activeTabId" animated class="col tab-panels">
            <q-tab-panel
              v-for="tab in tabs"
              :key="tab.id"
              :name="tab.id"
              class="q-pa-none full-height"
            >
              <QueryTab
                v-if="connection"
                :connection-url="connection.url"
                :table-name="tab.tableName"
                @table-deleted="handleTableDeleted(tab.id)"
              />
            </q-tab-panel>
          </q-tab-panels>

          <div v-if="tabs.length === 0" class="col flex flex-center text-grey-6">
            <div class="text-center">
              <q-icon name="table_chart" size="48px" class="q-mb-md" />
              <div>Select a table from the left panel to get started</div>
            </div>
          </div>
        </template>
      </q-page>
    </q-page-container>

    <CreateTableDialog
      v-model="showCreateDialog"
      @created="handleCreateTable"
      ref="createDialogRef"
    />
  </q-layout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useConnectionStore } from '../stores/connection-store';
import { useTabStore } from '../stores/tab-store';
import { RqliteService } from '../services/rqlite-service';
import TablePanel from '../components/TablePanel.vue';
import QueryTab from '../components/QueryTab.vue';
import CreateTableDialog from '../components/CreateTableDialog.vue';

const route = useRoute();
const router = useRouter();
const $q = useQuasar();
const connectionStore = useConnectionStore();
const tabStore = useTabStore();

const connectionId = computed(() => route.params.connectionId as string);
const connection = computed(() => connectionStore.getConnection(connectionId.value));

const loading = ref(true);
const error = ref<string | null>(null);
const tables = ref<string[]>([]);
const drawerOpen = ref(true);
const showCreateDialog = ref(false);
const createDialogRef = ref<InstanceType<typeof CreateTableDialog> | null>(null);

const tabs = computed(() => tabStore.getTabs(connectionId.value));
const activeTabId = computed({
  get: () => tabStore.getActiveTabId(connectionId.value) || '',
  set: (val) => tabStore.setActiveTab(connectionId.value, val),
});

const activeTable = computed(() => {
  const activeTab = tabStore.getActiveTab(connectionId.value);
  return activeTab?.tableName || null;
});

let rqliteService: RqliteService | null = null;

onMounted(async () => {
  if (!connection.value) {
    error.value = 'Connection not found';
    loading.value = false;
    return;
  }

  rqliteService = new RqliteService(connection.value.url);
  await loadTables();
});

async function loadTables() {
  if (!rqliteService) return;
  
  loading.value = true;
  try {
    tables.value = await rqliteService.getTables();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load tables';
  } finally {
    loading.value = false;
  }
}

function handleTableSelect(tableName: string) {
  tabStore.openTab(connectionId.value, tableName);
}

function handleCloseTab(tabId: string) {
  tabStore.closeTab(connectionId.value, tabId);
}

async function handleCreateTable() {
  if (!rqliteService || !createDialogRef.value) return;

  const sql = createDialogRef.value.getSql();
  
  // Remove both single-line (--) and multi-line (/* */) comments
  const sqlWithoutComments = sql
    .replace(/\/\*[\s\S]*?\*\//g, '') // Remove /* */ comments
    .split('\n')
    .filter(line => !line.trim().startsWith('--')) // Remove -- comments
    .join('\n')
    .trim();
  
  if (!sqlWithoutComments) return;

  try {
    await rqliteService.execute([sql]);
    $q.notify({ type: 'positive', message: 'Table created successfully' });
    await loadTables();
  } catch (err) {
    $q.notify({
      type: 'negative',
      message: err instanceof Error ? err.message : 'Failed to create table',
    });
  }
}

async function handleTableDeleted(tabId: string) {
  tabStore.closeTab(connectionId.value, tabId);
  await loadTables();
}
</script>

<style scoped>
.data-browser-layout {
  height: 100vh;
}
.header-bar {
  border-bottom: 1px solid #ddd;
}
.tab-panels {
  overflow: hidden;
}
.tab-panels :deep(.q-tab-panel) {
  height: 100%;
  padding: 0;
}
</style>
