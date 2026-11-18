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

/** mapping의 노드 하나. 글은 담지 않는다 */
interface Node {
  key: string;
  parent: string | null;
  /** user와 assistant 가운데 화면에 보이는 것만 이 값이 있다. 도구 결과는 tool, 그 밖(숨김, 시스템, 빈 노드)은 null이다 */
  role: "user" | "assistant" | "tool" | null;
  atMs: number | null;
  model: string | null;
}

/**
 * 대화 하나. 대화의 꼴(mapping과 ID)이 아니면 null이다.
 * 사람 요청은 보이는 사용자 메시지다. 응답은 사람 요청 뒤의 첫 어시스턴트 메시지다. 도구를 부르고 이어 쓴 메시지와 생각은 같은 응답이고, 질문 고치기로 생긴 가지는 새로 센다.
 * 응답의 시작은 부모 사슬로 가린다(숨은 메시지는 건너뛴다). 내보내기가 도구·시스템 메시지를 빼서 사슬이 끊긴 메시지만 시각 차례로 가린다.
 * 차례는 시각, 깊이, 노드 ID로 정해 mapping에 적힌 차례와 상관없다(짝 검토 3 필수 2). 다시 만들기는 앞 응답에 붙지 않고 새 응답이다
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

  const nodes = new Map<string, Node>();
  for (const [key, raw] of Object.entries(mapping)) {
    const node = obj(raw);
    if (node === null) {
      note("(node)");
      continue;
    }
    const parent = str(node.parent);
    const message = obj(node.message);
    if (message === null) {
      nodes.set(key, { key, parent, role: null, atMs: null, model: null });
      continue;
    }
    const role = str(obj(message.author)?.role);
    const metadata = obj(message.metadata);
    const contentType = str(obj(message.content)?.content_type);
    if (contentType !== null && !KNOWN_TYPES.has(contentType)) note(contentType);
    if (role !== null && !KNOWN_ROLES.has(role)) note(`role:${role}`);
    const hidden = metadata?.is_visually_hidden_from_conversation === true || metadata?.is_user_system_message === true || (contentType !== null && CONTEXT_TYPES.has(contentType));
    const shown = hidden ? null : role === "user" || role === "assistant" ? role : role === "tool" ? "tool" : null;
    nodes.set(key, { key, parent, role: shown, atMs: secondsToMs(message.create_time) ?? fallbackMs, model: shown === "assistant" ? (str(metadata?.model_slug) ?? defaultModel) : null });
  }

  /** 사슬이 끊긴(부모가 mapping에 없거나 고리인) 노드의 깊이 바탕. 끊긴 노드는 빠진 노드 뒤에 왔으므로 같은 시각이면 사슬이 이어진 노드 뒤에 둔다 */
  const BROKEN_DEPTH = 1_000_000;
  /** 뿌리까지의 깊이. 부모가 없으면 0에서, 부모가 mapping에 없거나 고리면 BROKEN_DEPTH에서 센다 */
  const depthCache = new Map<string, number>();
  const depthOf = (start: Node): number => {
    const chain: Node[] = [];
    const seen = new Set<string>();
    let node: Node | undefined = start;
    let base = 0;
    while (node !== undefined) {
      if (seen.has(node.key)) {
        base = BROKEN_DEPTH;
        break;
      }
      const known = depthCache.get(node.key);
      if (known !== undefined) {
        base = known + 1;
        break;
      }
      seen.add(node.key);
      chain.push(node);
      if (node.parent === null) break;
      const parent = nodes.get(node.parent);
      if (parent === undefined) {
        base = BROKEN_DEPTH;
        break;
      }
      node = parent;
    }
    for (let index = chain.length - 1; index >= 0; index--) depthCache.set(chain[index]!.key, base + (chain.length - 1 - index));
    return depthCache.get(start.key)!;
  };

  /**
   * 위로 올라가며 숨은 노드와 도구 결과를 건너뛰고 처음 만나는 보이는 사람 요청이나 어시스턴트 메시지. 뿌리까지 없으면 root, 부모가 mapping에 없거나 고리면 missing이다.
   * 도구 결과를 건너뛰므로, 도구를 부른 메시지가 숨겨졌거나 빠져도 최종 답변을 버리지 않는다(짝 검토 5 필수 1)
   */
  const visibleAbove = (start: string | null): "user" | "assistant" | "root" | "missing" => {
    const seen = new Set<string>();
    for (let key = start; key !== null; ) {
      if (seen.has(key)) return "missing";
      seen.add(key);
      const node = nodes.get(key);
      if (node === undefined) return "missing";
      if (node.role === "user" || node.role === "assistant") return node.role;
      key = node.parent;
    }
    return "root";
  };

  // 깊이는 노드 ID 차례로 미리 정해 둔다. 고리가 있으면 어느 노드에서 걷기 시작하느냐에 따라 깊이가 달라지므로 mapping에 적힌 차례와 상관없게 한다(짝 검토 5 참고 1)
  for (const key of [...nodes.keys()].sort()) depthOf(nodes.get(key)!);
  // 보이는 사람 요청과 어시스턴트 메시지를 시각, 깊이, 노드 ID 차례로 세운다(시각을 모르면 맨 뒤)
  const order = (a: Node, b: Node): number => (a.atMs ?? Number.POSITIVE_INFINITY) - (b.atMs ?? Number.POSITIVE_INFINITY) || depthOf(a) - depthOf(b) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  const visible = [...nodes.values()].filter((node) => node.role === "user" || node.role === "assistant").sort(order);

  const events: WebEvent[] = [];
  visible.forEach((node, index) => {
    if (node.role === "user") {
      events.push({ kind: "request", atMs: node.atMs, model: null });
      return;
    }
    const above = visibleAbove(node.parent);
    // 사슬이 끊겼으면 시각 차례에서 바로 앞의 보이는 메시지로 가린다. 앞이 없으면 대화를 연 응답이다
    const starts = above === "missing" ? index === 0 || visible[index - 1]!.role === "user" : above === "user" || above === "root";
    if (starts) events.push({ kind: "response", atMs: node.atMs, model: node.model });
  });
  return { id, events, unknownKinds };
}

/** 대화의 꼴인지만 본다(어느 서비스의 내보내기인지 가를 때) */
export const looksLikeChatgpt = (value: unknown): boolean => {
  const conversation = obj(value);
  return conversation !== null && obj(conversation.mapping) !== null;
};
