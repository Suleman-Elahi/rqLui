import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { TabState } from '../types/database';

export const useTabStore = defineStore('tabs', () => {
  // State: Map of connectionId -> tabs array
  const tabsByConnection = ref<Map<string, TabState[]>>(new Map());
  // State: Map of connectionId -> active tab id
  const activeTabByConnection = ref<Map<string, string>>(new Map());

  // Getters
  function getTabs(connectionId: string): TabState[] {
    return tabsByConnection.value.get(connectionId) || [];
  }

  function getActiveTabId(connectionId: string): string | null {
    return activeTabByConnection.value.get(connectionId) || null;
  }

  function getActiveTab(connectionId: string): TabState | undefined {
    const tabs = getTabs(connectionId);
    const activeId = getActiveTabId(connectionId);
    return tabs.find((t) => t.id === activeId);
  }

  function hasTabForTable(connectionId: string, tableName: string): boolean {
    const tabs = getTabs(connectionId);
    return tabs.some((t) => t.tableName === tableName && !t.isCustomQuery);
  }

  function getTabForTable(
    connectionId: string,
    tableName: string
  ): TabState | undefined {
    const tabs = getTabs(connectionId);
    return tabs.find((t) => t.tableName === tableName && !t.isCustomQuery);
  }

  // Actions
  function openTab(connectionId: string, tableName: string): string {
    // Check if tab already exists for this table
    const existingTab = getTabForTable(connectionId, tableName);
    if (existingTab) {
      // Switch to existing tab
      activeTabByConnection.value.set(connectionId, existingTab.id);
      return existingTab.id;
    }

    // Create new tab
    const newTab: TabState = {
      id: `${connectionId}-${tableName}-${Date.now()}`,
      tableName,
      sql: `SELECT * FROM "${tableName}"`,
      isCustomQuery: false,
    };

    const tabs = getTabs(connectionId);
    tabs.push(newTab);
    tabsByConnection.value.set(connectionId, tabs);
    activeTabByConnection.value.set(connectionId, newTab.id);

    return newTab.id;
  }


  function closeTab(connectionId: string, tabId: string): void {
    const tabs = getTabs(connectionId);
    const tabIndex = tabs.findIndex((t) => t.id === tabId);

    if (tabIndex === -1) return;

    // Remove the tab
    tabs.splice(tabIndex, 1);
    tabsByConnection.value.set(connectionId, tabs);

    // If this was the active tab, switch to nearest
    const activeId = getActiveTabId(connectionId);
    if (activeId === tabId && tabs.length > 0) {
      const newIndex = Math.min(tabIndex, tabs.length - 1);
      const newActiveTab = tabs[newIndex];
      if (newActiveTab) {
        activeTabByConnection.value.set(connectionId, newActiveTab.id);
      }
    } else if (tabs.length === 0) {
      activeTabByConnection.value.delete(connectionId);
    }
  }

  function setActiveTab(connectionId: string, tabId: string): void {
    const tabs = getTabs(connectionId);
    if (tabs.some((t) => t.id === tabId)) {
      activeTabByConnection.value.set(connectionId, tabId);
    }
  }

  function updateTabSql(connectionId: string, tabId: string, sql: string): void {
    const tabs = getTabs(connectionId);
    const tab = tabs.find((t) => t.id === tabId);
    if (tab) {
      tab.sql = sql;
      tab.isCustomQuery = true;
    }
  }

  function clearTabs(connectionId: string): void {
    tabsByConnection.value.delete(connectionId);
    activeTabByConnection.value.delete(connectionId);
  }

  return {
    // State
    tabsByConnection,
    activeTabByConnection,
    // Getters
    getTabs,
    getActiveTabId,
    getActiveTab,
    hasTabForTable,
    getTabForTable,
    // Actions
    openTab,
    closeTab,
    setActiveTab,
    updateTabSql,
    clearTabs,
  };
});
