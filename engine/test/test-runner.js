'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { runApiTests } = require('./api-tests');

const ENGINE_PATH = path.resolve(__dirname, '..', 'cell.js');
const SERVER_PATH = path.resolve(__dirname, '..', 'server.js');

let passed = 0;
let failed = 0;
const errors = [];

const TEST_DIR = path.join(os.tmpdir(), `cell-sdd-test-${Date.now()}`);

function assert(condition, msg) {
  if (condition) {
    passed += 1;
    console.log(`  OK ${msg}`);
    return;
  }
  failed += 1;
  errors.push(msg);
  console.log(`  FAIL ${msg}`);
}

function assertEq(actual, expected, msg) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  assert(ok, `${msg} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
}

function parseJson(text) {
  const body = (text || '').trim();
  if (!body) return null;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function runCli(args, cwd = TEST_DIR) {
  const result = spawnSync('node', [ENGINE_PATH, ...args], {
    cwd,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const outJson = parseJson(result.stdout);
  const errJson = parseJson(result.stderr);
  const errorObj = errJson && errJson.error ? errJson.error : null;

  return {
    ok: result.status === 0,
    status: result.status,
    data: outJson,
    stderr: (result.stderr || '').trim(),
    stdout: (result.stdout || '').trim(),
    error: errorObj,
  };
}

function mustOk(resp, label) {
  assert(resp.ok, `${label} should succeed`);
  if (!resp.ok) {
    console.log(`    stderr=${resp.stderr}`);
  }
}

function mustFail(resp, label) {
  assert(!resp.ok, `${label} should fail`);
}

function writeJson(name, data) {
  const filePath = path.join(TEST_DIR, name);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  return filePath;
}

function setup() {
  fs.mkdirSync(TEST_DIR, { recursive: true });
  console.log(`\nTest directory: ${TEST_DIR}\n`);
}

function teardown() {
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
}

function testGlossaryAndInit() {
  console.log('\n=== Suite: init + glossary ===');

  const initResp = runCli(['init']);
  mustOk(initResp, 'init');
  assertEq(initResp.data.initialized, true, 'init returns initialized=true');
  assert(fs.existsSync(path.join(TEST_DIR, '.sdd', 'glossary.yaml')), '.sdd/glossary.yaml exists');

  const readEmpty = runCli(['glossary-read']);
  mustOk(readEmpty, 'glossary-read empty');
  assertEq(readEmpty.data.version, 0, 'empty glossary version=0');
  assertEq(readEmpty.data.terms, {}, 'empty glossary terms={}');

  const addClaim = runCli([
    'glossary-add-term',
    '--data',
    JSON.stringify({
      term: 'Claim',
      definition: 'A falsifiable statement.',
      aliases: ['结论'],
    }),
  ]);
  mustOk(addClaim, 'glossary-add-term Claim');
  assertEq(addClaim.data.added, 'Claim', 'added term name matches');

  const addDuplicate = runCli([
    'glossary-add-term',
    '--data',
    JSON.stringify({
      term: 'Claim',
      definition: 'Duplicate',
      aliases: [],
    }),
  ]);
  mustFail(addDuplicate, 'duplicate glossary-add-term');
  assert((addDuplicate.error || '').includes('已存在'), 'duplicate term reports already exists');

  const updateGlossaryFile = writeJson('glossary-update.json', {
    terms: {
      Claim: { definition: 'A falsifiable statement.', aliases: ['结论'] },
      Evidence: { definition: 'Supporting or refuting artifact.', aliases: ['证据'] },
    },
  });
  const updateResp = runCli(['glossary-update', '--file', updateGlossaryFile]);
  mustOk(updateResp, 'glossary-update');
  assertEq(updateResp.data.updated, true, 'glossary-update updated=true');

  const glossaryCheck = runCli(['glossary-check']);
  mustOk(glossaryCheck, 'glossary-check');
  assertEq(glossaryCheck.data.conflicts, [], 'glossary-check conflicts empty');
  assertEq(glossaryCheck.data.missing_refs, [], 'glossary-check missing_refs empty');
}

function testCellValidationAndLifecycle() {
  console.log('\n=== Suite: cell create/update/read/list/check ===');

  const aggOrder = writeJson('cell-agg-order.json', {
    id: 'agg-order',
    kind: 'Aggregate',
    intent: 'Maintain order aggregate lifecycle',
    depends_on: [],
    schema: [{ name: 'id', type: 'string' }],
    states: [{ name: 'created' }],
    invariants: ['id must be unique'],
  });
  mustOk(runCli(['create', '--file', aggOrder]), 'create agg-order');

  const actionMissingContract = runCli([
    'create',
    '--data',
    JSON.stringify({
      id: 'act-invalid',
      kind: 'Action',
      intent: 'invalid action without contract',
      depends_on: ['agg-order'],
      plan: 'flow',
      test: [{ scenario: 's', given: 'g', when: 'w', then: 't' }],
    }),
  ]);
  mustFail(actionMissingContract, 'create action without contract');
  assert((actionMissingContract.error || '').includes('contract'), 'missing contract validation error');

  const actionPayFile = writeJson('cell-act-pay.json', {
    id: 'act-pay',
    kind: 'Action',
    intent: 'Pay an order',
    depends_on: ['agg-order'],
    plan: 'Execute payment',
    contract: [{ when: 'payment requested', then: 'payment accepted' }],
    test: [{ scenario: 'pay order', given: 'order exists', when: 'pay', then: 'state changes' }],
    requires_state: [{ target: 'agg-order', type: 'state', field: 'paid' }],
  });
  mustOk(runCli(['create', '--file', actionPayFile]), 'create act-pay');

  const journeyFile = writeJson('cell-journey-checkout.json', {
    id: 'journey-checkout',
    kind: 'Journey',
    intent: 'Checkout orchestration',
    depends_on: ['act-pay'],
    plan: 'flowchart TD\n  startNode[Start] --> payNode[act-pay]\n  payNode --> endNode[End]',
    test: [{ scenario: 'checkout success', given: 'valid order', when: 'checkout', then: 'payment completed' }],
  });
  mustOk(runCli(['create', '--file', journeyFile]), 'create journey-checkout');

  const listResp = runCli(['list']);
  mustOk(listResp, 'list cells');
  assert((listResp.data.cells || []).length >= 3, 'list returns 3+ cells');
  const listById = Object.fromEntries((listResp.data.cells || []).map((c) => [c.id, c]));
  assertEq(listById['agg-order'].kind, 'Aggregate', 'agg-order kind in list');
  assertEq(listById['act-pay'].kind, 'Action', 'act-pay kind in list');
  assertEq(listById['journey-checkout'].kind, 'Journey', 'journey-checkout kind in list');

  const readAction = runCli(['read', 'act-pay']);
  mustOk(readAction, 'read act-pay');
  assert(Array.isArray(readAction.data.requires_state), 'read action has requires_state array');

  const badAggregateUpdate = runCli([
    'update',
    'agg-order',
    '--module',
    'contract',
    '--data',
    JSON.stringify([{ when: 'x', then: 'y' }]),
  ]);
  mustFail(badAggregateUpdate, 'aggregate should reject contract update');
  assert((badAggregateUpdate.error || '').includes('Aggregate'), 'kind-module constraint error contains Aggregate');

  const checkResp = runCli(['check']);
  mustOk(checkResp, 'check');
  assertEq(checkResp.data.dangling_refs, [], 'check dangling refs empty');
  assertEq(checkResp.data.cycles, [], 'check cycles empty');
  assertEq(checkResp.data.gaps, [], 'check gaps empty for valid three-layer cells');

  const graphResp = runCli(['graph']);
  mustOk(graphResp, 'graph');
  assert((graphResp.data.mermaid || '').includes('journey-checkout --> act-pay'), 'graph contains journey->action edge');

  const depsResp = runCli(['deps', 'journey-checkout']);
  mustOk(depsResp, 'deps');
  assertEq(depsResp.data.depends_on, ['act-pay'], 'deps of journey-checkout');

  const rootsResp = runCli(['roots', '--threshold', '1']);
  mustOk(rootsResp, 'roots');
  assert(Array.isArray(rootsResp.data.roots), 'roots returns array');

  const sliceResp = runCli(['slice', 'act-pay', '--hops', '1']);
  mustOk(sliceResp, 'slice');
  assertEq(sliceResp.data.root, 'act-pay', 'slice root is act-pay');

  // 测试 evaluateGlobalImpact 按下游 kind 返回受影响模块
  // agg-order -> act-pay(Action) -> journey-checkout(Journey)
  // 对 agg-order 的 schema 做 confirm-module 评估时，下游应包含 Action 和 Journey 各自的模块
  const impactResp = runCli(['impact', 'agg-order']);
  mustOk(impactResp, 'impact agg-order');
  assert(impactResp.data.affected.includes('act-pay'), 'agg-order affects act-pay');
  assert(impactResp.data.affected.includes('journey-checkout'), 'agg-order affects journey-checkout');
}

function testConfirmDraftDeltaAndPropagation() {
  console.log('\n=== Suite: confirm-module + draft + propagate + delta ===');

  const blocked = runCli([
    'confirm-module',
    'act-pay',
    '--module',
    'plan',
    '--data',
    JSON.stringify('Updated payment plan with risk checks'),
  ]);
  mustOk(blocked, 'confirm-module blocked when downstream affected');
  const blockedData = blocked.data || {};
  assertEq(blockedData.blocked, true, 'blocked=true returned');
  assertEq(blockedData.draft_saved, true, 'draft saved when blocked');

  const draftRead = runCli(['draft-read', 'act-pay', '--module', 'plan']);
  mustOk(draftRead, 'draft-read');
  assert(draftRead.data && draftRead.data.draft && draftRead.data.draft.data, 'draft-read returns saved draft');

  // Remove dependent journey so confirm-module can pass
  mustOk(runCli(['delete', 'journey-checkout']), 'delete journey-checkout');

  const confirmPlan = runCli([
    'confirm-module',
    'act-pay',
    '--module',
    'plan',
    '--data',
    JSON.stringify('Updated payment plan with risk checks'),
  ]);
  mustOk(confirmPlan, 'confirm-module plan succeeds after removing dependent');
  assertEq(confirmPlan.data.blocked, false, 'confirm-module returns blocked=false');
  assert(Array.isArray(confirmPlan.data.marked_stale), 'confirm-module includes marked_stale array');

  const draftAfter = runCli(['draft-read', 'act-pay', '--module', 'plan']);
  mustOk(draftAfter, 'draft-read after confirm');
  assertEq(draftAfter.data.draft, null, 'draft cleared after successful confirm');

  const confirmRequiresState = runCli([
    'confirm-module',
    'act-pay',
    '--module',
    'requires_state',
    '--data',
    JSON.stringify([{ target: 'agg-order', type: 'schema', field: 'total_amount' }]),
  ]);
  mustOk(confirmRequiresState, 'confirm-module requires_state');
  assert(Array.isArray(confirmRequiresState.data.resonance_marked), 'resonance_marked exists');
  assert(confirmRequiresState.data.resonance_marked.includes('agg-order'), 'requires_state missing schema marks aggregate stale');

  const staleResp = runCli(['stale']);
  mustOk(staleResp, 'stale');
  const staleByCell = Object.fromEntries((staleResp.data.stale_cells || []).map((c) => [c.cell, c.stale_modules]));
  assert(Array.isArray(staleByCell['agg-order']), 'agg-order appears in stale list');
  assert(staleByCell['agg-order'].includes('schema'), 'agg-order schema stale');

  const updateAggSchema = runCli([
    'update',
    'agg-order',
    '--module',
    'schema',
    '--data',
    JSON.stringify([
      { name: 'id', type: 'string' },
      { name: 'total_amount', type: 'number' },
    ]),
  ]);
  mustOk(updateAggSchema, 'update aggregate schema');
  const propagateAgg = runCli(['propagate', 'agg-order']);
  mustOk(propagateAgg, 'propagate aggregate update');
  assert((propagateAgg.data.marked_stale || []).includes('act-pay'), 'aggregate update propagates to action');

  const confirmActAll = runCli(['confirm', 'act-pay', '--module', 'all']);
  mustOk(confirmActAll, 'confirm act-pay all');

  // Term impact
  const impactByTerms = runCli([
    'glossary-impact',
    '--data',
    JSON.stringify({ terms: ['total_amount'] }),
  ]);
  mustOk(impactByTerms, 'glossary-impact');
  assert((impactByTerms.data.affected_cells || []).includes('agg-order'), 'glossary-impact includes agg-order');

  // Delta workflow
  // 测试：Delta 模块必须匹配目标 Cell 的 kind
  const deltaWithContractForAgg = writeJson('delta-agg-with-contract.json', {
    id: 'delta-agg-bad',
    target: 'agg-order',
    intent: 'bad delta with contract for aggregate',
    contract: [{ when: 'x', then: 'y' }],
    depends_on: [],
  });
  mustFail(runCli(['delta-create', '--file', deltaWithContractForAgg]), 'delta with contract targeting Aggregate should fail');
  // 清理临时文件
  try { fs.unlinkSync(deltaWithContractForAgg); } catch {}

  const deltaFile = writeJson('delta-order-enrich.json', {
    id: 'delta-order-enrich',
    target: 'agg-order',
    intent: 'enrich aggregate',
    schema: [{ name: 'currency', type: 'string' }],
    states: [{ name: 'paid' }],
    invariants: ['currency must be ISO-4217'],
    depends_on: [],
  });
  mustOk(runCli(['delta-create', '--file', deltaFile]), 'delta-create');

  mustOk(runCli(['delta-list']), 'delta-list');
  const deltaRead = runCli(['delta-read', 'delta-order-enrich']);
  mustOk(deltaRead, 'delta-read');
  assert(Array.isArray(deltaRead.data.schema), 'delta-read includes schema module');

  const deltaUpdate = runCli([
    'delta-update',
    'delta-order-enrich',
    '--module',
    'intent',
    '--data',
    JSON.stringify('enrich aggregate v2'),
  ]);
  mustOk(deltaUpdate, 'delta-update');

  const preview = runCli(['merge-preview', 'delta-order-enrich']);
  mustOk(preview, 'merge-preview');
  assert((preview.data.merged.schema || []).some((f) => f.name === 'currency'), 'merge-preview merged schema');

  const mergeExec = runCli(['merge', 'delta-order-enrich']);
  mustOk(mergeExec, 'merge execute');
  assertEq(mergeExec.data.merged, true, 'merge returns merged=true');

  const deltaDeleteMissing = runCli(['delta-delete', 'delta-order-enrich']);
  mustFail(deltaDeleteMissing, 'delta already merged then delete should fail');

  const deltaArchiveFile = writeJson('delta-order-archive.json', {
    id: 'delta-order-archive',
    target: 'agg-order',
    intent: 'archive flow',
    schema: [{ name: 'archived_at', type: 'string' }],
    states: [{ name: 'archived' }],
    invariants: ['archived_at must be set'],
    depends_on: [],
  });
  mustOk(runCli(['delta-create', '--file', deltaArchiveFile]), 'delta-create for archive');
  const archiveResp = runCli(['archive', 'delta-order-archive']);
  mustOk(archiveResp, 'archive');
  assertEq(archiveResp.data.archived, true, 'archive returns archived=true');
}

function testErrorPaths() {
  console.log('\n=== Suite: error paths ===');

  const initAgain = runCli(['init']);
  mustOk(initAgain, 're-init should still succeed');

  const readMissingCell = runCli(['read', 'no-such-cell']);
  mustFail(readMissingCell, 'read missing cell');

  const badDepends = runCli([
    'create',
    '--data',
    JSON.stringify({
      id: 'bad-dep-cell',
      kind: 'Aggregate',
      intent: 'bad depends',
      depends_on: ['BadUppercase'],
    }),
  ]);
  mustFail(badDepends, 'create with invalid depends_on format');

  const invalidModule = runCli([
    'update',
    'agg-order',
    '--module',
    'invalid_mod',
    '--data',
    JSON.stringify('x'),
  ]);
  mustFail(invalidModule, 'update invalid module');
}

function testRootFlag() {
  console.log('\n=== Suite: --root flag ===');

  // 创建一个独立于 TEST_DIR 的外部项目目录
  const extDir = path.join(os.tmpdir(), `cell-sdd-ext-${Date.now()}`);
  fs.mkdirSync(extDir, { recursive: true });

  try {
    // 从 TEST_DIR（另一个目录）使用 --root 在 extDir 初始化
    const initResp = runCli(['init', '--root', extDir], TEST_DIR);
    mustOk(initResp, 'init with --root from different cwd');
    assert(fs.existsSync(path.join(extDir, '.sdd', 'glossary.yaml')), '.sdd created in --root directory');

    // 从 TEST_DIR 使用 --root 在 extDir 创建 Cell
    const createResp = runCli([
      'create',
      '--root', extDir,
      '--data',
      JSON.stringify({
        id: 'ext-agg',
        kind: 'Aggregate',
        intent: 'external aggregate',
        depends_on: [],
        schema: [{ name: 'id', type: 'string' }],
        states: [{ name: 'created' }],
        invariants: ['id unique'],
      }),
    ], TEST_DIR);
    mustOk(createResp, 'create cell with --root from different cwd');

    // 从 TEST_DIR 使用 --root 列出 extDir 的 Cell
    const listResp = runCli(['list', '--root', extDir], TEST_DIR);
    mustOk(listResp, 'list with --root from different cwd');
    assert((listResp.data.cells || []).some(c => c.id === 'ext-agg'), 'ext-agg appears in --root list');

    // 不传 --root 且 CWD 不在 extDir → 应找不到
    const noRootResp = runCli(['list'], TEST_DIR);
    // TEST_DIR 也有 .sdd/，所以 list 应成功但内容不同
    assert(!(noRootResp.data.cells || []).some(c => c.id === 'ext-agg'), 'ext-agg not in TEST_DIR list');

    // --root 指向不存在 .sdd/ 的目录 → 应失败
    const badDir = path.join(os.tmpdir(), `cell-sdd-noexist-${Date.now()}`);
    const badResp = runCli(['list', '--root', badDir], TEST_DIR);
    mustFail(badResp, 'list with --root pointing to non-initialized dir');
  } finally {
    fs.rmSync(extDir, { recursive: true, force: true });
  }
}

async function main() {
  console.log('Cell-SDD engine test runner');
  setup();

  try {
    testGlossaryAndInit();
    testCellValidationAndLifecycle();
    testConfirmDraftDeltaAndPropagation();
    testErrorPaths();
    testRootFlag();

    await runApiTests({
      testDir: TEST_DIR,
      serverPath: SERVER_PATH,
      assert,
      assertEq,
      runCli,
      writeJson,
    });

    const { runApiRootTests } = require('./api-tests');
    await runApiRootTests({
      serverPath: SERVER_PATH,
      assert,
      assertEq,
      runCli,
    });
  } catch (err) {
    failed += 1;
    errors.push(`Unexpected test exception: ${err.message}`);
    console.error(err.stack);
  } finally {
    teardown();
  }

  console.log('\n----------------------------------------');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  if (errors.length > 0) {
    console.log('Errors:');
    errors.forEach((e, idx) => console.log(`${idx + 1}. ${e}`));
  }
  console.log('----------------------------------------');

  process.exit(failed > 0 ? 1 : 0);
}

main();
