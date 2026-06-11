import type {
  Cell,
  CellSummary,
  Delta,
  DeltaSummary,
  GraphData,
  MergePreview,
  ModuleName,
  Glossary,
  GlossaryImpactResult,
  CheckResult,
  SliceResult,
  ImpactResult,
  StaleCell,
  RootResult,
} from './types';

const BASE = '/api';

export class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new ApiError(data.error || 'Request failed', res.status, data);
  return data;
}

// Cell CRUD
export const api = {
  listCells: () => request<{ cells: CellSummary[] }>('/cells'),

  readCell: (id: string) => request<Cell>(`/cells/${id}`),

  createCell: (data: Partial<Cell>) =>
    request<{ created: string }>('/cells', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateCellModule: (id: string, module: ModuleName | 'depends_on', data: unknown) =>
    request<{ updated: string; module: string }>(`/cells/${id}/${module}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  confirmModule: (id: string, module: ModuleName, data: unknown) =>
    request<{
      blocked: boolean;
      reasons?: string[];
      impact: ImpactResult;
      current_cell_impacted_modules: string[];
      affected_cell_impacted_modules: string[];
      marked_stale?: string[];
      draft_saved?: boolean;
      draft_path?: string;
    }>(`/cells/${id}/confirm-module`, {
      method: 'POST',
      body: JSON.stringify({ module, data }),
    }),

  readModuleDraft: (id: string, module: ModuleName) =>
    request<{ draft: { data: unknown } | null }>(`/cells/${id}/drafts/${module}`),

  deleteCell: (id: string) =>
    request<{ deleted: string; dependents: string[] }>(`/cells/${id}`, {
      method: 'DELETE',
    }),

  // Delta CRUD
  listDeltas: () => request<{ deltas: DeltaSummary[] }>('/deltas'),

  readDelta: (id: string) => request<Delta>(`/deltas/${id}`),

  createDelta: (data: Partial<Delta>) =>
    request<{ created: string; target: string }>('/deltas', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateDeltaModule: (id: string, module: ModuleName | 'depends_on', data: unknown) =>
    request<{ updated: string; module: string }>(`/deltas/${id}/${module}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteDelta: (id: string) =>
    request<{ deleted: string }>(`/deltas/${id}`, {
      method: 'DELETE',
    }),

  // Delta merge
  mergePreview: (id: string) =>
    request<MergePreview>(`/deltas/${id}/merge-preview`),

  mergeDelta: (id: string) =>
    request<{ merged: boolean; new_version: number }>(`/deltas/${id}/merge`, {
      method: 'POST',
    }),

  archiveDelta: (id: string) =>
    request<{ archived: boolean; new_version: number; propagated: string[] }>(`/deltas/${id}/archive`, {
      method: 'POST',
    }),

  // Graph
  getGraphData: () => request<GraphData>('/graph/data'),

  // Stale
  listStale: () =>
    request<{ stale_cells: StaleCell[] }>('/stale'),

  confirmCell: (id: string, module = 'all') =>
    request<{ confirmed: string; cleared: string[] }>(`/cells/${id}/confirm?module=${module}`, {
      method: 'POST',
    }),

  // Glossary
  readGlossary: () =>
    request<Glossary>('/glossary'),

  updateGlossary: (data: Partial<Glossary>) =>
    request<Glossary>('/glossary', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  addEntity: (data: Record<string, unknown>) =>
    request<{ added: string; version: number }>('/glossary/entities', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  checkGlossary: () =>
    request<{ conflicts: unknown[]; missing_refs: unknown[] }>('/glossary/check'),

  glossaryImpact: (entities: string[]) =>
    request<GlossaryImpactResult>('/glossary/impact', {
      method: 'POST',
      body: JSON.stringify({ entities }),
    }),

  // Graph operations
  getImpact: (id: string) =>
    request<ImpactResult>(`/cells/${id}/impact`),

  getDeps: (id: string) =>
    request<{ cell: string; depends_on: string[] }>(`/cells/${id}/deps`),

  check: () =>
    request<CheckResult>('/check'),

  roots: (threshold = 2) =>
    request<{ roots: RootResult[] }>(`/roots?threshold=${threshold}`),

  slice: (id: string, hops = 1) =>
    request<SliceResult>(`/cells/${id}/slice?hops=${hops}`),

  // Propagate
  propagate: (id: string) =>
    request<{ source: string; marked_stale: string[] }>(`/cells/${id}/propagate`, {
      method: 'POST',
    }),
};
