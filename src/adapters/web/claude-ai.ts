// Claude.ai 데이터 내보내기의 대화 하나(chat_messages 목록)에서 사람 요청과 응답의 시각, 응답의 모델만 꺼낸다. 글과 첨부는 읽지 않는다(순수 함수, 설계 「0.5.0에서 정한 것」)
import { nameRecord } from "../common/canonical.ts";
import type { WebConversation, WebEvent } from "./conversation.ts";

type Json = Record<string, unknown>;
const obj = (value: unknown): Json | null => (value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Json) : null);
const str = (value: unknown): string | null => (typeof value === "string" && value.length > 0 ? value : null);

/** ISO 시각을 밀리초로. 읽지 못하면 null이다 */
function isoToMs(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}

/**
 * 대화 하나. 대화의 꼴(uuid와 chat_messages)이 아니면 null이다.
 * 사람 요청은 sender가 human인 메시지, 응답은 assistant인 메시지다. 메시지의 시각이 없으면 대화를 만든 시각으로 대신한다
 */
export function claudeConversation(value: unknown): WebConversation | null {
  const conversation = obj(value);
  if (conversation === null) return null;
  const id = str(conversation.uuid);
  const messages = conversation.chat_messages;
  if (id === null || !Array.isArray(messages)) return null;
  const fallbackMs = isoToMs(conversation.created_at);
  const model = str(conversation.model);
  const events: WebEvent[] = [];
  const unknownKinds = nameRecord<number>();
  for (const raw of messages) {
    const message = obj(raw);
    const sender = message === null ? null : str(message.sender);
    if (message === null || sender === null) {
      unknownKinds["(message)"] = (unknownKinds["(message)"] ?? 0) + 1;
      continue;
    }
    const atMs = isoToMs(message.created_at) ?? fallbackMs;
    if (sender === "human") events.push({ kind: "request", atMs, model: null });
    else if (sender === "assistant") events.push({ kind: "response", atMs, model });
    else unknownKinds[`sender:${sender}`] = (unknownKinds[`sender:${sender}`] ?? 0) + 1;
  }
  return { id, events, unknownKinds };
}

/** 대화의 꼴인지만 본다(어느 서비스의 내보내기인지 가를 때) */
export const looksLikeClaude = (value: unknown): boolean => {
  const conversation = obj(value);
  return conversation !== null && str(conversation.uuid) !== null && Array.isArray(conversation.chat_messages);
};
