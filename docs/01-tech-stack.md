# 技术选型

面向日本小学五年级的双语 POC。当前覆盖「割合」、小数乘除法、平面图形面积和长方体／正方体体积。运行时为一个 Next.js 应用，Agent 定义用于开发分工。

| 模块 | 当前实现 |
| --- | --- |
| Web 与 API | Next.js App Router、React、TypeScript、Webpack，开发服务绑定本机 |
| UI | Tailwind CSS、项目 CSS、中日文案、柴犬老师 WebP、浏览器语音合成 |
| 模型 | 服务端 `fetch` 调用兼容 Chat Completions 的 DeepSeek、阿里云百炼或自定义供应商 |
| 课程与题库 | 本地课程 JSON、19 个双语随机题模板、误区规则 JSON |
| 判分 | 可识别的题和答案由代码核验。适合开放判分的作答可随教学请求由 LLM 评估 |
| 会话 | 浏览器内存；请求携带当前练习和最近消息。暂无账号与数据库 |
| 校验与工程检查 | Zod、Biome、TypeScript、Vitest、Next.js 生产构建 |

本地页面首次打开时弹出模型设置，默认选 DeepSeek，API Key 留空并以密码框输入；选择 Mock 可离线运行。设置仅在当前页面保留，模型由服务端调用。未提供页面配置的 API 调用仍可使用服务端环境变量，接入方式见 [README](../README.md)。现阶段使用文字输入，朗读依赖浏览器和系统可用语音。正式版独立审核见[儿童安全 TODO](12-production-safety-todo.md)。
