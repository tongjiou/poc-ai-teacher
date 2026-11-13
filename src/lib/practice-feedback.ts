import type { PracticeAssessment, TutorLanguage, TutorSession } from "../types/tutor";

export function compareParticipation(
  practice: TutorSession["practice"],
  message: string,
  language: TutorLanguage,
) {
  if (practice?.nodeId !== "meaning") return null;
  const answer = message.normalize("NFKC").replace(/\s/g, "").replace(/[。!！]+$/, "");
  const equal = /^(?:我觉得|我认为)?(?:一样|相同)(?:啊|呀|吧)?$|^(?:同じ(?:です|だ|だと思います)?|はい)$/u.test(answer);
  const unequal = /^(?:我觉得|我认为)?(?:不一样|不同|不相同)(?:啊|呀|吧)?$|^(?:違う|違います|同じではありません|いいえ)$/u.test(answer);
  if (!equal && !unequal) return null;

  const question = practice.question.normalize("NFKC");
  const quantities = language === "zh"
    ? question.match(/A\s*班\s*(\d+)\s*人中有\s*(\d+)\s*人参加活动.*B\s*班\s*(\d+)\s*人中有\s*(\d+)\s*人参加/u)
    : question.match(/A組は\s*(\d+)\s*人のうち\s*(\d+)\s*人、B組は\s*(\d+)\s*人のうち\s*(\d+)\s*人/u);
  if (!quantities) return null;

  const [totalA, partA, totalB, partB] = quantities.slice(1).map(Number);
  if (totalA < 1 || totalB < 1 || totalA > 1_000 || totalB > 1_000 || partA > totalA || partB > totalB) return null;
  const same = partA * totalB === partB * totalA;
  const percent = (part: number, total: number) => {
    const approximation = part * 10_000 % total !== 0;
    const prefix = approximation ? (language === "zh" ? "约 " : "約 ") : "";
    return `${prefix}${Number((part * 100 / total).toFixed(2))}%`;
  };
  const outcome: PracticeAssessment["outcome"] = equal === same ? "correct" : "comparison";
  const a = percent(partA, totalA);
  const b = percent(partB, totalB);

  if (language === "zh") {
    const conclusion = same ? "两个班的参加比例一样。" : "两个班的参加比例不一样。";
    const opening = equal === same ? "答对了！" : "我们用参加人数除以全班人数，再比较一下。";
    return { outcome, replyJa: `${opening}A 班是 ${partA} ÷ ${totalA}，也就是 ${a}。B 班是 ${partB} ÷ ${totalB}，也就是 ${b}。${conclusion}` };
  }
  const conclusion = same ? "二つの組の参加割合は同じです。" : "二つの組の参加割合は違います。";
  const opening = equal === same ? "正解です！" : "参加した人数を全体の人数で割って、比べてみよう。";
  return { outcome, replyJa: `${opening}A組は ${partA} ÷ ${totalA} で ${a}、B組は ${partB} ÷ ${totalB} で ${b} です。${conclusion}` };
}

export function gradeNumericPractice(
  practice: TutorSession["practice"],
  message: string,
  language: TutorLanguage,
) {
  if (!practice) return null;
  const answer = message.normalize("NFKC").trim().match(
    /^(?:答案是|等于|答えは)?\s*(-?\d+(?:\.\d+)?)\s*(平方厘米|立方厘米|cm[23])?\s*(?:です|だと思います)?[。.!！]?$/i,
  );
  if (!answer) return null;

  const question = practice.question.normalize("NFKC");
  const zh = language === "zh";
  let value: number;
  let formula: string;
  let unit = "";

  if (practice.nodeId === "decimal") {
    const expression = question.match(/(\d+(?:\.\d+)?)\s*([×÷])\s*(\d+(?:\.\d+)?)/);
    if (!expression) return null;
    const [, left, operator, right] = expression;
    if (operator === "÷" && Number(right) === 0) return null;
    value = operator === "×" ? Number(left) * Number(right) : Number(left) / Number(right);
    formula = `${left} ${operator} ${right}`;
  } else if (practice.nodeId === "area" || practice.nodeId === "volume") {
    const dimensions = Array.from(question.matchAll(/(\d+)\s*(?:厘米|cm)(?![23])/gi), ([, number]) => Number(number));
    const [a, b, c] = dimensions;
    if (practice.nodeId === "volume") {
      unit = zh ? "立方厘米" : "cm³";
      if (dimensions.length === 1 && /正方体|立方体/.test(question)) {
        value = a ** 3;
        formula = `${a} × ${a} × ${a}`;
      } else if (dimensions.length === 3 && /长方体|直方体/.test(question)) {
        value = a * b * c;
        formula = `${a} × ${b} × ${c}`;
      } else return null;
    } else {
      unit = zh ? "平方厘米" : "cm²";
      if (dimensions.length === 3 && /梯形|台形/.test(question)) {
        value = (a + b) * c / 2;
        formula = `(${a} + ${b}) × ${c} ÷ 2`;
      } else if (dimensions.length === 2 && /三角形|菱形|ひし形/.test(question)) {
        value = a * b / 2;
        formula = `${a} × ${b} ÷ 2`;
      } else if (dimensions.length === 2 && /平行四边形|平行四辺形/.test(question)) {
        value = a * b;
        formula = `${a} × ${b}`;
      } else return null;
    }
  } else return null;

  if (!Number.isFinite(value)) return null;
  const numberCorrect = Math.abs(Number(answer[1]) - value) < 1e-9;
  const submittedUnit = answer[2]?.toLowerCase();
  const unitCorrect = !submittedUnit || (practice.nodeId === "area" && /平方厘米|cm2/.test(submittedUnit))
    || (practice.nodeId === "volume" && /立方厘米|cm3/.test(submittedUnit));
  const outcome: PracticeAssessment["outcome"] = numberCorrect ? (unitCorrect ? "correct" : "unit") : "calculation";
  const result = `${formula} = ${Number(value.toFixed(8))}${unit ? ` ${unit}` : ""}`;
  if (zh) {
    const opening = numberCorrect ? (unitCorrect ? "答对了！" : "数值对了，再检查一下单位。") : "我们把算式再算一遍。";
    return { outcome, replyJa: `${opening}${result}。` };
  }
  const opening = numberCorrect ? (unitCorrect ? "正解です！" : "数は合っています。単位を確かめよう。") : "式を使って、もう一度計算してみよう。";
  return { outcome, replyJa: `${opening}${result}。` };
}

export function gradeFractionFollowup(question: string, message: string, language: TutorLanguage) {
  const decimal = question.normalize("NFKC").match(
    /(\d{1,6}\.\d{1,6})\s*(?:写成[^。!?]{0,12}(?:分数|几分之几)|化成[^。!?]{0,12}(?:分数|几分之几)|用分数表示|を分数で表すと)[^。!?]{0,24}(?:[?]|$)/,
  )?.[1];
  const fraction = message.normalize("NFKC").trim().match(
    /^(?:答案是|答えは)?\s*(\d{1,9})\s*\/\s*(\d{1,9})\s*(?:です)?[。.!]?$/,
  );
  if (!decimal || !fraction || fraction[2] === "0" || Number(fraction[2]) === 0) return null;

  const [, numerator, denominator] = fraction;
  const [whole, digits] = decimal.split(".");
  const correct = BigInt(numerator) * BigInt(10 ** digits.length)
    === BigInt(denominator) * BigInt(whole + digits);
  const answer = `${numerator}/${denominator}`;
  const replyJa = language === "zh"
    ? correct ? `答对了！${decimal} 等于 ${answer}。` : `再试一下。把 ${decimal} 写成分母为 ${10 ** digits.length} 的分数，再约分。`
    : correct ? `正解です！${decimal} は ${answer} です。` : `${decimal} を分母が ${10 ** digits.length} の分数にしてから、約分してみよう。`;
  const outcome: PracticeAssessment["outcome"] = correct ? "correct" : "calculation";
  return { replyJa, assessment: { question, outcome, answer } };
}

export function gradeArithmeticFollowup(question: string, message: string, language: TutorLanguage) {
  const prompts = Array.from(question.normalize("NFKC").matchAll(
    /(\d{1,8}(?:\.\d{1,8})?)\s*(÷|\/|除以|×|乘以)\s*(\d{1,8}(?:\.\d{1,8})?)\s*(?:=\s*(?:多少|几|いくつ)?|(?:的结果)?(?:等于|是)\s*(?:多少|几)|(?:は|を計算すると)\s*(?:いくつ|何)|[,，]\s*就是小数点向右移(?:两|二)位[,，]\s*\1\s*变成多少)(?:ですか|呢)?[?](?![^?]*[?])/g,
  ));
  const expression = prompts.at(-1);
  const answer = message.normalize("NFKC").trim().match(
    /^(?:答案是|答えは|等于)?\s*(\d{1,8}(?:\.\d{1,8})?)\s*(%|\/\s*\d{1,8})?\s*(?:です)?[。.!]?$/,
  );
  if (!expression || !answer) return null;
  const [, left, operator, right] = expression;
  const multiply = operator === "×" || operator === "乘以";
  if (expression[0].includes("小数点向右移") && (!multiply || Number(right) !== 100)) return null;
  const operand = Number(right);
  const suffix = answer[2]?.replace(/\s/g, "");
  const denominator = suffix === "%" ? 100 : suffix ? Number(suffix.slice(1)) : 1;
  if ((!multiply && !operand) || !denominator) return null;
  const expected = multiply ? Number(left) * operand : Number(left) / operand;
  const actual = Number(answer[1]) / denominator;
  const correct = Math.abs(actual - expected) < 1e-12;
  const normalized = `${answer[1]}${suffix ?? ""}`;
  const result = correct ? normalized : multiply ? String(Number(expected.toPrecision(15))) : `${left}/${right}`;
  const formula = `${left} ${multiply ? "×" : "÷"} ${right}`;
  const opening = language === "zh"
    ? (correct ? "答对了！" : "这个结果还不对。")
    : (correct ? "正解です！" : "もう一度計算しよう。");
  const outcome: PracticeAssessment["outcome"] = correct ? "correct" : "calculation";
  return {
    replyJa: `${opening}${formula} = ${result}。`,
    assessment: { question: formula, answer: normalized, outcome },
  };
}
