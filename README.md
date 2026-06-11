# Cell-SDD

Cell-SDD 是一个**规范驱动开发（Spec-Driven Development）**引擎。  
它将需求与设计拆分为原子化 `Cell`，并通过依赖图实现影响分析、变更传播与质量门禁。

## 核心能力

- **三层 Cell 模型**：`Aggregate` / `Action` / `Journey`
- **Pure Glossary**：统一术语定义与语义基线
- **图驱动分析**：依赖检查、影响范围、上下文切片
- **变更治理**：`confirm-module`、stale 标记、双向共振（`requires_state`）
- **可视化 Notebook**：前端页面查看图与模块状态

## 目录结构

- `engine/`：Node.js 后端引擎（CLI + REST API）
- `web/`：React + Vite 可视化前端
- `design.md`：设计文档
- `SKILL.md`：主 skill 工作流规范

## 快速开始

### 1) 环境要求

- Node.js `>= 18`

### 2) 安装依赖

```bash
cd engine && npm install
cd ../web && npm install
```

### 3) 初始化规范仓库

在你的项目目录执行（会创建 `.sdd/`）：

```bash
node /path/to/engine/cell.js init
```

### 4) 启动服务

```bash
# 后端 API（默认 3210）
cd engine && node server.js

# 前端页面（默认 5173）
cd ../web && npm run dev
```

## 常用 CLI 命令

```bash
# Cell
node cell.js create --data '<json>'
node cell.js update <id> --module <module> --data '<json>'
node cell.js confirm-module <id> --module <module> --data '<json>'

# Glossary
node cell.js glossary-read
node cell.js glossary-add-term --data '<json>'
node cell.js glossary-check

# Graph & Check
node cell.js check
node cell.js impact <id>
node cell.js stale
```

> 建议在 Windows PowerShell 下优先使用 `--file` 传参，避免复杂 JSON 转义问题。
