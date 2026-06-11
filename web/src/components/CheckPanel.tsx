import { useState } from 'react';
import type { CheckResult } from '../types';
import { api } from '../api';

export default function CheckPanel() {
  const [result, setResult] = useState<CheckResult | null>(null);
  const [loading, setLoading] = useState(false);

  const handleCheck = async () => {
    setLoading(true);
    try {
      const data = await api.check();
      setResult(data);
    } catch (err) {
      console.error('Failed to run check:', err);
    } finally {
      setLoading(false);
    }
  };

  const hasIssues = result && (
    result.dangling_refs.length > 0 ||
    result.cycles.length > 0 ||
    result.gaps.length > 0 ||
    result.glossary_conflicts.length > 0 ||
    result.glossary_missing_refs.length > 0
  );

  return (
    <div>
      <button
        onClick={handleCheck}
        disabled={loading}
        className={hasIssues ? 'btn btn-danger' : 'btn'}
      >
        {loading ? '检查中...' : '一致性检查'}
      </button>

      {result && (
        <div
          style={{
            position: 'fixed',
            bottom: 20,
            right: 20,
            width: 420,
            maxHeight: '60vh',
            background: 'var(--surface)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-lg)',
            zIndex: 1000,
            overflow: 'auto',
          }}
        >
          <div className="card-header" style={{ position: 'sticky', top: 0, zIndex: 1 }}>
            <h4 style={{ margin: 0, fontSize: 'var(--text-sm)', fontWeight: 'var(--font-bold)' }}>
              一致性检查结果
              {hasIssues && (
                <span className="tag tag-danger" style={{ marginLeft: 'var(--space-sm)' }}>存在阻断项</span>
              )}
              {!hasIssues && (
                <span className="tag tag-success" style={{ marginLeft: 'var(--space-sm)' }}>已通过</span>
              )}
            </h4>
            <button
              onClick={() => setResult(null)}
              className="btn btn-sm"
              style={{ border: 'none', background: 'none', fontSize: 16 }}
            >
              ×
            </button>
          </div>
          <div className="card-body">
            <CheckSection title="悬挂引用（Dangling References）" items={result.dangling_refs} />
            <CheckSection title="循环依赖（Cycles）" items={result.cycles} />
            <CheckSection title="模块缺口（Gaps）" items={result.gaps} />
            <CheckSection title="术语冲突（Glossary Conflicts）" items={result.glossary_conflicts} />
            <CheckSection title="术语缺失引用（Glossary Missing Refs）" items={result.glossary_missing_refs} />
          </div>
        </div>
      )}
    </div>
  );
}

function CheckSection({ title, items }: { title: string; items: unknown[] }) {
  if (items.length === 0) return null;
  return (
    <div style={{ marginBottom: 'var(--space-md)' }}>
      <div style={{ fontWeight: 'var(--font-bold)', fontSize: 'var(--text-xs)', color: 'var(--danger)', marginBottom: 'var(--space-xs)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {title} ({items.length})
      </div>
      {items.map((item, i) => (
        <div
          key={i}
          style={{
            padding: 'var(--space-sm)',
            marginBottom: 'var(--space-xs)',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--warning-light)',
            fontSize: 'var(--text-sm)',
            lineHeight: 1.4,
          }}
        >
          {typeof item === 'object' && item !== null
            ? Object.entries(item as Record<string, unknown>).map(([k, v]) => (
                <div key={k}>
                  <strong>{k}:</strong> {JSON.stringify(v)}
                </div>
              ))
            : JSON.stringify(item)}
        </div>
      ))}
    </div>
  );
}
