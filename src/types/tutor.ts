export const practiceNodes = ["meaning", "relation", "percent", "decimal", "area", "volume"] as const;

export type TutorLanguage = "zh" | "ja";

export type MisconceptionStatus = "unknown" | "suspected" | "confirmed" | "resolved";
export type NextAction = "explain" | "ask_diagnostic_question" | "give_hint" | "verify_understanding";

export interface CurriculumNode {
  id: string;
  grade: number;
  subject: "math";
  unit: string;
  titleJa: string;
  prerequisites: string[];
  learningGoalJa: string;
  misconceptionIds: string[];
  examplesJa: string[];
}

export interface Misconception {
  id: string;
  curriculumNodeId: string;
  descriptionJa: string;
  evidencePatterns: string[];
  diagnosticQuestionJa: string;
  correctionHintJa: string;
}

export interface DiagnosisState {
  misconceptionId: string | null;
  status: MisconceptionStatus;
  evidence: string[];
  verificationCount?: number;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface TutorSession {
  practice?: { nodeId: (typeof practiceNodes)[number]; question: string };
  language?: TutorLanguage;
  grade: number;
  curriculumNodeId: string | null;
  diagnosis: DiagnosisState;
  messages: ChatMessage[];
}

export interface PracticeAssessment {
  answer?: string;
  question: string;
  outcome: "correct" | "calculation" | "unit" | "comparison";
}

export interface ModelAssessment {
  question: string;
  verdict: "correct" | "partially_correct" | "incorrect";
  reason: string;
}

export interface ChatResponse {
  modelAssessment?: ModelAssessment;
  assessment?: PracticeAssessment;
  answerRecorded?: true;
  practice?: TutorSession["practice"];
  replyJa: string;
  curriculumNodeId: string | null;
  curriculumTitleJa: string | null;
  diagnosis: DiagnosisState;
  nextAction: NextAction;
}

export interface ChatError {
  error: { code: string; messageJa: string; retryable: boolean };
}

export const emptyDiagnosis = (): DiagnosisState => ({ misconceptionId: null, status: "unknown", evidence: [] });
