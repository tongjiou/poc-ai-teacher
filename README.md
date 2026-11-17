# AI 问答老师 POC（ai-juku-poc）

根据用户提供的[分享会话](https://chatgpt.com/s/t_6af522d85ac08191ae0b5caa0994d484)正文整理。面向日本小学五年级，提供比例、小数乘除法、平面图形面积、长方体和正方体体积。支持中日双语文字聊天和浏览器朗读。误区诊断演示集中在「割合」。

## 本地启动

建议使用 Node.js 22.12+ 或 24（含测试工具）。在项目目录运行：

```sh
npm ci
npm run dev
```

打开 http://127.0.0.1:3000 ，在弹出的「模型设置」中填写配置。默认显示中文，右上角可切换「中文／日本語」。两种语言各自保留当前页面内的对话。例题按钮每次会让老师出一道新题。输入答案后，老师会围绕当前题目继续辅导。要重现固定的误区演示，手动输入「0.25 是 2.5% 吗？」，再依次回复 `3%` → `我明白了` → `40%` → `8%`，查看「学习总结与辅导向导」中的不足点分析观察从可能有误区到已验证纠正的过程。点击老师消息下的「朗读」可听取对应语言，语音由浏览器和系统提供。

## 接入模型

首次打开或刷新页面会弹出「模型设置」。供应商、基础地址和模型名预填为 `deepseek`、`https://api.deepseek.com`、`deepseek-flash`。API Key 留空，输入时隐藏，只保存在当前页面内存中，不写入浏览器存储或配置文件。选择 Mock 可离线体验。开始使用后，仍可点击「模型设置」更换配置。

也可以选择 `qwen`（默认模型 `qwen3.8-flash`）或 `compatible`（需填写基础地址和模型名）。基础地址使用 HTTPS，不含 `/chat/completions`。网页配置仅用于本地页面，随聊天请求提交给本地服务，由服务端调用模型。未提交网页配置的 API 调用仍可使用服务端环境变量，未设置供应商时使用 Mock。

真模型会收到最近的教学消息；首次验证请只使用合成题和示例回答。证据追问、纠正提示与验证题由规则提供；服务端有校验、超时和可重试错误。Mock 是本地教学流程演示，不提供开放式问答。

公网演示时，在构建阶段设 `NEXT_PUBLIC_TUTOR_PUBLIC_MODE=1`，在运行阶段设 `TUTOR_PUBLIC_ORIGIN` 为访客访问的 HTTPS 地址（如使用非标准端口，包含端口；不加尾斜杠）。让 HTTPS 代理转发至仅监听本机的 Next.js 服务。公网模式默认 Mock；DeepSeek 和 Qwen 使用固定地址与模型，访客自行提供 Key，服务端不会为访客使用环境变量中的 Key。

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

## 技术文档

| 文件 | 归档内容 |
| --- | --- |
| [技术选型](docs/01-tech-stack.md) | 前端、后端、模型、存储和部署的选型与理由 |
| [技术架构](docs/02-architecture.md) | 系统边界、模块职责、问答流程、运行时提示词调用关系 |
| [数据契约](docs/03-data-contracts.md) | 接口、请求与响应结构、错误处理 |
| [任务拆分](docs/04-task-breakdown.md) | 交付物、负责人、依赖和实施顺序 |
| [验收测试](docs/05-acceptance-tests.md) | 验收标准、测试场景和预期结果 |
| [运行时提示词](docs/06-tutor-prompt.md) | 教学、AI 判分和纯文本重试的提示词 |
| [Codex 开发启动指令](docs/07-codex-kickoff.md) | 会话中的实施指令与交付要求 |
| [课程数据](docs/08-curriculum-data.md) | 知识点、原创示例与匹配范围 |
| [诊断规则](docs/09-diagnosis-rules.md) | 五类错误、状态与验证样例 |
| [页面操作](docs/10-demo-ui.md) | 双语聊天、朗读和学习总结演示指南 |
| [QA 验收记录](docs/11-qa-report.md) | 覆盖范围、手动清单和通用 AI 对比模板 |
| [正式版儿童安全 TODO](docs/12-production-safety-todo.md) | 输入和输出审核、隐私、试点验收及事件处理 |

流程图可插入 Word。 [中文 PNG](docs/poc-llm-flow-zh.png) · [日语 PNG](docs/poc-llm-flow-ja.png)

## Agent

各文件记录对应 Agent 的职责、工作提示词、输入、输出和交接约定。产品运行时使用的模型提示词另行标记，避免与开发 Agent 的指令混用。

- [00 · 统筹](agents/00-lead.md)
- [01 · 课程](agents/01-curriculum.md)
- [02 · 学情诊断](agents/02-diagnosis.md)
- [03 · 聊天后端](agents/03-chat-backend.md)
- [04 · 前端](agents/04-frontend.md)
- [05 · 测试](agents/05-qa.md)
