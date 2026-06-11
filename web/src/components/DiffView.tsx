import DiffViewer from 'react-diff-viewer-continued';
import type { Cell, ModuleName, ContractItem, TestItem, Dependency } from '../types';

interface DiffViewProps {
  current: Cell;
  merged: Cell;
  onAdopt: () => void;
  onReject: () => void;
  deltaId: string;
}

function contractItemToText(item: ContractItem): string {
  const lines: string[] = [];
  lines.push(item.name);
  if (item.description) lines.push(`  ${item.description}`);
  if (item.inputs?.length) {
    lines.push('Inputs:');
    item.inputs.forEach((f) => lines.push(`  ${f.name}: ${f.type}${f.required ? ' (required)' : ''}${f.description ? ` — ${f.description}` : ''}`));
  }
  if (item.outputs?.length) {
    lines.push('Outputs:');
    item.outputs.forEach((f) => lines.push(`  ${f.name}: ${f.type}${f.description ? ` — ${f.description}` : ''}`));
  }
  if (item.errors?.length) {
    lines.push('Errors:');
    item.errors.forEach((e) => lines.push(`  ${e.code}: ${e.description}`));
  }
  return lines.join('\n');
}

function moduleToString(module: ModuleName, cell: Cell): string {
  switch (module) {
    case 'intent':
      return cell.intent || '';
    case 'plan':
      return cell.plan || '';
    case 'contract':
      return (cell.contract || [])
        .map((c: ContractItem) => contractItemToText(c))
        .join('\n\n');
    case 'test':
      return (cell.test || [])
        .map((t: TestItem) => `SCENARIO: ${t.scenario}\nGIVEN: ${t.given}\nWHEN: ${t.when}\nTHEN: ${t.then}`)
        .join('\n\n');
    case 'schema':
      return JSON.stringify(cell.schema || [], null, 2);
    case 'states':
      return JSON.stringify(cell.states || [], null, 2);
    case 'invariants':
      return JSON.stringify(cell.invariants || [], null, 2);
    case 'requires_state':
      return '';
  }
}

function dependsOnToString(deps: Dependency[]): string {
  return deps.map((dep) => {
    if (typeof dep === 'string') return dep;
    return dep.kind ? `${dep.id} (${dep.kind})` : dep.id;
  }).join('\n');
}

const MODULES: ModuleName[] = ['intent', 'plan', 'contract', 'test', 'schema', 'states', 'invariants'];

export default function DiffView({ current, merged, onAdopt, onReject, deltaId }: DiffViewProps) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="card-header" style={{ flexShrink: 0 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 'var(--text-md)', fontWeight: 'var(--font-bold)' }}>
            Delta: <span style={{ color: 'var(--primary)' }}>{deltaId}</span>
          </h3>
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)' }}>
            Compare current (v{current.version}) with merged (v{merged.version})
          </span>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
          <button onClick={onReject} className="btn btn-danger">
            Reject
          </button>
          <button onClick={onAdopt} className="btn btn-success">
            Adopt (Archive)
          </button>
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 'var(--space-xl)' }}>
        {MODULES.map((mod) => {
          const oldStr = moduleToString(mod, current);
          const newStr = moduleToString(mod, merged);
          if (oldStr === newStr) return null;
          return (
            <div key={mod} style={{ marginBottom: 'var(--space-xl)' }}>
              <h4 className="section-title" style={{ marginBottom: 'var(--space-sm)' }}>
                {mod}
              </h4>
              <div className="card" style={{ overflow: 'hidden' }}>
                <DiffViewer
                  oldValue={oldStr}
                  newValue={newStr}
                  splitView={true}
                  leftTitle={`Current (v${current.version})`}
                  rightTitle={`Merged (v${merged.version})`}
                  styles={{
                    contentText: { fontSize: 'var(--text-base)', lineHeight: 1.6 },
                  }}
                />
              </div>
            </div>
          );
        })}
        {/* depends_on diff */}
        {(() => {
          const oldDeps = dependsOnToString(current.depends_on || []);
          const newDeps = dependsOnToString(merged.depends_on || []);
          if (oldDeps === newDeps) return null;
          return (
            <div style={{ marginBottom: 'var(--space-xl)' }}>
              <h4 className="section-title" style={{ marginBottom: 'var(--space-sm)' }}>
                depends_on
              </h4>
              <div className="card" style={{ overflow: 'hidden' }}>
                <DiffViewer
                  oldValue={oldDeps}
                  newValue={newDeps}
                  splitView={true}
                  leftTitle={`Current (v${current.version})`}
                  rightTitle={`Merged (v${merged.version})`}
                  styles={{
                    contentText: { fontSize: 'var(--text-base)', lineHeight: 1.6 },
                  }}
                />
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
