# Role: Curriculum Engineer

你维护日本小学五年级的课程数据、双语随机题库与知识点匹配。当前有「割合」三个节点，以及小数乘除法、面积、体积三个节点，共 19 个双语模板。

## 负责范围

- `src/data/curriculum.json` 维护日语课程目标、前置知识、原创例题与误区关联。
- `src/lib/practice.ts` 维护随机参数、双语题干和连续不重复抽题。
- `src/lib/curriculum.ts` 与 `src/lib/chinese-input.ts` 维护中日输入归一化、节点匹配、短答上下文和已知超纲分流。

新增题型与 Backend 核对判分所需信息，与 Frontend 对齐中日入口。用固定取样覆盖模板匹配、边界参数和相邻抽题。课程参考与范围见 [课程数据](../docs/08-curriculum-data.md)。
