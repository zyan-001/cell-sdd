import { useEffect, useState, useCallback } from 'react';
import type { Glossary, GlossaryTerm } from '../types';
import { api } from '../api';

interface GlossaryPanelProps {
  onClose: () => void;
}

export default function GlossaryPanel({ onClose }: GlossaryPanelProps) {
  const [glossary, setGlossary] = useState<Glossary | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'terms' | 'check'>('terms');
  const [checkResult, setCheckResult] = useState<{ conflicts: unknown[]; missing_refs: unknown[] } | null>(null);
  const [pendingSave, setPendingSave] = useState<{
    termName: string;
    newTerm: GlossaryTerm;
    impact: { terms: string[]; affected_cells: string[] };
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

  const handleTermSave = async (termName: string, newTerm: GlossaryTerm) => {
    try {
      const impact = await api.glossaryImpact([termName]);
      if (impact.affected_cells.length > 0) {
        setPendingSave({ termName, newTerm, impact });
      } else {
        await doSaveTerm(termName, newTerm);
      }
    } catch (err) {
      console.error('Failed to check impact:', err);
    }
  };

  const doSaveTerm = async (termName: string, newTerm: GlossaryTerm) => {
    if (!glossary) return;
    try {
      const updated = {
        ...glossary,
        terms: { ...glossary.terms, [termName]: newTerm },
      };
      await api.updateGlossary(updated);
      setPendingSave(null);
      await loadGlossary();
    } catch (err) {
      console.error('Failed to save term:', err);
    }
  };

  const handleConfirmSave = () => {
    if (!pendingSave) return;
    doSaveTerm(pendingSave.termName, pendingSave.newTerm);
  };

  const handleCancelSave = () => {
    setPendingSave(null);
  };

  if (loading) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">📖</div>
        <div>加载术语库中...</div>
      </div>
    );
  }

  if (!glossary) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">📖</div>
        <div>未找到术语库</div>
      </div>
    );
  }

  const termEntries = Object.entries(glossary.terms || {});

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
          <h3 style={{ margin: 0, fontSize: 'var(--text-lg)', fontWeight: 'var(--font-bold)' }}>术语库（Glossary）</h3>
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)' }}>v{glossary.version}</span>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
          <button onClick={handleCheck} className="btn btn-primary">
            术语检查
          </button>
          <button onClick={onClose} className="btn">
            关闭
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        {(['terms', 'check'] as const).map((tab) => (
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
            {tab === 'terms' ? '术语' : '检查结果'}
            {tab === 'terms' && ` (${termEntries.length})`}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: 'var(--space-xl)' }}>
        {activeTab === 'terms' && (
          <div>
            {termEntries.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">📭</div>
                  <div>暂无术语定义</div>
              </div>
            ) : (
              termEntries.map(([name, term]: [string, GlossaryTerm]) => (
                <TermCard
                  key={name}
                  name={name}
                  term={term}
                  onSave={handleTermSave}
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
                  <div>点击“术语检查”以运行一致性校验</div>
              </div>
            ) : (
              <>
                <CheckSection title="术语冲突（Conflicts）" items={checkResult.conflicts} />
                <CheckSection title="缺失引用（Missing References）" items={checkResult.missing_refs} />
                {checkResult.conflicts.length === 0 && checkResult.missing_refs.length === 0 && (
                  <div className="empty-state">
                    <div style={{ color: 'var(--success)', fontWeight: 'var(--font-bold)', fontSize: 'var(--text-lg)' }}>
                      术语检查通过
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
            检测到影响范围
          </div>
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--space-xs)' }}>
            修改 <strong>{pendingSave.termName}</strong> 会影响以下 Cell，确认后请继续修订相关模块：
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
              取消
            </button>
            <button onClick={handleConfirmSave} className="btn btn-danger">
              继续保存
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function TermCard({ name, term, onSave }: { name: string; term: GlossaryTerm; onSave: (name: string, term: GlossaryTerm) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<GlossaryTerm>(term);

  const startEdit = () => {
    setDraft({ ...term, aliases: [...(term.aliases || [])] });
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setDraft(term);
  };

  const saveEdit = () => {
    setEditing(false);
    onSave(name, draft);
  };

  const updateDefinition = (value: string) => {
    setDraft({ ...draft, definition: value });
  };

  const addAlias = () => {
    setDraft({ ...draft, aliases: [...(draft.aliases || []), ''] });
  };

  const updateAlias = (index: number, value: string) => {
    const aliases = [...(draft.aliases || [])];
    aliases[index] = value;
    setDraft({ ...draft, aliases });
  };

  const removeAlias = (index: number) => {
    const aliases = [...(draft.aliases || [])];
    aliases.splice(index, 1);
    setDraft({ ...draft, aliases });
  };

  const data = editing ? draft : term;

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
          {/* Definition */}
          <div style={{ marginBottom: 'var(--space-md)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-xs)' }}>
              <span className="section-title">Definition</span>
            </div>
            {editing ? (
              <textarea
                value={data.definition}
                onChange={(e) => updateDefinition(e.target.value)}
                className="input"
                style={{ width: '100%', minHeight: 60 }}
              />
            ) : (
              <div style={{ paddingLeft: 'var(--space-sm)' }}>{data.definition}</div>
            )}
          </div>

          {/* Aliases */}
          <div style={{ marginBottom: 'var(--space-md)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-xs)' }}>
              <span className="section-title">Aliases</span>
              {editing && (
                <button onClick={addAlias} className="btn btn-sm btn-primary">
                  + Add
                </button>
              )}
            </div>
            {(!data.aliases || data.aliases.length === 0) && !editing && (
              <div style={{ paddingLeft: 'var(--space-sm)', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>—</div>
            )}
            <div style={{ display: 'flex', gap: 'var(--space-xs)', flexWrap: 'wrap' }}>
              {(data.aliases || []).map((alias, i) => (
                editing ? (
                  <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-xs)' }}>
                    <input
                      value={alias}
                      onChange={(e) => updateAlias(i, e.target.value)}
                      className="input"
                      style={{ width: 100, fontSize: 'var(--text-xs)' }}
                    />
                    <button onClick={() => removeAlias(i)} className="btn btn-sm btn-danger" style={{ padding: '1px 6px' }}>
                      ×
                    </button>
                  </span>
                ) : (
                  <span key={i} className="tag tag-primary">
                    {alias}
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
