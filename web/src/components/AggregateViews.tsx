import type { SchemaField, StateItem } from '../types';

export function SchemaView({ items }: { items: SchemaField[] }) {
  if (items.length === 0) {
    return <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', padding: 'var(--space-md)' }}>No schema defined</div>;
  }
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
      <thead>
        <tr style={{ borderBottom: '2px solid var(--border)' }}>
          <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 'var(--font-semibold)', color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', width: '40%' }}>Name</th>
          <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 'var(--font-semibold)', color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', width: '60%' }}>Type</th>
        </tr>
      </thead>
      <tbody>
        {items.map((f, i) => (
          <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '5px 8px', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', color: 'var(--text)' }}>{f.name}</td>
            <td style={{ padding: '5px 8px', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--info)' }}>{f.type}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function StatesView({ items }: { items: StateItem[] }) {
  if (items.length === 0) {
    return <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', padding: 'var(--space-md)' }}>No states defined</div>;
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)', flexWrap: 'wrap' }}>
      {items.map((item, i) => (
        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-xs)' }}>
          <span
            className="tag"
            style={{
              background: 'var(--primary-light)',
              color: 'var(--primary)',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-xs)',
              fontWeight: 'var(--font-bold)',
            }}
          >
            {item.name}
          </span>
          {i < items.length - 1 && (
            <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)' }}>→</span>
          )}
        </span>
      ))}
    </div>
  );
}

export function InvariantsView({ items }: { items: string[] }) {
  if (items.length === 0) {
    return <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', padding: 'var(--space-md)' }}>No invariants defined</div>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
      {items.map((inv, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 'var(--space-sm)',
            padding: 'var(--space-xs) var(--space-sm)',
            background: 'var(--bg-secondary)',
            borderRadius: 4,
            fontSize: 'var(--text-sm)',
            lineHeight: 1.5,
          }}
        >
          <span style={{ color: 'var(--warning)', fontWeight: 'var(--font-bold)', fontSize: 'var(--text-xs)', flexShrink: 0 }}>🛡</span>
          <span style={{ color: 'var(--text-secondary)' }}>{inv}</span>
        </div>
      ))}
    </div>
  );
}
