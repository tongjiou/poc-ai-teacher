import { z } from "zod";
import { practiceNodes } from "../types/tutor";

export const chatRequest = z.object({
  grade: z.literal(5),
  practice: z.object({
    nodeId: z.enum(practiceNodes),
    question: z.string().trim().min(1).max(600),
  }).optional(),
  language: z.enum(["zh", "ja"]).optional(),
  curriculumNodeId: z.string().max(64).nullable(),
  diagnosis: z.object({
    misconceptionId: z.string().max(64).nullable(),
    status: z.enum(["unknown", "suspected", "confirmed", "resolved"]),
    evidence: z.array(z.string().max(600)).max(25),
    verificationCount: z.number().int().min(0).max(2).optional(),
  }),
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().trim().min(1).max(600),
  })).min(1).max(25).refine((messages) => messages.length % 2 === 1 &&
    messages.every((m, i) => m.role === (i % 2 ? "assistant" : "user"))),
});
export const modelReply = z.object({
  replyJa: z.string().trim().min(1).max(300),
  assessment: z.object({
    verdict: z.enum(["correct", "partially_correct", "incorrect", "ungradable"]),
    reason: z.string().trim().min(1).max(160),
  }).strict().optional(),
}).strict();
