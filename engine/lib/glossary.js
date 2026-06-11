'use strict';

const fs = require('fs');
const path = require('path');
const { getSddDir, readYaml, writeYaml, getCellsDir } = require('./store');
const { validateTerm } = require('./validate');

const GLOSSARY_FILE = 'glossary.yaml';

function glossaryPath(rootDir) {
  return path.join(getSddDir(rootDir), GLOSSARY_FILE);
}

function readGlossary(rootDir) {
  const filePath = glossaryPath(rootDir);
  if (!fs.existsSync(filePath)) {
    return { version: 0, terms: {} };
  }
  return readYaml(filePath);
}

function updateGlossary(rootDir, data) {
  // 校验术语名唯一性
  if (data.terms) {
    const termNames = Object.keys(data.terms);
    const duplicates = termNames.filter((name, i) => termNames.indexOf(name) !== i);
    if (duplicates.length > 0) {
      throw new Error(`术语名重复: ${duplicates.join(', ')}`);
    }
  }

  const current = readGlossary(rootDir);
  const newVersion = (current.version || 0) + 1;
  const glossary = {
    version: newVersion,
    terms: data.terms || {},
  };

  writeYaml(glossaryPath(rootDir), glossary);
  return { updated: true, version: newVersion };
}

function addTerm(rootDir, data) {
  const validation = validateTerm(data);
  if (!validation.valid) {
    throw new Error(`校验失败: ${validation.errors.join('; ')}`);
  }

  const glossary = readGlossary(rootDir);

  if (glossary.terms[data.term]) {
    throw new Error(`术语 "${data.term}" 已存在`);
  }

  glossary.terms[data.term] = {
    definition: data.definition,
    aliases: data.aliases || [],
  };
  glossary.version = (glossary.version || 0) + 1;

  writeYaml(glossaryPath(rootDir), glossary);
  return { added: data.term, version: glossary.version };
}

function checkConsistency(rootDir) {
  const glossary = readGlossary(rootDir);
  const conflicts = [];
  const missingRefs = [];

  const cellsDir = getCellsDir(rootDir);
  if (!fs.existsSync(cellsDir)) {
    return { conflicts, missing_refs: missingRefs };
  }

  // 纯粹化 Glossary 后，不再强制校验 Cell.entity 与 Glossary 的映射关系
  // 可以在这里实现基于文本的术语检测（未来扩展）
  
  return { conflicts, missing_refs: missingRefs };
}

function impactByTerms(rootDir, terms) {
  if (!Array.isArray(terms) || terms.length === 0) {
    return { terms: [], affected_cells: [] };
  }

  const targetTerms = new Set(
    terms
      .filter((t) => typeof t === 'string')
      .map((t) => t.trim())
      .filter((t) => t.length > 0),
  );

  const affectedCells = [];
  const cellsDir = getCellsDir(rootDir);
  if (fs.existsSync(cellsDir)) {
    const files = fs.readdirSync(cellsDir).filter(f => f.endsWith('.yaml'));
    for (const f of files) {
      const cellData = readYaml(path.join(cellsDir, f));
      // 简单匹配：如果 intent, plan, contract, test 包含术语名
      const cellText = JSON.stringify(cellData);
      let isAffected = false;
      for (const term of targetTerms) {
        if (cellText.includes(term)) {
          isAffected = true;
          break;
        }
      }
      if (isAffected) {
        affectedCells.push(cellData.id);
      }
    }
  }

  return {
    terms: [...targetTerms],
    affected_cells: [...new Set(affectedCells)],
  };
}

module.exports = {
  readGlossary,
  updateGlossary,
  addTerm,
  checkConsistency,
  impactByTerms,
};
