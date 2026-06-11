'use strict';

const fs = require('fs');
const path = require('path');
const { getCellsDir, readYaml, writeYaml, cellFilePath, listDirty, readCell } = require('./store');
const { extractDepId } = require('./validate');

function buildGraph(rootDir) {
  const cellsDir = getCellsDir(rootDir);
  const cells = new Map();
  const adjacency = new Map();
  const reverseAdjacency = new Map();

  if (!fs.existsSync(cellsDir)) {
    return { cells, adjacency, reverseAdjacency };
  }

  const files = fs.readdirSync(cellsDir).filter(f => f.endsWith('.yaml'));

  for (const f of files) {
    const data = readYaml(path.join(cellsDir, f));
    const id = data.id;
    cells.set(id, data);
    // 提取依赖 id 字符串，兼容 "cell-id" 和 { id: "cell-id", kind: "..." } 两种格式
    const depIds = (data.depends_on || []).map(extractDepId).filter(Boolean);
    adjacency.set(id, depIds);
    reverseAdjacency.set(id, []);
  }

  for (const [id, deps] of adjacency) {
    for (const dep of deps) {
      if (reverseAdjacency.has(dep)) {
        reverseAdjacency.get(dep).push(id);
      }
    }
  }

  return { cells, adjacency, reverseAdjacency };
}

function impactAnalysis(rootDir, cellId) {
  const { cells, reverseAdjacency } = buildGraph(rootDir);

  if (!cells.has(cellId)) {
    throw new Error(`Cell "${cellId}" 不存在`);
  }

  const affected = [];
  const depth = {};
  const queue = [[cellId, 0]];
  const visited = new Set([cellId]);

  while (queue.length > 0) {
    const [current, d] = queue.shift();
    const dependents = reverseAdjacency.get(current) || [];

    for (const dep of dependents) {
      if (!visited.has(dep)) {
        visited.add(dep);
        affected.push(dep);
        depth[dep] = d + 1;
        queue.push([dep, d + 1]);
      }
    }
  }

  return { source: cellId, affected, depth };
}

function getDeps(rootDir, cellId) {
  const { cells } = buildGraph(rootDir);

  if (!cells.has(cellId)) {
    throw new Error(`Cell "${cellId}" 不存在`);
  }

  const cell = cells.get(cellId);
  return { cell: cellId, depends_on: cell.depends_on || [] };
}

function getDependents(rootDir, cellId) {
  const { cells, reverseAdjacency } = buildGraph(rootDir);

  if (!cells.has(cellId)) {
    throw new Error(`Cell "${cellId}" 不存在`);
  }

  return { cell: cellId, dependents: reverseAdjacency.get(cellId) || [] };
}

function consistencyCheck(rootDir) {
  const { cells, adjacency } = buildGraph(rootDir);
  const cellIds = new Set(cells.keys());

  const danglingRefs = [];
  for (const [id, deps] of adjacency) {
    for (const dep of deps) {
      if (!cellIds.has(dep)) {
        danglingRefs.push({ cell: id, ref: dep });
      }
    }
  }

  const cycles = [];
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map();
  for (const id of cellIds) color.set(id, WHITE);

  function dfs(node, path) {
    color.set(node, GRAY);
    path.push(node);

    const deps = adjacency.get(node) || [];
    for (const dep of deps) {
      if (!cellIds.has(dep)) continue;
      if (color.get(dep) === GRAY) {
        const cycleStart = path.indexOf(dep);
        cycles.push([...path.slice(cycleStart), dep]);
      } else if (color.get(dep) === WHITE) {
        dfs(dep, path);
      }
    }

    path.pop();
    color.set(node, BLACK);
  }

  for (const id of cellIds) {
    if (color.get(id) === WHITE) {
      dfs(id, []);
    }
  }

  const gaps = [];
  for (const [id, cell] of cells) {
    const missing = [];
    if (cell.kind === 'Action') {
      if (!cell.plan || cell.plan.length === 0) missing.push('plan');
      if (!cell.test || cell.test.length === 0) missing.push('test');
      if (!cell.contract || cell.contract.length === 0) missing.push('contract');
    } else if (cell.kind === 'Journey') {
      if (!cell.plan || cell.plan.length === 0) missing.push('plan');
      if (!cell.test || cell.test.length === 0) missing.push('test');
    } else if (cell.kind === 'Aggregate') {
      if (!cell.schema || cell.schema.length === 0) missing.push('schema');
      if (!cell.states || cell.states.length === 0) missing.push('states');
      if (!cell.invariants || cell.invariants.length === 0) missing.push('invariants');
    } else {
      if (!cell.test || cell.test.length === 0) missing.push('test');
      if (!cell.contract || cell.contract.length === 0) missing.push('contract');
    }
    if (missing.length > 0) {
      gaps.push({ cell: id, missing });
    }
  }

  // 基线一致性检查
  let glossaryConflicts = [];
  let glossaryMissingRefs = [];
  try {
    const { checkConsistency } = require('./glossary');
    const result = checkConsistency(rootDir);
    glossaryConflicts = result.conflicts || [];
    glossaryMissingRefs = result.missing_refs || [];
  } catch {
    // glossary 模块不可用时跳过
  }

  return { dangling_refs: danglingRefs, cycles, gaps, glossary_conflicts: glossaryConflicts, glossary_missing_refs: glossaryMissingRefs };
}

function findRoots(rootDir, threshold = 2) {
  const { cells, reverseAdjacency } = buildGraph(rootDir);

  const roots = [];
  for (const [id] of cells) {
    const inDegree = (reverseAdjacency.get(id) || []).length;
    if (inDegree >= threshold) {
      roots.push({ cell: id, in_degree: inDegree });
    }
  }

  roots.sort((a, b) => b.in_degree - a.in_degree);
  return { roots };
}

function generateMermaid(rootDir) {
  const { adjacency } = buildGraph(rootDir);

  const lines = ['graph TD'];
  for (const [id, deps] of adjacency) {
    for (const dep of deps) {
      lines.push(`  ${id} --> ${dep}`);
    }
  }

  return { mermaid: lines.join('\n') };
}

function triggerResonance(rootDir, cellId, requiresStateData) {
  const { cells } = buildGraph(rootDir);
  const markedStale = [];

  if (!Array.isArray(requiresStateData)) return markedStale;

  for (const req of requiresStateData) {
    const targetId = req.target;
    if (!cells.has(targetId)) continue;
    
    const targetCell = cells.get(targetId);
    if (targetCell.kind !== 'Aggregate') continue;

    let isMissing = true;
    if (req.type === 'schema') {
      if (Array.isArray(targetCell.schema)) {
        isMissing = !targetCell.schema.some(s => s.name === req.field);
      }
    } else if (req.type === 'state') {
      if (Array.isArray(targetCell.states)) {
        isMissing = !targetCell.states.some(s => s.name === req.field);
      }
    }

    if (isMissing) {
      const filePath = cellFilePath(rootDir, targetId);
      const cell = readYaml(filePath);
      cell._stale = cell._stale || {};
      if (req.type === 'schema') cell._stale.schema = true;
      if (req.type === 'state') cell._stale.states = true;
      writeYaml(filePath, cell);
      markedStale.push(targetId);
    }
  }

  return markedStale;
}

function propagateChange(rootDir, cellId) {
  const { affected } = impactAnalysis(rootDir, cellId);

  const markedStale = [];
  for (const id of affected) {
    const filePath = cellFilePath(rootDir, id);
    const cell = readYaml(filePath);
    cell._stale = cell._stale || {};
    
    if (cell.kind === 'Action') {
      cell._stale.plan = true;
      cell._stale.contract = true;
    } else if (cell.kind === 'Journey') {
      cell._stale.plan = true;
    } else if (cell.kind === 'Aggregate') {
      cell._stale.schema = true;
      cell._stale.states = true;
      cell._stale.invariants = true;
    } else {
      cell._stale.plan = true;
      cell._stale.contract = true;
    }
    
    writeYaml(filePath, cell);
    markedStale.push(id);
  }

  return { source: cellId, marked_stale: markedStale };
}

function listStale(rootDir) {
  const { cells } = buildGraph(rootDir);

  const staleCells = [];
  for (const [id, cell] of cells) {
    if (cell._stale) {
      const staleModules = Object.entries(cell._stale)
        .filter(([, v]) => v === true)
        .map(([k]) => k);
      if (staleModules.length > 0) {
        staleCells.push({ cell: id, stale_modules: staleModules });
      }
    }
  }

  return { stale_cells: staleCells };
}

function confirmCell(rootDir, cellId, module = 'all') {
  const filePath = cellFilePath(rootDir, cellId);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Cell "${cellId}" 不存在`);
  }

  const cell = readYaml(filePath);
  const cleared = [];

  if (module === 'all') {
    if (cell._stale) {
      for (const key of Object.keys(cell._stale)) {
        if (cell._stale[key] === true) cleared.push(key);
      }
    }
    delete cell._stale;
  } else {
    if (cell._stale && cell._stale[module] === true) {
      cell._stale[module] = false;
      cleared.push(module);
    }
    const allFalse = Object.values(cell._stale || {}).every(v => v === false);
    if (allFalse) delete cell._stale;
  }

  writeYaml(filePath, cell);

  // 自动清除 dirty：检查每个 dirty Cell 的下游是否还有 stale
  const { dirty_cells } = listDirty(rootDir);
  for (const dc of dirty_cells) {
    const { affected } = impactAnalysis(rootDir, dc.cell);
    const hasDownstreamStale = affected.some(depId => {
      try {
        const depCell = readCell(rootDir, depId);
        return depCell._stale && Object.values(depCell._stale).some(v => v === true);
      } catch { return false; }
    });
    if (!hasDownstreamStale) {
      const dirtyFilePath = cellFilePath(rootDir, dc.cell);
      const dirtyCell = readYaml(dirtyFilePath);
      delete dirtyCell._dirty;
      writeYaml(dirtyFilePath, dirtyCell);
    }
  }

  return { confirmed: cellId, cleared };
}

function impactedModulesForCurrent(module, kind) {
  if (kind === 'Aggregate') {
    if (module === 'schema') return ['states', 'invariants'];
    if (module === 'states') return ['invariants'];
    return [];
  } else if (kind === 'Action') {
    if (module === 'intent') return ['plan', 'contract', 'test', 'requires_state'];
    if (module === 'plan') return ['contract', 'test'];
    if (module === 'contract') return ['test'];
    if (module === 'requires_state') return ['plan', 'contract'];
    return [];
  } else if (kind === 'Journey') {
    if (module === 'intent') return ['plan', 'test'];
    if (module === 'plan') return ['test'];
    return [];
  }
  
  if (module === 'intent') return ['plan', 'contract', 'test'];
  if (module === 'plan') return ['contract', 'test'];
  if (module === 'contract') return ['test'];
  return [];
}

function evaluateGlobalImpact(rootDir, cellId, module, nextData) {
  const { cells } = buildGraph(rootDir);
  const cell = cells.get(cellId) || {};
  const impact = impactAnalysis(rootDir, cellId);
  const reasons = [];

  if (impact.affected.length > 0) {
    if (module === 'intent') reasons.push('intent 语义变化会影响下游 Cell 的目标边界');
    if (module === 'plan') reasons.push('plan 设计变化可能影响共享约束与下游实现假设');
    if (module === 'contract') reasons.push('contract 接口契约变化会影响下游 Cell 集成');
    if (module === 'schema') reasons.push('schema 结构变化会影响下游 Cell 的数据依赖');
    if (module === 'states') reasons.push('states 状态机变化会影响下游 Cell 的流转逻辑');
    if (module === 'invariants') reasons.push('invariants 变化可能影响下游 Cell 的业务规则假设');
  }

  if (module === 'contract' && Array.isArray(nextData) && nextData.length === 0) {
    reasons.push('contract 不能为空，无法确认');
  }

  return {
    blocked: reasons.length > 0,
    reasons,
    impact,
    current_cell_impacted_modules: impactedModulesForCurrent(module, cell.kind),
    affected_cell_impacted_modules: ['plan', 'contract', 'test'],
  };
}

function slice(rootDir, cellId, hops = 1) {
  const { cells, adjacency, reverseAdjacency } = buildGraph(rootDir);

  if (!cells.has(cellId)) {
    throw new Error(`Cell "${cellId}" 不存在`);
  }

  // 收集 slice 内的所有 Cell id 及其角色
  const roles = new Map(); // id -> "root" | "dependency" | "dependent"
  roles.set(cellId, 'root');

  // 沿 depends_on 方向（向下）扩展 hops 层
  const downQueue = [[cellId, 0]];
  const downVisited = new Set([cellId]);
  while (downQueue.length > 0) {
    const [current, depth] = downQueue.shift();
    if (depth >= hops) continue;
    const deps = adjacency.get(current) || [];
    for (const dep of deps) {
      if (!downVisited.has(dep) && cells.has(dep)) {
        downVisited.add(dep);
        // 只有 root 的直接依赖标记为 dependency，更远的也标记 dependency
        if (!roles.has(dep)) {
          roles.set(dep, 'dependency');
        }
        downQueue.push([dep, depth + 1]);
      }
    }
  }

  // 沿反向依赖方向（向上）扩展 hops 层
  const upQueue = [[cellId, 0]];
  const upVisited = new Set([cellId]);
  while (upQueue.length > 0) {
    const [current, depth] = upQueue.shift();
    if (depth >= hops) continue;
    const dependents = reverseAdjacency.get(current) || [];
    for (const dep of dependents) {
      if (!upVisited.has(dep) && cells.has(dep)) {
        upVisited.add(dep);
        if (!roles.has(dep)) {
          roles.set(dep, 'dependent');
        }
        upQueue.push([dep, depth + 1]);
      }
    }
  }

  // 构建输出
  const result = [];
  for (const [id, role] of roles) {
    const cellData = cells.get(id);
    result.push({
      id,
      role,
      data: {
        id: cellData.id,
        version: cellData.version,
        kind: cellData.kind || null,
        tags: cellData.tags || null,
        entity: cellData.entity || null,
        intent: cellData.intent,
        plan: cellData.plan,
        contract: cellData.contract,
        test: cellData.test,
        depends_on: cellData.depends_on || [],
        stale: cellData._stale
          ? Object.entries(cellData._stale).filter(([, v]) => v === true).map(([k]) => k)
          : [],
      },
    });
  }

  // 排序：root 在前，然后 dependency，最后 dependent
  const roleOrder = { root: 0, dependency: 1, dependent: 2 };
  result.sort((a, b) => (roleOrder[a.role] || 3) - (roleOrder[b.role] || 3));

  return {
    root: cellId,
    hops,
    cells: result,
  };
}

module.exports = {
  buildGraph,
  impactAnalysis,
  getDeps,
  getDependents,
  consistencyCheck,
  findRoots,
  generateMermaid,
  propagateChange,
  listStale,
  confirmCell,
  evaluateGlobalImpact,
  slice,
  triggerResonance,
};
