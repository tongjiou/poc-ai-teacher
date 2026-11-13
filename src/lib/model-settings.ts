import { z } from "zod";

export const modelProviders = ["deepseek", "qwen", "mock", "compatible"] as const;
export const modelDefaults = {
  deepseek: { baseUrl: "https://api.deepseek.com", model: "deepseek-flash" },
  qwen: { baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen3.8-flash" },
  mock: { baseUrl: "", model: "" },
  compatible: { baseUrl: "", model: "" },
};

function isBaseUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password &&
      !url.search && !url.hash && !/\/chat\/completions\/*$/.test(url.pathname);
  } catch {
    return false;
  }
}

export const modelSettingsSchema = z.discriminatedUnion("provider", [
  z.object({ provider: z.literal("mock") }).strict(),
  z.object({
    provider: z.enum(["deepseek", "qwen", "compatible"]),
    baseUrl: z.string().trim().max(2048).refine(isBaseUrl),
    model: z.string().trim().min(1).max(256),
    apiKey: z.string().trim().regex(/^[!-~]{1,1024}$/),
  }).strict(),
]);
export type ModelSettings = z.infer<typeof modelSettingsSchema>;
