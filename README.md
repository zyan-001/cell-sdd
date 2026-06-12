# Cell-SDD

Cell-SDD 是一个规范驱动开发（Spec-Driven Development）引擎。  
它将需求与设计拆分为原子化 `Cell`，并通过依赖图实现影响分析、变更传播与质量门禁。

## 核心能力

- **三层 Cell 模型**：`Aggregate` / `Action` / `Journey`
- **Pure Glossary**：统一术语定义与语义基线
- **图驱动分析**：依赖检查、影响范围、上下文切片
- **变更治理**：`confirm-module`、stale 标记、双向共振（`requires_state`）
- **可视化看板**：前端页面查看图与模块状态

## 重要约定

- `.sdd/` 必须生成在**用户项目目录**，不是本仓库目录。
- 推荐所有 CLI / Server 命令都显式传 `--project-root <用户项目绝对路径>`，避免 CWD 误判。
- Windows PowerShell 下优先使用 `--file` 传参，避免 JSON 转义问题。

## 目录结构

- `engine/`：Node.js 后端引擎（CLI + REST API）
- `web/`：React + Vite 可视化前端
- `SKILL.md`：主 skill 工作流规范（流程与门禁）
- `manuals/`：引擎配套参考手册（命令/JSON/排障）

## 快速开始

### 1) 环境要求

- Node.js `>= 18`
- 其实只要满足了这条，启动skill后llm应该能自动完善其余环境配置的

### 2) 安装依赖

```bash
cd engine && npm install
cd ../web && npm install
```

### 3) 初始化规范仓库

在任意目录执行都可以，但要显式指定目标项目目录（会在该目录创建 `.sdd/`）：

```bash
node engine/cell.js init --project-root "D:/projects/your-app"
```

### 4) 启动服务

```bash
# 后端 API（默认 3210）
node engine/server.js --project-root "D:/projects/your-app"

# 前端页面（默认 5173）
# 可选：显式指定 Vite 临时目录，避免沙箱写权限问题
# PowerShell: $env:VITE_TMP_DIR="D:/projects/your-app/.cursor-tmp/vite"; cd web; npm run dev
# 说明：dev 脚本默认使用 `--configLoader runner`，可规避配置加载阶段写入 `.vite-temp`
cd web && npm run dev
```

## 常用 CLI 命令

```bash
# Cell
node engine/cell.js create --project-root "D:/projects/your-app" --file payload.json
node engine/cell.js update <id> --module <module> --project-root "D:/projects/your-app" --file payload.json
node engine/cell.js confirm-module <id> --module <module> --project-root "D:/projects/your-app" --file payload.json

# Glossary
node engine/cell.js glossary-read --project-root "D:/projects/your-app"
node engine/cell.js glossary-add-term --project-root "D:/projects/your-app" --file payload.json
node engine/cell.js glossary-check --project-root "D:/projects/your-app"

# Graph & Check
node engine/cell.js check --project-root "D:/projects/your-app"
node engine/cell.js impact <id> --project-root "D:/projects/your-app"
node engine/cell.js stale --project-root "D:/projects/your-app"
```

## 手册入口

- 总入口：`manuals/ENGINE_REFERENCE_INDEX.md`
- 命令速查：`manuals/ENGINE_CLI_QUICK_REFERENCE.md`
- Cell JSON 示例：`manuals/ENGINE_CELL_JSON_EXAMPLES.md`
- contract v2：`manuals/ENGINE_CONTRACT_V2.md`
- confirm-module / Delta 流程：`manuals/ENGINE_CONFIRM_DELTA_WORKFLOWS.md`
- 共振与排障：`manuals/ENGINE_RESONANCE_AND_TROUBLESHOOTING.md`
