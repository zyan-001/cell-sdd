# 共振触发与常见错误排查

## 1) 共振触发场景：`requires_state` -> Aggregate stale

当 Action 的 `requires_state` 被确认时，引擎会做“目标聚合能力检查”：

- `type: "schema"`：检查 `target` Aggregate 的 `schema` 是否存在 `field`
- `type: "state"`：检查 `target` Aggregate 的 `states` 是否存在 `field`

若缺失，则自动把目标 Aggregate 对应模块标记为 stale。

## 示例

`requires_state` 提交：
```json
[
  { "target": "agg-order", "type": "schema", "field": "total_amount" },
  { "target": "agg-order", "type": "state", "field": "paid" }
]
```

若 `agg-order` 尚无 `total_amount` 或 `paid`，返回中的 `resonance_marked` 会包含 `agg-order`。

---

## 2) 修复循环（推荐）

1. `stale` 查看黄灯节点
2. 更新被标黄的 Aggregate（如补齐 `schema/states`）
3. `propagate <aggregate-id>` 推送变更
4. 修复受影响 Action/Journey 的 `plan/contract/test`
5. `confirm-module` 或 `confirm` 清理 stale
6. 循环直到 `stale_cells` 为空

---

## 3) 常见错误与排查

## A. 校验失败（`校验失败: ...`）
症状：
- create/update/delta-create/delta-update 直接失败

高频原因：
- `id` 非 `kebab-case`
- 模块类型不匹配（如 `intent` 传了对象）
- kind 模块越界（如 Aggregate 更新 `contract`）
- contract v2 字段不完整或 status 非法

排查：
1. 对照 `ENGINE_CELL_JSON_EXAMPLES.md` 与 `ENGINE_CONTRACT_V2.md`
2. 确认模块与 kind 匹配
3. 优先用 `--file`，避免命令行转义污染 JSON

## B. 悬挂引用（dangling refs）
症状：
- `check` 返回 `dangling_refs` 非空

含义：
- 某 Cell 的 `depends_on` 指向了不存在的 Cell

排查：
1. `check` 定位 `cell` 与 `ref`
2. 修正 `depends_on` 或补建目标 Cell
3. 复跑 `check`

## C. 循环依赖（cycles）
症状：
- `check` 返回 `cycles` 非空

排查：
1. 依据 cycle 路径打断至少一条依赖边
2. 让 Journey 只编排，不反向依赖下游实现细节
3. 复跑 `check` 验证无环

## D. confirm-module 被阻断
症状：
- CLI 返回 `blocked: true`（HTTP 返回 409）

排查：
1. 看 `reasons` 与 `impact.affected`
2. `draft-read` 取回草稿，避免重写
3. 先修复下游，再重提确认
4. 必要且经用户确认后才 `--force`

## E. stale 清不掉
症状：
- 多轮修复后 `stale` 仍非空

排查：
1. 确认是否只更新了内容但未 `confirm-module/confirm`
2. 看是否有新传播再次打黄（上游仍在改）
3. 固化顺序：先 Aggregate 后 Action 再 Journey

## F. dirty 长期不清
症状：
- `dirty` 一直存在

机制说明：
- dirty 清理依赖“下游 stale 全部清零”

排查：
1. 对 dirty cell 跑影响分析
2. 确保其下游每个 stale 都处理并确认

---

## 4) 最小体检清单（执行前）

- `node engine/cell.js check`
- `node engine/cell.js stale`
- `node engine/cell.js dirty`

只要 `stale_cells` 非空，就不应进入实现阶段。
