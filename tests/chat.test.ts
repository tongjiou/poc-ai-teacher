import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../src/app/api/chat/route";
import { emptyDiagnosis, type ChatResponse, type TutorSession } from "../src/types/tutor";

const initial = (): TutorSession => ({ grade: 5, curriculumNodeId: null, diagnosis: emptyDiagnosis(), messages: [] });
const request = (body: unknown) => POST(new Request("http://localhost/api/chat", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => vi.stubEnv("TUTOR_PROVIDER", "mock"));
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("/api/chat", () => {
  it("uses the local dialog settings for this request and rejects cross-origin overrides", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ choices: [
      { message: { content: '{"replyJa":"先找出基准量。"}' } },
    ] }));
    vi.stubGlobal("fetch", fetchMock);
    const body = JSON.stringify({ ...initial(), language: "zh",
      messages: [{ role: "user", content: "如何比较两个班的参加比例？" }],
      modelSettings: { provider: "deepseek", apiKey: "dialog-test-key", baseUrl: "https://api.deepseek.com", model: "deepseek-flash" },
    });
    const send = (origin: string) => POST(new Request("http://localhost:3000/api/chat", {
      method: "POST", headers: { host: "localhost:3000", origin }, body,
    }));
    expect((await send("https://other.example")).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
    const response = await send("http://localhost:3000");
    expect(response.status).toBe(200);
    expect(await response.text()).not.toContain("dialog-test-key");
    expect(fetchMock).toHaveBeenCalledWith(new URL("https://api.deepseek.com/chat/completions"),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer dialog-test-key" }) }));
  });

  it("allows only the configured website and fixed model endpoints in public mode", async () => {
    const publicOrigin = "https://tutor.example.com:8443";
    vi.stubEnv("TUTOR_PUBLIC_ORIGIN", publicOrigin);
    vi.stubEnv("TUTOR_PROVIDER", "deepseek");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ choices: [
      { message: { content: '{"replyJa":"先找出基准量。"}' } },
    ] })));
    const body = { ...initial(), language: "zh",
      messages: [{ role: "user", content: "如何比较两个班的参加比例？" }],
    };
    const preset = { provider: "deepseek", apiKey: "dialog-test-key",
      baseUrl: "https://api.deepseek.com", model: "deepseek-flash" };
    const send = (origin: string, modelSettings?: unknown) => POST(new Request(`${publicOrigin}/api/chat`, {
      method: "POST", headers: { origin }, body: JSON.stringify({ ...body, modelSettings }),
    }));
    expect((await send("https://other.example", preset)).status).toBe(403);
    expect((await send(publicOrigin, { ...preset, baseUrl: "https://127.0.0.1" })).status).toBe(400);
    expect((await send(publicOrigin, { ...preset, provider: "compatible" })).status).toBe(400);
    expect((await send(publicOrigin)).status).toBe(200);
    expect(fetch).not.toHaveBeenCalled();
    expect((await send(publicOrigin, preset)).status).toBe(200);
    expect(fetch).toHaveBeenCalledWith(new URL("https://api.deepseek.com/chat/completions"),
      expect.objectContaining({ redirect: "error" }));
  });

  it("reproduces the evidence-gated diagnosis across five turns", async () => {
    const session = initial();
    const turns = [
      ["0.25は2.5%ですか？", "suspected", "ask_diagnostic_question"],
      ["3%", "confirmed", "give_hint"],
      ["わかった", "confirmed", "verify_understanding"],
      ["40%", "confirmed", "verify_understanding"],
      ["8%", "resolved", "explain"],
    ];
    for (const [content, status, action] of turns) {
      session.messages.push({ role: "user", content });
      const result = await request(session);
      expect(result.status).toBe(200);
      const value: ChatResponse = await result.json();
      expect(value.curriculumNodeId).toBe("percent");
      expect(value.diagnosis.status).toBe(status);
      expect(value.nextAction).toBe(action);
      session.messages.push({ role: "assistant", content: value.replyJa });
      session.diagnosis = value.diagnosis;
      session.curriculumNodeId = value.curriculumNodeId;
    }
  });

  it.each([
    ["割合は基準量÷比較量だと思います", "reversed", ["5人", "わかった", "30人", "80枚"]],
    ["割合の式は引き算でいいですか？", "additive", ["20−5", "わかった", "6÷30", "8/40"]],
    ["0.5倍は0.5%ですか？", "times_percent", ["0.5%", "わかった", "20%", "150%"]],
    ["割合の式は5÷20=0.3です", "calculation_slip", ["5/20", "0.2", "0.3"]],
  ] as const)("completes the rule path for %s", async (signal, id, answers) => {
    const session = initial();
    const states: string[] = [];
    for (const content of [signal, ...answers]) {
      session.messages.push({ role: "user", content });
      const response = await request(session);
      expect(response.status).toBe(200);
      const result: ChatResponse = await response.json();
      expect(result.diagnosis.misconceptionId).toBe(id);
      states.push(result.diagnosis.status);
      session.messages.push({ role: "assistant", content: result.replyJa });
    }
    expect(states[0]).toBe("suspected");
    expect(states.at(-1)).toBe("resolved");
    if (id === "calculation_slip") expect(states).not.toContain("confirmed");
    else expect(states[1]).toBe("confirmed");
  });

  it("replays translated diagnostic questions and accepts Chinese replies", async () => {
    const session: TutorSession = { ...initial(), language: "zh" };
    const turns = [
      ["0.25 是 2.5% 吗？", "suspected", "把 0.3 写成百分数是多少？"],
      ["答案是 3%", "confirmed", "把小数乘以 100"],
      ["我明白了", "confirmed", "把 0.4 写成百分数是多少？"],
      ["百分之40", "confirmed", "把 0.08 写成百分数是多少？"],
      ["8%", "resolved", "连续答对了两道验证题"],
    ];
    for (const [content, status, reply] of turns) {
      session.messages.push({ role: "user", content });
      const response = await request(session);
      expect(response.status).toBe(200);
      const result: ChatResponse = await response.json();
      expect(result.curriculumTitleJa).toBe("小数和百分数");
      expect(result.diagnosis.status).toBe(status);
      expect(result.replyJa).toContain(reply);
      session.messages.push({ role: "assistant", content: result.replyJa });
    }
  });

  it.each([["0.25是百分之多少？", "25%"], ["0.007是百分之多少？", "0.7%"]])(
    "explains a direct Chinese decimal conversion: %s",
    async (content, expected) => {
      const response = await request({ ...initial(), language: "zh", messages: [{ role: "user", content }] });
      expect(response.status).toBe(200);
      const result: ChatResponse = await response.json();
      expect(result.curriculumNodeId).toBe("percent");
      expect(result.replyJa).toContain(expected);
      expect(result.replyJa).toContain("乘以 100");
    }
  );

  it("keeps a numeric answer in the topic of the teacher's practice question", async () => {
    vi.stubEnv("TUTOR_PROVIDER", "deepseek");
    vi.stubEnv("TUTOR_API_KEY", "test-key");
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ choices: [
      { message: { content: '{"replyJa":"答对了，24%。"}' } },
    ] }));
    vi.stubGlobal("fetch", fetchMock);
    const question = "0.24是百分之多少？";
    const response = await request({ ...initial(), language: "zh",
      practice: { nodeId: "percent", question },
      messages: [{ role: "user", content: "24%" }],
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ curriculumNodeId: "percent", replyJa: "答对了，24%。" });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).messages.slice(1)).toEqual([
      { role: "assistant", content: question }, { role: "user", content: "24%" },
    ]);
  });

  it.each([
    ["A 班 80 人中有 64 人参加活动，B 班 160 人中有 130 人参加。两个班的参加比例一样吗？", "一样啊", "81.25%", "不一样"],
    ["A 班 80 人中有 64 人参加活动，B 班 160 人中有 128 人参加。两个班的参加比例一样吗？", "我觉得一样", "80%", "答对了"],
  ])("grades a short reply to the teacher’s participation question", async (question, content, percent, feedback) => {
    const response = await request({ ...initial(), language: "zh",
      practice: { nodeId: "meaning", question }, messages: [{ role: "user", content }],
    });
    expect(response.status).toBe(200);
    const result: ChatResponse = await response.json();
    expect(result.curriculumNodeId).toBe("meaning");
    expect(result.replyJa).toContain("80%");
    expect(result.replyJa).toContain(percent);
    expect(result.replyJa).toContain(feedback);
  });

  it.each([
    ["zh", "decimal", "算一算：2.4 × 1.5 等于多少？", "3.6", "答对了", "3.6"],
    ["zh", "area", "梯形的上底是 4 厘米，下底是 10 厘米，高是 6 厘米。面积是多少平方厘米？", "84", "再算一遍", "42 平方厘米"],
    ["ja", "area", "底辺が 8 cm、高さが 5 cm の三角形の面積は何 cm² ですか？", "20cm³", "単位を確かめよう", "20 cm²"],
    ["ja", "volume", "一辺が 5 cm の立方体の体積は何 cm³ ですか？", "125 cm³", "正解", "125 cm³"],
  ] as const)("grades %s %s practice using the generated problem", async (language, nodeId, question, content, feedback, expected) => {
    const response = await request({ ...initial(), language, practice: { nodeId, question },
      messages: [{ role: "user", content }],
    });
    expect(response.status).toBe(200);
    const result: ChatResponse = await response.json();
    expect(result.curriculumNodeId).toBe(nodeId);
    expect(result.replyJa).toContain(feedback);
    expect(result.replyJa).toContain(expected);
    expect(result.assessment).toEqual({ question, outcome:
      feedback === "再算一遍" ? "calculation" : feedback === "単位を確かめよう" ? "unit" : "correct",
    });
  });

  it("grades the newer decimal question from an earlier conversation", async () => {
    const response = await request({ ...initial(), language: "zh",
      practice: { nodeId: "decimal", question: "算一算：3.2 × 3 等于多少？" },
      messages: [
        { role: "user", content: "再来一个" },
        { role: "assistant", content: "那我们再试一个：1.5 × 4 等于多少？想一想，可以先算 15 × 4，再决定小数点的位置哦。" },
        { role: "user", content: "60" },
      ],
    });
    expect(response.status).toBe(200);
    const result: ChatResponse = await response.json();
    expect(result.replyJa).toContain("1.5 × 4 = 6");
    expect(result.replyJa).not.toContain("3.2");
  });

  it("returns a new active practice when the student asks for another question", async () => {
    const previous = { nodeId: "decimal", question: "算一算：3.2 × 3 等于多少？" } as const;
    const response = await request({ ...initial(), language: "zh", practice: previous,
      messages: [{ role: "user", content: "再来一个" }],
    });
    expect(response.status).toBe(200);
    const result: ChatResponse = await response.json();
    expect(result.practice).toEqual({ nodeId: "decimal", question: result.replyJa });
    expect(result.replyJa).not.toBe(previous.question);

    const next = await request({ ...initial(), language: "zh", practice: result.practice,
      messages: [{ role: "user", content: "-1" }],
    });
    const feedback: ChatResponse = await next.json();
    const expression = result.replyJa.match(/\d+(?:\.\d+)? [×÷] \d+(?:\.\d+)?/)?.[0];
    expect(expression).toBeDefined();
    expect(feedback.replyJa).toContain(`${expression} =`);
  });

  it.each([["1/4", "correct"], ["2/8", "correct"], ["1/5", "calculation"]])(
    "records evidence for a decimal-to-fraction follow-up answered with %s",
    async (content, outcome) => {
      const question = "你说的 0.25，是不是想把小数换成分数？那 0.25 写成几分之几更合适呢？";
      const response = await request({ ...initial(), language: "zh",
        practice: { nodeId: "meaning", question: "以小雨的 80 下为基准，小明跳了 48 下，是几倍？" },
        messages: [{ role: "user", content: "0.25" }, { role: "assistant", content: question }, { role: "user", content }],
      });
      expect(response.status).toBe(200);
      expect((await response.json()).assessment).toEqual({ question, answer: content, outcome });
    }
  );

  it.each([["0.2", "correct"], ["20%", "correct"], ["1/5", "correct"], ["0.25", "calculation"]])(
    "records checked division follow-up evidence for %s",
    async (content, outcome) => {
      const response = await request({ ...initial(), language: "zh",
        practice: { nodeId: "meaning", question: "两个班的参加比例一样吗？" },
        messages: [
          { role: "user", content: "A 班是 0.2" },
          { role: "assistant", content: "A 班是 0.2。再算一下，32 ÷ 160 等于多少？" },
          { role: "user", content },
        ],
      });
      expect(response.status).toBe(200);
      expect((await response.json()).assessment).toEqual({ question: "32 ÷ 160", answer: content, outcome });
    }
  );

  it.each([
    ["再试一次：0.05 × 100，就是小数点向右移两位，0.05 变成多少？", "50", "0.05 × 100", "5", "calculation"],
    ["再试一次：0.05 × 100，就是小数点向右移两位，0.05 变成多少？", "5", "0.05 × 100", "5", "correct"],
    ["先看 0.05 × 100 等于多少？再算 0.8 × 100 等于多少？", "80", "0.8 × 100", "80", "correct"],
  ])("checks arithmetic follow-ups without asking the model: %s, %s", async (question, content, formula, expected, outcome) => {
    vi.stubEnv("TUTOR_PROVIDER", "deepseek");
    vi.stubEnv("TUTOR_API_KEY", "test-key");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await request({ ...initial(), language: "zh",
      practice: { nodeId: "percent", question: "0.8 是百分之多少？" },
      messages: [{ role: "user", content: "帮我算一下" }, { role: "assistant", content: question }, { role: "user", content }],
    });
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.assessment).toEqual({ question: formula, answer: content, outcome });
    expect(result.replyJa).toContain(`${formula} = ${expected}`);
    expect(result.replyJa.includes("答对了")).toBe(outcome === "correct");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["correct", "partially_correct", "incorrect", "ungradable"] as const)(
    "handles a structured AI assessment of %s for an open-ended answer",
    async (verdict) => {
      vi.stubEnv("TUTOR_PROVIDER", "deepseek");
      vi.stubEnv("TUTOR_API_KEY", "test-key");
      const reason = "比较的是各班参加人数占本班人数的比例。";
      const fetchMock = vi.fn().mockResolvedValue(Response.json({ choices: [
        { message: { content: JSON.stringify({ replyJa: "我们来核对你的思路。", assessment: { verdict, reason } }) } },
      ] }));
      vi.stubGlobal("fetch", fetchMock);
      const question = "为什么比较参加比例时，要分别除以各班的总人数？";
      const response = await request({ ...initial(), language: "zh",
        practice: { nodeId: "meaning", question },
        messages: [{ role: "user", content: "因为各班人数不同，需要看各班各自参加了多少比例。" }],
      });
      expect(response.status).toBe(200);
      const result: ChatResponse = await response.json();
      expect(result.assessment).toBeUndefined();
      expect(result.modelAssessment).toEqual(verdict === "ungradable" ? undefined : { question, verdict, reason });
      expect(result.answerRecorded).toBe(verdict === "ungradable" ? true : undefined);
      expect(JSON.parse(fetchMock.mock.calls[0][1].body).messages[0].content).toContain("Solve the question independently");
    },
  );

  it("records an unverified answer without counting a model compliment as a grade", async () => {
    const response = await request({ ...initial(), language: "zh",
      practice: { nodeId: "meaning", question: "小明跳了 48 下，小雨跳了 80 下。小明跳的是几倍？" },
      messages: [{ role: "user", content: "我觉得是 48 除以 80" }],
    });
    const result: ChatResponse = await response.json();
    expect(result.answerRecorded).toBe(true);
    expect(result.assessment).toBeUndefined();
  });

  it("does not trust a submitted diagnosis", async () => {
    const response = await request({
      ...initial(), curriculumNodeId: "percent",
      diagnosis: { misconceptionId: "decimal_shift", status: "confirmed", evidence: [] },
      messages: [{ role: "user", content: "割合とは何ですか？" }],
    });
    expect((await response.json()).diagnosis.status).toBe("unknown");
  });

  it("requires the actual diagnostic question before accepting an answer as evidence", async () => {
    const response = await request({ ...initial(), messages: [
      { role: "user", content: "0.25は2.5%ですか？" }, { role: "assistant", content: "別の質問" }, { role: "user", content: "3%" },
    ] });
    expect((await response.json()).diagnosis.status).not.toBe("confirmed");
  });

  it.each([
    [{ grade: 6 }, []],
    [initial(), []],
    [initial(), [{ role: "assistant", content: "こんにちは" }]],
    [initial(), [{ role: "user", content: "あ".repeat(601) }]],
  ])("rejects invalid inputs", async (session, messages) => {
    expect((await request({ ...session, messages })).status).toBe(400);
  });

  it("rejects malformed and oversized bodies", async () => {
    const invalid = await POST(new Request("http://localhost", { method: "POST", body: "[" }));
    expect(invalid.status).toBe(400);
    const huge = await request("あ".repeat(40_000));
    expect(huge.status).toBe(413);
  });

  it("keeps credentials on the server and uses the configured vendor", async () => {
    vi.stubEnv("TUTOR_PROVIDER", "qwen");
    vi.stubEnv("TUTOR_API_KEY", "test-key");
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ choices: [
      { message: { content: JSON.stringify({ replyJa: "もとにする量を一つ見つけよう。" }) } },
    ] }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await request({ ...initial(), messages: [{ role: "user", content: "割合とは何ですか？" }] });
    const [url, init] = fetchMock.mock.calls[0];
    expect(new URL(url).hostname).toBe("dashscope.aliyuncs.com");
    expect(init.headers.Authorization).toBe("Bearer test-key");
    expect(JSON.parse(init.body)).toMatchObject({ enable_thinking: false, response_format: { type: "json_object" } });
    expect(await response.text()).not.toContain("test-key");
  });

  it("retries malformed JSON as plain text without switching providers", async () => {
    vi.stubEnv("TUTOR_PROVIDER", "deepseek");
    vi.stubEnv("TUTOR_API_KEY", "test-key");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ choices: [{ message: { content: "   " } }] }))
      .mockResolvedValueOnce(Response.json({ choices: [{ message: { content: "想一想，2 支是 8 支的几倍？" } }] }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await request({ ...initial(), language: "zh", messages: [
      { role: "user", content: "什么是比例？" },
      { role: "assistant", content: "把 2÷8 写成分数。" },
      { role: "user", content: "1/4" },
    ] });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ curriculumNodeId: "meaning", replyJa: "想一想，2 支是 8 支的几倍？" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).not.toHaveProperty("response_format");
  });

  it.each(["", '{"wrong":"value"}', '{"replyJa":"OK","diagnosis":"confirmed"}'])("rejects invalid model output %s", async (content) => {
    vi.stubEnv("TUTOR_PROVIDER", "deepseek");
    vi.stubEnv("TUTOR_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(Response.json({ choices: [{ message: { content } }] }))
      .mockResolvedValueOnce(Response.json({ choices: [{ message: { content: " " } }] })));
    const response = await request({ ...initial(), messages: [{ role: "user", content: "割合とは何ですか？" }] });
    expect(response.status).toBe(502);
    expect((await response.json()).error.retryable).toBe(true);
  });

  it("returns a retryable error on model timeout", async () => {
    vi.stubEnv("TUTOR_PROVIDER", "deepseek");
    vi.stubEnv("TUTOR_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("timed out", "TimeoutError")));
    expect((await request({ ...initial(), messages: [{ role: "user", content: "割合とは何ですか？" }] })).status).toBe(504);
  });

  it("does not send obvious personal information or safety requests to the model", async () => {
    vi.stubEnv("TUTOR_PROVIDER", "qwen");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    for (const content of ["名前は田中花子です。割合とは？", "死にたい"]) {
      expect((await request({ ...initial(), messages: [{ role: "user", content }] })).status).toBe(200);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
