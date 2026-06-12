# Cell 创建 JSON 示例（Aggregate / Action / Journey）

## 约束总览

- `id` 必须是 `kebab-case`
- `kind` 只能是 `Aggregate | Action | Journey`
- `depends_on` 可为字符串数组，或 `{ "id": "...", "kind": "..." }` 对象数组
- 各 `kind` 可用模块受限（引擎会校验）

---

## 1) Aggregate

### 最小可用结构（推荐）
```json
{
  "id": "agg-order",
  "kind": "Aggregate",
  "intent": "维护订单聚合状态与不变量",
  "depends_on": [],
  "schema": [
    { "name": "id", "type": "string" }
  ],
  "states": [
    { "name": "created" }
  ],
  "invariants": [
    "id must be unique"
  ]
}
```

### 完整结构（含可选字段）
```json
{
  "id": "agg-order",
  "kind": "Aggregate",
  "intent": "维护订单聚合状态与不变量",
  "depends_on": [],
  "schema": [
    { "name": "id", "type": "string" },
    { "name": "total_amount", "type": "number" },
    { "name": "currency", "type": "string" }
  ],
  "states": [
    { "name": "created" },
    { "name": "paid" },
    { "name": "closed" }
  ],
  "invariants": [
    "id must be unique",
    "total_amount must be non-negative"
  ],
  "tags": ["core", "order"],
  "entity": "Order"
}
```

> Aggregate 不允许 `plan/contract/test/requires_state`

---

## 2) Action

### 最小可用结构
```json
{
  "id": "act-pay-order",
  "kind": "Action",
  "intent": "对订单执行支付",
  "depends_on": ["agg-order"],
  "plan": "执行支付校验并提交支付",
  "contract": [
    { "when": "payment requested", "then": "payment accepted" }
  ],
  "test": [
    {
      "scenario": "pay order success",
      "given": "order exists",
      "when": "pay order",
      "then": "order becomes paid"
    }
  ]
}
```

### 完整结构（contract v2 + requires_state）
```json
{
  "id": "act-pay-order",
  "kind": "Action",
  "intent": "对订单执行支付",
  "depends_on": [
    { "id": "agg-order", "kind": "call" }
  ],
  "plan": "校验订单状态与金额，发起支付，记录支付结果",
  "contract": [
    {
      "api": {
        "name": "PayOrder",
        "method": "POST",
        "path": "/orders/{id}/pay"
      },
      "request": {
        "params": [
          { "name": "id", "type": "string", "required": true, "description": "订单ID" }
        ],
        "query": [],
        "headers": [
          { "name": "X-Request-Id", "type": "string", "required": false }
        ],
        "body": [
          { "name": "amount", "type": "number", "required": true },
          { "name": "currency", "type": "string", "required": true }
        ]
      },
      "response": {
        "status": 200,
        "headers": [
          { "name": "Content-Type", "type": "string", "required": true }
        ],
        "body": [
          { "name": "payment_id", "type": "string", "required": true },
          { "name": "status", "type": "string", "required": true }
        ]
      },
      "errors": [
        { "status": 400, "code": "INVALID_AMOUNT", "message": "amount invalid" },
        { "status": 409, "code": "ORDER_NOT_PAYABLE", "message": "order state not payable" }
      ]
    }
  ],
  "test": [
    {
      "scenario": "pay order success",
      "given": "order is created with valid amount",
      "when": "submit pay request",
      "then": "response returns payment_id and status"
    },
    {
      "scenario": "order not payable",
      "given": "order is closed",
      "when": "submit pay request",
      "then": "response status is 409"
    }
  ],
  "requires_state": [
    { "target": "agg-order", "type": "state", "field": "paid" },
    { "target": "agg-order", "type": "schema", "field": "total_amount" }
  ],
  "tags": ["payment", "order"],
  "entity": "OrderPayment"
}
```

> Action 不允许 `schema/states/invariants`

---

## 3) Journey

### 最小可用结构
```json
{
  "id": "journey-checkout",
  "kind": "Journey",
  "intent": "编排结算流程",
  "depends_on": ["act-pay-order"],
  "plan": "flowchart TD\n  startNode[Start] --> payNode[act-pay-order]\n  payNode --> endNode[End]",
  "test": [
    {
      "scenario": "checkout success",
      "given": "order is valid",
      "when": "run checkout",
      "then": "payment action is executed"
    }
  ]
}
```

### 完整结构（编排主干 + 回退分支）
```json
{
  "id": "journey-checkout",
  "kind": "Journey",
  "intent": "编排结算主流程与失败回退",
  "depends_on": [
    { "id": "act-pay-order", "kind": "call" },
    { "id": "act-notify-user", "kind": "call" }
  ],
  "plan": "flowchart TD\n  startNode[Start] --> payNode[act-pay-order]\n  payNode -->|success| notifyNode[act-notify-user]\n  payNode -->|failed| rollbackNode[Rollback]\n  notifyNode --> endNode[End]\n  rollbackNode --> endNode",
  "test": [
    {
      "scenario": "checkout success path",
      "given": "payment succeeds",
      "when": "run checkout",
      "then": "notify action is executed"
    },
    {
      "scenario": "checkout rollback path",
      "given": "payment fails",
      "when": "run checkout",
      "then": "rollback branch is executed"
    }
  ],
  "tags": ["checkout", "orchestration"],
  "entity": "CheckoutFlow"
}
```

> Journey 不允许 `contract/schema/states/invariants/requires_state`
