import { useState } from 'react';
import type { ModuleName, ContractItem, TestItem } from '../types';
import ContractView from './ContractView';
import TestView from './TestView';

interface ModuleCardProps {
  title: ModuleName;
  value: string;
  onChange: (module: ModuleName, value: string) => void;
  onConfirm: (module: ModuleName) => void;
  onRestoreDraft: (module: ModuleName) => void;
  isBusy?: boolean;
  structuredData?: ContractItem[] | TestItem[];
}

const MODULE_ICONS: Record<ModuleName, string> = {
  intent: '🎯',
  plan: '📋',
  contract: '📜',
  test: '🧪',
};

const MODULE_COLORS: Record<ModuleName, string> = {
  intent: '#6c63ff',
  plan: '#00b894',
  contract: '#f39c12',
  test: '#e74c3c',
};

export default function ModuleCard({
  title,
  value,
  onChange,
  onConfirm,
  onRestoreDraft,
  isBusy = false,
  structuredData,
}: ModuleCardProps) {
  const [editing, setEditing] = useState(false);
  const color = MODULE_COLORS[title];
  const icon = MODULE_ICONS[title];
  const isTextMode = title === 'intent' || title === 'plan';
  const hasStructuredView = !isTextMode && structuredData;

  // For text modules, always show textarea (no browse/edit toggle)
  const showTextarea = isTextMode || editing;
  const placeholder = isTextMode
    ? `Edit ${title} text...`
    : `Edit ${title} in JSON format...`;

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
          <button
            onClick={() => onRestoreDraft(title)}
            className="btn btn-sm"
            disabled={isBusy}
          >
            Restore Draft
          </button>
          {hasStructuredView && !editing && (
            <button
              onClick={() => setEditing(true)}
              className="btn btn-sm"
              style={{ borderColor: color, color, background: `${color}08` }}
              disabled={isBusy}
            >
              Edit
            </button>
          )}
          {hasStructuredView && editing && (
            <button
              onClick={() => setEditing(false)}
              className="btn btn-sm"
              disabled={isBusy}
            >
              Cancel
            </button>
          )}
          <button
            onClick={() => onConfirm(title)}
            className="btn btn-sm"
            style={{
              borderColor: color,
              color,
              background: `${color}08`,
            }}
            disabled={isBusy}
          >
            Confirm Module
          </button>
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
