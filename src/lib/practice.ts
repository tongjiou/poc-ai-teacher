import type { TutorLanguage } from "../types/tutor";

type Wording = Record<TutorLanguage, string>;
const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)];

export function practiceQuestion(category: number, language: TutorLanguage, previous?: string) {
  const whole = pick([20, 25, 40, 50, 80, 100, 120, 200]);
  const part = whole / 5 * pick([1, 2, 3, 4]);
  const otherPart = part * 2 + pick([-2, 0, 2]);
  const price = pick([200, 300, 400, 500, 600, 800, 1000]);
  const discount = pick([10, 15, 20, 25, 30]);
  const hundredths = pick([7, 12, 18, 24, 25, 32, 48, 65, 72, 85, 96, 125]);
  const decimal = hundredths / 100;
  const misconceptionHundredths = hundredths === 125 ? 62 : hundredths;
  const base = pick([4, 6, 8, 10, 12, 14]);
  const height = pick([3, 4, 5, 6, 7, 9]);
  const width = pick([2, 3, 5, 7, 9]);
  const tenths = pick([12, 15, 18, 24, 32, 45]);
  const factor = pick([12, 15, 20, 25, 30, 40]);
  const banks: Wording[][] = [
    [
      { zh: `盒彩笔有 ${whole} 支，借出了 ${part} 支。借出的彩笔占全体的比例，这个比例表示什么意思？`,
        ja: `色えんぴつが ${whole} 本あり、${part} 本を貸しました。貸した本数の割合は何を表しますか？` },
      { zh: `小明跳了 ${part} 下，小雨跳了 ${whole} 下。以小雨的次数为基准，小明跳的是几倍？`,
        ja: `なわとびを、ゆうさんは ${part} 回、はるさんは ${whole} 回跳びました。はるさんをもとにすると、ゆうさんの回数は何倍ですか？` },
      { zh: `A 班 ${whole} 人中有 ${part} 人参加活动，B 班 ${whole * 2} 人中有 ${otherPart} 人参加。两个班的参加比例一样吗？`,
        ja: `A組は ${whole} 人のうち ${part} 人、B組は ${whole * 2} 人のうち ${otherPart} 人が行事に参加しました。参加した割合は同じですか？` },
    ],
    [
      { zh: `全班有 ${whole} 人，其中 ${part} 人负责图书。这里的基准量和比较量各是多少？`,
        ja: `全体が ${whole} 人で、そのうち ${part} 人が図書係です。もとにする量と比べられる量はそれぞれ何人ですか？` },
      { zh: `学校准备了 ${whole} 张纸，用了 ${part} 张。用掉的纸占全体的百分之多少？`,
        ja: `学校が用意した ${whole} 枚の紙のうち ${part} 枚を使いました。使った紙は全体の何％ですか？` },
      { zh: `书包原价是 ${price} 日元，打折后便宜了原价的 ${discount}%。以原价为基准量，便宜了多少日元？`,
        ja: `かばんの定価は ${price} 円です。定価の ${discount}％分だけ値下げします。定価をもとにすると、何円安くなりますか？` },
      { zh: `一次活动有 ${part} 人报名，占全班的 ${part / whole * 100}%。全班人数是基准量，应该怎么求？`,
        ja: `行事に申しこんだ ${part} 人はクラス全体の ${part / whole * 100}％です。もとにする量であるクラスの人数はどう求めますか？` },
    ],
    [
      { zh: `${decimal}是百分之多少？`, ja: `${decimal} を百分率で表すと何％ですか？` },
      { zh: `把 ${hundredths}% 写成小数是多少？`, ja: `${hundredths}％を小数で表すといくつですか？` },
      { zh: `这个月的阅读量是上个月的 ${decimal} 倍。用百分数表示是百分之多少？`,
        ja: `今月の読書量は先月の ${decimal} 倍です。百分率で表すと何％ですか？` },
      { zh: `有人说 ${misconceptionHundredths / 100} 是 ${misconceptionHundredths / 10}%，这样换算对吗？`,
        ja: `${misconceptionHundredths / 100} は ${misconceptionHundredths / 10}％だと言う人がいます。合っていますか？` },
    ],
    [
      { zh: `算一算：${tenths / 10} × ${factor / 10} 等于多少？`, ja: `${tenths / 10} × ${factor / 10} はいくつですか？` },
      { zh: `小数除法：${tenths * factor / 100} ÷ ${factor / 10} 等于多少？`, ja: `小数のわり算：${tenths * factor / 100} ÷ ${factor / 10} はいくつですか？` },
    ],
    [
      { zh: `三角形的底是 ${base} 厘米，高是 ${height} 厘米。面积是多少平方厘米？`,
        ja: `底辺が ${base} cm、高さが ${height} cm の三角形の面積は何 cm² ですか？` },
      { zh: `平行四边形的底是 ${base} 厘米，高是 ${height} 厘米。面积是多少平方厘米？`,
        ja: `底辺が ${base} cm、高さが ${height} cm の平行四辺形の面積は何 cm² ですか？` },
      { zh: `梯形的上底是 ${width} 厘米，下底是 ${base + width} 厘米，高是 ${height} 厘米。面积是多少平方厘米？`,
        ja: `上底が ${width} cm、下底が ${base + width} cm、高さが ${height} cm の台形の面積は何 cm² ですか？` },
      { zh: `菱形的两条对角线分别长 ${base} 厘米和 ${height} 厘米。面积是多少平方厘米？`,
        ja: `対角線の長さがそれぞれ ${base} cm と ${height} cm のひし形の面積は何 cm² ですか？` },
    ],
    [
      { zh: `长方体纸盒长 ${base} 厘米、宽 ${width} 厘米、高 ${height} 厘米。体积是多少立方厘米？`,
        ja: `たて ${base} cm、横 ${width} cm、高さ ${height} cm の直方体の体積は何 cm³ ですか？` },
      { zh: `一个正方体的棱长是 ${height} 厘米。它的体积是多少立方厘米？`,
        ja: `一辺が ${height} cm の立方体の体積は何 cm³ ですか？` },
    ],
  ];
  const questions = banks[category].map((wording) => wording[language]);
  return pick(questions.filter((question) => question !== previous));
}
