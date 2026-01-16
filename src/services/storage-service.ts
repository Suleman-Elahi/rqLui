import type { DatabaseConnection } from '../types/database';

const STORAGE_KEY = 'rqlite-browser-connections';

export class StorageService {
  static saveConnections(connections: DatabaseConnection[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(connections));
    } catch (error) {
      console.error('Failed to save connections to localStorage:', error);
    }
  }

  static loadConnections(): DatabaseConnection[] {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (!data) return [];
      return JSON.parse(data) as DatabaseConnection[];
    } catch (error) {
      console.error('Failed to load connections from localStorage:', error);
      return [];
    }
  }

  static addConnection(connection: DatabaseConnection): void {
    const connections = this.loadConnections();
    connections.push(connection);
    this.saveConnections(connections);
  }

  static removeConnection(id: string): void {
    const connections = this.loadConnections();
    const filtered = connections.filter((c) => c.id !== id);
    this.saveConnections(filtered);
  }

  static updateConnection(connection: DatabaseConnection): void {
    const connections = this.loadConnections();
    const index = connections.findIndex((c) => c.id === connection.id);
    if (index !== -1) {
      connections[index] = connection;
      this.saveConnections(connections);
    }
  }

  static getConnection(id: string): DatabaseConnection | undefined {
    const connections = this.loadConnections();
    return connections.find((c) => c.id === id);
  }
}
