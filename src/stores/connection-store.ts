import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { DatabaseConnection } from '../types/database';
import { StorageService } from '../services/storage-service';

export const useConnectionStore = defineStore('connections', () => {
  // State
  const connections = ref<DatabaseConnection[]>([]);
  const activeConnectionId = ref<string | null>(null);

  // Getters
  const activeConnection = computed(() =>
    connections.value.find((c) => c.id === activeConnectionId.value)
  );

  const connectionCount = computed(() => connections.value.length);

  // Actions
  function loadConnections() {
    connections.value = StorageService.loadConnections();
  }

  function addConnection(connection: DatabaseConnection) {
    connections.value.push(connection);
    StorageService.saveConnections(connections.value);
  }

  function removeConnection(id: string) {
    connections.value = connections.value.filter((c) => c.id !== id);
    StorageService.saveConnections(connections.value);
    if (activeConnectionId.value === id) {
      activeConnectionId.value = null;
    }
  }

  function setActiveConnection(id: string | null) {
    activeConnectionId.value = id;
  }

  function getConnection(id: string): DatabaseConnection | undefined {
    return connections.value.find((c) => c.id === id);
  }

  // Initialize on store creation
  loadConnections();

  return {
    // State
    connections,
    activeConnectionId,
    // Getters
    activeConnection,
    connectionCount,
    // Actions
    loadConnections,
    addConnection,
    removeConnection,
    setActiveConnection,
    getConnection,
  };
});
