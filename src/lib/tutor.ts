import { z } from "zod";
import { getCurriculumNode, isUnsupportedTopic, matchCurriculumNode } from "./curriculum";
import { localizeFeedback, planDiagnosis } from "./diagnosis";
import { normalizeChineseInput } from "./chinese-input";
import { practiceQuestion } from "./practice";
import { compareParticipation, gradeArithmeticFollowup, gradeFractionFollowup, gradeNumericPractice } from "./practice-feedback";
import { modelReply } from "./chat-contract";
import { TUTOR_SYSTEM_JA } from "./tutor-prompt";
import { modelDefaults, type ModelSettings } from "./model-settings";
import { emptyDiagnosis, practiceNodes, type ChatResponse, type CurriculumNode, type TutorSession } from "../types/tutor";

const providers = {
  qwen: { ...modelDefaults.qwen, extra: { enable_thinking: false } },
  deepseek: { ...modelDefaults.deepseek, extra: { thinking: { type: "disabled" } } },
  compatible: { ...modelDefaults.compatible, extra: {} },
};
const envelope = z.object({ choices: z.array(z.object({
  finish_reason: z.string().optional(), message: z.object({ content: z.string() }),
})).min(1) });
const hints: Record<string, string> = {
  decimal: "小数のかけ算では、整数として計算してから小数点の位置を考えよう。わり算では、わる数が整数になるように両方を同じだけ10倍しよう。",
  area: "まず図形の形と、底辺に垂直な高さを確かめよう。",
  volume: "たてと横をかけると一段分。高さは何段分になるかな？",
  meaning: "もとにする量を1と見て、くらべる量がその何倍かを考えるのが「割合」だよ。たとえば、8本をもとにすると、2本はその何倍かな？",
  relation: "まず、何をもとにしてくらべているかを見つけよう。問題に出てくる量のうち、全体を表すのはどれかな？",
  percent: "もとにする量を100と見たとき、いくつ分かを考えよう。小数で表した割合を100倍すると、百分率の数になるよ。",
};
const chineseTopics: Record<string, { title: string; hint: string }> = {
  decimal: { title: "小数乘除法", hint: "小数乘法可以先按整数相乘，再确定小数点。除法可以把被除数和除数同时扩大相同的倍数，让除数变成整数。" },
  area: { title: "平面图形面积", hint: "先看是哪种图形，再找底边和垂直于底边的高。" },
  volume: { title: "长方体和正方体的体积", hint: "用长乘宽求出一层有多少个单位立方体，再想一共有几层。" },
  meaning: { title: "比例的含义", hint: "把基准量看作 1，比例表示比较量是它的几倍。比如以 8 支笔为基准，2 支笔是它的几倍呢？" },
  relation: { title: "比较量、基准量与比例", hint: "先找出用来做比较的基准。题目里的哪个数量表示全体？" },
  percent: { title: "小数和百分数", hint: "把基准量看成 100。想一想，把小数乘以 100 后得到多少？" },
};
const safety = /死にたい|自殺|自傷|消えたい|殺し方|爆弾.{0,8}作り|想死|不想活|自杀|自残|制造炸弹/;
const personal = /(?:電話番号|住所|本名|名前|姓名|地址|电话号码|手机号)(?:は|是|[：:]).{2,}|[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b0\d{1,4}[-‐ー]\d{1,4}[-‐ー]\d{4}\b/i;

async function generate(session: TutorSession, node: CurriculumNode, nextAction: ChatResponse["nextAction"], fallback: string, assessAnswer: boolean, settings?: ModelSettings) {
  const provider = settings?.provider ?? (process.env.TUTOR_PROVIDER?.trim() || "mock");
  if (provider === "mock") return { replyJa: fallback };
  if (!Object.hasOwn(providers, provider)) throw new Error("Unknown tutor provider");
  const defaults = providers[provider as keyof typeof providers];
  const configured = settings?.provider === "mock" ? undefined : settings;
  const key = configured?.apiKey ?? process.env.TUTOR_API_KEY;
  const model = configured?.model ?? (process.env.TUTOR_MODEL || defaults.model);
  const baseUrl = configured?.baseUrl ?? (process.env.TUTOR_BASE_URL || defaults.baseUrl);
  if (!key || !model || !baseUrl) throw new Error("Incomplete tutor configuration");
  const url = new URL(`${baseUrl.replace(/\/+$/, "")}/chat/completions`);
  if (url.protocol !== "https:") throw new Error("Tutor provider requires HTTPS");

  const languageInstruction = session.language === "zh"
    ? "\n本次对话使用简体中文。请用适合小学五年级学生的简体中文回答，并将答复放在 JSON 字段 replyJa 中。"
    : "";
  const context = { titleJa: node.titleJa, learningGoalJa: node.learningGoalJa, prerequisites: node.prerequisites, nextAction, fallback };
  const system = `${TUTOR_SYSTEM_JA}${languageInstruction}\n教材コンテキスト: ${JSON.stringify(context)}`;
  const withoutFormat = system.replace(/出力は .*JSON オブジェクトだけです。|并将答复放在 JSON 字段 replyJa 中。/g, "");
  const recent = session.messages.slice(-9);
  if (session.practice) recent.unshift({ role: "assistant", content: session.practice.question });
  const gradingInstruction = assessAnswer
    ? `\nEvaluate the student's latest message against the most recent teacher question it answers. If the last teacher message contains no question, use the active practice question at the beginning of the dialogue. Solve the question independently and accept mathematically equivalent answers. Do not infer correctness from earlier praise or use the result of a different question. Give "partially_correct" only when a specific step is correct and a required part is missing or wrong. If there is no clear answer or no identifiable question, give "ungradable". Return JSON with "replyJa" and "assessment": {"verdict":"correct|partially_correct|incorrect|ungradable","reason":"short specific explanation"}. Use exactly one verdict. The reason and student-facing reply must both be in ${session.language === "zh" ? "Simplified Chinese" : "Japanese"} and agree on the result.`
    : "";
  const history = recent.map((message) =>
    personal.test(message.content) || safety.test(message.content)
      ? { ...message, content: session.language === "zh" ? "［已省略］" : "［安全のため省略］" }
      : message
  );
  const signal = AbortSignal.timeout(12_000);
  const authorization = `Bearer ${key}`;

  async function complete(plainText: boolean) {
    const formatInstruction = session.language === "zh"
      ? "只输出给学生看的简短中文回复，最多 120 字。直接输出纯文本。"
      : "児童向けの短い日本語の返答だけを、プレーンテキストで出力してください。120文字以内です。";
    const prompt = plainText
      ? `${withoutFormat}\n${formatInstruction}`
      : assessAnswer ? `${withoutFormat}${gradingInstruction}` : system;
    const response = await fetch(url, {
      method: "POST",
      headers: { Authorization: authorization, "Content-Type": "application/json" },
      redirect: "error",
      signal,
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: prompt }, ...history],
        max_tokens: 350,
        ...(plainText ? {} : { response_format: { type: "json_object" } }),
        ...defaults.extra,
      }),
    });
    if (!response.ok) {
      console.warn("[tutor] Provider HTTP error", { provider, status: response.status });
      throw new Error("Tutor provider unavailable");
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      if (signal.aborted) throw error;
      return null;
    }
    const result = envelope.safeParse(payload);
    const choice = result.success ? result.data.choices[0] : undefined;
    if (!choice || choice.finish_reason === "length" || choice.finish_reason === "content_filter") return null;

    try {
      const content = choice.message.content.trim();
      const parsed = plainText
        ? { replyJa: content }
        : JSON.parse(content.replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i, "$1"));
      return modelReply.safeParse(parsed).data ?? null;
    } catch {
      return null;
    }
  }

  const reply = await complete(false);
  if (reply) return reply;
  console.warn("[tutor] Retrying invalid model response as text", { provider });
  const retry = await complete(true);
  if (!retry) throw new Error("Invalid tutor response");
  return retry;
}

function explainDecimalConversion(message: string) {
  const match = message.replace(/\s/g, "").match(/^(\d{1,9})\.(\d{1,9})=何%[?。]?$/);
  if (!match) return null;
  const [, whole, fraction] = match;
  const percentWhole = `${whole}${fraction.padEnd(2, "0").slice(0, 2)}`.replace(/^0+(?=\d)/, "");
  const percentFraction = fraction.slice(2).replace(/0+$/, "");
  const percent = percentFraction ? `${percentWhole}.${percentFraction}` : percentWhole;
  return `${whole}.${fraction} 等于 ${percent}%。把小数写成百分数时，先乘以 100，再加上百分号。`;
}

function requestsAnotherQuestion(message: string) {
  const text = message.normalize("NFKC").replace(/\s/g, "").replace(/[。!?！]+$/, "");
  return /^(?:请)?(?:再来(?:一[个道题]|一道题|一题)|再出(?:一[个道题]|一道题|一题)|换(?:一[个道题]|一道题|一题)|下一题)(?:吧|吗)?$|^还有(?:别的|其他|其它)题(?:吗)?$|^(?:もう一問(?:ください|お願いします)?|次の問題(?:をください|をお願いします)?|別の問題(?:をください|をお願いします)?)$/.test(text);
}

export async function tutorReply(session: TutorSession, settings?: ModelSettings): Promise<ChatResponse> {
  const language = session.language ?? "ja";
  const zh = language === "zh";
  let nodeId: string | null = session.practice?.nodeId ?? null;
  let diagnosis = emptyDiagnosis();
  let plan: ReturnType<typeof planDiagnosis> | undefined;
  // Reconstruct from the bounded dialogue, never from client-supplied diagnosis fields.
  // An answer can change the diagnosis only if the preceding reply actually showed the planned question.
  for (let i = 0; i < session.messages.length; i += 2) {
    const original = session.messages[i].content;
    if (safety.test(original) || personal.test(original)) continue;
    const message = zh ? normalizeChineseInput(original) : original;
    const expectedQuestion: string | undefined = localizeFeedback(plan?.questionJa, language);
    const asked: boolean = !expectedQuestion || session.messages[i - 1]?.content.includes(expectedQuestion);
    const matched: CurriculumNode | null = matchCurriculumNode(message, nodeId);
    const matchedId: string | null = matched?.id
      ?? (requestsAnotherQuestion(original) ? nodeId : null)
      ?? (session.practice && !isUnsupportedTopic(message) ? session.practice.nodeId : null);
    if (!asked || matchedId !== nodeId) diagnosis = emptyDiagnosis();
    nodeId = matchedId;
    plan = nodeId ? planDiagnosis({ message, nodeId, previous: diagnosis }) : undefined;
    diagnosis = plan?.diagnosis ?? emptyDiagnosis();
  }

  const message = session.messages.at(-1)?.content ?? "";
  const node = getCurriculumNode(nodeId);
  const topic = node && chineseTopics[node.id];
  const state = { curriculumNodeId: nodeId, curriculumTitleJa: (zh ? topic?.title : node?.titleJa) ?? null, diagnosis };
  if (safety.test(message)) return { ...state, nextAction: "explain", replyJa: zh ? "你的安全很重要。请现在就告诉身边可信任的大人，让他们陪你一起处理。" : "いまは算数より、あなたの安全が大切です。ひとりで抱えず、近くの信頼できる大人に今すぐ話してね。" };
  if (personal.test(message)) return { ...state, nextAction: "explain", replyJa: zh ? "这里不用填写姓名、地址或电话。请去掉个人信息，只发送数学题。" : "名前や住所、電話番号は書かなくて大丈夫だよ。個人情報を入れずに、算数の問題だけ送ってね。" };
  const practiceNode = practiceNodes.find((id) => id === (nodeId ?? session.practice?.nodeId));
  if (practiceNode && requestsAnotherQuestion(message)) {
    const question = practiceQuestion(practiceNodes.indexOf(practiceNode), language, session.practice?.question);
    const title = zh ? chineseTopics[practiceNode]?.title : getCurriculumNode(practiceNode)?.titleJa;
    return {
      curriculumNodeId: practiceNode,
      curriculumTitleJa: title ?? null,
      diagnosis: emptyDiagnosis(),
      nextAction: "explain",
      replyJa: question,
      practice: { nodeId: practiceNode, question },
    };
  }
  if (!node || !plan) return { ...state, nextAction: "explain", replyJa: zh ? "这里可以一起练习小学五年级的比例、小数乘除法、面积和体积。你想问哪道题？" : "ここでは小学5年生の割合、小数のかけ算とわり算、面積、体積を練習できるよ。" };
  let activePractice = session.practice;
  const replacementIndex = session.messages.slice(0, -1).findLastIndex((turn) =>
    turn.role === "user" && requestsAnotherQuestion(turn.content)
  );
  const previousReply = replacementIndex >= 0 ? session.messages[replacementIndex + 1] : undefined;
  // Earlier clients may still have a replacement exercise produced by the model.
  if (previousReply?.role === "assistant") {
    const question = previousReply.content.split(/[？?]/, 1)[0];
    activePractice = practiceNode && ["decimal", "area", "volume"].includes(practiceNode)
      ? { nodeId: practiceNode, question } : undefined;
  }
  const latestReply = session.messages.at(-2);
  const isFollowupQuestion = latestReply?.role === "assistant" && latestReply !== previousReply && /[？?]/.test(latestReply.content);
  const followup = isFollowupQuestion && latestReply && diagnosis.status === "unknown"
    ? gradeFractionFollowup(latestReply.content, message, language)
      ?? gradeArithmeticFollowup(latestReply.content, message, language) : null;
  if (followup) return { ...state, nextAction: "explain", ...followup };
  const comparison = !isFollowupQuestion && nodeId === activePractice?.nodeId && diagnosis.status === "unknown"
    ? compareParticipation(activePractice, message, language) ?? gradeNumericPractice(activePractice, message, language) : null;
  if (comparison && activePractice) {
    return { ...state, nextAction: "explain", replyJa: comparison.replyJa,
      assessment: { question: activePractice.question, outcome: comparison.outcome } };
  }
  const conversion = zh && nodeId === "percent" && diagnosis.status === "unknown"
    ? explainDecimalConversion(normalizeChineseInput(message)) : null;
  if (conversion) return { ...state, nextAction: "explain", replyJa: conversion };
  const nextAction = plan.nextAction;
  const fallback = zh
    ? topic?.hint ?? "你是用什么算式来想的呢？"
    : hints[node.id] ?? "どんな式で考えたか教えてね。";
  // Exact diagnostic/verification wording is part of the evidence contract.
  const question = localizeFeedback(plan.questionJa, language);
  const hint = localizeFeedback(plan.hintJa, language);
  const targetQuestion = isFollowupQuestion ? latestReply?.content
    : activePractice?.nodeId === nodeId ? activePractice.question : undefined;
  const answerRecorded = Boolean(targetQuestion)
    && (!/[？?]/.test(message) || /\d.*(?:对吗|正确吗|合っていますか)[？?]?$/.test(message))
    && !/^(?:为什么|怎么|请问|帮我|给个提示|不知道|不懂|不会|なぜ|どうして|わかりません|ヒント)/.test(message.trim());
  if (question || hint) {
    return { ...state, nextAction, replyJa: [hint, question].filter(Boolean).join("\n"),
      ...(answerRecorded ? { answerRecorded: true } : {}) };
  }

  const generated = await generate({ ...session, practice: activePractice }, node, nextAction, fallback,
    answerRecorded && diagnosis.status === "unknown", settings);
  const assessment = generated.assessment;
  if (answerRecorded && diagnosis.status === "unknown" && targetQuestion && assessment && assessment.verdict !== "ungradable"
    && !safety.test(assessment.reason) && !personal.test(assessment.reason)) {
    return { ...state, nextAction, replyJa: generated.replyJa,
      modelAssessment: { question: targetQuestion, verdict: assessment.verdict, reason: assessment.reason } };
  }
  return { ...state, nextAction, replyJa: generated.replyJa, ...(answerRecorded ? { answerRecorded: true } : {}) };
}
