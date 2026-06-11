import type { TestItem } from '../types';

const STEPS = [
  { key: 'given', label: 'Given', color: 'var(--info)' },
  { key: 'when', label: 'When', color: 'var(--warning)' },
  { key: 'then', label: 'Then', color: 'var(--success)' },
] as const;

export default function TestView({ items }: { items: TestItem[] }) {
  if (items.length === 0) {
    return <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', padding: 'var(--space-md)' }}>No tests defined</div>;
  }
  return (
    <div>
      {items.map((item, i) => (
        <div key={i} className="card" style={{ marginBottom: 'var(--space-sm)' }}>
          <div
            style={{
              padding: 'var(--space-sm) var(--space-md)',
              background: 'var(--surface-hover)',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-sm)',
            }}
          >
            <span
              style={{
                padding: '1px 8px',
                borderRadius: 4,
                background: 'var(--primary-light)',
                color: 'var(--primary)',
                fontSize: 'var(--text-xs)',
                fontWeight: 'var(--font-bold)',
              }}
            >
              #{i + 1}
            </span>
            <span style={{ fontWeight: 'var(--font-semibold)', fontSize: 'var(--text-sm)', color: 'var(--text)' }}>
              {item.scenario}
            </span>
          </div>
          <div style={{ padding: 'var(--space-md)', display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
            {STEPS.map(({ key, label, color }) => (
              <div key={key} style={{ display: 'flex', gap: 'var(--space-md)', alignItems: 'baseline' }}>
                <span
                  style={{
                    fontWeight: 'var(--font-bold)',
                    fontSize: 'var(--text-xs)',
                    color,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    minWidth: 40,
                    flexShrink: 0,
                  }}
                >
                  {label}
                </span>
                <span style={{ fontSize: 'var(--text-sm)', lineHeight: 1.5, color: 'var(--text-secondary)' }}>
                  {item[key]}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
