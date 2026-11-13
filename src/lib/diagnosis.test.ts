import { describe, expect, it } from "vitest";
import { planDiagnosis, proposeMisconception, unknownDiagnosis } from "./diagnosis";
import type { DiagnosisState } from "../types/tutor";

const scenarios = [
  {
    id: "reversed", node: "relation",
    signal: "割合は基準量 ÷ 比較量だと思います",
    confusing: "割合は比較量 ÷ 基準量だと思います",
    differentQuestionWrong: "5人です",
    differentQuestionCorrect: "２０人。",
    checks: ["30人", "80枚"],
  },
  {
    id: "additive", node: "relation",
    signal: "割合は引き算で求めますか？",
    confusing: "割合は引き算ではなく割り算です",
    differentQuestionWrong: "２０−５",
    differentQuestionCorrect: "5÷20",
    checks: ["6÷30", "8/40"],
  },
  {
    id: "decimal_shift", node: "percent",
    signal: "0.25は2.5%ですか？",
    confusing: "0.25は25%だと思います",
    differentQuestionWrong: "３％",
    differentQuestionCorrect: "30パーセントです",
    checks: ["40%", "８％です"],
  },
  {
    id: "times_percent", node: "percent",
    signal: "0.5倍は0.5%ですか？",
    confusing: "0.5倍は50%です",
    differentQuestionWrong: "0.5%",
    differentQuestionCorrect: "５０％です",
    checks: ["20%", "150%"],
  },
  {
    id: "calculation_slip", node: "relation",
    signal: "割合の式は5÷20=0.3です",
    confusing: "5÷20=0.3",
    differentQuestionWrong: "20÷5",
    differentQuestionCorrect: "5/20",
    checks: ["0.2", "0.3"],
  },
];

describe.each(scenarios)("$id", (scenario) => {
  const turn = (message: string, previous: DiagnosisState = unknownDiagnosis) =>
    planDiagnosis({ message, nodeId: scenario.node, previous });

  it("proposes a single rule and asks a diagnostic question without confirming", () => {
    expect(proposeMisconception(scenario.signal, scenario.node)).toBe(scenario.id);
    const plan = turn(scenario.signal);
    expect(plan.diagnosis).toMatchObject({ misconceptionId: scenario.id, status: "suspected" });
    expect(plan.nextAction).toBe("ask_diagnostic_question");
    expect(plan.questionJa).toContain("？");
    expect(plan.diagnosis.evidence).not.toContain(scenario.signal);
  });

  it("does not infer the misconception from a superficially similar answer", () => {
    expect(turn(scenario.confusing).diagnosis).toEqual(unknownDiagnosis);
  });

  it("keeps unknown without initial evidence and suspected without diagnostic evidence", () => {
    expect(turn("わかりません").diagnosis).toEqual(unknownDiagnosis);
    const suspected = turn(scenario.signal).diagnosis;
    expect(turn("わかりません", suspected).diagnosis).toEqual(suspected);
  });

  it("asks two distinct verification questions before resolving", () => {
    const suspected = turn(scenario.signal).diagnosis;
    const diagnostic = turn(scenario.differentQuestionWrong, suspected);
    const slip = scenario.id === "calculation_slip";
    expect(diagnostic.diagnosis.status).toBe(slip ? "suspected" : "confirmed");
    const verify = turn(slip ? scenario.differentQuestionCorrect : "わかった", diagnostic.diagnosis);
    const first = turn(scenario.checks[0], verify.diagnosis);
    expect(verify.nextAction).toBe("verify_understanding");
    expect(first.diagnosis.verificationCount).toBe(1);
    expect(first.diagnosis.status).toBe(slip ? "suspected" : "confirmed");
    expect(first.questionJa).not.toBe(verify.questionJa);
    const second = turn(scenario.checks[1], first.diagnosis);
    expect(second.diagnosis.status).toBe("resolved");
    expect(second.diagnosis.evidence).toContain("確認問題2に正答");
  });

  if (scenario.id !== "calculation_slip") {
    it("clears a candidate refuted by a correct diagnostic answer", () => {
      const first = turn(scenario.signal);
      expect(turn(scenario.differentQuestionCorrect, first.diagnosis).diagnosis)
        .toMatchObject({ misconceptionId: null, status: "unknown" });
    });
  }
});

it("a wrong verification answer breaks the consecutive streak", () => {
  const turn = (message: string, previous: DiagnosisState = unknownDiagnosis) =>
    planDiagnosis({ message, nodeId: "percent", previous });
  const first = turn("0.25は2.5%ですか？");
  const second = turn("3%", first.diagnosis);
  const third = turn("わかった", second.diagnosis);
  const fourth = turn("40%", third.diagnosis);
  const retry = turn("0.8%", fourth.diagnosis);
  expect(retry.diagnosis).toMatchObject({ status: "confirmed", verificationCount: 0 });
  expect(retry.questionJa).toBe(third.questionJa);
  expect(turn("8%", retry.diagnosis).diagnosis.status).toBe("confirmed");
});

it("does not use an old diagnostic question after switching to another node", () => {
  const { diagnosis } = planDiagnosis({
    message: "0.25は2.5%ですか？", nodeId: "percent", previous: unknownDiagnosis,
  });
  expect(planDiagnosis({ message: "3%", nodeId: "relation", previous: diagnosis }).diagnosis)
    .toEqual(unknownDiagnosis);
});

it("does not choose a diagnosis from two competing signals", () => {
  expect(proposeMisconception("引き算で割合を出すか、基準量÷比較量ですか？", "relation"))
    .toBeNull();
});

it.each([
  ["20人のうち5人が参加した割合は20÷5です", "reversed"],
  ["20人のうち5人が参加した割合は20−5です", "additive"],
  ["20人のうち5人が参加した割合は5÷20=0.3です", "calculation_slip"],
  ["20人のうち5人が参加した割合は5÷20=25％です", null],
])("interprets an explicit part/whole setup: %s", (message, expected) => {
  expect(proposeMisconception(message, "relation")).toBe(expected);
});
