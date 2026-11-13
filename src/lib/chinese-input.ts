// Convert common Chinese answers and math terms to the vocabulary used by the rule engine.
export function normalizeChineseInput(input: string) {
  return input.normalize("NFKC")
    .replace(/(?:我)?(?:明白了|懂了|知道了)/g, "わかった")
    .replace(/(?:我)?(?:不懂|不知道|不会)/g, "わかりません")
    .replace(/为什么/g, "なぜ")
    .replace(/^(?:对|正确)(?=[。!?]?$)/g, "はい")
    .replace(/^(?:不对|错了|错误)(?=[。!?]?$)/g, "いいえ")
    .replace(/^(?:我觉得|我认为|答案是|我选|用|是)\s*/, "")
    .replace(/百分之\s*(\d+(?:\.\d+)?)/g, "$1%")
    .replace(/百分之\s*(?:多少|几)/g, "何%")
    .replace(/(?:不是|并非|而不是)/g, "ではなく")
    .replace(/(?:什么是(?:比例|比率)|(?:比例|比率)(?:是什么|是什么意思|表示什么意思|的含义|的意义))/g, "割合の意味")
    .replace(/(?:比例|比率)的算式/g, "割合の式")
    .replace(/(?:比例|比率)/g, "割合")
    .replace(/几倍/g, "何倍")
    .replace(/(?:基准量|标准量|作为基准的量)/g, "基準量")
    .replace(/(?:比较量|用来比较的量)/g, "比較量")
    .replace(/(?:全部|总数|总共)/g, "全体")
    .replace(/(?:加法|加法算)/g, "足し算")
    .replace(/减法/g, "引き算")
    .replace(/除法/g, "割り算")
    .replace(/(?:除以|除)/g, "÷")
    .replace(/(?:百分比|百分数)/g, "百分率")
    .replace(/(?:转换成|换算成|化成|等于|等於|是)/g, "=")
    .replace(/(?:个|张)/g, (unit) => unit === "个" ? "個" : "枚")
    .replace(/(?:面积|体积|英语|天气|历史)/g, (topic) => ({
      面积: "面積", 体积: "体積", 英语: "英語", 天气: "天気", 历史: "歴史",
    })[topic] ?? topic);
}
