# Codex 后续开发指令

原启动方案已完成并扩展为中日双语 POC。开始新任务前，先读 [技术架构](02-architecture.md)、[数据契约](03-data-contracts.md)、[任务分工](04-task-breakdown.md) 与负责模块的 Agent 定义。

1. 在现有 Next.js 应用内实施改动。题库生成、可核验判分、诊断状态和模型讲解各自维护。
2. 修改共享字段时同步类型、Zod 校验、接口消费者和文档。新增或修改题型时检查双语匹配、换题上下文和学习总结。
3. 保持 Mock 可用，真实供应商通过服务端环境变量配置。真模型验收使用合成题与示例回答。
4. 执行 `npm run lint`、`npm run typecheck`、`npm test` 和 `npm run build`，记录实测结果及未覆盖项。
5. 需要并行开发时按 Agent 文件的模块归属分工。正式版安全按 [TODO](12-production-safety-todo.md)追踪。
