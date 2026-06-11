'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { validateCell, validateDelta, validateModule } = require('./validate');

const SDD_DIR = '.sdd';
const CELLS_DIR = 'cells';
const DELTAS_DIR = 'deltas';
const ARCHIVE_DIR = 'archive';
const DRAFTS_DIR = 'drafts';

function findProjectRoot(startDir) {
  let dir = startDir;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, SDD_DIR))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return null;
}

function getSddDir(rootDir) {
  return path.join(rootDir, SDD_DIR);
}

function getCellsDir(rootDir) {
  return path.join(getSddDir(rootDir), CELLS_DIR);
}

function getDeltasDir(rootDir) {
  return path.join(getSddDir(rootDir), DELTAS_DIR);
}

function getArchiveDir(rootDir) {
  return path.join(getSddDir(rootDir), ARCHIVE_DIR);
}

function getDraftsDir(rootDir) {
  return path.join(getSddDir(rootDir), DRAFTS_DIR);
}

function readYaml(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  return yaml.load(content);
}

function writeYaml(filePath, data) {
  const content = yaml.dump(data, { lineWidth: -1, noRefs: true });
  fs.writeFileSync(filePath, content, 'utf-8');
}

function cellFilePath(rootDir, id) {
  return path.join(getCellsDir(rootDir), `${id}.yaml`);
}

function deltaFilePath(rootDir, id) {
  return path.join(getDeltasDir(rootDir), `${id}.yaml`);
}

// === 项目管理 ===

function initProject(rootDir) {
  const sddDir = getSddDir(rootDir);
  fs.mkdirSync(path.join(sddDir, CELLS_DIR), { recursive: true });
  fs.mkdirSync(path.join(sddDir, DELTAS_DIR), { recursive: true });
  fs.mkdirSync(path.join(sddDir, ARCHIVE_DIR), { recursive: true });
  fs.mkdirSync(path.join(sddDir, DRAFTS_DIR), { recursive: true });
  // 创建空 glossary.yaml
  const glossaryPath = path.join(sddDir, 'glossary.yaml');
  if (!fs.existsSync(glossaryPath)) {
    writeYaml(glossaryPath, { version: 0, entities: {} });
  }
  return { initialized: true, path: SDD_DIR };
}

function moduleDraftFilePath(rootDir, id, module) {
  return path.join(getDraftsDir(rootDir), `${id}.${module}.json`);
}

function saveModuleDraft(rootDir, id, module, data, metadata = {}) {
  fs.mkdirSync(getDraftsDir(rootDir), { recursive: true });
  const payload = {
    cell: id,
    module,
    data,
    metadata,
    saved_at: new Date().toISOString(),
  };
  const filePath = moduleDraftFilePath(rootDir, id, module);
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf-8');
  return { saved: true, path: `.sdd/drafts/${id}.${module}.json` };
}

function readModuleDraft(rootDir, id, module) {
  const filePath = moduleDraftFilePath(rootDir, id, module);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function clearModuleDraft(rootDir, id, module) {
  const filePath = moduleDraftFilePath(rootDir, id, module);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return { cleared: true };
  }
  return { cleared: false };
}

// === Cell CRUD ===

function createCell(rootDir, data) {
  const validation = validateCell(data);
  if (!validation.valid) {
    throw new Error(`校验失败: ${validation.errors.join('; ')}`);
  }

  const filePath = cellFilePath(rootDir, data.id);
  if (fs.existsSync(filePath)) {
    throw new Error(`Cell "${data.id}" 已存在`);
  }

  const cellData = {
    id: data.id,
    version: 1,
    intent: data.intent,
    plan: data.plan,
    contract: data.contract,
    test: data.test,
    depends_on: data.depends_on || [],
    _stale: { plan: false, contract: false },
  };

  // 可选字段
  if (data.kind !== undefined) cellData.kind = data.kind;
  if (data.tags !== undefined) cellData.tags = data.tags;
  if (data.entity !== undefined) cellData.entity = data.entity;

  writeYaml(filePath, cellData);
  return { created: data.id, path: `.sdd/cells/${data.id}.yaml` };
}

function readCell(rootDir, id) {
  const filePath = cellFilePath(rootDir, id);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Cell "${id}" 不存在`);
  }
  return readYaml(filePath);
}

function updateCell(rootDir, id, module, data) {
  const validation = validateModule(module, data);
  if (!validation.valid) {
    throw new Error(`校验失败: ${validation.errors.join('; ')}`);
  }

  const cell = readCell(rootDir, id);
  cell[module] = data;
  writeYaml(cellFilePath(rootDir, id), cell);
  return { updated: id, module };
}

function deleteCell(rootDir, id) {
  const filePath = cellFilePath(rootDir, id);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Cell "${id}" 不存在`);
  }
  fs.unlinkSync(filePath);
  return { deleted: id };
}

function listCells(rootDir) {
  const cellsDir = getCellsDir(rootDir);
  if (!fs.existsSync(cellsDir)) {
    return { cells: [] };
  }

  const files = fs.readdirSync(cellsDir).filter(f => f.endsWith('.yaml'));
  const cells = files.map(f => {
    const data = readYaml(path.join(cellsDir, f));
    const stale = data._stale
      ? Object.entries(data._stale).some(([, v]) => v === true)
      : false;
    return {
      id: data.id,
      version: data.version || 1,
      entity: data.entity || null,
      depends_on_count: (data.depends_on || []).length,
      stale,
      kind: data.kind || null,
    };
  });
  return { cells };
}

// === Delta CRUD ===

function createDelta(rootDir, data) {
  const validation = validateDelta(data);
  if (!validation.valid) {
    throw new Error(`校验失败: ${validation.errors.join('; ')}`);
  }

  const targetPath = cellFilePath(rootDir, data.target);
  if (!fs.existsSync(targetPath)) {
    throw new Error(`目标 Cell "${data.target}" 不存在`);
  }

  const filePath = deltaFilePath(rootDir, data.id);
  if (fs.existsSync(filePath)) {
    throw new Error(`Delta "${data.id}" 已存在`);
  }

  const deltaData = {
    id: data.id,
    target: data.target,
    intent: data.intent,
    plan: data.plan,
    contract: data.contract,
    test: data.test,
    depends_on: data.depends_on || [],
  };

  writeYaml(filePath, deltaData);
  return { created: data.id, target: data.target, path: `.sdd/deltas/${data.id}.yaml` };
}

function readDelta(rootDir, id) {
  const filePath = deltaFilePath(rootDir, id);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Delta "${id}" 不存在`);
  }
  return readYaml(filePath);
}

function updateDelta(rootDir, id, module, data) {
  const validation = validateModule(module, data);
  if (!validation.valid) {
    throw new Error(`校验失败: ${validation.errors.join('; ')}`);
  }

  const delta = readDelta(rootDir, id);
  delta[module] = data;
  writeYaml(deltaFilePath(rootDir, id), delta);
  return { updated: id, module };
}

function deleteDelta(rootDir, id) {
  const filePath = deltaFilePath(rootDir, id);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Delta "${id}" 不存在`);
  }
  fs.unlinkSync(filePath);
  return { deleted: id };
}

function listDeltas(rootDir) {
  const deltasDir = getDeltasDir(rootDir);
  if (!fs.existsSync(deltasDir)) {
    return { deltas: [] };
  }

  const files = fs.readdirSync(deltasDir).filter(f => f.endsWith('.yaml'));
  const deltas = files.map(f => {
    const data = readYaml(path.join(deltasDir, f));
    return { id: data.id, target: data.target };
  });
  return { deltas };
}

module.exports = {
  findProjectRoot,
  getSddDir,
  getCellsDir,
  getDeltasDir,
  getArchiveDir,
  getDraftsDir,
  readYaml,
  writeYaml,
  cellFilePath,
  deltaFilePath,
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
  saveModuleDraft,
  readModuleDraft,
  clearModuleDraft,
};
