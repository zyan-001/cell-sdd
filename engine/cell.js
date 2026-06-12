#!/usr/bin/env node
'use strict';

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
  saveModuleDraft,
  readModuleDraft,
  clearModuleDraft,
  markDirty,
  listDirty,
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
  checkConsistency,
  impactByTerms,
} = require('./lib/glossary');

function output(data) {
  console.log(JSON.stringify(data, null, 2));
}

function outputError(message) {
  process.stderr.write(JSON.stringify({ error: message }) + '\n');
  process.exit(1);
}

function resolveData(options) {
  if (options.file) {
    const fs = require('fs');
    const content = fs.readFileSync(options.file, 'utf-8');
    return JSON.parse(content);
  }
  if (options.data) {
    return JSON.parse(options.data);
  }
  return null;
}

function parseArgs(argv) {
  const args = argv.slice(2);
  if (args.length === 0) {
    return { command: 'help' };
  }

  const command = args[0];
  const options = {};
  const positional = [];

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--data' && i + 1 < args.length) {
      options.data = args[i + 1];
      i++;
    } else if (args[i] === '--file' && i + 1 < args.length) {
      options.file = args[i + 1];
      i++;
    } else if (args[i] === '--module' && i + 1 < args.length) {
      options.module = args[i + 1];
      i++;
    } else if (args[i] === '--threshold' && i + 1 < args.length) {
      options.threshold = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--hops' && i + 1 < args.length) {
      options.hops = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--root' && i + 1 < args.length) {
      options.root = path.resolve(args[i + 1]);
      i++;
    } else if (args[i] === '--force') {
      options.force = true;
    } else {
      positional.push(args[i]);
    }
  }

  return { command, positional, options };
}

function main() {
  const { command, positional, options } = parseArgs(process.argv);

  if (command === 'help') {
    console.log(`
Cell-Based SDD 引擎

用法: node cell.js <command> [options]

全局选项:
  --root <path>                  指定用户项目根目录（.sdd/ 所在目录）

项目管理:
  init [--root <path>]           初始化项目

全局基线管理:
  glossary-read                  读取全局基线
  glossary-update --data '<json>' 更新全局基线（全量替换）
  glossary-add-term --data '<json>' 添加术语
  glossary-check                  检查 Cell 与基线的一致性
  glossary-impact --data '{"terms":["user","session"]}' 计算术语变更影响范围

Cell CRUD:
  create --data '<json>'         创建 Cell
  read <cell-id>                 读取 Cell
  update <cell-id> --module <m> --data '<json>'  更新 Cell 模块
  delete <cell-id>               删除 Cell
  list                           列出所有 Cell

Delta 管理:
  delta-create --data '<json>'   创建 Delta
  delta-read <delta-id>          读取 Delta
  delta-update <delta-id> --module <m> --data '<json>'  更新 Delta 模块
  delta-delete <delta-id>        删除 Delta
  delta-list                     列出所有 Delta
  merge-preview <delta-id>       预览合并结果
  merge <delta-id>               执行合并
  archive <delta-id>             归档 Delta

图操作:
  impact <cell-id>               影响分析
  deps <cell-id>                 依赖查看
  check                          一致性检查
  roots [--threshold N]          聚合根推导
  graph                          生成 Mermaid 依赖图

上下文切片:
  slice <cell-id> [--hops N]     获取 Cell 局部上下文（默认 1 跳）

变更传播:
  propagate <cell-id>            传播变更
  stale                          列出 stale Cell
  dirty                          列出 dirty 模块（用户在 Web 页面修改后标记）
  confirm <cell-id> [--module <plan|contract|all>]  确认 Cell
  confirm-module <cell-id> --module <intent|plan|contract|test|schema|states|invariants|requires_state> --data '<json>'  确认并提交模块
  draft-read <cell-id> --module <intent|plan|contract|test|schema|states|invariants|requires_state>      读取模块草稿
`);
    process.exit(0);
  }

  try {
    // 解析 --root：显式指定项目根目录，优先于 process.cwd()
    const fs = require('fs');
    const explicitRoot = options.root || null;

    // init 不需要已有 .sdd/
    if (command === 'init') {
      const initRoot = explicitRoot || process.cwd();
      output(initProject(initRoot));
      return;
    }

    // 其他命令需要找到项目根目录
    let rootDir;
    if (explicitRoot) {
      if (!fs.existsSync(path.join(explicitRoot, '.sdd'))) {
        outputError(`指定根目录 ${explicitRoot} 下不存在 .sdd/，请先运行 init`);
      }
      rootDir = explicitRoot;
    } else {
      rootDir = findProjectRoot(process.cwd());
      if (!rootDir) {
        outputError('未找到 .sdd/ 目录，请先运行 node cell.js init');
      }
    }

    switch (command) {
      // 全局基线管理
      case 'glossary-read': {
        output(readGlossary(rootDir));
        break;
      }
      case 'glossary-update': {
        const data = resolveData(options);
        if (!data) outputError('缺少 --data 或 --file 参数');
        output(updateGlossary(rootDir, data));
        break;
      }
      case 'glossary-add-term': {
        const data = resolveData(options);
        if (!data) outputError('缺少 --data 或 --file 参数');
        output(addTerm(rootDir, data));
        break;
      }
      case 'glossary-check': {
        output(checkConsistency(rootDir));
        break;
      }
      case 'glossary-impact': {
        const data = resolveData(options);
        if (!data || !Array.isArray(data.terms)) {
          outputError('缺少 --data 或 --file 参数，且必须包含 terms 数组');
        }
        output(impactByTerms(rootDir, data.terms));
        break;
      }

      // Cell CRUD
      case 'create': {
        const data = resolveData(options);
        if (!data) outputError('缺少 --data 或 --file 参数');
        output(createCell(rootDir, data));
        break;
      }
      case 'read': {
        const id = positional[0];
        if (!id) outputError('缺少 cell-id 参数');
        output(readCell(rootDir, id));
        break;
      }
      case 'update': {
        const id = positional[0];
        if (!id) outputError('缺少 cell-id 参数');
        if (!options.module) outputError('缺少 --module 参数');
        const modData = resolveData(options);
        if (modData === null) outputError('缺少 --data 或 --file 参数');
        output(updateCell(rootDir, id, options.module, modData));
        break;
      }
      case 'delete': {
        const id = positional[0];
        if (!id) outputError('缺少 cell-id 参数');
        const deps = getDependents(rootDir, id);
        const result = deleteCell(rootDir, id);
        result.dependents = deps.dependents;
        output(result);
        break;
      }
      case 'list': {
        output(listCells(rootDir));
        break;
      }

      // Delta CRUD
      case 'delta-create': {
        const data = resolveData(options);
        if (!data) outputError('缺少 --data 或 --file 参数');
        output(createDelta(rootDir, data));
        break;
      }
      case 'delta-read': {
        const id = positional[0];
        if (!id) outputError('缺少 delta-id 参数');
        output(readDelta(rootDir, id));
        break;
      }
      case 'delta-update': {
        const id = positional[0];
        if (!id) outputError('缺少 delta-id 参数');
        if (!options.module) outputError('缺少 --module 参数');
        const modData = resolveData(options);
        if (modData === null) outputError('缺少 --data 或 --file 参数');
        output(updateDelta(rootDir, id, options.module, modData));
        break;
      }
      case 'delta-delete': {
        const id = positional[0];
        if (!id) outputError('缺少 delta-id 参数');
        output(deleteDelta(rootDir, id));
        break;
      }
      case 'delta-list': {
        output(listDeltas(rootDir));
        break;
      }
      case 'merge-preview': {
        const id = positional[0];
        if (!id) outputError('缺少 delta-id 参数');
        output(previewMerge(rootDir, id));
        break;
      }
      case 'merge': {
        const id = positional[0];
        if (!id) outputError('缺少 delta-id 参数');
        output(executeMerge(rootDir, id));
        break;
      }
      case 'archive': {
        const id = positional[0];
        if (!id) outputError('缺少 delta-id 参数');
        output(archiveDelta(rootDir, id));
        break;
      }

      // 图操作
      case 'impact': {
        const id = positional[0];
        if (!id) outputError('缺少 cell-id 参数');
        output(impactAnalysis(rootDir, id));
        break;
      }
      case 'deps': {
        const id = positional[0];
        if (!id) outputError('缺少 cell-id 参数');
        output(getDeps(rootDir, id));
        break;
      }
      case 'check': {
        output(consistencyCheck(rootDir));
        break;
      }
      case 'roots': {
        const threshold = options.threshold || 2;
        output(findRoots(rootDir, threshold));
        break;
      }
      case 'graph': {
        output(generateMermaid(rootDir));
        break;
      }

      // 上下文切片
      case 'slice': {
        const id = positional[0];
        if (!id) outputError('缺少 cell-id 参数');
        const hops = options.hops || 1;
        output(slice(rootDir, id, hops));
        break;
      }

      // 变更传播
      case 'propagate': {
        const id = positional[0];
        if (!id) outputError('缺少 cell-id 参数');
        output(propagateChange(rootDir, id));
        break;
      }
      case 'stale': {
        output(listStale(rootDir));
        break;
      }
      case 'dirty': {
        output(listDirty(rootDir));
        break;
      }
      case 'confirm': {
        const id = positional[0];
        if (!id) outputError('缺少 cell-id 参数');
        const mod = options.module || 'all';
        output(confirmCell(rootDir, id, mod));
        break;
      }
      case 'confirm-module': {
        const id = positional[0];
        if (!id) outputError('缺少 cell-id 参数');
        if (!options.module) outputError('缺少 --module 参数');
        const modData = resolveData(options);
        if (modData === null) outputError('缺少 --data 或 --file 参数');
        const force = options.force || false;

        const evaluation = evaluateGlobalImpact(rootDir, id, options.module, modData);
        if (evaluation.blocked && !force) {
          const draft = saveModuleDraft(rootDir, id, options.module, modData, {
            blocked: true,
            reasons: evaluation.reasons,
            affected: evaluation.impact.affected,
          });
          output({
            blocked: true,
            reasons: evaluation.reasons,
            impact: evaluation.impact,
            current_cell_impacted_modules: evaluation.current_cell_impacted_modules,
            affected_cell_impacted_modules: evaluation.affected_cell_impacted_modules,
            draft_saved: draft.saved,
            draft_path: draft.path,
          });
          break;
        }

        const updated = updateCell(rootDir, id, options.module, modData);
        clearModuleDraft(rootDir, id, options.module);
        confirmCell(rootDir, id, options.module);
        const propagated = propagateChange(rootDir, id);
        
        let resonance_marked = [];
        if (options.module === 'requires_state') {
          const { triggerResonance } = require('./lib/graph');
          resonance_marked = triggerResonance(rootDir, id, modData);
        }

        output({
          blocked: false,
          updated,
          impact: evaluation.impact,
          current_cell_impacted_modules: evaluation.current_cell_impacted_modules,
          affected_cell_impacted_modules: evaluation.affected_cell_impacted_modules,
          marked_stale: propagated.marked_stale,
          resonance_marked,
          forced: evaluation.blocked && force,
        });
        break;
      }
      case 'draft-read': {
        const id = positional[0];
        if (!id) outputError('缺少 cell-id 参数');
        if (!options.module) outputError('缺少 --module 参数');
        output({ draft: readModuleDraft(rootDir, id, options.module) });
        break;
      }

      default:
        outputError(`未知命令: ${command}`);
    }
  } catch (err) {
    outputError(err.message);
  }
}

main();
