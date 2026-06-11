'use strict';

const fs = require('fs');
const path = require('path');
const { readYaml, writeYaml, cellFilePath, deltaFilePath, getArchiveDir } = require('./store');
const { propagateChange } = require('./graph');
const { extractDepId } = require('./validate');

function previewMerge(rootDir, deltaId) {
  const deltaPath = deltaFilePath(rootDir, deltaId);
  if (!fs.existsSync(deltaPath)) {
    throw new Error(`Delta "${deltaId}" 不存在`);
  }

  const delta = readYaml(deltaPath);
  const targetPath = cellFilePath(rootDir, delta.target);
  if (!fs.existsSync(targetPath)) {
    throw new Error(`目标 Cell "${delta.target}" 不存在`);
  }

  const target = readYaml(targetPath);
  const merged = applyMerge(target, delta);

  return { delta: deltaId, target: delta.target, merged };
}

function executeMerge(rootDir, deltaId) {
  const deltaPath = deltaFilePath(rootDir, deltaId);
  if (!fs.existsSync(deltaPath)) {
    throw new Error(`Delta "${deltaId}" 不存在`);
  }

  const delta = readYaml(deltaPath);
  const targetPath = cellFilePath(rootDir, delta.target);
  if (!fs.existsSync(targetPath)) {
    throw new Error(`目标 Cell "${delta.target}" 不存在`);
  }

  const target = readYaml(targetPath);
  const merged = applyMerge(target, delta);

  writeYaml(targetPath, merged);
  fs.unlinkSync(deltaPath);

  return { merged: true, delta: deltaId, target: delta.target, new_version: merged.version };
}

function archiveDelta(rootDir, deltaId) {
  const deltaPath = deltaFilePath(rootDir, deltaId);
  if (!fs.existsSync(deltaPath)) {
    throw new Error(`Delta "${deltaId}" 不存在`);
  }

  const delta = readYaml(deltaPath);
  const targetPath = cellFilePath(rootDir, delta.target);
  if (!fs.existsSync(targetPath)) {
    throw new Error(`目标 Cell "${delta.target}" 不存在`);
  }

  const target = readYaml(targetPath);

  // 创建归档目录
  const name = deltaId.replace(/^delta-/, '');
  const date = new Date().toISOString().slice(0, 10);
  const archiveDir = path.join(getArchiveDir(rootDir), `${date}-${name}`);
  fs.mkdirSync(archiveDir, { recursive: true });

  // 快照目标 Cell
  const snapshotName = `${delta.target}.v${target.version}.yaml`;
  const snapshotPath = path.join(archiveDir, snapshotName);
  fs.copyFileSync(targetPath, snapshotPath);

  // 执行合并
  const merged = applyMerge(target, delta);
  writeYaml(targetPath, merged);

  // 移动 Delta 到归档目录
  const archivedDeltaPath = path.join(archiveDir, `${deltaId}.yaml`);
  fs.copyFileSync(deltaPath, archivedDeltaPath);
  fs.unlinkSync(deltaPath);

  // 执行变更传播
  let propagated = [];
  try {
    const result = propagateChange(rootDir, delta.target);
    propagated = result.marked_stale;
  } catch {
    // 传播失败不影响归档
  }

  return {
    archived: true,
    delta: deltaId,
    target: delta.target,
    new_version: merged.version,
    snapshot: `.sdd/archive/${date}-${name}/${snapshotName}`,
    propagated,
  };
}

// 按 id 去重合并 depends_on，保留第一次出现的格式（含 kind 信息）
function mergeDependsOn(targetDeps, deltaDeps) {
  const seen = new Set();
  const result = [];

  for (const dep of [...targetDeps, ...deltaDeps]) {
    const id = extractDepId(dep);
    if (id && !seen.has(id)) {
      seen.add(id);
      result.push(dep);
    }
  }

  return result;
}

function applyMerge(target, delta) {
  const merged = {
    id: target.id,
    version: target.version + 1,
    entity: target.entity,
    kind: target.kind,
    tags: target.tags,
    intent: target.intent + '\n---\n' + delta.intent,
    plan: (target.plan || '') + (delta.plan ? '\n---\n' + delta.plan : ''),
    contract: [...(target.contract || []), ...(delta.contract || [])],
    test: [...(target.test || []), ...(delta.test || [])],
    schema: [...(target.schema || []), ...(delta.schema || [])],
    states: [...(target.states || []), ...(delta.states || [])],
    invariants: [...(target.invariants || []), ...(delta.invariants || [])],
    requires_state: [...(target.requires_state || []), ...(delta.requires_state || [])],
    depends_on: mergeDependsOn(target.depends_on || [], delta.depends_on || []),
    _stale: target._stale || {},
  };

  // 清除 undefined 的可选字段
  if (merged.entity === undefined) delete merged.entity;
  if (merged.kind === undefined) delete merged.kind;
  if (merged.tags === undefined) delete merged.tags;
  if (merged.plan === '') delete merged.plan;
  if (merged.contract.length === 0) delete merged.contract;
  if (merged.test.length === 0) delete merged.test;
  if (merged.schema.length === 0) delete merged.schema;
  if (merged.states.length === 0) delete merged.states;
  if (merged.invariants.length === 0) delete merged.invariants;
  if (merged.requires_state.length === 0) delete merged.requires_state;

  return merged;
}

module.exports = {
  previewMerge,
  executeMerge,
  archiveDelta,
  applyMerge,
};
