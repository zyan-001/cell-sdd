export interface Cell {
  id: string;
  version: number;
  entity?: string | null;
  intent: string;
  plan?: string;
  contract?: ContractItem[];
  test?: TestItem[];
  schema?: SchemaField[];
  states?: StateItem[];
  invariants?: string[];
  requires_state?: RequiresStateItem[];
  depends_on: Dependency[];
  kind?: string | null;
  tags?: string[] | null;
  _stale?: Record<string, boolean>;
}

export interface SchemaField {
  name: string;
  type: string;
}

export interface StateItem {
  name: string;
}

export interface RequiresStateItem {
  target: string;
  field: string;
  type: 'schema' | 'state';
}

export interface LegacyContractItem {
  when: string;
  then: string;
}

export interface ContractField {
  name: string;
  type: string;
  required?: boolean;
  description?: string;
}

export interface ContractError {
  code: string;
  description: string;
}

export interface ContractItem {
  name: string;
  description?: string;
  inputs?: ContractField[];
  outputs?: ContractField[];
  errors?: ContractError[];
}

export interface TestItem {
  scenario: string;
  given: string;
  when: string;
  then: string;
}

export type Dependency = string | { id: string; kind?: string };

export interface Delta {
  id: string;
  target: string;
  intent: string;
  plan: string;
  contract: ContractItem[];
  test: TestItem[];
  depends_on: Dependency[];
}

export interface CellSummary {
  id: string;
  version: number;
  entity: string | null;
  depends_on_count: number;
  stale: boolean;
  kind: string | null;
}

export interface DeltaSummary {
  id: string;
  target: string;
}

export interface GraphNode {
  id: string;
  data: {
    label: string;
    version: number;
    kind: string | null;
    entity: string | null;
    tags: string[];
    stale: string[];
  };
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface MergePreview {
  delta: string;
  target: string;
  merged: Cell;
}

export type ModuleName = 'intent' | 'plan' | 'contract' | 'test' | 'schema' | 'states' | 'invariants' | 'requires_state';

// Glossary types
export interface GlossaryTerm {
  definition: string;
  aliases?: string[];
}

export interface Glossary {
  version: number;
  terms: Record<string, GlossaryTerm>;
}

export interface GlossaryImpactResult {
  terms: string[];
  affected_cells: string[];
}

// Check result types
export interface DanglingRef {
  cell: string;
  ref: string;
}

export interface Gap {
  cell: string;
  missing: string[];
}

export interface GlossaryConflict {
  cell: string;
  entity: string;
  issue: string;
}

export interface GlossaryMissingRef {
  cell: string;
  entity: string;
  issue: string;
}

export interface CheckResult {
  dangling_refs: DanglingRef[];
  cycles: string[][];
  gaps: Gap[];
  glossary_conflicts: GlossaryConflict[];
  glossary_missing_refs: GlossaryMissingRef[];
}

// Slice result types
export interface SliceCell {
  role: 'root' | 'dependency';
  data: Cell;
}

export interface SliceResult {
  root: string;
  cells: SliceCell[];
}

// Impact analysis result
export interface ImpactResult {
  source: string;
  affected: string[];
  depth: Record<string, number>;
}

// Dirty cell
export interface DirtyCell {
  cell: string;
  dirty_modules: string[];
}

// Stale cell
export interface StaleCell {
  cell: string;
  stale_modules: string[];
}

// Roots result
export interface RootResult {
  cell: string;
  in_degree: number;
}
