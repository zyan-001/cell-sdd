# Engine CLI 完整速查

> 入口：`node engine/cell.js <command> [options]`  
> 推荐（Windows/PowerShell）：优先 `--file` 传 JSON。

## 1) 项目与基线

### `init`
- 用途：初始化 `.sdd/` 目录结构
- 输入 JSON：无
- 输出示例：
```json
{
  "initialized": true,
  "path": ".sdd"
}
```

### `glossary-read`
- 用途：读取术语基线
- 输入 JSON：无
- 输出示例：
```json
{
  "version": 2,
  "terms": {
    "Claim": {
      "definition": "A falsifiable statement.",
      "aliases": ["结论"]
    }
  }
}
```

### `glossary-update --file <json>`
- 用途：全量覆盖 Glossary
- 输入 JSON 结构：
```json
{
  "terms": {
    "<Term>": {
      "definition": "<string>",
      "aliases": ["<string>"]
    }
  }
}
```
- 输出示例：
```json
{
  "updated": true,
  "version": 3
}
```

### `glossary-add-term --file <json>`
- 用途：新增术语
- 输入 JSON 结构：
```json
{
  "term": "Claim",
  "definition": "A falsifiable statement.",
  "aliases": ["结论"]
}
```
- 输出示例：
```json
{
  "added": "Claim",
  "version": 4
}
```

### `glossary-check`
- 用途：检查 Cell 与基线一致性
- 输入 JSON：无
- 输出示例：
```json
{
  "conflicts": [],
  "missing_refs": []
}
```

### `glossary-impact --file <json>`
- 用途：评估术语变更影响
- 输入 JSON 结构：
```json
{
  "terms": ["user", "session"]
}
```
- 输出示例：
```json
{
  "terms": ["user", "session"],
  "affected_cells": ["agg-user", "act-login"]
}
```

## 2) Cell CRUD

### `create --file <json>`
- 用途：创建 Cell
- 输入 JSON：见 `ENGINE_CELL_JSON_EXAMPLES.md`
- 输出示例：
```json
{
  "created": "act-pay",
  "path": ".sdd/cells/act-pay.yaml"
}
```

### `read <cell-id>`
- 用途：读取 Cell 全量数据
- 输入 JSON：无
- 输出示例（截断）：
```json
{
  "id": "act-pay",
  "kind": "Action",
  "intent": "Pay an order",
  "depends_on": ["agg-order"],
  "plan": "Execute payment",
  "contract": [{"when": "x", "then": "y"}],
  "test": [{"scenario": "s", "given": "g", "when": "w", "then": "t"}]
}
```

### `update <cell-id> --module <mod> --file <json>`
- 用途：更新单模块

> ⚠️ **JSON 根结构规则**：`--file` 所指 JSON 文件的根结构**就是模块数据本身**，不要额外包裹。
>
> | 模块 | ✅ 正确 | ❌ 错误 |
> |------|---------|---------|
> | `intent` | `"新意图"` | `{"intent": "新意图"}` |
> | `plan` | `"新计划"` | `{"plan": "新计划"}` |
> | `schema` | `[{"name":"id","type":"string"}]` | `{"schema": [{"name":"id","type":"string"}]}` |
> | `contract` | `[{"api":...}]` | `{"contract": [{"api":...}]}` |
> | `test` | `[{"scenario":"..."}]` | `{"test": [{"scenario":"..."}]}` |
>
> 引擎会把文件内容直接写入目标模块——如果你多包了一层，引擎会把整个对象当作模块值，触发校验失败。

- 输入 JSON 结构：取决于 `<mod>`
  - `intent|plan`: string
  - `contract|test|depends_on|schema|states|invariants|requires_state`: array
- 输出示例：
```json
{
  "updated": "act-pay",
  "module": "plan"
}
```

### `delete <cell-id>`
- 用途：删除 Cell（并返回下游依赖信息）
- 输入 JSON：无
- 输出示例：
```json
{
  "deleted": "journey-checkout",
  "dependents": []
}
```

### `list`
- 用途：列出 Cell 摘要
- 输入 JSON：无
- 输出示例：
```json
{
  "cells": [
    {
      "id": "agg-order",
      "version": 1,
      "entity": null,
      "depends_on_count": 0,
      "stale": false,
      "kind": "Aggregate"
    }
  ]
}
```

## 3) Delta 管理

### `delta-create --file <json>`
- 输入 JSON 结构（最小）：
```json
{
  "id": "delta-order-enrich",
  "target": "agg-order",
  "intent": "enrich aggregate"
}
```
- 输出示例：
```json
{
  "created": "delta-order-enrich",
  "target": "agg-order",
  "path": ".sdd/deltas/delta-order-enrich.yaml"
}
```

### `delta-read <delta-id>`
- 输出示例（截断）：
```json
{
  "id": "delta-order-enrich",
  "target": "agg-order",
  "intent": "enrich aggregate",
  "schema": [{"name": "currency", "type": "string"}]
}
```

### `delta-update <delta-id> --module <mod> --file <json>`
- 输出示例：
```json
{
  "updated": "delta-order-enrich",
  "module": "intent"
}
```

### `delta-delete <delta-id>`
- 输出示例：
```json
{
  "deleted": "delta-order-enrich"
}
```

### `delta-list`
- 输出示例：
```json
{
  "deltas": [
    {
      "id": "delta-order-enrich",
      "target": "agg-order"
    }
  ]
}
```

### `merge-preview <delta-id>`
- 输出示例（截断）：
```json
{
  "delta": "delta-order-enrich",
  "target": "agg-order",
  "merged": {
    "id": "agg-order",
    "version": 2
  }
}
```

### `merge <delta-id>`
- 输出示例：
```json
{
  "merged": true,
  "delta": "delta-order-enrich",
  "target": "agg-order",
  "new_version": 2
}
```

### `archive <delta-id>`
- 输出示例：
```json
{
  "archived": true,
  "delta": "delta-order-archive",
  "target": "agg-order",
  "new_version": 3,
  "snapshot": ".sdd/archive/2026-06-12-order-archive/agg-order.v2.yaml",
  "propagated": ["act-pay"]
}
```

## 4) 图与传播

### `impact <cell-id>`
```json
{
  "source": "agg-order",
  "affected": ["act-pay", "journey-checkout"],
  "depth": {"act-pay": 1, "journey-checkout": 2}
}
```

### `deps <cell-id>`
```json
{
  "cell": "act-pay",
  "depends_on": ["agg-order"]
}
```

### `check`
```json
{
  "dangling_refs": [],
  "cycles": [],
  "gaps": [],
  "glossary_conflicts": [],
  "glossary_missing_refs": []
}
```

### `roots --threshold 2`
```json
{
  "roots": [
    {"cell": "agg-order", "in_degree": 2}
  ]
}
```

### `graph`
```json
{
  "mermaid": "graph TD\n  journey-checkout --> act-pay\n  act-pay --> agg-order"
}
```

### `slice <cell-id> --hops 1`
```json
{
  "root": "act-pay",
  "hops": 1,
  "cells": [
    {"id": "act-pay", "role": "root", "data": {"kind": "Action"}},
    {"id": "agg-order", "role": "dependency", "data": {"kind": "Aggregate"}}
  ]
}
```

### `propagate <cell-id>`
```json
{
  "source": "agg-order",
  "marked_stale": ["act-pay", "journey-checkout"]
}
```

### `stale`
```json
{
  "stale_cells": [
    {"cell": "act-pay", "stale_modules": ["plan", "contract"]}
  ]
}
```

### `dirty`
```json
{
  "dirty_cells": [
    {"cell": "act-pay", "dirty_modules": ["plan"]}
  ]
}
```

### `confirm <cell-id> [--module <mod|all>]`
```json
{
  "confirmed": "act-pay",
  "cleared": ["plan", "contract"]
}
```

### `confirm-module <cell-id> --module <mod> --file <json> [--force]`
- 成功输出示例：
```json
{
  "blocked": false,
  "updated": {"updated": "act-pay", "module": "plan"},
  "impact": {"source": "act-pay", "affected": []},
  "current_cell_impacted_modules": ["contract", "test"],
  "affected_cell_impacted_modules": ["plan", "contract", "test"],
  "marked_stale": [],
  "resonance_marked": [],
  "forced": false
}
```
- 阻断输出示例：
```json
{
  "blocked": true,
  "reasons": ["plan 设计变化可能影响共享约束与下游实现假设"],
  "impact": {"source": "act-pay", "affected": ["journey-checkout"]},
  "draft_saved": true,
  "draft_path": ".sdd/drafts/act-pay.plan.json"
}
```

### `draft-read <cell-id> --module <mod>`
```json
{
  "draft": {
    "cell": "act-pay",
    "module": "plan",
    "data": "Updated payment plan",
    "metadata": {
      "blocked": true,
      "reasons": ["..."]
    },
    "saved_at": "2026-06-12T10:00:00.000Z"
  }
}
```
