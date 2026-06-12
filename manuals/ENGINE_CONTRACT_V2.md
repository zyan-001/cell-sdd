# contract v2 契约格式详解

`contract` 是数组。每一项支持两种格式：

- 兼容旧格式：`{ "when": "...", "then": "..." }`
- 推荐 v2 格式：`{ "api": ..., "request": ..., "response": ..., "errors": ... }`

---

## v2 单项完整结构

```json
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
    "query": [
      { "name": "dry_run", "type": "boolean", "required": false }
    ],
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
```

---

## 字段级约束

## `api`
- `api.name`：必填，非空字符串
- `api.method`：必填，非空字符串，且必须是 HTTP 方法之一  
  (`GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD`)
- `api.path`：必填，非空字符串

## `request`
- 必填对象
- `params/query/headers/body`：可选；若提供必须是数组
- 数组元素字段对象格式：
  - `name`：必填，非空字符串
  - `type`：必填，非空字符串
  - `required`：可选，布尔值
  - `description`：可选，字符串

## `response`
- 必填对象
- `status`：必填，100-599 整数
- `headers/body`：可选；若提供必须是字段数组（同上）

## `errors`
- 可选；若提供必须是数组
- 每项结构：
  - `status`：100-599 整数
  - `code`：非空字符串
  - `message`：非空字符串

---

## 常见校验失败

- `contract` 不是非空数组：`contract: 必须是非空数组`
- `api.method` 非法：`contract[i].api.method: 必须是有效 HTTP 方法`
- `response.status` 非法：`contract[i].response.status: 必须是 100-599 的整数`
- 字段缺 `name/type`：`contract[i].request.body[j].name/type ...`

---

## 设计建议

- 对内流程动作，可先用 legacy `when/then` 快速建模；
- 需要 API 级联调、Mock、自动生成测试时，优先用 v2；
- 同一 Action 允许 `contract` 数组里并存多条接口契约（如主接口+回调）。
