# Cell-Based SDD — 可执行设计文档

## 1. 概述

Cell-Based SDD 是一个 Trae SOLO Skill，将规范驱动开发（SDD）重构为基于 Cell 的图结构模型，融合 DDD 思维，通过全局基线（统一语言/实体字典）保证语义一致性，依赖图自动推导变更影响，Delta 机制支持安全迭代。

### 1.1 核心设计决策

| 决策项 | 选择 |
|--------|------|
| 执行方式 | **所有操作通过引擎（Node.js CLI）执行，LLM 不直接读写文件** |
| 触发方式 | 手动调用 |
| 人机分工 | LLM 主导，人类在关键节点审批 |
| 引擎语言 | Node.js |
| Skill 结构 | 单一 Skill |
| 工作流边界 | 需求澄清 → 基线建立 → 规格确认 → 变更响应 → TDD 实现（全流程） |
| Cell 存储位置 | `.sdd/` 隐藏目录 |
| 全局基线 | `.sdd/glossary.yaml` 独立文件，结构化实体定义 |
| 实现验证 | 全自动：LLM 按 Cell 生成代码和测试并自动运行 |

### 1.2 引擎架构

LLM 与 Cell-Based SDD 的所有交互都通过引擎完成。引擎是一个统一的 Node.js CLI 工具，提供完整的 CRUD、图算法、Delta 管理、基线管理能力。LLM 只需通过 RunCommand 调用引擎命令，不直接接触任何文件。

```
┌─────────┐    RunCommand     ┌──────────────────┐    读写     ┌───────────────┐
│   LLM   │ ───────────────→ │  引擎 (cell.js)  │ ─────────→ │  .sdd/        │
│         │ ←─────────────── │                  │ ←───────── │  YAML 文件     │
└─────────┘    JSON stdout    └──────────────────┘            └───────────────┘
```

引擎的职责：
- **基线管理**：统一语言/实体字典的读写与校验，Cell 引用的术语必须存在于基线
- **数据校验**：写入前校验 Cell 格式、id 唯一性、depends_on 有效性
- **原子操作**：创建/修改/删除保证文件系统一致性
- **图计算**：影响分析、一致性检查、变更传播
- **Delta 管理**：合并、归档、快照
- **统一输出**：所有命令输出 JSON，方便 LLM 解析

---

## 2. Skill 文件结构

```
notebook-sdd/
├── design.md                          # 本文档
├── skill/
│   ├── skill.md                       # Skill 指令文件（LLM 的行为指南）
│   └── engine/
│       ├── package.json
│       ├── cell.js                    # 统一引擎入口
│       └── lib/
│           ├── store.js               # 存储层：YAML 文件读写
│           ├── graph.js               # 图算法：影响分析、一致性检查、传播
│           ├── merge.js               # 合并逻辑：Delta 合并规则
│           ├── validate.js            # 校验：Cell 格式、id 唯一性等
│           └── glossary.js            # 基线管理：实体字典读写与校验
└── examples/                          # 示例文件
    ├── user-auth-login.yaml
    ├── delta-add-oauth2.yaml
    └── glossary-example.yaml
```

---

## 3. 项目目录结构（引擎初始化后）

当 LLM 在用户项目中执行 `node cell.js init` 时，生成以下结构：

```
user-project/
├── .sdd/
│   ├── glossary.yaml                  # 全局基线：统一语言/实体字典
│   ├── cells/                         # 主 Cell 目录
│   │   ├── user-auth-login.yaml
│   │   ├── user-store.yaml
│   │   └── rate-limiter.yaml
│   ├── deltas/                        # 活跃 Delta（未归档）
│   │   └── delta-add-oauth2.yaml
│   └── archive/                       # 已归档 Delta
│       └── 2026-06-05-add-oauth2/
│           ├── delta-add-oauth2.yaml
│           └── user-auth-login.v1.yaml
├── src/                               # 项目源代码（由 Cell 驱动生成）
└── ...
```

---

## 4. 数据模型

### 4.1 全局基线（glossary.yaml）

全局基线是项目的唯一语义源，定义统一语言和实体字典。Cell 仅可引用或扩展基线中的概念，不可私自重定义同名概念。

```yaml
version: 1                             # 基线版本，每次更新 +1

entities:
  user:
    attributes:                        # 实体属性
      - name: id
        type: uuid
        description: 用户唯一标识
      - name: username
        type: string
        description: 登录用户名，唯一
      - name: password_hash
        type: string
        description: bcrypt 哈希后的密码
      - name: email
        type: string
        description: 用户邮箱
    capabilities:                      # 实体能力（与 Cell 对应）
      - user-auth-login
      - user-register
      - user-profile
    states:                            # 实体状态机
      - name: active
        description: 正常状态
      - name: suspended
        description: 已封禁
      - name: unverified
        description: 未验证邮箱
    transitions:
      - from: unverified
        to: active
        trigger: email-verified
      - from: active
        to: suspended
        trigger: admin-suspend
    relations:                         # 实体间关系
      - target: session
        kind: one-to-many
        description: 一个用户可有多个会话
      - target: role
        kind: many-to-many
        description: 用户可拥有多个角色

  session:
    attributes:
      - name: id
        type: uuid
        description: 会话唯一标识
      - name: token
        type: string
        description: JWT 令牌
      - name: expires_at
        type: datetime
        description: 过期时间
    capabilities:
      - session-create
      - session-validate
      - session-revoke
    states:
      - name: active
        description: 会话有效
      - name: expired
        description: 会话已过期
      - name: revoked
        description: 会话已撤销
    transitions:
      - from: active
        to: expired
        trigger: timeout
      - from: active
        to: revoked
        trigger: user-logout
    relations:
      - target: user
        kind: many-to-one
        description: 会话属于用户

```

**基线校验规则**：
- Cell 中引用的实体名称必须在 `entities` 中存在
- Cell 的 `id` 如果属于某实体的 `capabilities`，该实体必须存在
- 基线更新时，引擎自动检查引用该实体的所有 Cell 是否受影响

### 4.2 Cell

```yaml
id: user-auth-login                    # 唯一标识，kebab-case
version: 1                             # 合并次数，初始为 1
kind: feature                          # 可选：Cell 角色/层级
tags:                                  # 可选：自由标签
  - auth
  - security
entity: user                           # 可选：所属实体（引用 glossary 中的实体名）

intent: |
  用户需要通过用户名/密码认证以访问受保护资源。
  解决"谁在访问"的身份确认问题。

plan: |
  - 使用 JWT 令牌作为认证凭证，24h 过期
  - 密码使用 bcrypt 哈希存储
  - 速率限制防止暴力破解（5次/分钟/IP）

contract:
  - api:
      name: user-login
      method: POST
      path: /auth/login
    request:
      body:
        - name: username
          type: string
          required: true
        - name: password
          type: string
          required: true
    response:
      status: 200
      body:
        - name: token
          type: jwt
          required: true
    errors:
      - status: 401
        code: INVALID_CREDENTIALS
        message: 用户名或密码错误
      - status: 429
        code: TOO_MANY_REQUESTS
        message: 登录请求过于频繁

test:
  - scenario: 有效登录
    given: 用户 "alice" 存在，密码为 "secret123"
    when: POST /auth/login { username: "alice", password: "secret123" }
    then: status=200, body.token 为有效 JWT
  - scenario: 密码错误
    given: 用户 "alice" 存在
    when: POST /auth/login { username: "alice", password: "wrong" }
    then: status=401, body.error 不包含"用户不存在"等提示
  - scenario: 速率限制触发
    given: 同一 IP 已连续 5 次登录失败
    when: POST /auth/login { username: "alice", password: "wrong" }
    then: status=429, header 包含 Retry-After

depends_on:                              # 支持两种格式（见下方说明）
  - id: user-store
    kind: data-source
  - id: rate-limiter
    kind: call

# 运行时状态（由引擎管理，可选字段）
_stale:
  plan: false
  contract: false
```

### 4.3 Delta Cell

```yaml
id: delta-add-oauth2                   # delta- 前缀标识
target: user-auth-login                # 指向主 Cell

intent: |
  新增 OAuth2 登录方式，与现有用户名/密码并存。
  解决第三方账号快速登录的需求。

plan: |
  - 集成标准 OAuth2 Authorization Code Flow
  - 保留用户名/密码登录作为降级方案
  - OAuth2 用户首次登录自动创建关联账号

contract:
  - when: 提交有效 OAuth2 授权码
    then: 交换令牌，创建/关联用户，返回 JWT
  - when: 提交无效或过期授权码
    then: 返回 401，提示授权码无效
  - when: OAuth2 Provider 不可用
    then: 返回 503，提示第三方登录暂不可用

test:
  - scenario: OAuth2 首次登录
    given: OAuth2 Provider 已配置，用户 "bob@gmail.com" 不存在
    when: POST /auth/oauth2/callback { code: "valid_code", provider: "google" }
    then: status=200, body.token 为有效 JWT, 自动创建用户
  - scenario: OAuth2 关联登录
    given: 用户 "bob@gmail.com" 已通过 OAuth2 创建
    when: POST /auth/oauth2/callback { code: "valid_code", provider: "google" }
    then: status=200, body.token 为有效 JWT

depends_on:
  - id: oauth2-provider
    kind: call
```

### 4.4 合并规则

Delta 归档时，按以下规则合并到主 Cell：

| 模块 | 合并策略 |
|------|----------|
| intent | 追加，用 `---` 分隔原始 intent 和 delta intent |
| plan | 追加，同上 |
| contract | 合并列表，delta 中的 when/then 条目追加到主 Cell 的 contract 列表 |
| test | 合并列表，delta 中的测试场景追加到主 Cell 的 test 列表 |
| depends_on | 合并列表，按 id 去重，保留第一次出现的格式（含 kind） |
| version | +1 |

### 4.5 depends_on 格式说明

depends_on 支持两种格式，引擎对两种格式完全兼容：

**简写格式（字符串数组）**：
```yaml
depends_on:
  - user-store
  - rate-limiter
```

**完整格式（对象数组，带 kind 语义标签）**：
```yaml
depends_on:
  - id: user-store
    kind: data-source
  - id: rate-limiter
    kind: call
```

kind 字段用于表达依赖的语义关系，推荐值：

| kind | 含义 | 示例 |
|------|------|------|
| `compose` | 组合关系——目标 Cell 是当前 Cell 的组成部分 | 订单 Cell compose 订单项 Cell |
| `call` | 调用关系——当前 Cell 运行时调用目标 Cell 的功能 | 登录 Cell call 速率限制 Cell |
| `event` | 事件关系——当前 Cell 监听或派发目标 Cell 的事件 | 通知 Cell event 订单 Cell |
| `data-source` | 数据源关系——当前 Cell 依赖目标 Cell 提供的数据 | 登录 Cell data-source 用户存储 Cell |
| `other` | 其他关系 | — |

kind 不做枚举强制校验，任何非空字符串均可。引擎在构建依赖图时只关心 id，忽略 kind——kind 是留给人类和 LLM 理解依赖语义的元信息。

**推荐**：LLM 创建新 Cell 时优先使用对象格式（带 kind），以便保留依赖语义。已有的字符串格式 Cell 无需迁移。

### 4.6 Cell 角色/层级（kind 与 tags）

Cell 支持两个可选字段，用于标记角色和层级：

- **kind**：`string`，标记 Cell 的角色/层级。推荐值：
  - `feature` — 描述单一功能的 Cell（默认）
  - `entity` — 聚合多个功能的领域实体 Cell（如 user-store 聚合了用户 CRUD 全部行为）
  - `event-engine` — 事件驱动的引擎 Cell（如消息总线、事件派发器）
  - 其他任意非空字符串均可，不做枚举强制校验

- **tags**：`string[]`，自由标签，用于跨维度分类。例如 `["auth", "security"]`、`["core", "infra"]`

- **entity**：`string`，可选，引用 glossary.yaml 中的实体名称，标记该 Cell 属于哪个领域实体

两个字段都是可选的，不出现时保持当前行为不变。`list` 命令返回中会带出 kind 和 entity 字段。

### 4.6.1 Cell.kind 与 depends_on[].kind 的区别

Cell 模型中有两处使用了 `kind` 字段名，含义完全不同，不应混淆：

| 字段 | 位置 | 含义 | 示例值 |
|------|------|------|--------|
| `Cell.kind` | Cell 顶层 | 标记 Cell **自身**的角色/层级——"我是谁" | `feature`、`entity`、`event-engine` |
| `depends_on[].kind` | depends_on 元素上 | 标记**依赖关系**的语义——"我和别人是什么关系" | `compose`、`call`、`event`、`data-source` |

两者互不影响：Cell.kind 决定 Cell 在建模中的角色，depends_on[].kind 只是依赖边的语义标注。引擎在建图时只关心 depends_on 中的 id，对两种 kind 均不参与图算法计算。

### 4.7 stale 标记

Cell 被标记为 stale 时，在 YAML 中增加 `_stale` 字段：

```yaml
_stale:
  plan: true          # plan 模块待确认
  contract: true      # contract 模块待确认
```

- `_stale` 仅作为提醒机制，不影响 Cell 的语义
- 人类确认后通过引擎命令清除 stale 标记

---

## 5. 引擎命令规格

引擎是唯一的操作入口，LLM 通过 RunCommand 调用。所有命令输出 JSON 到 stdout，错误输出到 stderr。

### 5.1 项目管理

```bash
# 初始化项目：创建 .sdd/ 目录结构（含空 glossary.yaml）
node cell.js init
# 输出: { "initialized": true, "path": ".sdd" }
```

### 5.2 全局基线管理

```bash
# 读取全局基线
node cell.js glossary-read
# 输出: { "version": 1, "entities": { ... } }

# 更新全局基线（全量替换）
node cell.js glossary-update --data '<json>'
# 示例:
node cell.js glossary-update --data '{"entities":{"user":{...}}}'
# 输出: { "updated": true, "version": 2, "affected_cells": ["user-auth-login", "user-register"] }
# 校验: 实体名唯一性、引用完整性

# 向基线添加实体
node cell.js glossary-add-entity --data '<json>'
# 示例:
node cell.js glossary-add-entity --data '{"name":"order","attributes":[...],"capabilities":[...],"states":[...],"relations":[...]}'
# 输出: { "added": "order", "version": 2 }

# 检查 Cell 与基线的一致性
node cell.js glossary-check
# 输出: { "conflicts": [{ "cell": "user-auth-login", "entity": "user", "issue": "Cell 引用了 user.password 但基线中属性名为 password_hash" }], "missing_refs": [{ "cell": "order-create", "entity": "order", "issue": "Cell 引用了不存在的实体 order" }] }
```

### 5.3 Cell CRUD

```bash
# 创建 Cell：通过 JSON 传入完整内容
node cell.js create --data '<json>'
# 示例:
node cell.js create --data '{"id":"user-auth-login","entity":"user","intent":"...","plan":"...","contract":[...],"test":[...],"depends_on":[{"id":"user-store","kind":"data-source"},{"id":"rate-limiter","kind":"call"}]}'
# 输出: { "created": "user-auth-login", "path": ".sdd/cells/user-auth-login.yaml" }
# 校验: id 唯一性、depends_on 引用存在性（警告，不阻止创建）、entity 引用存在性（警告）
# 注: depends_on 也支持字符串数组（如 ["user-store"]），但推荐使用对象格式以保留依赖语义

# 读取 Cell：输出完整 YAML 内容
node cell.js read <cell-id>
# 输出: { "id": "user-auth-login", "version": 1, "entity": "user", "intent": "...", "plan": "...", "contract": [...], "test": [...], "depends_on": [...] }

# 更新 Cell 的指定模块
node cell.js update <cell-id> --module <intent|plan|contract|test|depends_on> --data '<json>'
# 示例:
node cell.js update user-auth-login --module plan --data '"新的设计方案"'
node cell.js update user-auth-login --module contract --data '[{"api":{"name":"login","method":"POST","path":"/auth/login"},"request":{"body":[{"name":"username","type":"string","required":true},{"name":"password","type":"string","required":true}]},"response":{"status":200,"body":[{"name":"token","type":"jwt","required":true}]}}]'
# 输出: { "updated": "user-auth-login", "module": "plan" }

# 删除 Cell
node cell.js delete <cell-id>
# 输出: { "deleted": "user-auth-login", "dependents": ["user-auth-oauth"] }
# 注意: dependents 列出依赖该 Cell 的其他 Cell，LLM 应展示给人类确认

# 列出所有 Cell（摘要信息）
node cell.js list
# 输出: { "cells": [{ "id": "user-auth-login", "version": 1, "entity": "user", "depends_on_count": 2, "stale": false }, ...] }
```

### 5.4 Delta 管理

```bash
# 创建 Delta Cell
node cell.js delta-create --data '<json>'
# 示例:
node cell.js delta-create --data '{"id":"delta-add-oauth2","target":"user-auth-login","intent":"...","plan":"...","contract":[...],"test":[...],"depends_on":[{"id":"oauth2-provider","kind":"call"}]}'
# 输出: { "created": "delta-add-oauth2", "target": "user-auth-login", "path": ".sdd/deltas/delta-add-oauth2.yaml" }
# 校验: target 必须指向存在的主 Cell

# 读取 Delta Cell
node cell.js delta-read <delta-id>
# 输出: Delta 的完整 JSON 内容

# 更新 Delta 的指定模块
node cell.js delta-update <delta-id> --module <intent|plan|contract|test|depends_on> --data '<json>'
# 输出: { "updated": "delta-add-oauth2", "module": "plan" }

# 删除 Delta
node cell.js delta-delete <delta-id>
# 输出: { "deleted": "delta-add-oauth2" }

# 列出所有活跃 Delta
node cell.js delta-list
# 输出: { "deltas": [{ "id": "delta-add-oauth2", "target": "user-auth-login" }, ...] }

# 预览 Delta 合并结果（不实际执行）
node cell.js merge-preview <delta-id>
# 输出: { "delta": "delta-add-oauth2", "target": "user-auth-login", "merged": { ...完整合并后的 Cell... } }

# 执行 Delta 合并
node cell.js merge <delta-id>
# 输出: { "merged": true, "delta": "delta-add-oauth2", "target": "user-auth-login", "new_version": 2 }

# 执行 Delta 归档（合并 + 快照 + 传播）
node cell.js archive <delta-id>
# 输出: { "archived": true, "delta": "delta-add-oauth2", "target": "user-auth-login", "new_version": 2, "snapshot": ".sdd/archive/2026-06-05-add-oauth2/user-auth-login.v1.yaml", "propagated": ["user-auth-oauth"] }
```

### 5.5 图操作

```bash
# 影响分析：找出所有依赖指定 Cell 的 Cell（反向 BFS）
node cell.js impact <cell-id>
# 输出: { "source": "user-store", "affected": ["user-auth-login", "user-auth-oauth"], "depth": { "user-auth-login": 1, "user-auth-oauth": 2 } }

# 依赖查看：列出指定 Cell 的直接依赖
node cell.js deps <cell-id>
# 输出: { "cell": "user-auth-login", "depends_on": ["user-store", "rate-limiter"] }

# 一致性检查：扫描所有 Cell，报告问题
node cell.js check
# 输出: { "dangling_refs": [{ "cell": "user-auth-login", "ref": "nonexistent" }], "cycles": [["cell-a", "cell-b", "cell-a"]], "gaps": [{ "cell": "rate-limiter", "missing": ["test"] }], "glossary_conflicts": [...] }

# 聚合根推导：找出被依赖最多的 Cell
node cell.js roots [--threshold 2]
# 输出: { "roots": [{ "cell": "user-store", "in_degree": 3 }, ...] }

# 图可视化：生成 Mermaid 格式的依赖图
node cell.js graph
# 输出: { "mermaid": "graph TD\n  user-auth-login --> user-store\n  user-auth-login --> rate-limiter" }
```

### 5.6 变更传播

```bash
# 传播变更：标记受影响 Cell 为 stale
node cell.js propagate <cell-id>
# 输出: { "source": "user-store", "marked_stale": ["user-auth-login", "user-auth-oauth"] }

# 列出所有 stale Cell
node cell.js stale
# 输出: { "stale_cells": [{ "cell": "user-auth-login", "stale_modules": ["plan", "contract"] }] }

# 确认 Cell 已更新，清除 stale 标记
node cell.js confirm <cell-id> [--module <plan|contract|all>]
# 输出: { "confirmed": "user-auth-login", "cleared": ["plan", "contract"] }

# 确认当前模块（确认时自动影响分析 + 全局阻断 + 草稿保留）
node cell.js confirm-module <cell-id> --module <intent|plan|contract|test> --data '<json>'
# 输出（阻断）: { "blocked": true, "reasons": [...], "impact": {...}, "draft_saved": true }
# 输出（通过）: { "blocked": false, "updated": {...}, "impact": {...}, "marked_stale": [...] }
```

### 5.7 引擎校验规则

引擎在执行操作时自动进行以下校验：

| 操作 | 校验规则 |
|------|----------|
| create | id 格式（kebab-case）、id 唯一性、4 模块非空、entity 引用存在性（警告） |
| update | Cell 存在性、module 名称有效性、data 格式匹配 module 类型 |
| delete | 列出依赖该 Cell 的其他 Cell（警告） |
| delta-create | target 存在性、id 以 delta- 开头 |
| merge / archive | Delta 存在性、target 存在性 |
| propagate | Cell 存在性 |
| glossary-update | 实体名唯一性 |
| glossary-add-entity | 实体名唯一性 |
| confirm-module | 模块数据格式校验、影响分析、全局影响判定、阻断时草稿保留 |
| glossary-check | Cell 与基线的一致性 |

---

## 6. Skill 工作流详细设计

### 6.0 阶段 0：需求澄清与能力切分

**触发**：用户描述需求

**LLM 行为**：

1. **苏格拉底式问答**：通过提问明确目标、约束、边界，不急于创建 Cell
2. **识别能力**：将需求拆分为"用户可感知的能力"，每个能力对应一个 Cell
3. **标注依赖**：识别能力之间的依赖关系，确定 depends_on
4. **输出切分方案**：向用户展示能力列表和依赖关系，等待确认

**提问方向**：
- 这个需求解决谁的问题？核心目标是什么？
- 有哪些边界条件或约束？
- 哪些能力是独立的，哪些必须依赖其他能力？
- 是否涉及已有 Cell 的变更？

**输出物**：经用户确认的能力切分方案（Cell 列表 + 依赖关系）

### 6.1 阶段 1：全局基线

**触发**：能力切分确认后

**LLM 行为**：

1. **识别实体**：从切分方案中提取领域实体
2. **创建/更新基线**：通过 `glossary-add-entity` 逐项添加实体与能力
3. **定义实体结构**：为每个实体填写属性、能力、状态、关系
4. **校验一致性**：通过 `glossary-check` 确认无冲突
5. **展示基线**：通过 `glossary-read` 展示完整基线，等待用户一次性确认

**关键约束**：
- 基线是唯一语义源，Cell 不可私自重定义同名概念
- 实体的 capabilities 必须与后续创建的 Cell id 对应
- 基线确认后，后续 Cell 创建必须引用基线中的实体

**输出物**：经用户确认的全局基线（glossary.yaml）

### 6.2 阶段 2：三段宏观确认

**触发**：基线确认后

**LLM 行为**：

**第一段：Intent 批量确认**
1. 为每个能力创建 Cell，填充 intent（目标、输入输出、依赖、风险）
2. 设置 `entity` 字段引用基线中的实体
3. 设置 `depends_on` 标注依赖关系
4. 通过 `check` 确认无悬空引用
5. 批量展示所有 Cell 的 intent，等待用户确认

**第二段：Spec 批量确认**
1. 为每个 Cell 填充 plan（步骤/数据流/逻辑）和 contract（接口参数/返回/错误定义）
2. 批量展示所有 Cell 的 plan + contract，等待用户确认

**第三段：Test 批量确认**
1. 为每个 Cell 填充 test（when-then-given 场景，覆盖主流程、边界、失败、回归）
2. 批量展示所有 Cell 的 test，等待用户确认

**输出物**：三段确认后的完整 Cell 集合

### 6.3 阶段 3：模块确认与变更响应

**触发**：用户点击“确认当前模块”

**LLM 行为**：

1. **执行影响分析**：引擎在确认时自动执行 `impact`，输出受影响 Cell 列表

   **全局影响判定规则**（满足任一即触发全局评估）：
   - 实体新增/删除能力
   - 实体语义变化（属性、状态、关系变更）
   - 跨 Cell 接口变化（contract 参数、返回或错误语义变更）
   - 共享约束变化（如安全策略、限流规则）

2. **阻断与草稿保留**：
   - 若触发全局影响评估，引擎阻断提交并返回原因
   - 同时自动保存该模块草稿，用户可恢复后继续修改

3. **通过后提交**：
   - 未触发阻断时，引擎写入模块变更
   - 自动执行传播，标记受影响 Cell 为 stale

**输出物**：变更影响报告 + 用户决策结果

### 6.4 阶段 4：TDD 实现

**触发**：全部设计流程完善后，用户显式指示开始实现

**LLM 行为**：

1. **读取 Cell**：`node cell.js read <cell-id>`
2. **读取依赖 Cell**：`node cell.js deps <cell-id>` → 逐个 `node cell.js read <dep-id>`，了解接口约定
3. **生成测试**：按 Cell 的 test 模块生成测试代码（先写测试）
4. **生成代码**：按 Cell 的 contract 和 plan 生成实现代码，使测试通过
5. **运行测试**：执行测试，自动修复失败用例
6. **展示关键变更**：展示生成的代码摘要和测试结果，等待确认
7. **写入文件**：确认后将代码写入项目

**关键约束**：
- 代码必须满足 Cell 的所有 contract 条目
- 测试必须覆盖 Cell 的所有 test scenario
- 依赖的 Cell 的 contract 作为接口约定，不可违反
- 全部 Cell 设计完成后才进入实现，保证全局一致性

---

## 7. Skill 指令文件内容（skill.md）

```markdown
# Cell-Based SDD

你是 Cell-Based SDD 工作流助手。融合 DDD 思维，通过原子级 Cell 管理项目规格，全局基线保证语义一致性，依赖图自动推导变更影响，Delta 机制支持安全迭代。

## 核心概念

- **全局基线（glossary.yaml）**：统一语言/实体字典，项目的唯一语义源。最小集合为实体（属性、能力、版本）。Cell 仅可引用或扩展，不可私自重定义同名概念。
- **Cell**：原子规格单元，一个功能点的完整画像。包含 intent（为什么）、plan（怎么做）、contract（做成什么样）、test（怎么验证）四个模块。
- **Delta Cell**：变更单元，指向一个主 Cell，声明增量内容。归档时合并回主 Cell。
- **依赖图**：Cell 之间通过 depends_on 构成的有向图，支撑影响分析和变更传播。
- **引擎**：所有操作的唯一入口，LLM 通过 RunCommand 调用引擎命令，不直接读写文件。

## 引擎命令

引擎位于 Skill 安装目录的 `engine/` 下，通过 `node <skill-dir>/engine/cell.js` 调用。

**重要**：在 PowerShell 环境中传递 JSON 参数容易出错，优先使用 `--file` 参数从文件读取 JSON 数据。

### 项目管理

- `node cell.js init` — 初始化项目，创建 .sdd/ 目录结构（含空 glossary.yaml）

### 全局基线管理

- `node cell.js glossary-read` — 读取全局基线
- `node cell.js glossary-update --data '<json>'` — 更新全局基线（全量替换）
- `node cell.js glossary-add-entity --data '<json>'` — 添加实体
- `node cell.js glossary-check` — 检查 Cell 与基线的一致性

### Cell CRUD

- `node cell.js create --data '<json>'` 或 `--file <path>` — 创建 Cell
- `node cell.js read <cell-id>` — 读取 Cell 完整内容
- `node cell.js update <cell-id> --module <intent|plan|contract|test|depends_on> --data '<json>'` 或 `--file <path>` — 更新指定模块
- `node cell.js delete <cell-id>` — 删除 Cell
- `node cell.js list` — 列出所有 Cell 摘要

### Delta 管理

- `node cell.js delta-create --data '<json>'` 或 `--file <path>` — 创建 Delta Cell
- `node cell.js delta-read <delta-id>` — 读取 Delta 完整内容
- `node cell.js delta-update <delta-id> --module <intent|plan|contract|test|depends_on> --data '<json>'` 或 `--file <path>` — 更新 Delta 指定模块
- `node cell.js delta-delete <delta-id>` — 删除 Delta
- `node cell.js delta-list` — 列出所有活跃 Delta
- `node cell.js merge-preview <delta-id>` — 预览合并结果（不实际执行）
- `node cell.js merge <delta-id>` — 执行合并
- `node cell.js archive <delta-id>` — 执行归档（合并 + 快照 + 传播）

### 图操作

- `node cell.js impact <cell-id>` — 影响分析：谁依赖了我
- `node cell.js deps <cell-id>` — 依赖查看：我依赖了谁
- `node cell.js check` — 一致性检查（含基线一致性）
- `node cell.js roots [--threshold 2]` — 聚合根推导
- `node cell.js graph` — 生成 Mermaid 依赖图

### 变更传播

- `node cell.js propagate <cell-id>` — 标记受影响 Cell 为 stale
- `node cell.js stale` — 列出所有 stale Cell
- `node cell.js confirm <cell-id> [--module <plan|contract|all>]` — 确认 Cell 已更新，清除 stale 标记
- `node cell.js confirm-module <cell-id> --module <intent|plan|contract|test> --data '<json>'` — 确认并提交指定模块（自动影响分析、全局阻断与草稿保留）

## 工作流

### 阶段 0：需求澄清与能力切分

1. 苏格拉底式问答明确目标、约束、边界
2. 按"用户可感知能力"拆分 Cell，标注依赖关系
3. 展示切分方案，等待用户确认

### 阶段 1：全局基线

1. 从切分方案中提取领域实体
2. 创建/更新 glossary.yaml，定义实体（属性、能力、状态、关系、版本）
3. 通过 `glossary-check` 确认无冲突
4. 展示完整基线，等待用户一次性确认

### 阶段 2：三段宏观确认

每一轮都通过 AskQuestion 给出唯一确认入口：
- **Intent 批量确认**：创建 Cell，填充 intent + entity + depends_on → AskQuestion 一次确认
- **Spec 批量确认**：填充 plan + contract → AskQuestion 一次确认
- **Test 批量确认**：填充 test → AskQuestion 一次确认

### 阶段 3：变更响应

每次“确认当前模块”时执行：
1. 引擎自动推算影响范围（cell 级）
2. 若命中全局影响规则：阻断提交并保存草稿
3. 若未命中：提交模块并自动传播 stale 标记

### 阶段 4：TDD 实现

全部设计完成后，用户显式指示开始实现：
1. 读取 Cell 及依赖 Cell
2. 按 test 生成测试代码（先写测试）
3. 按 contract + plan 生成实现代码
4. 运行测试，自动修复失败
5. 展示关键变更，等待用户确认后写入

## 全局评估触发规则

凡"有全局影响"的改动一律触发全局评估，包括但不限于：
- 实体新增/删除能力
- 实体语义变化（属性、状态、关系变更）
- 跨 Cell 接口变化（contract 签名变更）
- 共享约束变化（如安全策略、限流规则）
- depends_on 新增/删除

LLM 在每次变更时自行判断并声明"本变更触发/不触发全局评估"。

## 人类审批节点

以下操作必须获得人类确认后才可执行：
1. 全局基线确认 — 基线内容一次性确认
2. 三段宏观确认 — Intent / Spec / Test 各一次批量确认
3. 变更响应决策 — 用户决策采用哪个版本
4. 删除 Cell — 展示依赖该 Cell 的其他 Cell
5. 代码实现 — 展示关键变更

## Cell JSON 格式

### 主 Cell（create --data 的 JSON 结构）

{
  "id": "kebab-case-identifier",
  "entity": "entity-name-from-glossary",
  "intent": "为什么存在",
  "plan": "怎么设计",
  "contract": [
    { "when": "条件", "then": "预期行为" }
  ],
  "test": [
    { "scenario": "场景名", "given": "前置条件", "when": "操作", "then": "预期结果" }
  ],
  "depends_on": [
    { "id": "cell-id", "kind": "call" }
  ]
}

### Delta Cell（delta-create --data 的 JSON 结构）

{
  "id": "delta-name",
  "target": "cell-id",
  "intent": "...",
  "plan": "...",
  "contract": [...],
  "test": [...],
  "depends_on": [...]
}
```

---

## 8. 引擎实现规格

### 8.1 文件结构

```
skill/engine/
├── package.json
├── cell.js                    # 入口：解析命令行参数，分发到子命令
└── lib/
    ├── store.js               # 存储层：YAML 文件读写
    ├── graph.js               # 图算法：影响分析、一致性检查、传播
    ├── merge.js               # 合并逻辑：Delta 合并规则
    ├── validate.js            # 校验：Cell 格式、id 唯一性等
    └── glossary.js            # 基线管理：实体字典读写与校验
```

### 8.2 cell.js 入口

```
入口逻辑：
1. 解析命令行参数（子命令 + 选项）
2. 确定项目根目录（从 cwd 向上查找 .sdd/，init 命令除外）
3. 分发到对应子命令处理函数
4. 捕获异常，输出错误 JSON 到 stderr
5. 成功时输出结果 JSON 到 stdout

子命令路由：
  init           → lib/store.js: initProject()

  glossary-read  → lib/glossary.js: readGlossary()
  glossary-update → lib/glossary.js: updateGlossary(data)
  glossary-add-entity → lib/glossary.js: addEntity(data)
  glossary-check → lib/glossary.js: checkConsistency()

  create         → lib/store.js: createCell(data) + lib/validate.js: validateCell()
  read           → lib/store.js: readCell(id)
  update         → lib/store.js: updateCell(id, module, data) + lib/validate.js: validateModule()
  delete         → lib/store.js: deleteCell(id) + lib/graph.js: getDependents(id)
  list           → lib/store.js: listCells()

  delta-create   → lib/store.js: createDelta(data) + lib/validate.js: validateDelta()
  delta-read     → lib/store.js: readDelta(id)
  delta-update   → lib/store.js: updateDelta(id, module, data)
  delta-delete   → lib/store.js: deleteDelta(id)
  delta-list     → lib/store.js: listDeltas()
  merge-preview  → lib/merge.js: previewMerge(deltaId)
  merge          → lib/merge.js: executeMerge(deltaId)
  archive        → lib/merge.js: archiveDelta(deltaId)

  impact         → lib/graph.js: impactAnalysis(cellId)
  deps           → lib/graph.js: getDeps(cellId)
  check          → lib/graph.js: consistencyCheck()
  roots          → lib/graph.js: findRoots(threshold)
  graph          → lib/graph.js: generateMermaid()

  propagate      → lib/graph.js: propagateChange(cellId)
  stale          → lib/graph.js: listStale()
  confirm        → lib/graph.js: confirmCell(cellId, module)
```

### 8.3 lib/glossary.js — 基线管理

```
职责：全局基线（glossary.yaml）的读写与校验

函数：
  readGlossary(rootDir)
    - 读取 .sdd/glossary.yaml
    - 解析为 JSON 返回
    - 如果文件不存在，返回空结构 { version: 0, entities: {} }

  updateGlossary(rootDir, data)
    - 校验实体名唯一性、术语名唯一性
    - 写入 .sdd/glossary.yaml，version +1
    - 计算受影响的 Cell（引用了变更实体的 Cell）
    - 返回 { updated: true, version, affected_cells }

  addEntity(rootDir, data)
    - 读取当前基线
    - 校验实体名不存在
    - 添加到 entities
    - version +1，写回
    - 返回 { added: entityName, version }

  checkConsistency(rootDir)
    - 读取基线和所有 Cell
    - 检查 Cell 的 entity 字段是否在基线中存在
    - 检查 Cell 中引用的概念是否与基线定义冲突
    - 检查基线中 capabilities 列表是否有对应的 Cell
    - 返回 { conflicts: [...], missing_refs: [...] }

依赖：js-yaml
```

### 8.4 lib/store.js — 存储层

```
职责：YAML 文件的读写操作

函数：
  initProject(rootDir)
    - 创建 .sdd/cells/, .sdd/deltas/, .sdd/archive/ 目录
    - 创建空 .sdd/glossary.yaml（version: 0, entities: {}）
    - 返回 { initialized: true, path: ".sdd" }

  createCell(rootDir, data)
    - 校验 id 不存在
    - 设置 version=1, _stale={plan:false, contract:false}
    - 写入 .sdd/cells/<id>.yaml
    - 返回 { created: id, path: "..." }

  readCell(rootDir, id)
    - 读取 .sdd/cells/<id>.yaml
    - 解析为 JSON 返回

  updateCell(rootDir, id, module, data)
    - 读取 Cell
    - 替换指定模块内容
    - 写回文件
    - 返回 { updated: id, module: module }

  deleteCell(rootDir, id)
    - 删除 .sdd/cells/<id>.yaml
    - 返回 { deleted: id }

  listCells(rootDir)
    - 读取 .sdd/cells/ 下所有 YAML
    - 返回摘要列表 [{ id, version, entity, depends_on_count, stale }]

  createDelta(rootDir, data)
    - 校验 target Cell 存在
    - 写入 .sdd/deltas/<id>.yaml
    - 返回 { created: id, target: target, path: "..." }

  readDelta(rootDir, id)
    - 读取 .sdd/deltas/<id>.yaml
    - 解析为 JSON 返回

  updateDelta(rootDir, id, module, data)
    - 读取 Delta
    - 替换指定模块内容
    - 写回文件

  deleteDelta(rootDir, id)
    - 删除 .sdd/deltas/<id>.yaml

  listDeltas(rootDir)
    - 读取 .sdd/deltas/ 下所有 YAML
    - 返回摘要列表 [{ id, target }]

依赖：js-yaml
```

### 8.5 lib/graph.js — 图算法

```
职责：依赖图的构建和算法

内部函数：
  buildGraph(rootDir)
    - 读取所有 Cell
    - 返回 { cells: Map<id, cellData>, adjacency: Map<id, depends_on[]>, reverseAdjacency: Map<id, dependents[]> }

导出函数：
  impactAnalysis(rootDir, cellId)
    - 构建图
    - 反向 BFS 从 cellId 出发
    - 返回 { source, affected, depth }

  getDeps(rootDir, cellId)
    - 读取 Cell 的 depends_on
    - 返回 { cell, depends_on }

  getDependents(rootDir, cellId)
    - 构建反向邻接表
    - 返回直接依赖 cellId 的 Cell 列表

  consistencyCheck(rootDir)
    - 悬空引用：depends_on 中的 id 不存在
    - 循环依赖：DFS 染色法检测
    - 缺口 Cell：缺少 test 或 contract
    - 基线一致性：调用 glossary.checkConsistency()
    - 返回 { dangling_refs, cycles, gaps, glossary_conflicts }

  findRoots(rootDir, threshold)
    - 计算每个 Cell 的入度
    - 过滤入度 >= threshold
    - 返回 { roots: [{ cell, in_degree }] }

  generateMermaid(rootDir)
    - 遍历所有 Cell 的 depends_on
    - 生成 Mermaid graph TD 格式
    - 返回 { mermaid: "graph TD\n  ..." }

  propagateChange(rootDir, cellId)
    - 执行 impactAnalysis
    - 对每个受影响的 Cell，设置 _stale.plan=true, _stale.contract=true
    - 写回文件
    - 返回 { source, marked_stale }

  listStale(rootDir)
    - 读取所有 Cell
    - 过滤 _stale 中有 true 的
    - 返回 { stale_cells: [{ cell, stale_modules }] }

  confirmCell(rootDir, cellId, module)
    - 读取 Cell
    - 如果 module=all，清除整个 _stale
    - 否则设置 _stale[module]=false，如果全部 false 则移除 _stale
    - 写回文件
    - 返回 { confirmed: cellId, cleared: [...] }
```

### 8.6 lib/merge.js — 合并逻辑

```
职责：Delta 合并与归档

导出函数：
  previewMerge(rootDir, deltaId)
    - 读取 Delta 和目标 Cell
    - 按合并规则计算合并结果（不写入）
    - 返回 { delta, target, merged: { ...完整合并后的 Cell... } }

  executeMerge(rootDir, deltaId)
    - 读取 Delta 和目标 Cell
    - 按合并规则合并
    - 写入目标 Cell（version +1）
    - 删除 Delta 文件
    - 返回 { merged: true, delta, target, new_version }

  archiveDelta(rootDir, deltaId)
    - 从 delta-id 提取名称（去掉 delta- 前缀）
    - 创建归档目录 .sdd/archive/<date>-<name>/
    - 快照目标 Cell 到归档目录
    - 执行合并（同 executeMerge 逻辑）
    - 移动 Delta 文件到归档目录
    - 执行变更传播（同 graph.propagateChange 逻辑）
    - 返回 { archived: true, delta, target, new_version, snapshot, propagated }

合并规则：
  intent:     主Cell.intent + "\n---\n" + Delta.intent
  plan:       主Cell.plan + "\n---\n" + Delta.plan
  contract:   [...主Cell.contract, ...Delta.contract]
  test:       [...主Cell.test, ...Delta.test]
  depends_on: [...new Set([...主Cell.depends_on, ...Delta.depends_on])]
  version:    主Cell.version + 1
```

### 8.7 lib/validate.js — 校验

```
职责：数据校验

导出函数：
  validateCell(data)
    - id: 非空、kebab-case 格式
    - intent: 非空字符串
    - plan: 非空字符串
    - contract: 非空数组，每项有 when 和 then
    - test: 非空数组，每项有 scenario, given, when, then
    - depends_on: 数组（可为空）
    - entity: 可选字符串
    - 返回 { valid: true } 或 { valid: false, errors: [...] }

  validateDelta(data)
    - 同 validateCell，额外要求：
    - id: 以 "delta-" 开头
    - target: 非空字符串
    - 返回 { valid: true } 或 { valid: false, errors: [...] }

  validateModule(module, data)
    - module 名在 [intent, plan, contract, test, depends_on] 中
    - data 格式匹配 module 类型
    - 返回 { valid: true } 或 { valid: false, errors: [...] }

  validateEntity(data)
    - name: 非空字符串
    - attributes: 数组，每项有 name 和 type
    - capabilities: 数组
    - states: 数组
    - relations: 数组
    - 返回 { valid: true } 或 { valid: false, errors: [...] }

  validateTerm(data)
    - term: 非空字符串
    - definition: 非空字符串
    - aliases: 数组（可为空）
    - 返回 { valid: true } 或 { valid: false, errors: [...] }
```

---

## 9. 实现清单

| 文件 | 说明 | 优先级 |
|------|------|--------|
| `skill/skill.md` | Skill 指令文件 | P0 |
| `skill/engine/package.json` | Node.js 项目配置，依赖 js-yaml | P0 |
| `skill/engine/cell.js` | 引擎入口：命令行参数解析和分发 | P0 |
| `skill/engine/lib/store.js` | 存储层：YAML 读写 | P0 |
| `skill/engine/lib/graph.js` | 图算法 | P0 |
| `skill/engine/lib/merge.js` | Delta 合并逻辑 | P0 |
| `skill/engine/lib/validate.js` | 数据校验 | P0 |
| `skill/engine/lib/glossary.js` | 基线管理：实体字典读写与校验 | P0 |
| `examples/user-auth-login.yaml` | 主 Cell 示例 | P1 |
| `examples/delta-add-oauth2.yaml` | Delta Cell 示例 | P1 |
| `examples/glossary-example.yaml` | 全局基线示例 | P1 |

---

## 10. 设计原则

1. **基线即语义源**：全局基线是唯一语义源，Cell 引用基线概念，不可私自重定义
2. **内聚优先**：一个功能点的完整画像只存在于一个 Cell
3. **图即真相**：依赖关系是可计算的结构化数据，不是文档中的自然语言描述
4. **Delta 可追溯**：所有变更都有迹可循，合并前主 Cell 保持稳定
5. **引擎即入口**：LLM 与 Cell-Based SDD 的所有交互都通过引擎，不直接操作文件
6. **渐进式采用**：可以从一个 Cell 开始，逐步构建图
7. **LLM 友好**：引擎输出 JSON，方便 LLM 解析；JSON 输入避免 LLM 拼接 YAML
8. **人类审批关键节点**：基线确认、三段确认、变更决策、代码写入前必须人类确认
9. **全局管语义一致性，Cell 管实现自治**：基线统一语义，Cell 独立演进
10. **批量确认控成本，变更传播控风险**：三段确认减少交互次数，变更响应即时传播影响

---

## 11. 建模原则

Cell-Based SDD 的建模风格融合 DDD 思维，以**全局基线**为锚点，**自底向上**构建 Cell 图。

### 11.1 基线先行：实体驱动建模

- 需求澄清后，首先识别领域实体，建立全局基线
- 实体定义属性、能力、状态、关系，作为 Cell 的语义锚点
- Cell 的 `entity` 字段将功能挂载到实体上，形成"实体→能力"的清晰映射
- 基线中的 `capabilities` 列表与 Cell id 对应，确保功能不遗漏

### 11.2 小而专注：Cell 的默认粒度

- 一个 Cell 描述**单一能力**（用户可感知的功能点）。判断标准：如果 Cell 的 contract 可以用一句话概括"当 X 时做 Y"，它就是合适粒度的 feature Cell。
- 如果一个 Cell 的 contract/test 涉及多个相对独立的能力（例如同时描述"用户登录"和"密码重置"），应优先拆成多个 Cell，再通过 `depends_on` 的 kind 和 Cell 的 tags 表达组合关系。
- 拆分的收益：每个 Cell 独立演进、独立测试、独立传播变更；LLM 的上下文只需加载相关 Cell，而非一个巨型 Cell。

### 11.3 高维 Cell 的角色与抽象时机

高维 Cell 不是设计的起点，而是**当子 Cell 稳定存在后**，为了组织和导航而抽象出来的聚合节点。

| 角色 | kind 值 | 职责 | 抽象时机 |
|------|---------|------|----------|
| 实体 Cell | `entity` | 聚合同一领域实体的多个功能 Cell | 当多个 feature Cell 围绕同一实体（如 user、order）频繁出现，且它们的 intent 合在一起才能完整描述该实体时 |
| 事件引擎 Cell | `event-engine` | 对一组事件处理 Cell 做编排和路由 | 当多个 Cell 通过 `depends_on.kind=event` 构成事件流，且需要一个中心节点统一描述事件路由/派发规则时 |

高维 Cell 的 contract 描述的是**聚合层面的行为契约**，而非重复子 Cell 的细节。例如：
- `user-store`（entity Cell）的 contract 描述"用户实体的生命周期保证"，而非逐一列出 CRUD
- `order-event-bus`（event-engine Cell）的 contract 描述"订单事件的派发与订阅规则"，而非重复每个事件处理 Cell 的逻辑

### 11.4 自底向上的过程

1. **先有子 Cell**：从最小能力开始创建 feature Cell
2. **观察模式**：当多个 Cell 围绕同一实体频繁出现，说明存在聚合需求
3. **抽象高维 Cell**：创建 entity 或 event-engine Cell，通过 `depends_on.kind=compose` 引用子 Cell，标记合适的 kind 和 tags
4. **持续演进**：新需求优先通过新增 Delta 或新增子 Cell 来满足，而非膨胀已有高维 Cell

**反模式**：一开始就设计一个包含所有功能的巨型 Cell，然后试图拆分。正确做法是从小 Cell 往上长，而不是从大 Cell 往下切。
