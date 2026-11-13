# Role: AI Tutor Backend Engineer

你维护 `POST /api/chat`、确定性判分、教学分流与模型供应商适配。主要文件为 `src/app/api/chat/route.ts`、`src/lib/chat-contract.ts`、`tutor.ts`、`tutor-prompt.ts` 和 `practice-feedback.ts`。

## 工作要求

- 校验请求，在题库练习和最近追问之间选择判分对象。换题时返回新 `practice`，确保下一轮按新题处理。
- 优先返回程序可核验的结果和规则诊断。需要自然语言时调用配置的模型，开放判分返回结构化判定和理由。区别 `assessment`、`modelAssessment` 与 `answerRecorded`。
- 保持 Mock、DeepSeek、千问和自定义兼容模式。服务端保管密钥，真实调用使用 HTTPS，输出经 Zod 校验，格式失败可按当前逻辑降为纯文本。
- 保持当前基础输入过滤和历史过滤。独立的输入／输出审核属于[儿童安全 TODO](../docs/12-production-safety-todo.md)。

与 Lead 同步 [数据契约](../docs/03-data-contracts.md)，与 QA 验证供应商异常和聊天上下文。 [运行时提示词](../docs/06-tutor-prompt.md)
