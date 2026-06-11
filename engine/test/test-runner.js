'use strict';

/**
 * Cell-Based SDD 引擎测试运行器
 * 基于深度搜索 Agent 场景，按 SOP 五阶段验证引擎功能
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

// ─── 配置 ───
const ENGINE_PATH = path.resolve(__dirname, '..', 'cell.js');
const FIXTURES_DIR = path.resolve(__dirname, 'fixtures');

// ─── 测试统计 ───
let passed = 0;
let failed = 0;
let errors = [];

// ─── 工具函数 ───
function run(cmd, cwd) {
  try {
    const result = execSync(cmd, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    return JSON.parse(result.trim());
  } catch (e) {
    if (e.stdout) {
      try { return JSON.parse(e.stdout.trim()); } catch { /* ignore */ }
    }
    return { __error: e.message, __stderr: e.stderr?.toString() };
  }
}

function engine(args, cwd) {
  return run(`node "${ENGINE_PATH}" ${args}`, cwd);
}

function readFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, name), 'utf-8'));
}

function assert(condition, msg) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    errors.push(msg);
    console.log(`  ✗ ${msg}`);
  }
}

function assertEq(actual, expected, msg) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    errors.push(`${msg} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    console.log(`  ✗ ${msg} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertIncludes(arr, item, msg) {
  const ok = Array.isArray(arr) && arr.some(a => JSON.stringify(a) === JSON.stringify(item));
  if (ok) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    errors.push(`${msg} — ${JSON.stringify(item)} not found in ${JSON.stringify(arr)}`);
    console.log(`  ✗ ${msg}`);
  }
}

function assertHasKey(obj, key, msg) {
  if (obj && obj[key] !== undefined) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    errors.push(`${msg} — key "${key}" missing`);
    console.log(`  ✗ ${msg} — key "${key}" missing`);
  }
}

function assertNoError(obj, msg) {
  if (!obj.__error) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    errors.push(`${msg} — ${obj.__error}`);
    console.log(`  ✗ ${msg} — ${obj.__error}`);
  }
}

// ─── 创建临时测试目录 ───
const TEST_DIR = path.join(os.tmpdir(), `sdd-test-${Date.now()}`);

function setup() {
  fs.mkdirSync(TEST_DIR, { recursive: true });
  console.log(`\n测试目录: ${TEST_DIR}\n`);
}

function teardown() {
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
}

// ═══════════════════════════════════════════════
// 阶段 0：需求澄清与能力切分（无引擎操作，跳过）
// ═══════════════════════════════════════════════

// ═══════════════════════════════════════════════
// 阶段 1：全局基线
// ═══════════════════════════════════════════════
function testPhase1() {
  console.log('\n═══ 阶段 1：全局基线 ═══');

  // 1.1 init
  console.log('\n--- 1.1 init ---');
  const initResult = engine('init', TEST_DIR);
  assertNoError(initResult, 'init 成功');
  assertEq(initResult.initialized, true, 'init 返回 initialized: true');
  assert(fs.existsSync(path.join(TEST_DIR, '.sdd', 'glossary.yaml')), 'glossary.yaml 已创建');

  // 1.2 glossary-read（空基线）
  console.log('\n--- 1.2 glossary-read（空基线） ---');
  const emptyGlossary = engine('glossary-read', TEST_DIR);
  assertEq(emptyGlossary.version, 0, '空基线 version=0');
  assertEq(emptyGlossary.entities, {}, '空基线 entities={}');
  assert(emptyGlossary.terms === undefined, '空基线不包含 terms 字段');

  // 1.3 glossary-add-entity: reasoning-chain
  console.log('\n--- 1.3 glossary-add-entity: reasoning-chain ---');
  const entity1 = readFixture('entity-reasoning-chain.json');
  const addResult1 = engine(`glossary-add-entity --file "${path.join(FIXTURES_DIR, 'entity-reasoning-chain.json')}"`, TEST_DIR);
  assertNoError(addResult1, '添加 reasoning-chain 实体成功');
  assertEq(addResult1.added, 'reasoning-chain', '返回 added: reasoning-chain');
  assertEq(addResult1.version, 1, 'version 递增为 1');

  // 1.4 glossary-add-entity: expert-knowledge
  console.log('\n--- 1.4 glossary-add-entity: expert-knowledge ---');
  const addResult2 = engine(`glossary-add-entity --file "${path.join(FIXTURES_DIR, 'entity-expert-knowledge.json')}"`, TEST_DIR);
  assertNoError(addResult2, '添加 expert-knowledge 实体成功');
  assertEq(addResult2.added, 'expert-knowledge', '返回 added: expert-knowledge');
  assertEq(addResult2.version, 2, 'version 递增为 2');

  // 1.5 重复添加实体应报错
  console.log('\n--- 1.5 重复添加实体 ---');
  const dupEntity = engine(`glossary-add-entity --data '{"name":"reasoning-chain"}'`, TEST_DIR);
  assert(dupEntity.__error !== undefined, '重复添加实体报错');

  // 1.6 glossary-read（完整基线）
  console.log('\n--- 1.6 glossary-read（完整基线） ---');
  const fullGlossary = engine('glossary-read', TEST_DIR);
  assert(Object.keys(fullGlossary.entities).length === 2, '基线包含 2 个实体');
  assert(fullGlossary.terms === undefined, '完整基线不包含 terms 字段');
  assertHasKey(fullGlossary.entities, 'reasoning-chain', '包含 reasoning-chain 实体');
  assertHasKey(fullGlossary.entities, 'expert-knowledge', '包含 expert-knowledge 实体');

  // 1.7 glossary-check（Cell 未创建，capabilities 缺对应 Cell）
  console.log('\n--- 1.7 glossary-check（capabilities 缺对应 Cell） ---');
  const check1 = engine('glossary-check', TEST_DIR);
  assert(Array.isArray(check1.missing_refs), 'glossary-check 返回 missing_refs');
  assert(check1.missing_refs.length > 0, 'capabilities 缺少对应 Cell');
}

// ═══════════════════════════════════════════════
// 阶段 2：三段宏观确认
// ═══════════════════════════════════════════════
function testPhase2() {
  console.log('\n═══ 阶段 2：三段宏观确认 ═══');

  // ── 第一段：Intent 批量确认 ──
  console.log('\n--- 2.1 Intent 批量确认 ---');

  // 创建 4 个 Cell
  const cellFiles = [
    'cell-audit-chain.json',
    'cell-expert-engine.json',
    'cell-search-reasoning.json',
    'cell-reviewer-agent.json',
  ];

  for (const f of cellFiles) {
    const result = engine(`create --file "${path.join(FIXTURES_DIR, f)}"`, TEST_DIR);
    assertNoError(result, `创建 Cell ${f} 成功`);
  }

  // 验证 list 包含 entity 字段
  const listResult = engine('list', TEST_DIR);
  assert(listResult.cells.length === 4, 'list 返回 4 个 Cell');
  const srCell = listResult.cells.find(c => c.id === 'search-reasoning');
  assert(srCell && srCell.entity === 'reasoning-chain', 'search-reasoning 的 entity 字段正确');
  const eeCell = listResult.cells.find(c => c.id === 'expert-engine');
  assert(eeCell && eeCell.entity === 'expert-knowledge', 'expert-engine 的 entity 字段正确');

  // 验证 read 返回 entity
  const readSR = engine('read search-reasoning', TEST_DIR);
  assertEq(readSR.entity, 'reasoning-chain', 'read 返回 entity 字段');

  // check 应有 gaps（plan/contract/test 为占位内容，但非空所以不报 gap）
  const checkResult = engine('check', TEST_DIR);
  assert(Array.isArray(checkResult.glossary_missing_refs), 'check 返回 glossary_missing_refs');
  // capabilities 现在有对应 Cell，missing_refs 应为空
  assert(checkResult.glossary_missing_refs.length === 0, '所有 capabilities 有对应 Cell');

  // ── 第二段：Spec 批量确认 ──
  console.log('\n--- 2.2 Spec 批量确认 ---');

  // 更新 plan（使用临时文件避免 PowerShell 转义问题）
  const plans = {
    'search-reasoning': '1. 接收用户查询\n2. 调用 expert-engine 获取领域判断\n3. 生成推理步骤，记录到 audit-chain\n4. 提交完整链路给 reviewer-agent\n5. 若驳回，根据审查意见重新推理（自循环），最多3次',
    'expert-engine': '1. 接收推理步骤上下文\n2. 匹配领域规则库\n3. 返回规则匹配结果和置信度评分',
    'reviewer-agent': '1. 读取推理链路和审计记录\n2. 检查逻辑一致性、置信度阈值、事实矛盾\n3. 通过则标记approved，驳回则附上具体原因',
    'audit-chain': '1. 接收推理步骤数据\n2. 追加写入审计日志（含时间戳、哈希）\n3. 支持按链路ID查询完整审计记录',
  };

  for (const [cellId, plan] of Object.entries(plans)) {
    const tmpFile = path.join(TEST_DIR, `_plan_${cellId}.json`);
    fs.writeFileSync(tmpFile, JSON.stringify(plan));
    engine(`update ${cellId} --module plan --file "${tmpFile}"`, TEST_DIR);
    fs.unlinkSync(tmpFile);
  }

  // 更新 contract
  engine(`update search-reasoning --module contract --file "${path.join(FIXTURES_DIR, 'contract-search-reasoning.json')}"`, TEST_DIR);
  engine(`update expert-engine --module contract --file "${path.join(FIXTURES_DIR, 'contract-expert-engine.json')}"`, TEST_DIR);
  engine(`update reviewer-agent --module contract --file "${path.join(FIXTURES_DIR, 'contract-reviewer-agent.json')}"`, TEST_DIR);
  engine(`update audit-chain --module contract --file "${path.join(FIXTURES_DIR, 'contract-audit-chain.json')}"`, TEST_DIR);

  // 验证 contract 更新
  const readSR2 = engine('read search-reasoning', TEST_DIR);
  assert(readSR2.contract.length === 4, 'search-reasoning contract 有 4 条');
  assert(readSR2.plan.includes('自循环'), 'search-reasoning plan 包含"自循环"');

  // 验证依赖图
  const graphResult = engine('graph', TEST_DIR);
  assert(graphResult.mermaid.includes('search-reasoning'), '依赖图包含 search-reasoning');
  assert(graphResult.mermaid.includes('expert-engine'), '依赖图包含 expert-engine');

  // ── 第三段：Test 批量确认 ──
  console.log('\n--- 2.3 Test 批量确认 ---');

  engine(`update search-reasoning --module test --file "${path.join(FIXTURES_DIR, 'test-search-reasoning.json')}"`, TEST_DIR);
  engine(`update expert-engine --module test --file "${path.join(FIXTURES_DIR, 'test-expert-engine.json')}"`, TEST_DIR);
  engine(`update reviewer-agent --module test --file "${path.join(FIXTURES_DIR, 'test-reviewer-agent.json')}"`, TEST_DIR);
  engine(`update audit-chain --module test --file "${path.join(FIXTURES_DIR, 'test-audit-chain.json')}"`, TEST_DIR);

  // 最终验证
  const finalCheck = engine('check', TEST_DIR);
  assert(finalCheck.dangling_refs.length === 0, '无悬空引用');
  assert(finalCheck.cycles.length === 0, '无循环依赖');
  assert(finalCheck.gaps.length === 0, '无缺口 Cell');
  assert(finalCheck.glossary_conflicts.length === 0, '无基线冲突');

  const glossaryCheck = engine('glossary-check', TEST_DIR);
  assert(glossaryCheck.conflicts.length === 0, 'glossary-check 无冲突');
  assert(glossaryCheck.missing_refs.length === 0, 'glossary-check 无缺失引用');
}

// ═══════════════════════════════════════════════
// 阶段 3：变更响应
// ═══════════════════════════════════════════════
function testPhase3() {
  console.log('\n═══ 阶段 3：变更响应 ═══');

  // ── 场景A：局部变更 ──
  console.log('\n--- 3.1 局部变更：修改 audit-chain plan ---');
  const acPlanUpdate = '1. 接收推理步骤数据\n2. 追加写入审计日志（含时间戳、哈希、操作者标识）\n3. 支持按链路ID查询完整审计记录\n4. 支持哈希链校验';
  const acPlanFile = path.join(TEST_DIR, '_plan_ac_update.json');
  fs.writeFileSync(acPlanFile, JSON.stringify(acPlanUpdate));
  engine(`update audit-chain --module plan --file "${acPlanFile}"`, TEST_DIR);
  fs.unlinkSync(acPlanFile);

  // 影响分析
  const impact = engine('impact audit-chain', TEST_DIR);
  assert(impact.affected.includes('search-reasoning'), 'audit-chain 变更影响 search-reasoning');
  assert(impact.affected.includes('reviewer-agent'), 'audit-chain 变更影响 reviewer-agent');

  // 传播
  const propagate = engine('propagate audit-chain', TEST_DIR);
  assert(propagate.marked_stale.includes('search-reasoning'), 'search-reasoning 被标记 stale');
  assert(propagate.marked_stale.includes('reviewer-agent'), 'reviewer-agent 被标记 stale');

  // 查看 stale
  const staleResult = engine('stale', TEST_DIR);
  assert(staleResult.stale_cells.length >= 2, '至少 2 个 stale Cell');

  // 确认
  const confirmSR = engine('confirm search-reasoning --module all', TEST_DIR);
  assertNoError(confirmSR, '确认 search-reasoning 成功');
  const confirmRA = engine('confirm reviewer-agent --module all', TEST_DIR);
  assertNoError(confirmRA, '确认 reviewer-agent 成功');

  // ── 场景B：全局变更（Delta） ──
  console.log('\n--- 3.2 全局变更：expert-engine 新增异步模式 ---');
  const deltaCreate = engine(`delta-create --file "${path.join(FIXTURES_DIR, 'delta-expert-async.json')}"`, TEST_DIR);
  assertNoError(deltaCreate, '创建 Delta 成功');

  // 预览合并
  const preview = engine('merge-preview delta-expert-async', TEST_DIR);
  assertNoError(preview, '预览合并成功');
  assert(preview.merged.contract.length === 5, '合并后 contract 有 5 条（原3+新2）');
  assertEq(preview.merged.entity, 'expert-knowledge', '合并后保留 entity 字段');

  // 归档
  const archive = engine('archive delta-expert-async', TEST_DIR);
  assertNoError(archive, '归档成功');
  assertEq(archive.new_version, 2, '归档后 version=2');
  assert(archive.propagated.includes('search-reasoning'), '传播影响 search-reasoning');

  // 检查 stale
  const staleAfterArchive = engine('stale', TEST_DIR);
  const srStale = staleAfterArchive.stale_cells.find(c => c.cell === 'search-reasoning');
  assert(srStale !== undefined, 'search-reasoning 被 stale（因依赖 expert-engine 变更）');

  // 确认修订
  engine('confirm search-reasoning --module all', TEST_DIR);

  // 验证合并后 entity 保留
  const readEE = engine('read expert-engine', TEST_DIR);
  assertEq(readEE.entity, 'expert-knowledge', '合并后 entity 仍为 expert-knowledge');
  assertEq(readEE.version, 2, '合并后 version=2');
}

// ═══════════════════════════════════════════════
// 阶段 4：TDD 实现（slice 测试）
// ═══════════════════════════════════════════════
function testPhase4() {
  console.log('\n═══ 阶段 4：TDD 实现（slice 测试） ═══');

  // slice 无依赖的 Cell
  const sliceAC = engine('slice audit-chain', TEST_DIR);
  assertEq(sliceAC.root, 'audit-chain', 'slice root 为 audit-chain');
  const acRootCell = sliceAC.cells.find(c => c.role === 'root');
  assert(acRootCell && acRootCell.data.entity === 'reasoning-chain', 'slice root 包含 entity 字段');
  const acDeps = sliceAC.cells.filter(c => c.role === 'dependency');
  assert(acDeps.length === 0, 'audit-chain 无依赖');

  const sliceEE = engine('slice expert-engine', TEST_DIR);
  assertEq(sliceEE.root, 'expert-engine', 'slice root 为 expert-engine');

  // slice 有依赖的 Cell
  const sliceSR = engine('slice search-reasoning --hops 1', TEST_DIR);
  assertEq(sliceSR.root, 'search-reasoning', 'slice root 为 search-reasoning');
  const srDeps = sliceSR.cells.filter(c => c.role === 'dependency');
  assert(srDeps.length >= 2, 'search-reasoning 有 2+ 依赖');

  const sliceRA = engine('slice reviewer-agent --hops 1', TEST_DIR);
  assertEq(sliceRA.root, 'reviewer-agent', 'slice root 为 reviewer-agent');
}

// ═══════════════════════════════════════════════
// 边界与回归测试
// ═══════════════════════════════════════════════
function testEdgeCases() {
  console.log('\n═══ 边界与回归测试 ═══');

  // E1: 循环依赖检测
  console.log('\n--- E1 循环依赖检测 ---');
  const cycleDepFile = path.join(TEST_DIR, '_cycle_dep.json');
  fs.writeFileSync(cycleDepFile, JSON.stringify([{"id":"search-reasoning","kind":"call"}]));
  engine(`update audit-chain --module depends_on --file "${cycleDepFile}"`, TEST_DIR);
  fs.unlinkSync(cycleDepFile);
  const checkCycle = engine('check', TEST_DIR);
  assert(checkCycle.cycles.length > 0, '检测到循环依赖');
  // 恢复
  engine(`update audit-chain --module depends_on --data '[]'`, TEST_DIR);

  // E2: entity 引用不存在的实体
  console.log('\n--- E2 entity 引用不存在的实体 ---');
  const badCellData = {"id":"bad-cell","entity":"nonexistent","intent":"test","plan":"test","contract":[{"when":"x","then":"y"}],"test":[{"scenario":"x","given":"x","when":"x","then":"x"}],"depends_on":[]};
  const badCellFile = path.join(TEST_DIR, '_bad_cell.json');
  fs.writeFileSync(badCellFile, JSON.stringify(badCellData));
  const badCell = engine(`create --file "${badCellFile}"`, TEST_DIR);
  fs.unlinkSync(badCellFile);
  assertNoError(badCell, '创建 entity 引用不存在实体的 Cell 成功（仅警告）');
  const gCheck = engine('glossary-check', TEST_DIR);
  const badRef = gCheck.missing_refs.find(r => r.entity === 'nonexistent');
  assert(badRef !== undefined, 'glossary-check 检测到不存在的实体引用');

  // 清理
  engine('delete bad-cell', TEST_DIR);

  // E3: validateEntity
  console.log('\n--- E3 validateEntity ---');
  const badEntity = engine(`glossary-add-entity --data '{"name":""}'`, TEST_DIR);
  assert(badEntity.__error !== undefined, '空实体名报错');

  // E4: 删除 Cell 的影响提示
  console.log('\n--- E4 删除 Cell 的影响提示 ---');
  const delResult = engine('delete expert-engine', TEST_DIR);
  assert(delResult.dependents && delResult.dependents.includes('search-reasoning'), '删除提示 search-reasoning 依赖 expert-engine');

  // 重新创建 expert-engine 以便后续测试
  engine(`create --file "${path.join(FIXTURES_DIR, 'cell-expert-engine.json')}"`, TEST_DIR);
  // 恢复 spec
  const eeRestorePlan = '1. 接收推理步骤上下文\n2. 匹配领域规则库\n3. 返回规则匹配结果和置信度评分';
  const eePlanFile = path.join(TEST_DIR, '_plan_ee_restore.json');
  fs.writeFileSync(eePlanFile, JSON.stringify(eeRestorePlan));
  engine(`update expert-engine --module plan --file "${eePlanFile}"`, TEST_DIR);
  fs.unlinkSync(eePlanFile);
  engine(`update expert-engine --module contract --file "${path.join(FIXTURES_DIR, 'contract-expert-engine.json')}"`, TEST_DIR);
  engine(`update expert-engine --module test --file "${path.join(FIXTURES_DIR, 'test-expert-engine.json')}"`, TEST_DIR);

  // E5: Delta 合并后 entity/kind/tags 保留
  console.log('\n--- E5 合并后 entity/kind/tags 保留 ---');
  // 确保 audit-chain 的 depends_on 为空
  engine(`update audit-chain --module depends_on --data '[]'`, TEST_DIR);
  const deltaPreserveData = {"id":"delta-test-preserve","target":"audit-chain","intent":"测试保留字段","plan":"测试","contract":[{"when":"x","then":"y"}],"test":[{"scenario":"x","given":"x","when":"x","then":"x"}],"depends_on":[]};
  const deltaPreserveFile = path.join(TEST_DIR, '_delta_preserve.json');
  fs.writeFileSync(deltaPreserveFile, JSON.stringify(deltaPreserveData));
  engine(`delta-create --file "${deltaPreserveFile}"`, TEST_DIR);
  fs.unlinkSync(deltaPreserveFile);
  const mergePreview = engine('merge-preview delta-test-preserve', TEST_DIR);
  assert(mergePreview.merged && mergePreview.merged.entity === 'reasoning-chain', '合并后 entity 保留');
  // 清理
  engine('delta-delete delta-test-preserve', TEST_DIR);

  // E6: roots 聚合根推导
  console.log('\n--- E6 roots 聚合根推导 ---');
  const roots = engine('roots --threshold 1', TEST_DIR);
  assert(roots.roots.length > 0, 'roots 返回结果');
  const acRoot = roots.roots.find(r => r.cell === 'audit-chain');
  assert(acRoot !== undefined, 'audit-chain 是聚合根（入度>=1）');

  // E7: deps 依赖查看
  console.log('\n--- E7 deps 依赖查看 ---');
  const deps = engine('deps search-reasoning', TEST_DIR);
  const depIds = (deps.depends_on || []).map(d => typeof d === 'string' ? d : d.id);
  assert(depIds.includes('expert-engine'), 'search-reasoning 依赖 expert-engine');
  assert(depIds.includes('audit-chain'), 'search-reasoning 依赖 audit-chain');
}

// ═══════════════════════════════════════════════
// 主流程
// ═══════════════════════════════════════════════
function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  Cell-Based SDD 引擎测试 — 深度搜索 Agent   ║');
  console.log('╚══════════════════════════════════════════════╝');

  setup();

  try {
    testPhase1();
    testPhase2();
    testPhase3();
    testPhase4();
    testEdgeCases();
  } catch (e) {
    console.error(`\n!!! 测试执行异常: ${e.message}`);
    console.error(e.stack);
  } finally {
    teardown();
  }

  console.log('\n══════════════════════════════════════════════');
  console.log(`测试结果: ${passed} 通过, ${failed} 失败`);
  if (errors.length > 0) {
    console.log('\n失败详情:');
    errors.forEach((e, i) => console.log(`  ${i + 1}. ${e}`));
  }
  console.log('══════════════════════════════════════════════');

  process.exit(failed > 0 ? 1 : 0);
}

main();
