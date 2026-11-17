"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { modelDefaults, modelProviders, modelSettingsSchema, type ModelSettings } from "../lib/model-settings";
import type { TutorLanguage } from "../types/tutor";

const publicMode = process.env.NEXT_PUBLIC_TUTOR_PUBLIC_MODE === "1";
const availableProviders = publicMode ? modelProviders.filter((provider) => provider !== "compatible") : modelProviders;

export function ModelDialog({ language, current, onLanguageChange, onSave, onClose }: {
  language: TutorLanguage;
  current: ModelSettings | null;
  onLanguageChange: (language: TutorLanguage) => void;
  onSave: (settings: ModelSettings) => void;
  onClose: () => void;
}) {
  const zh = language === "zh";
  const dialog = useRef<HTMLDialogElement>(null);
  const [provider, setProvider] = useState(current?.provider ?? (publicMode ? "mock" : "deepseek"));
  const [fields, setFields] = useState(current && current.provider !== "mock"
    ? { baseUrl: current.baseUrl, model: current.model } : modelDefaults[provider]);
  const [error, setError] = useState(false);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    element.showModal();
    return () => element.close();
  }, []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const apiKey = new FormData(event.currentTarget).get("apiKey");
    const parsed = modelSettingsSchema.safeParse(provider === "mock" ? { provider } : { provider, ...fields, apiKey });
    setError(!parsed.success);
    if (parsed.success) onSave(parsed.data);
  }

  return (
    <dialog ref={dialog} className="model-dialog" aria-labelledby="model-title" onCancel={(event) => {
      event.preventDefault();
      if (current) onClose();
    }}>
      <form onSubmit={submit} autoComplete="off">
        <div className="model-dialog-heading">
          <h2 id="model-title">{zh ? "模型设置" : "モデル設定"}</h2>
          <fieldset className="model-language" aria-label={zh ? "选择语言" : "言語を選択"}>
            <button type="button" lang="zh-CN" aria-pressed={zh} onClick={() => onLanguageChange("zh")}>中文</button>
            <button type="button" lang="ja" aria-pressed={!zh} onClick={() => onLanguageChange("ja")}>日本語</button>
          </fieldset>
        </div>
        <p>{zh ? "填写 API Key 开始使用，或选择 Mock 离线体验。密钥仅用于当前页面，刷新后清除。"
          : "API キーを入力するか、Mock を選んでください。再読み込みするとキーは消去されます。"}</p>
        <label>{zh ? "供应商" : "プロバイダー"}
          <select value={provider} onChange={(event) => {
            const next = availableProviders.find((item) => item === event.target.value);
            if (!next) return;
            setProvider(next);
            setFields(modelDefaults[next]);
            setError(false);
          }}>
            {availableProviders.map((item) => <option key={item} value={item}>{item === "mock" ? "Mock" : item}</option>)}
          </select>
        </label>
        {provider !== "mock" && <>
          <label>{zh ? "API 基础地址" : "API ベース URL"}
            <input type="url" readOnly={publicMode} required maxLength={2048} value={fields.baseUrl} onChange={(event) => setFields({ ...fields, baseUrl: event.target.value })} />
          </label>
          <label>{zh ? "模型名" : "モデル名"}
            <input readOnly={publicMode} required maxLength={256} value={fields.model} onChange={(event) => setFields({ ...fields, model: event.target.value })} />
          </label>
          <label>API Key
            <input name="apiKey" type="password" autoComplete="off" required maxLength={1024} />
          </label>
        </>}
        {error && <p role="alert">{zh ? "请检查 HTTPS 基础地址、模型名和 API Key。" : "HTTPS URL、モデル名、API キーを確認してください。"}</p>}
        <div className="model-actions">
          {current && <button type="button" onClick={onClose}>{zh ? "取消" : "キャンセル"}</button>}
          <button type="submit">{zh ? "开始使用" : "開始"}</button>
        </div>
      </form>
    </dialog>
  );
}
