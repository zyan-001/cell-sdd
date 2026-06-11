import { useEffect, useState, useCallback } from 'react';
import type { Cell, ModuleName, ImpactResult, ContractItem, TestItem } from '../types';
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
  });
  const [loading, setLoading] = useState(false);
  const [busyModule, setBusyModule] = useState<ModuleName | null>(null);
  const [impactResult, setImpactResult] = useState<ImpactResult | null>(null);
  const [blockedReasons, setBlockedReasons] = useState<string[]>([]);
  const [info, setInfo] = useState<string | null>(null);

  const modules: ModuleName[] = ['intent', 'plan', 'contract', 'test'];

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
      });
      setBlockedReasons([]);
      setInfo(null);
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

  const handleRestoreDraft = async (module: ModuleName) => {
    if (!cell) return;
    try {
      const result = await api.readModuleDraft(cell.id, module);
      if (result.draft && result.draft.data !== undefined) {
        const value = module === 'intent' || module === 'plan'
          ? String(result.draft.data)
          : JSON.stringify(result.draft.data, null, 2);
        setModuleDrafts((prev) => ({ ...prev, [module]: value }));
        setInfo(`已恢复 ${module} 草稿`);
      } else {
        setInfo(`${module} 暂无草稿`);
      }
    } catch (err) {
      console.error('Failed to restore draft:', err);
    }
  };

  const handleConfirmModule = async (module: ModuleName) => {
    if (!cell) return;
    const parsed = parseDraft(module, moduleDrafts[module]);
    if (!parsed.ok) {
      setInfo(parsed.error);
      return;
    }

    setBusyModule(module);
    setInfo(null);
    setBlockedReasons([]);
    try {
      const result = await api.confirmModule(cell.id, module, parsed.value);
      setImpactResult(result.impact);
      setInfo(`模块 ${module} 确认成功，已自动推算影响并传播。`);
      await loadCell();
      onCellChanged();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && typeof err.payload === 'object' && err.payload) {
        const payload = err.payload as {
          reasons?: string[];
          impact?: ImpactResult;
          draft_saved?: boolean;
        };
        setBlockedReasons(payload.reasons || ['该改动被全局评估阻断']);
        if (payload.impact) setImpactResult(payload.impact);
        setInfo(payload.draft_saved ? '改动已被阻断，草稿已保留。' : '改动已被阻断。');
      } else {
        setInfo(err instanceof Error ? err.message : '确认失败');
      }
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

      {/* Modules */}
      {modules.map((mod) => (
        <ModuleCard
          key={mod}
          title={mod}
          value={moduleDrafts[mod]}
          onChange={handleChange}
          onConfirm={handleConfirmModule}
          onRestoreDraft={handleRestoreDraft}
          isBusy={busyModule !== null}
          structuredData={
            mod === 'contract' ? cell.contract as ContractItem[] :
            mod === 'test' ? cell.test as TestItem[] :
            undefined
          }
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
    </div>
  );
}
