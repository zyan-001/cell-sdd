#!/usr/bin/env node
'use strict';

const express = require('express');
const cors = require('cors');
const path = require('path');
const {
  findProjectRoot,
  initProject,
  createCell,
  readCell,
  updateCell,
  deleteCell,
  listCells,
  createDelta,
  readDelta,
  updateDelta,
  deleteDelta,
  listDeltas,
} = require('./lib/store');
const {
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
  buildGraph,
  triggerResonance,
} = require('./lib/graph');
const {
  previewMerge,
  executeMerge,
  archiveDelta,
} = require('./lib/merge');
const {
  readGlossary,
  updateGlossary,
  addTerm,
  checkConsistency: glossaryCheck,
  impactByTerms,
} = require('./lib/glossary');
const {
  saveModuleDraft,
  readModuleDraft,
  clearModuleDraft,
  markDirty,
  listDirty,
} = require('./lib/store');

const app = express();
const PORT = process.env.PORT || 3210;

app.use(cors());
app.use(express.json({ limit: '10mb', strict: false }));

// 前端静态文件（构建后）
const webDistPath = path.resolve(__dirname, '../web/dist');
app.use('/assets', express.static(path.join(webDistPath, 'assets')));
app.get('/', (req, res) => {
  res.sendFile(path.join(webDistPath, 'index.html'));
});

// 获取项目根目录中间件
function getRootDir(req, res, next) {
  const rootDir = findProjectRoot(process.cwd());
  if (!rootDir) {
    return res.status(400).json({ error: '未找到 .sdd/ 目录，请先运行 node cell.js init' });
  }
  req.rootDir = rootDir;
  next();
}

// === 项目管理 ===
app.post('/api/init', (req, res) => {
  try {
    const result = initProject(process.cwd());
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === 全局基线管理 ===
app.get('/api/glossary', getRootDir, (req, res) => {
  try {
    res.json(readGlossary(req.rootDir));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/glossary', getRootDir, (req, res) => {
  try {
    res.json(updateGlossary(req.rootDir, req.body));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/glossary/terms', getRootDir, (req, res) => {
  try {
    res.json(addTerm(req.rootDir, req.body));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/glossary/check', getRootDir, (req, res) => {
  try {
    res.json(glossaryCheck(req.rootDir));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/glossary/impact', getRootDir, (req, res) => {
  try {
    const terms = Array.isArray(req.body?.terms) ? req.body.terms : [];
    res.json(impactByTerms(req.rootDir, terms));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// === Cell CRUD ===
app.get('/api/cells', getRootDir, (req, res) => {
  try {
    res.json(listCells(req.rootDir));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/cells/:id', getRootDir, (req, res) => {
  try {
    res.json(readCell(req.rootDir, req.params.id));
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

app.post('/api/cells', getRootDir, (req, res) => {
  try {
    res.json(createCell(req.rootDir, req.body));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/cells/:id/:module', getRootDir, (req, res) => {
  try {
    const { id, module } = req.params;
    if (!['intent', 'plan', 'contract', 'test', 'depends_on', 'schema', 'states', 'invariants', 'requires_state'].includes(module)) {
      return res.status(400).json({ error: `无效模块: ${module}` });
    }
    res.json(updateCell(req.rootDir, id, module, req.body));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/cells/:id/confirm-module', getRootDir, (req, res) => {
  try {
    const { id } = req.params;
    const { module, data, force, source } = req.body || {};
    const validModules = ['intent', 'plan', 'contract', 'test', 'schema', 'states', 'invariants', 'requires_state'];
    if (!validModules.includes(module)) {
      return res.status(400).json({ error: `无效模块: ${module}` });
    }

    const evalResult = evaluateGlobalImpact(req.rootDir, id, module, data);
    if (evalResult.blocked && !force) {
      const draft = saveModuleDraft(req.rootDir, id, module, data, {
        blocked: true,
        reasons: evalResult.reasons,
        affected: evalResult.impact.affected,
      });
      return res.status(409).json({
        blocked: true,
        reasons: evalResult.reasons,
        impact: evalResult.impact,
        current_cell_impacted_modules: evalResult.current_cell_impacted_modules,
        affected_cell_impacted_modules: evalResult.affected_cell_impacted_modules,
        draft_saved: draft.saved,
        draft_path: draft.path,
      });
    }

    const updated = updateCell(req.rootDir, id, module, data);
    clearModuleDraft(req.rootDir, id, module);
    confirmCell(req.rootDir, id, module);
    const propagated = propagateChange(req.rootDir, id);

    // Web 端操作标记 dirty
    if (source === 'web') {
      markDirty(req.rootDir, id, module);
    }

    let resonance_marked = [];
    if (module === 'requires_state') {
      resonance_marked = triggerResonance(req.rootDir, id, data);
    }

    return res.json({
      blocked: false,
      updated,
      impact: evalResult.impact,
      current_cell_impacted_modules: evalResult.current_cell_impacted_modules,
      affected_cell_impacted_modules: evalResult.affected_cell_impacted_modules,
      marked_stale: propagated.marked_stale,
      resonance_marked,
      forced: evalResult.blocked && force,
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

app.get('/api/cells/:id/drafts/:module', getRootDir, (req, res) => {
  try {
    const { id, module } = req.params;
    const draft = readModuleDraft(req.rootDir, id, module);
    res.json({ draft });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/cells/:id', getRootDir, (req, res) => {
  try {
    const deps = getDependents(req.rootDir, req.params.id);
    const result = deleteCell(req.rootDir, req.params.id);
    result.dependents = deps.dependents;
    res.json(result);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

// === Delta CRUD ===
app.get('/api/deltas', getRootDir, (req, res) => {
  try {
    res.json(listDeltas(req.rootDir));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/deltas/:id', getRootDir, (req, res) => {
  try {
    res.json(readDelta(req.rootDir, req.params.id));
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

app.post('/api/deltas', getRootDir, (req, res) => {
  try {
    res.json(createDelta(req.rootDir, req.body));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/deltas/:id/:module', getRootDir, (req, res) => {
  try {
    const { id, module } = req.params;
    if (!['intent', 'plan', 'contract', 'test', 'depends_on', 'schema', 'states', 'invariants', 'requires_state'].includes(module)) {
      return res.status(400).json({ error: `无效模块: ${module}` });
    }
    res.json(updateDelta(req.rootDir, id, module, req.body));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/deltas/:id', getRootDir, (req, res) => {
  try {
    res.json(deleteDelta(req.rootDir, req.params.id));
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

// === Delta 合并/归档 ===
app.get('/api/deltas/:id/merge-preview', getRootDir, (req, res) => {
  try {
    res.json(previewMerge(req.rootDir, req.params.id));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/deltas/:id/merge', getRootDir, (req, res) => {
  try {
    res.json(executeMerge(req.rootDir, req.params.id));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/deltas/:id/archive', getRootDir, (req, res) => {
  try {
    res.json(archiveDelta(req.rootDir, req.params.id));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// === 图操作 ===
app.get('/api/graph', getRootDir, (req, res) => {
  try {
    res.json(generateMermaid(req.rootDir));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/graph/data', getRootDir, (req, res) => {
  try {
    const { cells, adjacency } = buildGraph(req.rootDir);
    const nodes = [];
    const edges = [];
    for (const [id, cellData] of cells) {
      const stale = cellData._stale
        ? Object.entries(cellData._stale).filter(([, v]) => v === true).map(([k]) => k)
        : [];
      nodes.push({
        id,
        data: {
          label: id,
          version: cellData.version || 1,
          kind: cellData.kind || null,
          tags: cellData.tags || [],
          entity: cellData.entity || null,
          stale,
        },
      });
    }
    for (const [source, deps] of adjacency) {
      for (const dep of deps) {
        edges.push({
          id: `${source}->${dep}`,
          source,
          target: dep,
        });
      }
    }
    res.json({ nodes, edges });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/cells/:id/impact', getRootDir, (req, res) => {
  try {
    res.json(impactAnalysis(req.rootDir, req.params.id));
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

app.get('/api/cells/:id/deps', getRootDir, (req, res) => {
  try {
    res.json(getDeps(req.rootDir, req.params.id));
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

app.get('/api/check', getRootDir, (req, res) => {
  try {
    res.json(consistencyCheck(req.rootDir));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/roots', getRootDir, (req, res) => {
  try {
    const threshold = parseInt(req.query.threshold) || 2;
    res.json(findRoots(req.rootDir, threshold));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/cells/:id/slice', getRootDir, (req, res) => {
  try {
    const hops = parseInt(req.query.hops) || 1;
    res.json(slice(req.rootDir, req.params.id, hops));
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

// === 变更传播 ===
app.post('/api/cells/:id/propagate', getRootDir, (req, res) => {
  try {
    res.json(propagateChange(req.rootDir, req.params.id));
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

app.get('/api/stale', getRootDir, (req, res) => {
  try {
    res.json(listStale(req.rootDir));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/dirty', getRootDir, (req, res) => {
  try {
    res.json(listDirty(req.rootDir));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/cells/:id/confirm', getRootDir, (req, res) => {
  try {
    const mod = req.query.module || 'all';
    res.json(confirmCell(req.rootDir, req.params.id, mod));
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(webDistPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Cell-SDD Server running at http://localhost:${PORT}`);
});
