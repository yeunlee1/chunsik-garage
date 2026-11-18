// ChatGPT 데이터 내보내기의 대화 하나(mapping)에서 사람 요청과 응답의 시각, 응답의 모델만 꺼낸다. 질문 고치기로 생긴 가지도 센다. 글은 읽지 않는다(순수 함수, 설계 「0.5.0에서 정한 것」)
import { nameRecord } from "../common/canonical.ts";
import type { WebConversation, WebEvent } from "./conversation.ts";

type Json = Record<string, unknown>;
const obj = (value: unknown): Json | null => (value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Json) : null);
const str = (value: unknown): string | null => (typeof value === "string" && value.length > 0 ? value : null);

/** 초 단위 시각(소수)을 밀리초로. 0 이하나 수가 아니면 null이다 */
function secondsToMs(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value * 1000) : null;
}

/** 화면에 보이지 않는 맥락(맞춤 지시, 기억). 사람 요청도 응답도 아니다 */
const CONTEXT_TYPES: ReadonlySet<string> = new Set(["user_editable_context", "model_editable_context"]);

/** 공개 파서들이 읽는 내용의 꼴(짝 보고 1의 A3). 이 밖의 꼴도 세되 알아보지 못한 꼴로 따로 적는다 */
const KNOWN_TYPES: ReadonlySet<string> = new Set([
  "text",
  "multimodal_text",
  "code",
  "execution_output",
  "thoughts",
  "reasoning_recap",
  "tether_browsing_display",
  "tether_quote",
  "system_error",
  "sonic_webpage",
  "computer_output",
  ...CONTEXT_TYPES,
]);
const KNOWN_ROLES: ReadonlySet<string> = new Set(["user", "assistant", "tool", "system"]);

interface Visible {
  role: "user" | "assistant";
  atMs: number | null;
  model: string | null;
}

/**
 * 대화 하나. 대화의 꼴(mapping과 ID)이 아니면 null이다.
 * 사람 요청은 보이는 사용자 메시지다. 응답은 보이는 메시지를 시각 차례로 세웠을 때 사람 요청 뒤에 이어지는 어시스턴트 메시지 한 덩어리다.
 * 도구를 부르고 이어 쓴 메시지와 생각은 같은 응답이고, 내보내기가 도구·시스템 메시지를 빼서 부모 사슬이 끊겨도 같게 센다. 다시 만들기는 앞 응답에 붙어 세지 않는다(적게 센다)
 */
export function chatgptConversation(value: unknown): WebConversation | null {
  const conversation = obj(value);
  if (conversation === null) return null;
  const mapping = obj(conversation.mapping);
  const id = str(conversation.conversation_id) ?? str(conversation.id);
  if (mapping === null || id === null) return null;
  const defaultModel = str(conversation.default_model_slug);
  const fallbackMs = secondsToMs(conversation.create_time);
  const unknownKinds = nameRecord<number>();
  const note = (kind: string): void => {
    unknownKinds[kind] = (unknownKinds[kind] ?? 0) + 1;
  };
  const visible: Visible[] = [];
  for (const raw of Object.values(mapping)) {
    const node = obj(raw);
    if (node === null) {
      note("(node)");
      continue;
    }
    const message = obj(node.message);
    if (message === null) continue;
    const role = str(obj(message.author)?.role);
    const metadata = obj(message.metadata);
    const contentType = str(obj(message.content)?.content_type);
    if (contentType !== null && !KNOWN_TYPES.has(contentType)) note(contentType);
    if (role !== null && !KNOWN_ROLES.has(role)) note(`role:${role}`);
    const hidden = metadata?.is_visually_hidden_from_conversation === true || metadata?.is_user_system_message === true || (contentType !== null && CONTEXT_TYPES.has(contentType));
    if (hidden || (role !== "user" && role !== "assistant")) continue;
    visible.push({ role, atMs: secondsToMs(message.create_time) ?? fallbackMs, model: role === "assistant" ? (str(metadata?.model_slug) ?? defaultModel) : null });
  }
  // 시각이 같으면 mapping의 차례를 지킨다(정렬은 안정하다). 시각을 모르는 메시지는 맨 뒤다
  visible.sort((a, b) => (a.atMs ?? Number.POSITIVE_INFINITY) - (b.atMs ?? Number.POSITIVE_INFINITY));
  const events: WebEvent[] = [];
  let previous: Visible["role"] | null = null;
  for (const message of visible) {
    if (message.role === "user") events.push({ kind: "request", atMs: message.atMs, model: null });
    else if (previous !== "assistant") events.push({ kind: "response", atMs: message.atMs, model: message.model });
    previous = message.role;
  }
  return { id, events, unknownKinds };
}

/** 대화의 꼴인지만 본다(어느 서비스의 내보내기인지 가를 때) */
export const looksLikeChatgpt = (value: unknown): boolean => {
  const conversation = obj(value);
  return conversation !== null && obj(conversation.mapping) !== null;
};
