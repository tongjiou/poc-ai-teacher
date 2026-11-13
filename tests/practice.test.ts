import { expect, it, vi } from "vitest";
import { practiceQuestion } from "../src/lib/practice";
import { normalizeChineseInput } from "../src/lib/chinese-input";
import { matchCurriculumNode } from "../src/lib/curriculum";

it.each(["zh", "ja"] as const)("keeps randomized %s examples in their intended curriculum topics", (language) => {
  const random = vi.spyOn(Math, "random");
  try {
    for (const [index, node] of ["meaning", "relation", "percent", "decimal", "area", "volume"].entries()) {
      for (const draw of [0, 0.26, 0.51, 0.76, 0.99]) {
        random.mockReturnValue(draw);
        const question = practiceQuestion(index, language);
        const input = language === "zh" ? normalizeChineseInput(question) : question;
        expect(matchCurriculumNode(input)?.id, question).toBe(node);
        expect(practiceQuestion(index, language, question)).not.toBe(question);
      }
    }
  } finally {
    random.mockRestore();
  }
});
