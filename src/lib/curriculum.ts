import data from "../data/curriculum.json";
import type { CurriculumNode } from "../types/tutor";

const nodes: CurriculumNode[] = data.map((node) => ({ ...node, subject: "math" }));

export function getCurriculumNode(id: string | null | undefined): CurriculumNode | null {
  return nodes.find((node) => node.id === id) ?? null;
}

export function getPrerequisites(id: string): string[] {
  return [...(getCurriculumNode(id)?.prerequisites ?? [])];
}

export function listCurriculumNodes(grade: number): CurriculumNode[] {
  return nodes.filter((node) => node.grade === grade);
}

const unrelatedTopic = /円周率|圆周率|円の面積|圆的面積|円柱|圆柱|球の体積|最小公倍数|最大公約数|英語|理科|天気|歴史|漢字|俳句/;
export function isUnsupportedTopic(question: string) {
  return unrelatedTopic.test(question.normalize("NFKC"));
}

const quantityRole = /比較量|基準量|比べられる量|くらべられる量|もとにする量|元にする量/;
const percentWord = /百分率|パーセント|%/;
const asksMeaning = /割合(の意味|とは|って何|ってなに|ってどういう|は何を表)|何を表(す|して)/;
const asksToConvert = /に直(す|して)|に変換|で表(す|して)|にすると|は何(?:%|パーセント)|何(?:%|パーセント)ですか/;
const shortAnswer = /^(?:はい|いいえ|そうです|はいそうです|いいえ違います|違います|わかった|分かった|わかりました|分かりました|わかりません|分かりません|もう一度|ヒント|どうして|なぜ|引き算|ひき算|割り算|わり算|(?:たぶん|答えは)?-?\d+(?:\.\d+)?(?:%|パーセント|倍|人|個|本|枚)?(?:です|だと思います|になります)?)[。!?]*$/;

export function matchCurriculumNode(question: string, currentNodeId: string | null = null): CurriculumNode | null {
  const q = question.normalize("NFKC").trim();
  const compact = q.replace(/\s/g, "");
  const current = getCurriculumNode(currentNodeId);
  // A bare numerical answer belongs to the pending exercise, even if it has a percent sign.
  if (current && (shortAnswer.test(compact) || /^-?\d+[/／]\d+[。!?]*$/.test(compact))) return current;
  if (isUnsupportedTopic(q)) return null;

  if (/体積|直方体|立方体|长方体|正方体/.test(q)) return getCurriculumNode("volume");
  if (/面積|面积/.test(q)) return getCurriculumNode("area");
  const percent = percentWord.test(q);
  if (!percent && (/小数.{0,10}(?:乗法|除法|かけ算|わり算|割り算|乘除|乘法)/.test(q)
    || !current && /(?:\d+\.\d+\s*[×÷*/]|[×÷*/]\s*\d+\.\d+)/.test(q))) {
    return getCurriculumNode("decimal");
  }
  if (percent && (/(?:小数|何倍|\d+(?:\.\d+)?倍)/.test(q) ||
      (/\d+\.\d+/.test(q) && asksToConvert.test(q)) ||
      /^(?:\d+(?:\.\d+)?%|百分率).*(?:とは|って何)/.test(q))) {
    return getCurriculumNode("percent");
  }
  if (asksMeaning.test(q)) return getCurriculumNode("meaning");
  if (/割合の式/.test(q) || quantityRole.test(q) || /(?:割合|何%)を(?:求め|計算)|(?:全体の|にあたる|に当たる).*(?:何人|何個|何本|何枚|何m|いくつ)|\d+(?:\.\d+)?\s*[÷／/]\s*\d+(?:\.\d+)?.*(?:割合|でいい|で合っ)/.test(q)) {
    return getCurriculumNode("relation");
  }
  if (percent) {
    // A word problem asks for a ratio; a standalone percent asks about notation.
    const wordProblem = /(?:\d+(?:\.\d+)?\s*(?:人|個|枚|本|円|m|g|L)|全体|のうち|の中)/.test(q);
    return getCurriculumNode(wordProblem ? "relation" : "percent");
  }
  if (/割合|何倍|\d+(?:\.\d+)?倍/.test(q)) return getCurriculumNode("meaning");
  if (current && /\d+(?:\.\d+)?\s*[÷/×＋+−-]\s*\d+(?:\.\d+)?/.test(q)) return current;
  return null;
}
