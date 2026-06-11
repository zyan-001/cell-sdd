import { useState } from 'react';
import type { ModuleName, ContractItem, TestItem } from '../types';
import ContractView from './ContractView';
import TestView from './TestView';
import JourneyPlanView from './JourneyPlanView';

interface ModuleCardProps {
  title: ModuleName;
  value: string;
  onChange: (module: ModuleName, value: string) => void;
  onConfirm: (module: ModuleName) => Promise<boolean>;
  isBusy?: boolean;
  structuredData?: ContractItem[] | TestItem[];
  renderPlanAsMermaid?: boolean;
}

const MODULE_ICONS: Record<ModuleName, string> = {
  intent: '🎯',
  plan: '📋',
  contract: '📜',
  test: '🧪',
  schema: '🗄️',
  states: '🚥',
  invariants: '🛡️',
  requires_state: '🔗',
};

const MODULE_COLORS: Record<ModuleName, string> = {
  intent: '#6c63ff',
  plan: '#00b894',
  contract: '#f39c12',
  test: '#e74c3c',
  schema: '#3498db',
  states: '#9b59b6',
  invariants: '#34495e',
  requires_state: '#16a085',
};

export default function ModuleCard({
  title,
  value,
  onChange,
  onConfirm,
  isBusy = false,
  structuredData,
  renderPlanAsMermaid = false,
}: ModuleCardProps) {
  const [editing, setEditing] = useState(false);
  const color = MODULE_COLORS[title];
  const icon = MODULE_ICONS[title];
  const isMermaidPlan = title === 'plan' && renderPlanAsMermaid;
  const isTextMode = title === 'intent' || title === 'plan';
  const hasStructuredView = title !== 'intent' && title !== 'plan' && structuredData;
  const showTextarea = editing;
  const placeholder = isTextMode
    ? `Edit ${title} text...`
    : `Edit ${title} in JSON format...`;
  const canEdit = !isBusy;

  return (
    <div className="card" style={{ marginBottom: 'var(--space-md)' }}>
      <div
        className="card-header"
        style={{
          background: `${color}08`,
          borderBottom: `2px solid ${color}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
          <span style={{ fontSize: 14 }}>{icon}</span>
          <span style={{ fontWeight: 'var(--font-bold)', fontSize: 'var(--text-sm)', color, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {title}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
          {!editing && (
            <button
              onClick={() => setEditing(true)}
              className="btn btn-sm"
              style={{ borderColor: color, color, background: `${color}08` }}
              disabled={!canEdit}
            >
              Edit
            </button>
          )}
          {editing && (
            <>
              <button
                onClick={() => {
                  setEditing(false);
                }}
                className="btn btn-sm"
                disabled={isBusy}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const ok = await onConfirm(title);
                  if (ok) {
                    setEditing(false);
                  }
                }}
                className="btn btn-sm"
                style={{
                  borderColor: color,
                  color,
                  background: `${color}08`,
                }}
                disabled={isBusy}
              >
                Confirm
              </button>
            </>
          )}
        </div>
      </div>
      <div className="card-body" style={{ padding: 'var(--space-md)' }}>
        {showTextarea ? (
          <textarea
            value={value}
            onChange={(e) => onChange(title, e.target.value)}
            placeholder={placeholder}
            className="input"
            style={{
              width: '100%',
              minHeight: isTextMode ? 120 : 180,
              fontFamily: isTextMode ? 'inherit' : 'var(--font-mono)',
              resize: 'vertical',
              lineHeight: 1.5,
            }}
          />
        ) : isMermaidPlan ? (
          <JourneyPlanView chart={value} />
        ) : isTextMode ? (
          <pre
            style={{
              margin: 0,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontFamily: 'inherit',
              lineHeight: 1.5,
            }}
          >
            {value || '—'}
          </pre>
        ) : hasStructuredView ? (
          title === 'contract' ? (
            <ContractView items={structuredData as ContractItem[]} />
          ) : (
            <TestView items={structuredData as TestItem[]} />
          )
        ) : null}
      </div>
    </div>
  );
}
