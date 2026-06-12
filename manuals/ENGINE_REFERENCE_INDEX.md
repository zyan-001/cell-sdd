# Engine 配套参考（索引）

这组文档用于承载“引擎使用细节”，避免把 `SKILL.md` 膨胀成命令手册。

## 何时看哪份

- **要查命令、参数、输入输出**：看 `ENGINE_CLI_QUICK_REFERENCE.md`
- **要创建 Cell JSON（最小/完整）**：看 `ENGINE_CELL_JSON_EXAMPLES.md`
- **要定义 contract v2**：看 `ENGINE_CONTRACT_V2.md`
- **卡在 confirm-module / draft / force / Delta 流程**：看 `ENGINE_CONFIRM_DELTA_WORKFLOWS.md`
- **要处理共振和常见报错排查**：看 `ENGINE_RESONANCE_AND_TROUBLESHOOTING.md`

## 设计原则

- `SKILL.md` 负责流程规则与门禁。
- 本索引及子文档负责”可执行细节”和”故障恢复”。
- **每个阶段开始前必须读取对应手册，这是硬约束而非建议。** 跳过手册直接写 JSON 是最常见的错误来源。
