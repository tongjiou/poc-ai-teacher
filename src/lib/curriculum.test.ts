import { describe, expect, it } from "vitest";
import { getCurriculumNode, getPrerequisites, listCurriculumNodes, matchCurriculumNode } from "./curriculum";

const cases: [question: string, current: string | null, expected: string | null][] = [
  ["割合って何？", null, "meaning"],
  ["12本のうち青は3本です。青の割合は何を表しますか？", null, "meaning"],
  ["2本は8本の何倍ですか？", null, "meaning"],
  ["割合の意味を教えて", "percent", "meaning"],
  ["基準量と比較量をどう見分ける？", null, "relation"],
  ["もとにする量が40個で、割合が0.3です。比べられる量は何個ですか？", null, "relation"],
  ["24人が全体の0.6にあたります。もとにする量は何人ですか？", null, "relation"],
  ["30人のうち6人は何％ですか？", "meaning", "relation"],
  ["割合を求めるには、6÷30で合っていますか？", "percent", "relation"],
  ["0.25を百分率で表すと何％ですか？", null, "percent"],
  ["４０％を小数で表すといくつですか？", "meaning", "percent"],
  ["0.25 は 2.5% ですか？", "relation", "percent"],
  ["1.2倍は何パーセントですか？", null, "percent"],
  ["25%です", "relation", "relation"],
  ["2.5です", "percent", "percent"],
  ["どうして？", "meaning", "meaning"],
  ["円周率を教えて", "percent", null],
  ["今日の天気は？", "relation", null],
  ["今日は何を食べよう？", "meaning", null],
  ["さっぱり分からない", null, null],
];

describe("grade five curriculum matching", () => {
  it.each(cases)("routes %s (current: %s) to %s", (question, current, expected) => {
    expect(matchCurriculumNode(question, current)?.id ?? null).toBe(expected);
  });

  it("exposes the supported grade-five nodes with Japanese prerequisites and two examples each", () => {
    expect(listCurriculumNodes(5).map((node) => node.id)).toEqual(["meaning", "relation", "percent", "decimal", "area", "volume"]);
    expect(listCurriculumNodes(4)).toEqual([]);
    expect(getCurriculumNode("other")).toBeNull();
    expect(getPrerequisites("percent")).toContain("割合の意味");
    expect(listCurriculumNodes(5).every((node) => node.examplesJa.length === 2)).toBe(true);
  });
});
