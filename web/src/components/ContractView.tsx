import type { ContractItem, ContractField, ContractError } from '../types';

function FieldTable({ label, fields, color }: { label: string; fields?: ContractField[]; color: string }) {
  if (!fields || fields.length === 0) return null;
  return (
    <div style={{ marginBottom: 'var(--space-sm)' }}>
      <div style={{ fontWeight: 'var(--font-bold)', fontSize: 'var(--text-xs)', color, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 'var(--space-xs)' }}>
        {label}
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <th style={{ textAlign: 'left', padding: '2px 6px', fontWeight: 'var(--font-semibold)', color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', width: '30%' }}>Name</th>
            <th style={{ textAlign: 'left', padding: '2px 6px', fontWeight: 'var(--font-semibold)', color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', width: '15%' }}>Type</th>
            <th style={{ textAlign: 'center', padding: '2px 6px', fontWeight: 'var(--font-semibold)', color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', width: '10%' }}>Req</th>
            <th style={{ textAlign: 'left', padding: '2px 6px', fontWeight: 'var(--font-semibold)', color: 'var(--text-secondary)', fontSize: 'var(--text-xs)' }}>Description</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((f, i) => (
            <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '3px 6px', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>{f.name}</td>
              <td style={{ padding: '3px 6px', color: 'var(--info)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>{f.type}</td>
              <td style={{ padding: '3px 6px', textAlign: 'center' }}>
                {f.required ? <span style={{ color: 'var(--danger)', fontWeight: 'var(--font-bold)' }}>*</span> : ''}
              </td>
              <td style={{ padding: '3px 6px', color: 'var(--text-secondary)', fontSize: 'var(--text-xs)' }}>{f.description || ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ErrorList({ errors }: { errors?: ContractError[] }) {
  if (!errors || errors.length === 0) return null;
  return (
    <div style={{ marginBottom: 'var(--space-sm)' }}>
      <div style={{ fontWeight: 'var(--font-bold)', fontSize: 'var(--text-xs)', color: 'var(--danger)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 'var(--space-xs)' }}>
        Errors
      </div>
      {errors.map((e, i) => (
        <div key={i} style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'baseline', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-xs)' }}>
          <span className="tag tag-danger" style={{ fontFamily: 'var(--font-mono)' }}>{e.code}</span>
          <span style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)' }}>{e.description}</span>
        </div>
      ))}
    </div>
  );
}

export default function ContractView({ items }: { items: ContractItem[] }) {
  if (items.length === 0) {
    return <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', padding: 'var(--space-md)' }}>No contracts defined</div>;
  }
  return (
    <div>
      {items.map((item, i) => (
        <div key={i} className="card" style={{ marginBottom: 'var(--space-sm)' }}>
          <div className="card-header" style={{ padding: 'var(--space-sm) var(--space-md)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
              <span
                style={{
                  padding: '2px 8px',
                  borderRadius: 4,
                  background: 'var(--primary-light)',
                  color: 'var(--primary)',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 'var(--font-bold)',
                }}
              >
                {i + 1}
              </span>
              <span style={{ fontWeight: 'var(--font-semibold)', fontSize: 'var(--text-sm)', color: 'var(--text)' }}>
                {item.name}
              </span>
              {item.description && (
                <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)' }}>
                  — {item.description}
                </span>
              )}
            </div>
          </div>
          <div className="card-body" style={{ padding: 'var(--space-md)' }}>
            <FieldTable label="Inputs" fields={item.inputs} color="var(--info)" />
            <FieldTable label="Outputs" fields={item.outputs} color="var(--success)" />
            <ErrorList errors={item.errors} />
          </div>
        </div>
      ))}
    </div>
  );
}
