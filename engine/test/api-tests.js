'use strict';

const { spawn } = require('child_process');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServerReady(proc, timeoutMs = 10000) {
  const start = Date.now();
  let out = '';
  let err = '';

  proc.stdout.on('data', (chunk) => {
    out += chunk.toString();
  });
  proc.stderr.on('data', (chunk) => {
    err += chunk.toString();
  });

  while (Date.now() - start < timeoutMs) {
    if (out.includes('Cell-SDD Server running')) {
      return;
    }
    if (proc.exitCode !== null) {
      throw new Error(`server exited early: ${proc.exitCode}, stderr=${err}`);
    }
    await sleep(100);
  }

  throw new Error(`server start timeout, stdout=${out}, stderr=${err}`);
}

async function requestJson(port, method, route, body) {
  const resp = await fetch(`http://127.0.0.1:${port}${route}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  let payload = null;
  try {
    payload = await resp.json();
  } catch {
    payload = null;
  }

  return { status: resp.status, ok: resp.ok, data: payload };
}

async function runApiTests(ctx) {
  const {
    testDir, serverPath, assert, assertEq, runCli,
  } = ctx;

  console.log('\n=== Suite: server API integration ===');

  // Ensure base .sdd exists for server middleware
  const initResp = runCli(['init'], testDir);
  assert(initResp.ok, 'api suite init should succeed');

  const port = 3500 + Math.floor(Math.random() * 500);
  const serverProc = spawn('node', [serverPath], {
    cwd: testDir,
    env: {
      ...process.env,
      PORT: String(port),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  try {
    await waitForServerReady(serverProc);

    const g1 = await requestJson(port, 'GET', '/api/glossary');
    assert(g1.ok, 'GET /api/glossary');
    assertEq(typeof g1.data.version, 'number', '/api/glossary has version');

    const addTerm = await requestJson(port, 'POST', '/api/glossary/terms', {
      term: 'ApiTerm',
      definition: 'added via api test',
      aliases: ['api'],
    });
    assertEq(addTerm.status, 200, 'POST /api/glossary/terms success');

    const addTermDup = await requestJson(port, 'POST', '/api/glossary/terms', {
      term: 'ApiTerm',
      definition: 'dup',
      aliases: [],
    });
    assertEq(addTermDup.status, 400, 'POST /api/glossary/terms duplicate fails');

    const aggCreate = await requestJson(port, 'POST', '/api/cells', {
      id: 'agg-api',
      kind: 'Aggregate',
      intent: 'api aggregate',
      depends_on: [],
      schema: [{ name: 'id', type: 'string' }],
      states: [{ name: 'created' }],
      invariants: ['id unique'],
    });
    assertEq(aggCreate.status, 200, 'POST /api/cells aggregate');

    const actionCreate = await requestJson(port, 'POST', '/api/cells', {
      id: 'act-api',
      kind: 'Action',
      intent: 'api action',
      depends_on: ['agg-api'],
      plan: 'api plan',
      contract: [{ when: 'x', then: 'y' }],
      test: [{ scenario: 's', given: 'g', when: 'w', then: 't' }],
      requires_state: [{ target: 'agg-api', type: 'state', field: 'created' }],
    });
    assertEq(actionCreate.status, 200, 'POST /api/cells action');

    const listCells = await requestJson(port, 'GET', '/api/cells');
    assertEq(listCells.status, 200, 'GET /api/cells');
    assert((listCells.data.cells || []).some((c) => c.id === 'act-api'), 'cell list contains act-api');

    const readAction = await requestJson(port, 'GET', '/api/cells/act-api');
    assertEq(readAction.status, 200, 'GET /api/cells/:id');
    assertEq(readAction.data.kind, 'Action', 'read action kind');

    const updateAction = await requestJson(port, 'PUT', '/api/cells/act-api/plan', 'plan via api');
    assertEq(updateAction.status, 200, 'PUT /api/cells/:id/:module');

    const badUpdate = await requestJson(port, 'PUT', '/api/cells/agg-api/contract', [{ when: 'x', then: 'y' }]);
    assertEq(badUpdate.status, 400, 'aggregate cannot update contract by api');

    // blocked confirm-module due downstream dependency
    const journeyCreate = await requestJson(port, 'POST', '/api/cells', {
      id: 'journey-api',
      kind: 'Journey',
      intent: 'journey for block',
      depends_on: ['act-api'],
      plan: 'flowchart TD\n  s[Start] --> a[act-api]\n  a --> e[End]',
      test: [{ scenario: 's', given: 'g', when: 'w', then: 't' }],
    });
    assertEq(journeyCreate.status, 200, 'POST /api/cells journey');

    const confirmBlocked = await requestJson(port, 'POST', '/api/cells/act-api/confirm-module', {
      module: 'plan',
      data: 'updated plan by api',
    });
    assertEq(confirmBlocked.status, 409, 'POST /api/cells/:id/confirm-module blocked');
    assertEq(confirmBlocked.data.blocked, true, 'blocked response payload');

    const draftRead = await requestJson(port, 'GET', '/api/cells/act-api/drafts/plan');
    assertEq(draftRead.status, 200, 'GET /api/cells/:id/drafts/:module');
    assert(draftRead.data.draft !== null, 'draft exists');

    const graph = await requestJson(port, 'GET', '/api/graph');
    assertEq(graph.status, 200, 'GET /api/graph');
    const graphData = await requestJson(port, 'GET', '/api/graph/data');
    assertEq(graphData.status, 200, 'GET /api/graph/data');
    assert(Array.isArray(graphData.data.nodes), '/api/graph/data nodes array');

    const check = await requestJson(port, 'GET', '/api/check');
    assertEq(check.status, 200, 'GET /api/check');
    const stale = await requestJson(port, 'GET', '/api/stale');
    assertEq(stale.status, 200, 'GET /api/stale');

    const impact = await requestJson(port, 'GET', '/api/cells/agg-api/impact');
    assertEq(impact.status, 200, 'GET /api/cells/:id/impact');

    const deps = await requestJson(port, 'GET', '/api/cells/act-api/deps');
    assertEq(deps.status, 200, 'GET /api/cells/:id/deps');

    const roots = await requestJson(port, 'GET', '/api/roots?threshold=0');
    assertEq(roots.status, 200, 'GET /api/roots');

    const slice = await requestJson(port, 'GET', '/api/cells/act-api/slice?hops=1');
    assertEq(slice.status, 200, 'GET /api/cells/:id/slice');

    const glossImpact = await requestJson(port, 'POST', '/api/glossary/impact', { terms: ['api'] });
    assertEq(glossImpact.status, 200, 'POST /api/glossary/impact');
    assert(Array.isArray(glossImpact.data.affected_cells), 'glossary impact affected_cells array');

    const deltaCreate = await requestJson(port, 'POST', '/api/deltas', {
      id: 'delta-api',
      target: 'agg-api',
      intent: 'api delta',
      schema: [{ name: 'status', type: 'string' }],
      states: [{ name: 'active' }],
      invariants: ['status must be set'],
      depends_on: [],
    });
    assertEq(deltaCreate.status, 200, 'POST /api/deltas');

    const deltaList = await requestJson(port, 'GET', '/api/deltas');
    assertEq(deltaList.status, 200, 'GET /api/deltas');
    const deltaRead = await requestJson(port, 'GET', '/api/deltas/delta-api');
    assertEq(deltaRead.status, 200, 'GET /api/deltas/:id');
    const deltaUpdate = await requestJson(port, 'PUT', '/api/deltas/delta-api/intent', 'delta intent updated');
    assertEq(deltaUpdate.status, 200, 'PUT /api/deltas/:id/:module');

    const deltaPreview = await requestJson(port, 'GET', '/api/deltas/delta-api/merge-preview');
    assertEq(deltaPreview.status, 200, 'GET /api/deltas/:id/merge-preview');
    const deltaMerge = await requestJson(port, 'POST', '/api/deltas/delta-api/merge');
    assertEq(deltaMerge.status, 200, 'POST /api/deltas/:id/merge');

    const deltaDeleteMissing = await requestJson(port, 'DELETE', '/api/deltas/delta-api');
    assertEq(deltaDeleteMissing.status, 404, 'DELETE merged delta returns 404');

    const deltaArchiveCreate = await requestJson(port, 'POST', '/api/deltas', {
      id: 'delta-api-archive',
      target: 'agg-api',
      intent: 'archive',
      schema: [{ name: 'archived_at', type: 'string' }],
      depends_on: [],
    });
    assertEq(deltaArchiveCreate.status, 200, 'POST /api/deltas archive case');
    const deltaArchive = await requestJson(port, 'POST', '/api/deltas/delta-api-archive/archive');
    assertEq(deltaArchive.status, 200, 'POST /api/deltas/:id/archive');

    const deleteCell = await requestJson(port, 'DELETE', '/api/cells/journey-api');
    assertEq(deleteCell.status, 200, 'DELETE /api/cells/:id');

    const badCellRead = await requestJson(port, 'GET', '/api/cells/no-such-cell');
    assertEq(badCellRead.status, 404, 'GET missing cell returns 404');

    // 测试 Delta kind 校验：contract 不能指向 Aggregate
    const deltaWithContractForAgg = await requestJson(port, 'POST', '/api/deltas', {
      id: 'delta-agg-bad',
      target: 'agg-api',
      intent: 'bad delta with contract',
      contract: [{ when: 'x', then: 'y' }],
      depends_on: [],
    });
    assertEq(deltaWithContractForAgg.status, 400, 'Delta with contract targeting Aggregate should fail');
  } finally {
    serverProc.kill('SIGTERM');
    await sleep(100);
    if (serverProc.exitCode === null) {
      serverProc.kill('SIGKILL');
    }
  }
}

async function runApiRootTests(ctx) {
  const { serverPath, assert, assertEq } = ctx;
  const os = require('os');
  const path = require('path');

  console.log('\n=== Suite: server --root flag ===');

  // 创建独立项目目录
  const extDir = path.join(os.tmpdir(), `cell-sdd-ext-api-${Date.now()}`);
  const fs = require('fs');
  fs.mkdirSync(extDir, { recursive: true });

  // 用 CLI 在 extDir 初始化
  ctx.runCli(['init', '--root', extDir], extDir);

  const port = 3600 + Math.floor(Math.random() * 500);
  // 从另一个目录启动 server，但传 --root 指向 extDir
  const serverProc = spawn('node', [serverPath, '--root', extDir], {
    cwd: os.tmpdir(),  // CWD 不是 extDir，验证 --root 生效
    env: {
      ...process.env,
      PORT: String(port),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  try {
    await waitForServerReady(serverProc);

    // 验证 API 指向 --root 目录
    const listResp = await requestJson(port, 'GET', '/api/cells');
    assertEq(listResp.status, 200, 'GET /api/cells with --root');
    assert(Array.isArray(listResp.data.cells), 'cells array with --root');

    const glossaryResp = await requestJson(port, 'GET', '/api/glossary');
    assertEq(glossaryResp.status, 200, 'GET /api/glossary with --root');
  } finally {
    serverProc.kill('SIGTERM');
    await sleep(100);
    if (serverProc.exitCode === null) {
      serverProc.kill('SIGKILL');
    }
    fs.rmSync(extDir, { recursive: true, force: true });
  }
}

module.exports = { runApiTests, runApiRootTests };
