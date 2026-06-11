'use strict';

const fs = require('fs');
const path = require('path');
const { getSddDir, readYaml, writeYaml, getCellsDir } = require('./store');
const { validateEntity } = require('./validate');

const GLOSSARY_FILE = 'glossary.yaml';

function glossaryPath(rootDir) {
  return path.join(getSddDir(rootDir), GLOSSARY_FILE);
}

function readGlossary(rootDir) {
  const filePath = glossaryPath(rootDir);
  if (!fs.existsSync(filePath)) {
    return { version: 0, entities: {} };
  }
  return readYaml(filePath);
}

function updateGlossary(rootDir, data) {
  // 校验实体名唯一性
  if (data.entities) {
    const entityNames = Object.keys(data.entities);
    const duplicates = entityNames.filter((name, i) => entityNames.indexOf(name) !== i);
    if (duplicates.length > 0) {
      throw new Error(`实体名重复: ${duplicates.join(', ')}`);
    }
  }

  const current = readGlossary(rootDir);
  const newVersion = (current.version || 0) + 1;
  const glossary = {
    version: newVersion,
    entities: data.entities || {},
  };

  // 计算受影响的 Cell
  const affectedCells = [];
  const cellsDir = getCellsDir(rootDir);
  if (fs.existsSync(cellsDir)) {
    const files = fs.readdirSync(cellsDir).filter(f => f.endsWith('.yaml'));
    for (const f of files) {
      const cellData = readYaml(path.join(cellsDir, f));
      if (cellData.entity && glossary.entities[cellData.entity]) {
        affectedCells.push(cellData.id);
      }
    }
  }

  writeYaml(glossaryPath(rootDir), glossary);
  return { updated: true, version: newVersion, affected_cells: affectedCells };
}

function addEntity(rootDir, data) {
  const validation = validateEntity(data);
  if (!validation.valid) {
    throw new Error(`校验失败: ${validation.errors.join('; ')}`);
  }

  const glossary = readGlossary(rootDir);

  if (glossary.entities[data.name]) {
    throw new Error(`实体 "${data.name}" 已存在`);
  }

  glossary.entities[data.name] = {
    attributes: data.attributes || [],
    capabilities: data.capabilities || [],
    states: data.states || [],
    transitions: data.transitions || [],
    relations: data.relations || [],
  };
  glossary.version = (glossary.version || 0) + 1;

  writeYaml(glossaryPath(rootDir), glossary);
  return { added: data.name, version: glossary.version };
}

function checkConsistency(rootDir) {
  const glossary = readGlossary(rootDir);
  const conflicts = [];
  const missingRefs = [];

  const cellsDir = getCellsDir(rootDir);
  if (!fs.existsSync(cellsDir)) {
    return { conflicts, missing_refs: missingRefs };
  }

  const entityNames = new Set(Object.keys(glossary.entities || {}));
  const files = fs.readdirSync(cellsDir).filter(f => f.endsWith('.yaml'));

  for (const f of files) {
    const cellData = readYaml(path.join(cellsDir, f));

    // 检查 Cell 的 entity 字段是否在基线中存在
    if (cellData.entity && !entityNames.has(cellData.entity)) {
      missingRefs.push({
        cell: cellData.id,
        entity: cellData.entity,
        issue: `Cell 引用了不存在的实体 "${cellData.entity}"`,
      });
    }

    // 检查基线中 capabilities 列表是否有对应的 Cell
    if (cellData.entity && entityNames.has(cellData.entity)) {
      const entity = glossary.entities[cellData.entity];
      if (entity.capabilities) {
        for (const cap of entity.capabilities) {
          if (cap === cellData.id) break; // 当前 Cell 就是该 capability
        }
      }
    }
  }

  // 检查基线中 capabilities 是否有对应的 Cell
  const cellIds = new Set(files.map(f => {
    const data = readYaml(path.join(cellsDir, f));
    return data.id;
  }));

  for (const [entityName, entity] of Object.entries(glossary.entities || {})) {
    if (entity.capabilities) {
      for (const cap of entity.capabilities) {
        if (!cellIds.has(cap)) {
          missingRefs.push({
            entity: entityName,
            capability: cap,
            issue: `实体 "${entityName}" 的 capability "${cap}" 没有对应的 Cell`,
          });
        }
      }
    }
  }

  return { conflicts, missing_refs: missingRefs };
}

function impactByEntities(rootDir, entities) {
  if (!Array.isArray(entities) || entities.length === 0) {
    return { entities: [], affected_cells: [] };
  }

  const targetEntities = new Set(
    entities
      .filter((e) => typeof e === 'string')
      .map((e) => e.trim())
      .filter((e) => e.length > 0),
  );

  const affectedCells = [];
  const cellsDir = getCellsDir(rootDir);
  if (fs.existsSync(cellsDir)) {
    const files = fs.readdirSync(cellsDir).filter(f => f.endsWith('.yaml'));
    for (const f of files) {
      const cellData = readYaml(path.join(cellsDir, f));
      if (cellData.entity && targetEntities.has(cellData.entity)) {
        affectedCells.push(cellData.id);
      }
    }
  }

  return {
    entities: [...targetEntities],
    affected_cells: [...new Set(affectedCells)],
  };
}

module.exports = {
  readGlossary,
  updateGlossary,
  addEntity,
  checkConsistency,
  impactByEntities,
};
