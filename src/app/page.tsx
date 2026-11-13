"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { LearningSummary, type LearningProgress } from "./learning-summary";
import { chatCopy } from "./chat-copy";
import { ModelDialog } from "./model-dialog";
import type { ModelSettings } from "../lib/model-settings";
import { practiceQuestion } from "../lib/practice";
import { emptyDiagnosis, practiceNodes } from "../types/tutor";
import type { ChatMessage, ChatResponse, TutorLanguage, TutorSession } from "../types/tutor";

const MAX_LENGTH = 600;
const MAX_HISTORY = 24;
const topicIcons = ["◔", "↔", "%", "×", "△", "▣"];

type ChatError = { messageJa: string; retryable: boolean };
type FailedTurn = { request: TutorSession; error: ChatError };

function createSession(language: TutorLanguage): TutorSession {
  return {
    language,
    grade: 5,
    curriculumNodeId: null,
    diagnosis: emptyDiagnosis(),
    messages: [],
  };
}

function readError(body: unknown, copy: typeof chatCopy[TutorLanguage]): ChatError | null {
  if (!body || typeof body !== "object" || !("error" in body)) return null;
  const error = body.error;
  if (!error || typeof error !== "object") return null;
  if (!("messageJa" in error) || typeof error.messageJa !== "string") return null;
  const code = "code" in error ? error.code : undefined;
  const message = typeof code === "string" && Object.hasOwn(copy.errors, code)
    ? copy.errors[code as keyof typeof copy.errors] : copy.networkError;
  return { messageJa: message, retryable: !("retryable" in error) || error.retryable !== false };
}

type ReadMessage = (id: string, content: string, language: TutorLanguage) => void;

export default function Home() {
  const [language, setLanguage] = useState<TutorLanguage>("zh");
  const [modelSettings, setModelSettings] = useState<ModelSettings | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [playing, setPlaying] = useState<string | null>(null);
  const [audioError, setAudioError] = useState(false);
  const utterance = useRef<SpeechSynthesisUtterance | null>(null);
  const copy = chatCopy[language];

  useEffect(() => {
    document.documentElement.lang = copy.lang;
    document.title = copy.title;
  }, [copy]);

  function stopAudio() {
    utterance.current = null;
    window.speechSynthesis?.cancel();
    setPlaying(null);
    setAudioError(false);
  }

  function readMessage(id: string, content: string, language: TutorLanguage) {
    stopAudio();
    if (id === playing) return;
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) {
      setAudioError(true);
      return;
    }

    const message = new SpeechSynthesisUtterance(content);
    message.lang = chatCopy[language].lang;
    const voices = window.speechSynthesis.getVoices().filter((voice) =>
      voice.lang.toLowerCase().split(/[-_]/)[0] === language
    );
    message.voice = voices.find((voice) => voice.lang === message.lang && voice.localService)
      ?? voices.find((voice) => voice.lang === message.lang) ?? voices.find((voice) => voice.localService)
      ?? voices[0] ?? null;
    message.onend = () => {
      if (utterance.current !== message) return;
      utterance.current = null;
      setPlaying(null);
    };
    message.onerror = () => {
      if (utterance.current !== message) return;
      utterance.current = null;
      setPlaying(null);
      setAudioError(true);
    };
    utterance.current = message;
    setPlaying(id);
    window.speechSynthesis.speak(message);
  }

  return (
    <>
      <fieldset className="language-bar" aria-label={language === "zh" ? "选择语言" : "言語を選択"}>
        {(["zh", "ja"] as const).map((option) => (
          <button key={option} type="button" lang={chatCopy[option].lang}
            aria-pressed={language === option} onClick={() => {
              if (option === language) return;
              stopAudio();
              setLanguage(option);
            }}>
            {option === "zh" ? "中文" : "日本語"}
          </button>
        ))}
      </fieldset>
      <button className="model-settings-button" type="button" onClick={() => setSettingsOpen(true)}>
        {language === "zh" ? "模型设置" : "モデル設定"}
      </button>
      {settingsOpen && <ModelDialog language={language} current={modelSettings} onLanguageChange={(option) => {
        if (option === language) return;
        stopAudio();
        setLanguage(option);
      }} onClose={() => setSettingsOpen(false)}
        onSave={(settings) => {
          setModelSettings(settings);
          setSettingsOpen(false);
        }} />}
      {audioError && <p className="audio-error" role="status">{copy.audioError}</p>}
      {(["zh", "ja"] as const).map((option) => (
        <div key={option} hidden={language !== option} lang={chatCopy[option].lang}>
          <Chat language={option} playing={playing} readMessage={readMessage} stopAudio={stopAudio} modelSettings={modelSettings} />
        </div>
      ))}
    </>
  );
}

function Chat({ language, playing, readMessage, stopAudio, modelSettings }: {
  language: TutorLanguage;
  playing: string | null;
  readMessage: ReadMessage;
  stopAudio: () => void;
  modelSettings: ModelSettings | null;
}) {
  const copy = chatCopy[language];
  const [session, setSession] = useState(() => createSession(language));
  const [archive, setArchive] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<TutorSession | null>(null);
  const [failed, setFailed] = useState<FailedTurn | null>(null);
  const [lastResult, setLastResult] = useState<ChatResponse | null>(null);
  const [progress, setProgress] = useState<LearningProgress>({});
  const active = useRef<AbortController | null>(null);
  const previousExamples = useRef<Record<number, string>>({});
  const input = useRef<HTMLTextAreaElement>(null);
  const transcript = useRef<HTMLDivElement>(null);
  const failedContent = failed?.request.messages.at(-1)?.content;
  const optimisticContent = pending?.messages.at(-1)?.content ?? failedContent;

  useEffect(() => () => active.current?.abort(), []);

  useEffect(() => {
    if (!archive.length && !session.practice && !session.messages.length && !pending && !failed) return;
    const log = transcript.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [archive.length, session.practice, session.messages.length, pending, failed]);

  async function requestReply(request: TutorSession) {
    if (active.current || !modelSettings) return;
    const controller = new AbortController();
    active.current = controller;
    setFailed(null);
    setPending(request);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...request, modelSettings }),
        signal: controller.signal,
      });
      const body: unknown = await response.json().catch(() => null);
      if (controller.signal.aborted) return;
      if (!response.ok) {
        setFailed({ request, error: readError(body, copy) ?? { messageJa: copy.networkError, retryable: true } });
        return;
      }
      if (!body || typeof body !== "object" || !("replyJa" in body) || typeof body.replyJa !== "string") {
        setFailed({ request, error: { messageJa: copy.networkError, retryable: true } });
        return;
      }
      const result = body as ChatResponse;
      const sent = request.messages.at(-1);
      if (!sent) return;
      if (result.practice) {
        const practice = result.practice;
        previousExamples.current[practiceNodes.indexOf(practice.nodeId)] = practice.question;
        archiveTurn(session, sent);
        setSession({ ...createSession(language), curriculumNodeId: practice.nodeId, practice });
        stopAudio();
      } else {
        setSession((current) => ({
          ...current,
          curriculumNodeId: result.curriculumNodeId,
          diagnosis: result.diagnosis,
          messages: [...current.messages, sent, { role: "assistant", content: result.replyJa }],
        }));
      }
      const node = practiceNodes.find((id) => id === result.curriculumNodeId);
      if (node) {
        setProgress((current) => {
          const previous = current[node] ?? { assessed: [] };
          const { assessment, modelAssessment, diagnosis } = result;
          const assessed = assessment && !previous.assessed.some((item) => item.question === assessment.question)
            ? [...previous.assessed, assessment] : previous.assessed;
          const finding = diagnosis.status !== "unknown" ? diagnosis
            : diagnosis.evidence.length ? undefined : previous.diagnosis;
          return { ...current, [node]: {
            assessed, diagnosis: finding,
            evaluated: modelAssessment && !previous.evaluated?.some((item) => item.question === modelAssessment.question)
              ? [...(previous.evaluated ?? []), modelAssessment] : previous.evaluated,
            ungraded: (previous.ungraded ?? 0) + (result.answerRecorded ? 1 : 0),
          } };
        });
      }
      setLastResult(result);
    } catch {
      if (!controller.signal.aborted) {
        setFailed({ request, error: { messageJa: copy.networkError, retryable: true } });
      }
    } finally {
      if (active.current === controller) {
        active.current = null;
        setPending(null);
      }
    }
  }

  function send(content: string) {
    const message = content.trim();
    if (!message || message.length > MAX_LENGTH || active.current || failed) return;
    setDraft("");
    void requestReply({
      ...session,
      messages: [...session.messages.slice(-MAX_HISTORY), { role: "user", content: message }],
    });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    send(draft);
  }

  function handleKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    send(draft);
  }

  function reset() {
    active.current?.abort();
    active.current = null;
    stopAudio();
    setSession(createSession(language));
    setArchive([]);
    setProgress({});
    setLastResult(null);
    setDraft("");
    setPending(null);
    setFailed(null);
    input.current?.focus();
  }

  function archiveTurn(current: TutorSession, sent?: ChatMessage) {
    setArchive((messages) => [
      ...messages,
      ...(current.practice ? [{ role: "assistant" as const, content: current.practice.question }] : []),
      ...current.messages,
      ...(sent ? [sent] : []),
    ]);
  }

  function drawPractice(index: number) {
    if (active.current || failed) return;
    const question = practiceQuestion(index, language, previousExamples.current[index]);
    previousExamples.current[index] = question;
    archiveTurn(session);
    const nodeId = practiceNodes[index];
    setProgress((current) => current[nodeId] ? current : { ...current, [nodeId]: { assessed: [] } });
    stopAudio();
    setSession({ ...createSession(language), curriculumNodeId: nodeId, practice: { nodeId, question } });
    setLastResult(null);
    setDraft("");
    input.current?.focus();
  }

  function editFailed() {
    setDraft(failedContent ?? "");
    setFailed(null);
    input.current?.focus();
  }

  function renderMessage(id: string, speaker: "user" | "assistant", content: string) {
    const speechId = `${language}-${id}`;
    return <Bubble key={id} speaker={speaker} content={content} copy={copy} speaking={playing === speechId}
      read={() => readMessage(speechId, content, language)} />;
  }

  const topic = lastResult?.curriculumTitleJa ?? (session.practice ? copy.examples[practiceNodes.indexOf(session.practice.nodeId)].title : null);

  return (
    <main className="workspace">
      <header className="masthead">
        <div className="masthead-copy">
          <p className="hero-grade">{copy.grade}</p>
          <h1>{copy.title}</h1>
          <p>{copy.intro}</p>
        </div>
        <span className="hero-flower" aria-hidden="true">✿</span>
        <span className="hero-spark" aria-hidden="true">✦</span>
        <Image className="hero-mascot" src="/shiba-sensei.webp" alt="" width={480} height={480} unoptimized loading="eager" />
      </header>

      <div className="learning-grid">
        <aside className="lesson" aria-label={copy.guide}>
          <div className="lesson-intro">
            <span className="lesson-symbol" aria-hidden="true">✎</span>
            <h2>{copy.unit}</h2>
          </div>
          <div className="lesson-content">
            <div className="current-topic">
              <span>{copy.topic}</span>
              <strong aria-live="polite">{topic ?? copy.noTopic}</strong>
            </div>
            <section className="examples" aria-labelledby={`examples-${language}`}>
              <h3 id={`examples-${language}`}>{copy.examplesTitle}</h3>
              {copy.examples.map((example, index) => (
                <button
                  key={example.title}
                  type="button"
                  title={copy.practiceHint}
                  disabled={Boolean(pending || failed)}
                  onClick={() => drawPractice(index)}
                >
                  <span className="topic-icon" data-topic={index} aria-hidden="true">{topicIcons[index]}</span>
                  {example.title}
                  <span className="example-arrow" aria-hidden="true">↗</span>
                </button>
              ))}
            </section>
          </div>
        </aside>

        <section className="chat" aria-labelledby={`chat-${language}`}>
          <header className="chat-header">
            <div className="chat-heading">
              <Image src="/shiba-sensei.webp" alt="" width={40} height={40} unoptimized />
              <div>
              <h2 id={`chat-${language}`}>{copy.chat}</h2>
              <p>{copy.chatIntro}</p>
              </div>
            </div>
            <button className="reset" type="button" onClick={reset}>{copy.reset}</button>
          </header>

          {/* biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users need to scroll the chat history. */}
          <div className="transcript" ref={transcript} role="log" aria-label={copy.history} aria-live="polite" tabIndex={0}>
            {renderMessage("welcome", "assistant", copy.welcome)}
            {[
              ...archive,
              ...(session.practice ? [{ role: "assistant" as const, content: session.practice.question }] : []),
              ...session.messages,
            ].map((message, index) => renderMessage(String(index), message.role, message.content))}
            {optimisticContent && renderMessage("pending", "user", optimisticContent)}
            {pending && <p className="chat-status">{copy.thinking}<span className="thinking-dots" aria-hidden="true"><i /><i /><i /></span></p>}
          </div>

          {failed && (
            <div className="failed">
              <p role="alert">{failed.error.messageJa}</p>
              <div className="failed-actions">
                {failed.error.retryable && <button type="button" onClick={() => void requestReply(failed.request)}>{copy.retry}</button>}
                <button type="button" onClick={editFailed}>{copy.edit}</button>
              </div>
            </div>
          )}

          <form className="composer" onSubmit={submit}>
            <label htmlFor={`question-${language}`}>{copy.input}</label>
            <div className="composer-row">
              <textarea
                id={`question-${language}`}
                ref={input}
                rows={2}
                maxLength={MAX_LENGTH}
                value={draft}
                placeholder={copy.placeholder}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={handleKey}
              />
              <button type="submit" disabled={!draft.trim() || Boolean(pending || failed)}>{copy.send} <span aria-hidden="true">↑</span></button>
            </div>
            <p className="composer-hint">{copy.keyboard}</p>
          </form>
        </section>
      </div>

      <LearningSummary language={language} progress={progress} current={session.curriculumNodeId}
        topic={topic} disabled={Boolean(pending || failed)} draw={drawPractice} />
    </main>
  );
}

function Bubble({ speaker, content, copy, speaking, read }: {
  speaker: "user" | "assistant";
  content: string;
  copy: typeof chatCopy[TutorLanguage];
  speaking: boolean;
  read: () => void;
}) {
  const student = speaker === "user";
  return (
    <div className={student ? "message message-student" : "message"}>
      <span className="message-author">
        {!student && <Image src="/shiba-sensei.webp" alt="" width={24} height={24} unoptimized />}
        {student ? copy.student : copy.teacher}
      </span>
      <p className="bubble">{content}</p>
      {!student && <button className="read-aloud" type="button" onClick={read}>
        <span aria-hidden="true">{speaking ? "◼" : "◖"}</span> {speaking ? copy.stop : copy.read}
      </button>}
    </div>
  );
}
