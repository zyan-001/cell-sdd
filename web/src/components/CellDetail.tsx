import { useEffect, useState, useCallback } from 'react';
import type { Cell, ModuleName, ImpactResult, ContractItem, TestItem, DirtyCell } from '../types';
import { ApiError, api } from '../api';
import ModuleCard from './ModuleCard';

interface CellDetailProps {
  cellId: string | null;
  onCellChanged: () => void;
}

export default function CellDetail({ cellId, onCellChanged }: CellDetailProps) {
  const [cell, setCell] = useState<Cell | null>(null);
  const [moduleDrafts, setModuleDrafts] = useState<Record<ModuleName, string>>({
    intent: '',
    plan: '',
    contract: '',
    test: '',
    schema: '',
    states: '',
    invariants: '',
    requires_state: '',
  });
  const [loading, setLoading] = useState(false);
  const [busyModule, setBusyModule] = useState<ModuleName | null>(null);
  const [impactResult, setImpactResult] = useState<ImpactResult | null>(null);
  const [blockedReasons, setBlockedReasons] = useState<string[]>([]);
  const [blockedModule, setBlockedModule] = useState<ModuleName | null>(null);
  const [blockedData, setBlockedData] = useState<unknown>(null);
  const [showForceConfirm, setShowForceConfirm] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [dirtyCells, setDirtyCells] = useState<DirtyCell[]>([]);

  const getModulesForKind = (kind?: string | null): ModuleName[] => {
    if (kind === 'Aggregate') return ['intent', 'schema', 'states', 'invariants'];
    if (kind === 'Action') return ['intent', 'plan', 'contract', 'test'];
    if (kind === 'Journey') return ['intent', 'plan', 'test'];
    return ['intent', 'plan', 'contract', 'test'];
  };

  const modules = cell ? getModulesForKind(cell.kind) : [];

  const toDraftText = (mod: ModuleName, value: Cell[ModuleName]): string => {
    if (mod === 'intent' || mod === 'plan') {
      return String(value || '');
    }
    return JSON.stringify(value || [], null, 2);
  };

  const parseDraft = (mod: ModuleName, raw: string): { ok: true; value: unknown } | { ok: false; error: string } => {
    if (mod === 'intent' || mod === 'plan') {
      const text = raw.trim();
      if (!text) {
        return { ok: false, error: `${mod} 不能为空` };
      }
      return { ok: true, value: text };
    }
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return { ok: false, error: `${mod} 必须是 JSON 数组` };
      }
      return { ok: true, value: parsed };
    } catch {
      return { ok: false, error: `${mod} 不是合法 JSON` };
    }
  };

  const loadCell = useCallback(async () => {
    if (!cellId) {
      setCell(null);
      return;
    }
    setLoading(true);
    try {
      const cellData = await api.readCell(cellId);
      setCell(cellData);
      setModuleDrafts({
        intent: toDraftText('intent', cellData.intent),
        plan: toDraftText('plan', cellData.plan),
        contract: toDraftText('contract', cellData.contract),
        test: toDraftText('test', cellData.test),
        schema: toDraftText('schema', cellData.schema),
        states: toDraftText('states', cellData.states),
        invariants: toDraftText('invariants', cellData.invariants),
        requires_state: toDraftText('requires_state', cellData.requires_state),
      });
      setBlockedReasons([]);
      setInfo(null);
      // Load dirty list
      try {
        const dirtyData = await api.listDirty();
        setDirtyCells(dirtyData.dirty_cells);
      } catch {
        setDirtyCells([]);
      }
    } catch (err) {
      console.error('Failed to load cell:', err);
    } finally {
      setLoading(false);
    }
  }, [cellId]);

  useEffect(() => {
    loadCell();
  }, [loadCell]);

  const handleChange = (module: ModuleName, value: string) => {
    setModuleDrafts((prev) => ({ ...prev, [module]: value }));
  };

  const handleConfirmModule = async (module: ModuleName): Promise<boolean> => {
    if (!cell) return false;
    const parsed = parseDraft(module, moduleDrafts[module]);
    if (!parsed.ok) {
      setInfo(parsed.error);
      return false;
    }

    setBusyModule(module);
    setInfo(null);
    setBlockedReasons([]);
    setBlockedModule(null);
    setBlockedData(null);
    try {
      const result = await api.confirmModule(cell.id, module, parsed.value);
      setImpactResult(result.impact);
      let infoMsg = `模块 ${module} 确认成功，已自动推算影响并传播。`;
      if (result.resonance_marked && result.resonance_marked.length > 0) {
        infoMsg += ` 触发了双向共振，倒逼更新了: ${result.resonance_marked.join(', ')}`;
      }
      if (result.forced) {
        infoMsg = `模块 ${module} 已强制提交，变更已传播到下游。`;
      }
      setInfo(infoMsg);
      await loadCell();
      onCellChanged();
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && typeof err.payload === 'object' && err.payload) {
        const payload = err.payload as {
          reasons?: string[];
          impact?: ImpactResult;
          draft_saved?: boolean;
        };
        setBlockedReasons(payload.reasons || ['该改动被全局评估阻断']);
        setBlockedModule(module);
        setBlockedData(parsed.value);
        if (payload.impact) setImpactResult(payload.impact);
        setInfo(payload.draft_saved ? '改动已被阻断，草稿已保留。你可以选择强制提交。' : '改动已被阻断。你可以选择强制提交。');
      } else {
        setInfo(err instanceof Error ? err.message : '确认失败');
      }
      return false;
    } finally {
      setBusyModule(null);
    }
  };

  const handleForceConfirm = async () => {
    if (!cell || !blockedModule || blockedData === null) return;
    setShowForceConfirm(false);
    setBusyModule(blockedModule);
    setInfo(null);
    try {
      const result = await api.confirmModule(cell.id, blockedModule, blockedData, true);
      setImpactResult(result.impact);
      let infoMsg = `模块 ${blockedModule} 已强制提交，变更已传播到下游。`;
      if (result.resonance_marked && result.resonance_marked.length > 0) {
        infoMsg += ` 触发了双向共振，倒逼更新了: ${result.resonance_marked.join(', ')}`;
      }
      if (result.marked_stale && result.marked_stale.length > 0) {
        infoMsg += ` 以下 Cell 已被标记为 Stale: ${result.marked_stale.join(', ')}`;
      }
      setInfo(infoMsg);
      setBlockedReasons([]);
      setBlockedModule(null);
      setBlockedData(null);
      await loadCell();
      onCellChanged();
    } catch (err) {
      setInfo(err instanceof Error ? err.message : '强制提交失败');
    } finally {
      setBusyModule(null);
    }
  };

  if (!cellId) {
    return (
      <div className="empty-state" style={{ height: '100%' }}>
        <div className="empty-state-icon">📋</div>
        <div style={{ fontSize: 'var(--text-lg)', color: 'var(--text-secondary)' }}>
          Select a cell from the graph to view details
        </div>
      </div>
    );
  }

  if (loading) {
    return <div className="empty-state" style={{ height: '100%' }}>Loading...</div>;
  }

  if (!cell) {
    return <div className="empty-state" style={{ height: '100%' }}>Cell not found</div>;
  }

  const staleModules = cell._stale
    ? Object.entries(cell._stale).filter(([, v]) => v).map(([k]) => k)
    : [];
  const isStale = staleModules.length > 0;
  const dirtyInfo = dirtyCells.find(dc => dc.cell === cell.id);
  const isDirty = !!dirtyInfo;

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: 'var(--space-xl)' }}>
      {/* Cell Header */}
      <div style={{ marginBottom: 'var(--space-lg)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', flexWrap: 'wrap', marginBottom: 'var(--space-xs)' }}>
          <h2 style={{ margin: 0, fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--text)' }}>
            {cell.id}
          </h2>
          <span className="tag tag-primary">v{cell.version}</span>
          {cell.kind && <span className="tag tag-success">{cell.kind}</span>}
          {cell.entity && <span className="tag tag-info">@{cell.entity}</span>}
          {isDirty && (
            <span className="tag" style={{ background: '#ff6b6b20', color: '#e74c3c', border: '1px solid #e74c3c40' }}>
              DIRTY: {dirtyInfo!.dirty_modules.join(', ')}
            </span>
          )}
          {isStale && (
            <>
              <span className="tag tag-warning">STALE: {staleModules.join(', ')}</span>
              <button
                onClick={async () => {
                  try {
                    await api.confirmCell(cell.id, 'all');
                    loadCell();
                    onCellChanged();
                  } catch (err) {
                    console.error('Failed to confirm:', err);
                  }
                }}
                className="btn btn-sm btn-warning"
              >
                Confirm
              </button>
            </>
          )}
        </div>
        {cell.tags && cell.tags.length > 0 && (
          <div style={{ display: 'flex', gap: 'var(--space-xs)', flexWrap: 'wrap' }}>
            {cell.tags.map((tag) => (
              <span key={tag} className="tag tag-muted">{tag}</span>
            ))}
          </div>
        )}
      </div>

      {/* Dirty warning bar */}
      {isDirty && (
        <div style={{
          background: '#fff3cd',
          border: '1px solid #ffc107',
          borderRadius: 'var(--radius-md)',
          padding: 'var(--space-sm) var(--space-md)',
          marginBottom: 'var(--space-md)',
          fontSize: 'var(--text-sm)',
          color: '#856404',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-sm)',
        }}>
          <span style={{ fontWeight: 'var(--font-bold)' }}>编辑已锁定</span>
          <span>此 Cell 存在未处理的变更（{dirtyInfo!.dirty_modules.join(', ')}），下游 Stale 全部清除后自动解锁。请前往 Chat 通知 LLM 处理 Stale 节点。</span>
        </div>
      )}

      {/* Modules */}
      {modules.map((mod) => (
        <ModuleCard
          key={mod}
          title={mod}
          value={moduleDrafts[mod]}
          onChange={handleChange}
          onConfirm={handleConfirmModule}
          isBusy={busyModule !== null}
          disabled={isDirty}
          structuredData={
            mod === 'contract' ? cell.contract as ContractItem[] :
            mod === 'test' ? cell.test as TestItem[] :
            undefined
          }
          renderPlanAsMermaid={mod === 'plan' && cell.kind === 'Journey'}
        />
      ))}

      {/* Feedback area */}
      {(info || blockedReasons.length > 0 || impactResult) && (
        <div className="card" style={{ marginBottom: 'var(--space-md)' }}>
          <div className="card-body">
            {info && (
              <div style={{ fontSize: 'var(--text-base)', color: 'var(--text-secondary)', marginBottom: 'var(--space-sm)' }}>
                {info}
              </div>
            )}
            {blockedReasons.length > 0 && (
              <div style={{ marginBottom: 'var(--space-md)' }}>
                <div style={{ fontWeight: 'var(--font-bold)', color: 'var(--danger)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-xs)' }}>
                  提交被阻断
                </div>
                {blockedReasons.map((r, i) => (
                  <div key={i} style={{ fontSize: 'var(--text-sm)', color: 'var(--danger)' }}>— {r}</div>
                ))}
                <button
                  onClick={() => setShowForceConfirm(true)}
                  className="btn btn-sm btn-danger"
                  style={{ marginTop: 'var(--space-sm)' }}
                  disabled={busyModule !== null}
                >
                  强制提交
                </button>
              </div>
            )}
            {impactResult && (
              <div style={{ fontSize: 'var(--text-sm)' }}>
                <div style={{ fontWeight: 'var(--font-semibold)', color: 'var(--text-secondary)', marginBottom: 'var(--space-xs)' }}>
                  受影响 Cell
                </div>
                {impactResult.affected.length === 0 ? (
                  <span style={{ color: 'var(--text-tertiary)' }}>无</span>
                ) : (
                  <div style={{ display: 'flex', gap: 'var(--space-xs)', flexWrap: 'wrap' }}>
                    {impactResult.affected.map((id) => (
                      <span key={id} className="tag tag-primary">
                        {id} (depth: {impactResult.depth[id] ?? '?'})
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Force confirm dialog */}
      {showForceConfirm && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
          }}
          onClick={() => setShowForceConfirm(false)}
        >
          <div
            className="card"
            style={{ width: 420, zIndex: 2001 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="card-header">
              <h4 style={{ margin: 0, fontSize: 'var(--text-base)', fontWeight: 'var(--font-bold)', color: 'var(--danger)' }}>
                确认强制提交？
              </h4>
            </div>
            <div className="card-body">
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--space-md)' }}>
                此操作将绕过全局影响评估，直接提交模块 <strong>{blockedModule}</strong> 的变更。
                下游 Cell 可能会受到影响并被标记为 Stale。
              </p>
              {impactResult && impactResult.affected.length > 0 && (
                <div style={{ marginBottom: 'var(--space-md)' }}>
                  <div style={{ fontWeight: 'var(--font-bold)', fontSize: 'var(--text-xs)', color: 'var(--warning)', marginBottom: 'var(--space-xs)', textTransform: 'uppercase' }}>
                    受影响的 Cell
                  </div>
                  <div style={{ display: 'flex', gap: 'var(--space-xs)', flexWrap: 'wrap' }}>
                    {impactResult.affected.map((id) => (
                      <span key={id} className="tag tag-warning">{id}</span>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', gap: 'var(--space-sm)', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setShowForceConfirm(false)}
                  className="btn btn-sm"
                >
                  取消
                </button>
                <button
                  onClick={handleForceConfirm}
                  className="btn btn-sm btn-danger"
                >
                  确认强制提交
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
