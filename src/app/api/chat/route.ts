import { chatRequest } from "../../../lib/chat-contract";
import { tutorReply } from "../../../lib/tutor";
import { modelDefaults, modelSettingsSchema, type ModelSettings } from "../../../lib/model-settings";
import type { ChatError } from "../../../types/tutor";

const maxBytes = 96 * 1024;
function error(status: number, code: string, messageJa: string, retryable: boolean) {
  return Response.json({ error: { code, messageJa, retryable } } satisfies ChatError, { status });
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    if (Number(request.headers.get("content-length")) > maxBytes) return error(413, "too_large", "メッセージが長すぎます。", false);
    const reader = request.body?.getReader();
    if (!reader) throw new Error("Missing body");
    const decoder = new TextDecoder();
    let size = 0;
    let body = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        return error(413, "too_large", "メッセージが長すぎます。", false);
      }
      body += decoder.decode(value, { stream: true });
    }
    payload = JSON.parse(body + decoder.decode());
  } catch {
    return error(400, "invalid_json", "送信内容を読み取れませんでした。", false);
  }

  const parsed = chatRequest.safeParse(payload);
  if (!parsed.success) return error(400, "invalid_request", "メッセージの長さや会話の順番を確認してください。", false);
  const publicOrigin = process.env.TUTOR_PUBLIC_ORIGIN;
  const origin = request.headers.get("origin");
  if (publicOrigin && origin !== publicOrigin) {
    return error(403, "invalid_request", "このサイトからアクセスしてください。", false);
  }
  // Public visitors never inherit server-side model credentials.
  let settings: ModelSettings | undefined = publicOrigin ? { provider: "mock" } : undefined;
  if (payload && typeof payload === "object" && "modelSettings" in payload) {
    const host = request.headers.get("host");
    // Custom endpoints remain available only in the local POC.
    if (!publicOrigin && (!host || !/^(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(host) ||
      (origin !== `http://${host}` && origin !== `https://${host}`))) {
      return error(403, "invalid_request", "ローカルページから設定してください。", false);
    }
    const config = modelSettingsSchema.safeParse(payload.modelSettings);
    if (!config.success) return error(400, "invalid_request", "モデル設定を確認してください。", false);
    settings = config.data;
    if (publicOrigin && settings.provider !== "mock") {
      if (settings.provider === "compatible" || settings.baseUrl !== modelDefaults[settings.provider].baseUrl ||
        settings.model !== modelDefaults[settings.provider].model) {
        return error(400, "invalid_request", "利用できるモデルを選んでください。", false);
      }
    }
  }
  try {
    return Response.json(await tutorReply(parsed.data, settings));
  } catch (cause) {
    if (cause instanceof Error && (cause.name === "TimeoutError" || cause.name === "AbortError")) {
      return error(504, "model_timeout", "返事に時間がかかっています。もう一度試してください。", true);
    }
    return error(502, "tutor_unavailable", "いまは返事を作れませんでした。もう一度試してください。", true);
  }
}
