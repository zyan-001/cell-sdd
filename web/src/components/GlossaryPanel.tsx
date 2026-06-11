import { useEffect, useState, useCallback } from 'react';
import type { Glossary, GlossaryEntity, GlossaryEntityAttribute } from '../types';
import { api } from '../api';

interface GlossaryPanelProps {
  onClose: () => void;
}

export default function GlossaryPanel({ onClose }: GlossaryPanelProps) {
  const [glossary, setGlossary] = useState<Glossary | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'entities' | 'check'>('entities');
  const [checkResult, setCheckResult] = useState<{ conflicts: unknown[]; missing_refs: unknown[] } | null>(null);
  const [pendingSave, setPendingSave] = useState<{
    entityName: string;
    newEntity: GlossaryEntity;
    impact: { entities: string[]; affected_cells: string[] };
  } | null>(null);

  useEffect(() => {
    loadGlossary();
  }, []);

  const loadGlossary = useCallback(async () => {
    try {
      const data = await api.readGlossary();
      setGlossary(data);
    } catch (err) {
      console.error('Failed to load glossary:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleCheck = async () => {
    try {
      const result = await api.checkGlossary();
      setCheckResult(result);
      setActiveTab('check');
    } catch (err) {
      console.error('Failed to check glossary:', err);
    }
  };

  const handleEntitySave = async (entityName: string, newEntity: GlossaryEntity) => {
    try {
      const impact = await api.glossaryImpact([entityName]);
      if (impact.affected_cells.length > 0) {
        setPendingSave({ entityName, newEntity, impact });
      } else {
        await doSaveEntity(entityName, newEntity);
      }
    } catch (err) {
      console.error('Failed to check impact:', err);
    }
  };

  const doSaveEntity = async (entityName: string, newEntity: GlossaryEntity) => {
    if (!glossary) return;
    try {
      const updated = {
        ...glossary,
        entities: { ...glossary.entities, [entityName]: newEntity },
      };
      await api.updateGlossary(updated);
      setPendingSave(null);
      await loadGlossary();
    } catch (err) {
      console.error('Failed to save entity:', err);
    }
  };

  const handleConfirmSave = () => {
    if (!pendingSave) return;
    doSaveEntity(pendingSave.entityName, pendingSave.newEntity);
  };

  const handleCancelSave = () => {
    setPendingSave(null);
  };

  if (loading) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">📖</div>
        <div>Loading glossary...</div>
      </div>
    );
  }

  if (!glossary) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">📖</div>
        <div>No glossary found</div>
      </div>
    );
  }

  const entityEntries = Object.entries(glossary.entities);

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        width: 480,
        height: '100%',
        background: 'var(--surface)',
        boxShadow: 'var(--shadow-lg)',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div
        className="card-header"
        style={{ padding: 'var(--space-md) var(--space-xl)', flexShrink: 0 }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: 'var(--text-lg)', fontWeight: 'var(--font-bold)' }}>Glossary</h3>
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)' }}>v{glossary.version}</span>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
          <button onClick={handleCheck} className="btn btn-primary">
            Check
          </button>
          <button onClick={onClose} className="btn">
            Close
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        {(['entities', 'check'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              flex: 1,
              padding: 'var(--space-sm) 0',
              border: 'none',
              background: activeTab === tab ? 'var(--primary-light)' : 'var(--surface)',
              color: activeTab === tab ? 'var(--primary)' : 'var(--text-secondary)',
              fontWeight: activeTab === tab ? 'var(--font-bold)' : 'var(--font-normal)',
              fontSize: 'var(--text-sm)',
              cursor: 'pointer',
              borderBottom: activeTab === tab ? '2px solid var(--primary)' : '2px solid transparent',
              transition: 'all 0.15s ease',
            }}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
            {tab === 'entities' && ` (${entityEntries.length})`}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: 'var(--space-xl)' }}>
        {activeTab === 'entities' && (
          <div>
            {entityEntries.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">📭</div>
                <div>No entities defined</div>
              </div>
            ) : (
              entityEntries.map(([name, entity]: [string, GlossaryEntity]) => (
                <EntityCard
                  key={name}
                  name={name}
                  entity={entity}
                  onSave={handleEntitySave}
                />
              ))
            )}
          </div>
        )}

        {activeTab === 'check' && (
          <div>
            {!checkResult ? (
              <div className="empty-state">
                <div className="empty-state-icon">🔍</div>
                <div>Click "Check" to run consistency check</div>
              </div>
            ) : (
              <>
                <CheckSection title="Conflicts" items={checkResult.conflicts} />
                <CheckSection title="Missing References" items={checkResult.missing_refs} />
                {checkResult.conflicts.length === 0 && checkResult.missing_refs.length === 0 && (
                  <div className="empty-state">
                    <div style={{ color: 'var(--success)', fontWeight: 'var(--font-bold)', fontSize: 'var(--text-lg)' }}>
                      All checks passed!
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Impact confirmation overlay */}
      {pendingSave && (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            background: 'var(--surface)',
            borderTop: '2px solid var(--danger)',
            boxShadow: 'var(--shadow-lg)',
            padding: 'var(--space-xl)',
          }}
        >
          <div style={{ fontWeight: 'var(--font-bold)', fontSize: 'var(--text-md)', color: 'var(--danger)', marginBottom: 'var(--space-sm)' }}>
            Impact Detected
          </div>
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--space-xs)' }}>
            Modifying <strong>{pendingSave.entityName}</strong> will affect:
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-xs)', flexWrap: 'wrap', marginBottom: 'var(--space-md)' }}>
            {pendingSave.impact.affected_cells.map((cell) => (
              <span key={cell} className="tag tag-danger">
                {cell}
              </span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-sm)', justifyContent: 'flex-end' }}>
            <button onClick={handleCancelSave} className="btn">
              Cancel
            </button>
            <button onClick={handleConfirmSave} className="btn btn-danger">
              Confirm Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function EntityCard({ name, entity, onSave }: { name: string; entity: GlossaryEntity; onSave: (name: string, entity: GlossaryEntity) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<GlossaryEntity>(entity);

  const startEdit = () => {
    setDraft({ ...entity, attributes: entity.attributes.map(a => ({ ...a })), capabilities: [...entity.capabilities] });
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setDraft(entity);
  };

  const saveEdit = () => {
    setEditing(false);
    onSave(name, draft);
  };

  const addAttribute = () => {
    setDraft({ ...draft, attributes: [...draft.attributes, { name: '', type: 'string', description: '' }] });
  };

  const updateAttribute = (index: number, field: keyof GlossaryEntityAttribute, value: string) => {
    const attrs = draft.attributes.map((a, i) => i === index ? { ...a, [field]: value } : a);
    setDraft({ ...draft, attributes: attrs });
  };

  const removeAttribute = (index: number) => {
    setDraft({ ...draft, attributes: draft.attributes.filter((_, i) => i !== index) });
  };

  const addCapability = () => {
    setDraft({ ...draft, capabilities: [...draft.capabilities, ''] });
  };

  const updateCapability = (index: number, value: string) => {
    const caps = draft.capabilities.map((c, i) => i === index ? value : c);
    setDraft({ ...draft, capabilities: caps });
  };

  const removeCapability = (index: number) => {
    setDraft({ ...draft, capabilities: draft.capabilities.filter((_, i) => i !== index) });
  };

  const data = editing ? draft : entity;

  return (
    <div
      className="card"
      style={{
        marginBottom: 'var(--space-sm)',
        border: editing ? '2px solid var(--primary)' : undefined,
      }}
    >
      <div
        onClick={() => !editing && setExpanded(!expanded)}
        className="card-header"
        style={{
          cursor: editing ? 'default' : 'pointer',
          background: editing ? 'var(--primary-light)' : undefined,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
          <span style={{ fontWeight: 'var(--font-bold)', fontSize: 'var(--text-sm)', color: 'var(--info)' }}>{name}</span>
          {entity.capabilities.length > 0 && (
            <span className="tag tag-muted">{entity.capabilities.length} capabilities</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-xs)', alignItems: 'center' }}>
          {expanded && !editing && (
            <button
              onClick={(e) => { e.stopPropagation(); startEdit(); }}
              className="btn btn-sm btn-primary"
            >
              Edit
            </button>
          )}
          {!editing && (
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)' }}>
              {expanded ? '▲' : '▼'}
            </span>
          )}
        </div>
      </div>
      {expanded && (
        <div className="card-body" style={{ fontSize: 'var(--text-sm)' }}>
          {/* Attributes */}
          <div style={{ marginBottom: 'var(--space-md)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-xs)' }}>
              <span className="section-title">Attributes</span>
              {editing && (
                <button onClick={addAttribute} className="btn btn-sm btn-primary">
                  + Add
                </button>
              )}
            </div>
            {data.attributes.length === 0 && !editing && (
              <div style={{ paddingLeft: 'var(--space-sm)', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>—</div>
            )}
            {data.attributes.map((attr, i) => (
              <div key={i} style={{ paddingLeft: 'var(--space-sm)', marginBottom: 'var(--space-xs)', display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}>
                {editing ? (
                  <>
                    <input
                      value={attr.name}
                      onChange={(e) => updateAttribute(i, 'name', e.target.value)}
                      placeholder="name"
                      className="input"
                      style={{ width: 80 }}
                    />
                    <span style={{ color: 'var(--text-tertiary)' }}>:</span>
                    <input
                      value={attr.type}
                      onChange={(e) => updateAttribute(i, 'type', e.target.value)}
                      placeholder="type"
                      className="input"
                      style={{ width: 60 }}
                    />
                    <input
                      value={attr.description}
                      onChange={(e) => updateAttribute(i, 'description', e.target.value)}
                      placeholder="description"
                      className="input"
                      style={{ flex: 1 }}
                    />
                    <button onClick={() => removeAttribute(i)} className="btn btn-sm btn-danger" style={{ padding: '1px 6px' }}>
                      ×
                    </button>
                  </>
                ) : (
                  <>
                    <span style={{ fontWeight: 'var(--font-semibold)' }}>{attr.name}</span>
                    <span style={{ color: 'var(--text-tertiary)' }}>: {attr.type}</span>
                    {attr.description && <span style={{ color: 'var(--text-muted)' }}>— {attr.description}</span>}
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Capabilities */}
          <div style={{ marginBottom: 'var(--space-md)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-xs)' }}>
              <span className="section-title">Capabilities</span>
              {editing && (
                <button onClick={addCapability} className="btn btn-sm btn-primary">
                  + Add
                </button>
              )}
            </div>
            {data.capabilities.length === 0 && !editing && (
              <div style={{ paddingLeft: 'var(--space-sm)', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>—</div>
            )}
            <div style={{ display: 'flex', gap: 'var(--space-xs)', flexWrap: 'wrap' }}>
              {data.capabilities.map((cap, i) => (
                editing ? (
                  <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-xs)' }}>
                    <input
                      value={cap}
                      onChange={(e) => updateCapability(i, e.target.value)}
                      className="input"
                      style={{ width: 100, fontSize: 'var(--text-xs)' }}
                    />
                    <button onClick={() => removeCapability(i)} className="btn btn-sm btn-danger" style={{ padding: '1px 6px' }}>
                      ×
                    </button>
                  </span>
                ) : (
                  <span key={cap} className="tag tag-primary">
                    {cap}
                  </span>
                )
              ))}
            </div>
          </div>

          {/* Edit actions */}
          {editing && (
            <div style={{ display: 'flex', gap: 'var(--space-sm)', justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: 'var(--space-sm)' }}>
              <button onClick={cancelEdit} className="btn">
                Cancel
              </button>
              <button onClick={saveEdit} className="btn btn-filled">
                Save
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CheckSection({ title, items }: { title: string; items: unknown[] }) {
  if (items.length === 0) return null;
  return (
    <div style={{ marginBottom: 'var(--space-lg)' }}>
      <div style={{ fontWeight: 'var(--font-bold)', fontSize: 'var(--text-sm)', color: 'var(--danger)', marginBottom: 'var(--space-sm)' }}>
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
