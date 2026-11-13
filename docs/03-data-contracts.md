# 数据契约

共享类型以 `src/types/tutor.ts` 为准。请求与模型输出校验在 `src/lib/chat-contract.ts`。

## POST /api/chat

| 请求字段 | 约定 |
| --- | --- |
| `grade` | 固定为 5 |
| `language` | 可选 `zh` 或 `ja`。界面默认中文并显式发送。旧请求未传时后端默认日语 |
| `practice` | 可选 `{ nodeId, question }`，表示当前练习题。节点为 meaning、relation、percent、decimal、area、volume 之一 |
| `curriculumNodeId`、`diagnosis` | 客户端回传字段。后端根据当前练习与消息历史重算知识点及诊断 |
| `messages` | 1 到 25 条，学生和老师交替，从学生消息开始并以学生消息结尾。每条最多 600 字符 |
| `modelSettings` | 本地网页可选配置。Mock 只传 `provider`；真实模型传 `provider`、`baseUrl`、`model`、`apiKey`。仅接受同源本地请求，配置不会出现在响应中。 |

请求体上限 96 KiB。失败返回 `{ error: { code, messageJa, retryable } }`。400 表示 JSON 或请求无效，413 表示过大，502 表示辅导失败，504 表示超时。前端用错误代码呈现对应语言。

| 成功响应字段 | 约定 |
| --- | --- |
| `replyJa`、`curriculumTitleJa` | 教学回复、知识点名，保留旧字段名并按请求语言返回 |
| `curriculumNodeId` | 识别出的知识点，未知为 null |
| `diagnosis` | `misconceptionId`、`status`、`evidence`、可选 `verificationCount` |
| `nextAction` | `explain`、`give_hint`、`ask_diagnostic_question` 或 `verify_understanding` |
| `practice` | 换题时返回新练习，客户端切换作答上下文 |
| `assessment` | 程序核验，包含 `question`、可选 `answer`、`outcome`。结果为正确、数值有误、单位有误或比较结论有误 |
| `modelAssessment` | AI 判分，包含 `question`、`verdict`、`reason`。判定为正确、部分正确或错误 |
| `answerRecorded` | 识别为作答但缺少有效判分时可返回 `true` |

模型输出 JSON 与对外响应分开。模型仅返回 `replyJa` 和可选的 `assessment`。模型判定为 `ungradable` 时不生成 `modelAssessment`。误区证据最多保留 12 条规则事件，状态为 `unknown`、`suspected`、`confirmed`、`resolved`。
