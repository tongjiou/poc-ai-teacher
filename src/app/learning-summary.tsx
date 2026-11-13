import { practiceNodes, type DiagnosisState, type ModelAssessment, type PracticeAssessment, type TutorLanguage } from "../types/tutor";
import { chatCopy } from "./chat-copy";

type NodeId = (typeof practiceNodes)[number];
type TopicProgress = {
  assessed: PracticeAssessment[];
  evaluated?: ModelAssessment[];
  ungraded?: number;
  diagnosis?: DiagnosisState;
};
export type LearningProgress = Partial<Record<NodeId, TopicProgress>>;

const copyByLanguage = {
  zh: {
    title: "学习总结与辅导向导", current: "当前知识点", noTopic: "还未开始",
    summary: "知识点总结", evaluation: "学习评价", gaps: "不足点分析", guide: "下一步辅导",
    hasUngraded: "已收到作答。暂未核验的答案不计入正确率。",
    empty: "先选一道例题作答，学习记录会显示在这里。",
    noEvidence: "暂时没有可自动判分的答案。",
    noGap: "目前没有足够证据确认具体不足。",
    noGrade: "待收集答题证据",
    ai: "AI 判分",
    verdicts: { correct: "正确", partially_correct: "部分正确", incorrect: "需要订正" },
    ungraded: (count: number) => `已收到 ${count} 次作答，暂未核验`,
    checkedAnswer: (answer: string, correct: boolean) => `已核验 ${answer} · ${correct ? "答对" : "待订正"}`,
    counts: (correct: number, total: number) => `${total} 道已判分 · ${correct} 道首次答对`,
    mixed: "已有可复习的错题，建议用新题验证改进。",
    positive: "已判分的题目前均答对，可以再做一道不同题型验证理解。",
    practice: "开始推荐练习",
    fallback: "先做一道比例题，看看你如何找到基准量。",
    resolved: "这项误区已通过两道验证题，建议再做一道同类新题巩固。",
    retry: "先复习下面的提示，再试一道同类新题。",
    evidence: "程序核验和 AI 判分分别记录。AI 评估可能出错，未判分的作答不计入结果。",
    issue: { calculation: "至少一道题的数值与标准答案不一致，原因还需要结合解题步骤确认。", unit: "至少一道题算对了数值，但填错了单位。", comparison: "至少一道题的比例比较结论有误。" },
    tips: ["先用部分除以全体，再比较两个比例。", "先找基准量，再写出比较量和比例的关系。", "把基准量看成 100，练习在小数和百分数之间换算。", "先写出算式，再检查小数点的位置。", "先辨认图形，找底和高，再写面积公式。面积用平方厘米。", "用长 × 宽 × 高计算，并用立方厘米表示体积。"],
  },
  ja: {
    title: "学習のまとめと次の練習", current: "学習中の内容", noTopic: "まだ始めていません",
    summary: "単元ごとのまとめ", evaluation: "学習の評価", gaps: "つまずきの確認", guide: "次の学習",
    hasUngraded: "回答を受け取りました。未採点の回答は正答数に含めません。",
    empty: "例題を選んで答えると、ここに学習記録が表示されます。",
    noEvidence: "自動採点できる回答はまだありません。",
    noGap: "具体的なつまずきはまだ確認できていません。",
    noGrade: "回答を確認中",
    ai: "AIによる採点",
    verdicts: { correct: "正解", partially_correct: "一部正解", incorrect: "要見直し" },
    ungraded: (count: number) => `未採点の回答 ${count} 件`,
    checkedAnswer: (answer: string, correct: boolean) => `確認済み ${answer} · ${correct ? "正解" : "見直し"}`,
    counts: (correct: number, total: number) => `採点 ${total} 問 · 初回正解 ${correct} 問`,
    mixed: "間違えた問題を見直し、別の問題で理解を確かめよう。",
    positive: "採点した問題はすべて正解です。別の問題でも考え方を使ってみよう。",
    practice: "おすすめの問題を始める",
    fallback: "まず割合の問題で、何をもとにするか考えてみよう。",
    resolved: "確認問題2問に正解しました。同じ種類の別の問題で復習しよう。",
    retry: "ヒントを読み、同じ種類の新しい問題を解いてみよう。",
    evidence: "計算で確認した結果とAIの採点を分けて表示します。AIの判断には誤りがあり得ます。",
    issue: { calculation: "正答と異なる数がありました。どこで違ったか、式を見て確かめよう。", unit: "数は合っていても、単位が違う回答がありました。", comparison: "割合を比べた結果に間違いがありました。" },
    tips: ["部分を全体で割り、それぞれの割合を比べよう。", "もとにする量を見つけ、比べる量との関係を式にしよう。", "もとの量を100と見て、小数と百分率を行き来しよう。", "式を書き、小数点の位置を確かめよう。", "図形の形と底辺・高さを確認し、面積の単位も書こう。", "たて×横×高さを計算し、体積の単位を付けよう。"],
  },
};

export function LearningSummary({ language, progress, current, topic, disabled, draw }: {
  language: TutorLanguage;
  progress: LearningProgress;
  current: string | null;
  topic: string | null;
  disabled: boolean;
  draw: (index: number) => void;
}) {
  const copy = copyByLanguage[language];
  const chat = chatCopy[language];
  const topics = practiceNodes.filter((id) => progress[id]);
  const assessed = topics.flatMap((id) => progress[id]?.assessed ?? []);
  const evaluated = topics.flatMap((id) => progress[id]?.evaluated ?? []);
  const ungraded = topics.reduce((sum, id) => sum + (progress[id]?.ungraded ?? 0), 0);
  const concerns = topics.filter((id) => progress[id]?.diagnosis?.status === "confirmed");
  const recommended = concerns[0] ?? topics.find((id) => progress[id]?.assessed.some((item) => item.outcome !== "correct")
    || progress[id]?.evaluated?.some((item) => item.verdict !== "correct"))
    ?? practiceNodes.find((id) => id === current) ?? topics.at(-1) ?? practiceNodes[0];
  const index = practiceNodes.indexOf(recommended);
  const findings = topics.flatMap((id) => {
    const entry = progress[id];
    if (!entry) return [];
    const label = chat.examples[practiceNodes.indexOf(id)].title;
    const issues = [...new Set(entry.assessed.map((item) => item.outcome))].filter((issue) => issue !== "correct");
    const diagnosis = entry.diagnosis;
    const misconception = diagnosis?.misconceptionId as keyof typeof chat.misconceptions | null;
    return [
      ...issues.map((issue) => `${label} · ${copy.issue[issue]}`),
      ...(entry.evaluated ?? []).filter((item) => item.verdict !== "correct").slice(-2).map(
        (item) => `${label} · ${copy.ai} · ${copy.verdicts[item.verdict]} · ${item.reason}`
      ),
      ...(diagnosis && misconception && chat.misconceptions[misconception]
        ? [`${label} · ${chat.states[diagnosis.status]} · ${chat.misconceptions[misconception]}`] : []),
    ];
  });
  return (
    <details className="debug learning-summary" open>
      <summary>{copy.title}</summary>
      <p className="report-context">{copy.current} · {topic ?? copy.noTopic}</p>
      <div className="report-grid">
        <section>
          <h3>{copy.summary}</h3>
          {topics.length ? <ul>{topics.map((id) => {
            const entry = progress[id];
            const results = entry?.assessed ?? [];
            const aiResults = entry?.evaluated ?? [];
            return <li key={id}><strong>{chat.examples[practiceNodes.indexOf(id)].title}</strong>
              <span>{results.length ? copy.counts(results.filter((item) => item.outcome === "correct").length, results.length) : entry?.ungraded || aiResults.length ? null : copy.noGrade}</span>
              {aiResults.length > 0 && <span>{copy.ai} · {(["correct", "partially_correct", "incorrect"] as const)
                .map((verdict) => `${copy.verdicts[verdict]} ${aiResults.filter((item) => item.verdict === verdict).length}`).join(" · ")}</span>}
              {entry?.ungraded ? <span>{copy.ungraded(entry.ungraded)}</span> : null}
              {results.filter((item) => item.answer).slice(-3).map((item) =>
                <span key={item.question}>{copy.checkedAnswer(item.answer ?? "", item.outcome === "correct")}</span>)}
            </li>;
          })}</ul> : <p>{copy.empty}</p>}
        </section>
        <section><h3>{copy.evaluation}</h3>
          {assessed.length > 0 && <p>{assessed.every((item) => item.outcome === "correct") ? copy.positive : copy.mixed}</p>}
          {evaluated.length > 0 && <p>{copy.ai} · {copy.verdicts[evaluated.at(-1)?.verdict ?? "correct"]} · {evaluated.at(-1)?.reason}</p>}
          {!assessed.length && !evaluated.length && <p>{ungraded ? copy.hasUngraded : copy.noEvidence}</p>}
        </section>
        <section><h3>{copy.gaps}</h3>
          {findings.length ? <ul>{[...new Set(findings)].map((finding) => <li key={finding}>{finding}</li>)}</ul> : <p>{copy.noGap}</p>}
        </section>
        <section><h3>{copy.guide}</h3>
          <p>{topics.length ? copy.tips[index] : copy.fallback}</p>
          {progress[recommended]?.diagnosis?.status === "resolved" ? <p>{copy.resolved}</p>
            : findings.length > 0 && <p>{copy.retry}</p>}
          <button type="button" className="reset" disabled={disabled} onClick={() => draw(index)}>{copy.practice} · {chat.examples[index].title}</button>
        </section>
      </div>
      <p className="report-note">{copy.evidence}</p>
    </details>
  );
}
