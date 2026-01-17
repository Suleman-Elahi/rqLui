export interface DatabaseConnection {
  id: string;
  name: string;
  url: string;
  username?: string;
  password?: string;
  createdAt: number;
}

export interface ColumnDef {
  name: string;
  label: string;
  field: string;
  sortable: boolean;
  align: 'left' | 'center' | 'right';
  type?: string;
  primaryKey?: boolean;
}

export interface PaginationState {
  page: number;
  rowsPerPage: number;
  rowsNumber: number;
}

export interface TabState {
  id: string;
  tableName: string;
  sql: string;
  isCustomQuery: boolean;
}

export interface CellEditPayload {
  row: Record<string, unknown>;
  column: string;
  oldValue: unknown;
  newValue: unknown;
  primaryKey: string;
  primaryKeyValue: unknown;
}
