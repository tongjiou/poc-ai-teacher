import rawRules from "../data/misconceptions.json";
import type { DiagnosisState, NextAction } from "../types/tutor";

type Rule = (typeof rawRules)[number];
export type DiagnosisPlan = {
  diagnosis: DiagnosisState;
  nextAction: NextAction;
  questionJa?: string;
  hintJa?: string;
};

export const unknownDiagnosis: DiagnosisState = {
  misconceptionId: null,
  status: "unknown",
  evidence: [],
};

function normalize(message: string): string {
  return message.normalize("NFKC").replace(/\s/g, "").replace(/[−－]/g, "-").replace(/パーセント/g, "%");
}

function normalizeAnswer(message: string): string {
  return normalize(message)
    .replace(/(?:だと思います|だと思う|になります|を選びます|です|だよ|だ)?[。.!！?？、]*$/, "");
}

function isAnswer(message: string, answers: string[]): boolean {
  return answers.some((answer) => normalizeAnswer(message) === normalize(answer));
}

function lookup(id: string | null): Rule | undefined {
  return rawRules.find((rule) => rule.id === id);
}

function matchesNode(rule: Rule, nodeId: string | null): boolean {
  return nodeId === rule.curriculumNodeId ||
    (nodeId === "meaning" && ["additive", "times_percent"].includes(rule.id));
}

function observe(message: string, nodeId: string | null): Rule | undefined {
  const text = normalize(message);
  if (/(逆ではない|ではない|じゃない|ではなく|じゃなく|間違いだと|違うと思)/.test(text)) return;
  const possible = new Set<string>();
  if (/(?:基準量|全体|もとにする量|元にする量)(?:を|は)?(?:÷|\/|割る)(?:比較量|部分|比べられる量)/.test(text) ||
      /(?:基準量|全体|もとにする量)を(?:比較量|部分|比べられる量)で割/.test(text)) {
    possible.add("reversed");
  }
  if (/(?:割合|わりあい).{0,12}(?:足し算|たし算|引き算|ひき算)|(?:足し算|たし算|引き算|ひき算).{0,10}(?:割合|わりあい)/.test(text) ||
      /(?:基準量|全体|もとにする量)[+-](?:比較量|部分|比べられる量)/.test(text)) {
    possible.add("additive");
  }
  const numberUnit = text.match(/(\d+(?:\.\d+)?)(倍|%)?(?:は|=|→|が)(\d+(?:\.\d+)?)(倍|%)/);
  if (numberUnit) {
    const [, first, firstUnit, second, secondUnit] = numberUnit;
    const a = Number(first);
    const b = Number(second);
    if (a > 0 && a === b && firstUnit && firstUnit !== secondUnit) possible.add("times_percent");
    if (a > 0 && a < 1 && !firstUnit && secondUnit === "%" && close(a * 10, b)) possible.add("decimal_shift");
  }
  if (/10倍(?:して|すれば|すると).{0,6}(?:%|百分率)/.test(text)) possible.add("decimal_shift");

  // Require both quantities and a clearly stated part/whole relationship before interpreting a numeric setup.
  const partWhole = text.match(/(\d+(?:\.\d+)?)(人|枚|個|本|冊|円|m|kg)?(?:のうち|中)(\d+(?:\.\d+)?)(?:人|枚|個|本|冊|円|m|kg)?/);
  if (partWhole) {
    const base = Number(partWhole[1]);
    const part = Number(partWhole[3]);
    const expression = text.slice((partWhole.index ?? 0) + partWhole[0].length)
      .match(/(\d+(?:\.\d+)?)([+\-÷/])(\d+(?:\.\d+)?)(?:=(\d+(?:\.\d+)?)(%?))?/);
    if (expression && base > part && part > 0) {
      const [, left, op, right, result, unit] = expression;
      const isReversed = Number(left) === base && Number(right) === part;
      const isStandard = Number(left) === part && Number(right) === base;
      if ((isReversed || isStandard) && (op === "+" || op === "-")) possible.add("additive");
      if (isReversed && (op === "÷" || op === "/")) possible.add("reversed");
      if (isStandard && (op === "÷" || op === "/") && result &&
          !close(part / base * (unit === "%" ? 100 : 1), Number(result))) {
        possible.add("calculation_slip");
      }
    }
  }

  // Without explicit part/whole quantities, require the student to state the comparison ÷ base setup.
  const arithmetic = text.match(/(?:割合の式|比較量を基準量で割る式|比べられる量÷もとにする量)(?:は|:|=)(\d+(?:\.\d+)?)[÷/](\d+(?:\.\d+)?)=(\d+(?:\.\d+)?)(%?)/);
  if (arithmetic) {
    const [, numerator, denominator, result, unit] = arithmetic;
    const expected = Number(numerator) / Number(denominator) * (unit === "%" ? 100 : 1);
    if (Number.isFinite(expected) && !close(expected, Number(result))) possible.add("calculation_slip");
  }
  const candidates = rawRules.filter((rule) => matchesNode(rule, nodeId) && possible.has(rule.id));
  return candidates.length === 1 ? candidates[0] : undefined;
}

function close(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1e-9;
}

export function proposeMisconception(message: string, nodeId: string | null): string | null {
  return observe(message, nodeId)?.id ?? null;
}

export function selectDiagnosticQuestion(misconceptionId: string | null): string | undefined {
  return lookup(misconceptionId)?.diagnosticQuestionJa;
}

function record(state: DiagnosisState, eventJa: string, status = state.status): DiagnosisState {
  return { ...state, status, evidence: [...state.evidence, eventJa].slice(-12) };
}

function ask(rule: Rule, diagnosis: DiagnosisState): DiagnosisPlan {
  return { diagnosis, nextAction: "ask_diagnostic_question", questionJa: rule.diagnosticQuestionJa };
}

export function resolveDiagnosis(previous: DiagnosisState, message: string): DiagnosisPlan | null {
  const rule = lookup(previous.misconceptionId);
  const count = previous.verificationCount;
  if (!rule || count === undefined || !Number.isInteger(count) || count < 0 ||
      count >= rule.verification.length ||
      (previous.status !== "confirmed" &&
       !(rule.id === "calculation_slip" && previous.status === "suspected"))) return null;
  const check = rule.verification[count];
  if (isAnswer(message, check.answers)) {
    const next = count + 1;
    const diagnosis = record({ ...previous, verificationCount: next }, `確認問題${next}に正答`,
      next === rule.verification.length ? "resolved" : previous.status);
    return next === rule.verification.length
      ? { diagnosis, nextAction: "explain", hintJa: "二つの確認問題に続けて正しく答えられましたね。" }
      : { diagnosis, nextAction: "verify_understanding", questionJa: rule.verification[next].questionJa };
  }

  // A non-answer does not progress the count; require consecutive successes after a wrong attempt.
  const attempted = /^[-+\d]/.test(normalizeAnswer(message));
  const diagnosis = attempted
    ? record({ ...previous, verificationCount: 0 }, "確認問題に正答できず、連続正答を最初から確認")
    : previous;
  return {
    diagnosis,
    nextAction: "verify_understanding",
    questionJa: rule.verification[attempted ? 0 : count].questionJa,
    ...(attempted ? { hintJa: rule.correctionHintJa } : {}),
  };
}

export function updateDiagnosis({
  message,
  nodeId,
  previous,
}: {
  message: string;
  nodeId: string | null;
  previous: DiagnosisState;
}): DiagnosisPlan {
  const current = lookup(previous.misconceptionId);
  if (current && matchesNode(current, nodeId)) {
    const verification = resolveDiagnosis(previous, message);
    if (verification) return verification;

    if (previous.status === "suspected") {
      if (isAnswer(message, current.diagnosticCorrectAnswers)) {
        if (current.id === "calculation_slip") {
          return {
            diagnosis: record({ ...previous, verificationCount: 0 }, "割合の式は正しい。計算だけを別に確認"),
            nextAction: "verify_understanding",
            questionJa: current.verification[0].questionJa,
            hintJa: current.correctionHintJa,
          };
        }
        return {
          diagnosis: record(unknownDiagnosis, "診断質問に正答。誤解を確認できなかった"),
          nextAction: "give_hint",
        };
      }
      if (current.id !== "calculation_slip" && isAnswer(message, current.diagnosticWrongAnswers)) {
        return {
          diagnosis: record(previous, "別の診断質問でも同じ誤りが見られた", "confirmed"),
          nextAction: "give_hint",
          hintJa: current.correctionHintJa,
        };
      }
      return ask(current, previous);
    }

    if (previous.status === "confirmed") {
      return {
        diagnosis: { ...previous, verificationCount: 0 },
        nextAction: "verify_understanding",
        questionJa: current.verification[0].questionJa,
      };
    }
  }

  const candidate = observe(message, nodeId);
  if (candidate) {
    return ask(candidate, record(
      { ...unknownDiagnosis, misconceptionId: candidate.id },
      `誤りの候補: ${candidate.descriptionJa}。追加の確認が必要`,
      "suspected",
    ));
  }
  if (current && previous.status === "resolved" && matchesNode(current, nodeId)) {
    return { diagnosis: previous, nextAction: "give_hint" };
  }
  return {
    diagnosis: previous.status === "unknown" && nodeId ? previous : unknownDiagnosis,
    nextAction: nodeId ? "give_hint" : "explain",
  };
}

export const planDiagnosis = updateDiagnosis;

const chineseFeedback = new Map<string, string>([
  ["二つの確認問題に続けて正しく答えられましたね。", "你连续答对了两道验证题。这个方法也能用在别的题里！"],
]);

for (const rule of rawRules) {
  chineseFeedback.set(rule.diagnosticQuestionJa, rule.diagnosticQuestionZh);
  chineseFeedback.set(rule.correctionHintJa, rule.correctionHintZh);
  for (const check of rule.verification) chineseFeedback.set(check.questionJa, check.questionZh);
}

export function localizeFeedback(text: string | undefined, language: "zh" | "ja") {
  return text && language === "zh" ? chineseFeedback.get(text) ?? text : text;
}
