# confirm-module 与 Delta 工作流

## A. `confirm-module` 阻断与草稿处理

## 1) 正常调用
```bash
node engine/cell.js confirm-module act-pay --module plan --file payload.json
```

## 2) 被阻断（CLI）

当评估到“会影响下游或破坏约束”时，CLI 不会报错退出，而会返回：

```json
{
  "blocked": true,
  "reasons": ["plan 设计变化可能影响共享约束与下游实现假设"],
  "impact": { "source": "act-pay", "affected": ["journey-checkout"] },
  "draft_saved": true,
  "draft_path": ".sdd/drafts/act-pay.plan.json"
}
```

- 语义：更新被拦截，草稿已保存。
- 下一步：先修复影响面，再重提确认；或明确风险后使用 `--force`。

## 3) 被阻断（HTTP API）

`POST /api/cells/:id/confirm-module` 在阻断场景返回 `409`：

```json
{
  "blocked": true,
  "reasons": ["..."],
  "impact": { "source": "act-pay", "affected": ["journey-checkout"] },
  "draft_saved": true,
  "draft_path": ".sdd/drafts/act-pay.plan.json"
}
```

## 4) 读取草稿恢复上下文

CLI：
```bash
node engine/cell.js draft-read act-pay --module plan
```

返回：
```json
{
  "draft": {
    "cell": "act-pay",
    "module": "plan",
    "data": "Updated payment plan",
    "metadata": {
      "blocked": true,
      "reasons": ["..."]
    }
  }
}
```

## 5) `--force` 使用场景

仅在以下情况使用：
- 已与用户确认“接受影响范围与风险”；
- 确认下游会进入立即修复循环（非放任 stale）。

调用：
```bash
node engine/cell.js confirm-module act-pay --module plan --file payload.json --force
```

输出里 `forced: true` 表示本次属于“阻断后强制提交”。

---

## B. Delta 生命周期（create -> update -> merge-preview -> archive）

## 1) create
```bash
node engine/cell.js delta-create --file delta.json
```

`delta.json` 示例：
```json
{
  "id": "delta-order-enrich",
  "target": "agg-order",
  "intent": "enrich aggregate",
  "schema": [{ "name": "currency", "type": "string" }],
  "states": [{ "name": "paid" }],
  "invariants": ["currency must be ISO-4217"],
  "depends_on": []
}
```

## 2) update
```bash
node engine/cell.js delta-update delta-order-enrich --module intent --data "\"enrich aggregate v2\""
```

## 3) merge-preview
```bash
node engine/cell.js merge-preview delta-order-enrich
```

返回 `merged` 预览对象，不落盘。

## 4) archive
```bash
node engine/cell.js archive delta-order-enrich
```

返回示例：
```json
{
  "archived": true,
  "delta": "delta-order-enrich",
  "target": "agg-order",
  "new_version": 3,
  "snapshot": ".sdd/archive/2026-06-12-order-enrich/agg-order.v2.yaml",
  "propagated": ["act-pay"]
}
```

`archive` 会：
- 先保存快照与 delta 文件到 `.sdd/archive/...`
- 再执行合并
- 最后执行传播并标记下游 stale
