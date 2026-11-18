// ChatGPT·Claude.ai 대화 하나를 사람 요청과 응답으로 바꾸고 날짜별 요약을 만드는 것을 시험한다. 대화의 모양은 공개 파서들이 읽는 칸(짝 보고 1의 A·B절)을 따른 합성 대화다(설계 「0.5.0에서 정한 것」)
import { describe, expect, it } from "vitest";
import { chatgptConversation, looksLikeChatgpt } from "../../../src/adapters/web/chatgpt.ts";
import { claudeConversation, looksLikeClaude } from "../../../src/adapters/web/claude-ai.ts";
import { conversationKey, webSummary } from "../../../src/adapters/web/conversation.ts";

const T0 = Date.UTC(2026, 10, 10, 1, 0, 0) / 1000; // 2026-11-10 10:00 서울

interface GptNode {
  id: string;
  parent: string | null;
  role?: string;
  type?: string;
  at?: number | null;
  model?: string;
  hidden?: boolean;
  systemMessage?: boolean;
}

function gpt(nodes: GptNode[], extra: Record<string, unknown> = {}) {
  const mapping: Record<string, unknown> = {};
  for (const node of nodes) {
    mapping[node.id] = {
      id: node.id,
      parent: node.parent,
      children: nodes.filter((other) => other.parent === node.id).map((other) => other.id),
      message:
        node.role === undefined
          ? null
          : {
              id: `m-${node.id}`,
              author: { role: node.role, name: null, metadata: {} },
              create_time: node.at === undefined ? T0 : node.at,
              content: { content_type: node.type ?? "text", parts: ["비밀 글"] },
              status: "finished_successfully",
              metadata: { ...(node.model === undefined ? {} : { model_slug: node.model }), ...(node.hidden ? { is_visually_hidden_from_conversation: true } : {}), ...(node.systemMessage ? { is_user_system_message: true } : {}) },
            },
    };
  }
  return { id: "conv-1", conversation_id: "conv-1", title: "비밀 제목", create_time: T0, update_time: T0 + 60, mapping, current_node: nodes[nodes.length - 1]!.id, default_model_slug: "gpt-5", ...extra };
}

describe("chatgptConversation", () => {
  it("보이는 사용자 메시지가 사람 요청이고, 그 뒤 어시스턴트 메시지 한 덩어리가 응답 하나다. 도구 호출·도구 결과·생각은 같은 응답이다", () => {
    const conversation = chatgptConversation(
      gpt([
        { id: "root", parent: null },
        { id: "sys", parent: "root", role: "system", hidden: true, at: null },
        { id: "u1", parent: "sys", role: "user", at: T0 },
        { id: "a1", parent: "u1", role: "assistant", type: "thoughts", at: T0 + 1, model: "gpt-5-thinking" },
        { id: "a2", parent: "a1", role: "assistant", type: "code", at: T0 + 2, model: "gpt-5-thinking" },
        { id: "t1", parent: "a2", role: "tool", type: "execution_output", at: T0 + 3 },
        { id: "a3", parent: "t1", role: "assistant", at: T0 + 4, model: "gpt-5-thinking" },
        { id: "u2", parent: "a3", role: "user", at: T0 + 10 },
        { id: "a4", parent: "u2", role: "assistant", at: T0 + 11, model: "gpt-5" },
      ]),
    )!;
    expect(conversation.id).toBe("conv-1");
    expect(conversation.events.map((event) => [event.kind, event.model])).toEqual([
      ["request", null],
      ["response", "gpt-5-thinking"],
      ["request", null],
      ["response", "gpt-5"],
    ]);
    expect(conversation.unknownKinds).toEqual({});
  });

  it("내보내기가 도구·시스템 메시지를 빼서 부모가 mapping에 없어도 응답을 두 번 세지 않는다", () => {
    const conversation = chatgptConversation(
      gpt([
        { id: "u1", parent: "gone-root", role: "user", at: T0 },
        { id: "a1", parent: "u1", role: "assistant", at: T0 + 1 },
        { id: "a2", parent: "gone-tool", role: "assistant", at: T0 + 3 },
      ]),
    )!;
    expect(conversation.events.map((event) => event.kind)).toEqual(["request", "response"]);
  });

  it("시각이 같거나 없어도 mapping에 적힌 차례와 상관없이 같은 수다(짝 검토 3 필수 2). 부모 사슬이 있으면 그것으로 응답의 시작을 가린다", () => {
    const line = (order: string[], at: number | null) => {
      const all: GptNode[] = [
        { id: "u1", parent: null, role: "user", at },
        { id: "a1", parent: "u1", role: "assistant", at },
        { id: "u2", parent: "a1", role: "user", at },
        { id: "a2", parent: "u2", role: "assistant", at },
      ];
      return gpt(order.map((id) => all.find((node) => node.id === id)!));
    };
    for (const at of [T0, null]) {
      for (const order of [["u1", "a1", "u2", "a2"], ["u1", "u2", "a1", "a2"], ["a2", "u2", "a1", "u1"]]) {
        const events = chatgptConversation(line(order, at))!.events;
        expect({ at, order, kinds: events.map((event) => event.kind).sort() }).toEqual({ at, order, kinds: ["request", "request", "response", "response"] });
      }
    }
  });

  it("부모가 빠진 메시지는 시각 차례로 가리고, 시각이 같으면 깊이와 ID로 정해 mapping 차례와 상관없다", () => {
    const nodes: GptNode[] = [
      { id: "u1", parent: null, role: "user", at: T0 },
      { id: "a1", parent: "u1", role: "assistant", at: T0 + 1 },
      { id: "a2", parent: "gone-tool", role: "assistant", at: T0 + 1 },
    ];
    const forward = chatgptConversation(gpt(nodes))!.events.map((event) => event.kind);
    const backward = chatgptConversation(gpt([...nodes].reverse()))!.events.map((event) => event.kind);
    expect(forward.sort()).toEqual(["request", "response"]);
    expect(backward.sort()).toEqual(["request", "response"]);
  });

  it("질문을 고쳐 생긴 가지는 사람 요청과 응답을 새로 센다", () => {
    const conversation = chatgptConversation(
      gpt([
        { id: "root", parent: null },
        { id: "u1", parent: "root", role: "user", at: T0 },
        { id: "a1", parent: "u1", role: "assistant", at: T0 + 1 },
        { id: "u1b", parent: "root", role: "user", at: T0 + 30 },
        { id: "a1b", parent: "u1b", role: "assistant", at: T0 + 31 },
      ]),
    )!;
    expect(conversation.events.map((event) => event.kind)).toEqual(["request", "response", "request", "response"]);
  });

  it("맞춤 지시·기억·숨긴 메시지·사용자 시스템 메시지는 사람 요청도 응답도 아니다", () => {
    const conversation = chatgptConversation(
      gpt([
        { id: "root", parent: null },
        { id: "ctx", parent: "root", role: "user", type: "user_editable_context", at: T0 },
        { id: "mem", parent: "ctx", role: "assistant", type: "model_editable_context", at: T0 },
        { id: "h", parent: "mem", role: "user", hidden: true, at: T0 },
        { id: "s", parent: "h", role: "user", systemMessage: true, at: T0 },
        { id: "u1", parent: "s", role: "user", at: T0 + 5 },
        { id: "a1", parent: "u1", role: "assistant", at: T0 + 6 },
      ]),
    )!;
    expect(conversation.events.map((event) => event.kind)).toEqual(["request", "response"]);
  });

  it("메시지의 모델이 없으면 대화의 기본 모델을 쓰고, 둘 다 없으면 모름이다. 메시지 시각이 없으면 대화를 만든 시각으로 대신한다", () => {
    const withDefault = chatgptConversation(gpt([{ id: "u", parent: null, role: "user", at: null }, { id: "a", parent: "u", role: "assistant", at: null }]))!;
    expect(withDefault.events.map((event) => [event.kind, event.atMs, event.model])).toEqual([
      ["request", T0 * 1000, null],
      ["response", T0 * 1000, "gpt-5"],
    ]);
    const none = chatgptConversation(gpt([{ id: "u", parent: null, role: "user" }, { id: "a", parent: "u", role: "assistant" }], { default_model_slug: null }))!;
    expect(none.events[1]!.model).toBeNull();
  });

  it("모르는 내용 꼴과 역할은 세되 따로 적는다", () => {
    const conversation = chatgptConversation(gpt([{ id: "u", parent: null, role: "user", type: "brand_new_type" }, { id: "x", parent: "u", role: "critic" }]))!;
    expect(conversation.unknownKinds).toEqual({ brand_new_type: 1, "role:critic": 1 });
    expect(conversation.events.map((event) => event.kind)).toEqual(["request"]);
  });

  it("mapping이나 ID가 없으면 대화가 아니다", () => {
    expect(chatgptConversation({ id: "x" })).toBeNull();
    expect(chatgptConversation({ mapping: {} })).toBeNull();
    expect(chatgptConversation([])).toBeNull();
    expect(looksLikeChatgpt(gpt([{ id: "u", parent: null, role: "user" }]))).toBe(true);
    expect(looksLikeChatgpt({ uuid: "x", chat_messages: [] })).toBe(false);
  });
});

const claude = (messages: unknown[], extra: Record<string, unknown> = {}) => ({ uuid: "c-1", name: "비밀 제목", created_at: "2026-11-10T01:00:00.000000Z", updated_at: "2026-11-10T02:00:00Z", account: { uuid: "acc" }, chat_messages: messages, ...extra });
const message = (sender: string, at: string | null) => ({ uuid: `m-${sender}-${at}`, text: "비밀 글", content: [{ type: "text", text: "비밀 글" }], sender, created_at: at, updated_at: at, attachments: [], files: [] });

describe("claudeConversation", () => {
  it("human은 사람 요청, assistant는 응답이다. 시각은 소수 초 여섯 자리도 읽고, 없으면 대화를 만든 시각으로 대신한다", () => {
    const conversation = claudeConversation(claude([message("human", "2026-11-10T01:00:01.123456Z"), message("assistant", "2026-11-10T01:00:05Z"), message("human", null)]))!;
    expect(conversation.events).toEqual([
      { kind: "request", atMs: Date.parse("2026-11-10T01:00:01.123Z"), model: null },
      { kind: "response", atMs: Date.parse("2026-11-10T01:00:05Z"), model: null },
      { kind: "request", atMs: Date.parse("2026-11-10T01:00:00Z"), model: null },
    ]);
  });

  it("대화에 모델 칸이 있을 때만 응답의 모델로 쓴다. 지어내지 않는다", () => {
    expect(claudeConversation(claude([message("assistant", "2026-11-10T01:00:05Z")], { model: "claude-opus-5-5" }))!.events[0]!.model).toBe("claude-opus-5-5");
    expect(claudeConversation(claude([message("assistant", "2026-11-10T01:00:05Z")]))!.events[0]!.model).toBeNull();
  });

  it("모르는 보낸 이와 깨진 메시지는 세지 않고 따로 적는다", () => {
    const conversation = claudeConversation(claude([message("system", "2026-11-10T01:00:05Z"), "깨짐", message("human", "2026-11-10T01:00:06Z")]))!;
    expect(conversation.unknownKinds).toEqual({ "(message)": 1, "sender:system": 1 });
    expect(conversation.events.map((event) => event.kind)).toEqual(["request"]);
  });

  it("uuid나 chat_messages가 없으면 대화가 아니다", () => {
    expect(claudeConversation({ chat_messages: [] })).toBeNull();
    expect(claudeConversation({ uuid: "x" })).toBeNull();
    expect(looksLikeClaude(claude([]))).toBe(true);
    expect(looksLikeClaude(gpt([{ id: "u", parent: null, role: "user" }]))).toBe(false);
  });
});

describe("webSummary", () => {
  const conversation = {
    id: "conv-1",
    events: [
      { kind: "request" as const, atMs: Date.UTC(2026, 9, 1, 3), model: null },
      { kind: "response" as const, atMs: Date.UTC(2026, 9, 1, 3, 1), model: "gpt-5" },
      { kind: "request" as const, atMs: Date.UTC(2026, 10, 10, 14, 59), model: null },
      { kind: "response" as const, atMs: Date.UTC(2026, 10, 10, 15, 1), model: "gpt-5" },
      { kind: "response" as const, atMs: null, model: null },
    ],
    unknownKinds: { z: 1, a: 2 },
  };

  it("현지 날짜마다 사람 요청·응답·모델을 센다. 대화 ID는 지문으로만 남기고 글·제목·작업 폴더·버전은 없다", () => {
    const summary = webSummary("web-chatgpt", conversation, "Asia/Seoul", null);
    expect(summary.tool).toBe("web-chatgpt");
    expect(summary.sessionId).toBe(conversationKey("web-chatgpt", "conv-1"));
    expect(summary.sessionId).not.toContain("conv-1");
    expect([summary.kind, summary.cwd, summary.version, summary.parentSessionId]).toEqual(["main", null, null, null]);
    expect(Object.keys(summary.days)).toEqual(["2026-10-01", "2026-11-10", "2026-11-11"]);
    expect([summary.days["2026-11-10"]!.humanRequests, summary.days["2026-11-10"]!.responses]).toEqual([1, 0]);
    expect([summary.days["2026-11-11"]!.humanRequests, summary.days["2026-11-11"]!.responses, summary.days["2026-11-11"]!.models]).toEqual([0, 1, { "gpt-5": 1 }]);
    expect(summary.firstDate).toBe("2026-10-01");
    expect(summary.notes.undatedLines).toBe(1);
    expect(Object.keys(summary.missing.unconfirmedTypes)).toEqual(["a", "z"]);
    expect(JSON.stringify(summary)).not.toContain("비밀");
  });

  it("keepFrom보다 이른 날의 칸은 버리되 첫 날짜는 버린 날까지 따진다", () => {
    const summary = webSummary("web-chatgpt", conversation, "Asia/Seoul", "2026-11-01");
    expect(Object.keys(summary.days)).toEqual(["2026-11-10", "2026-11-11"]);
    expect(summary.firstDate).toBe("2026-10-01");
  });

  it("도구가 다르면 같은 대화 ID라도 지문이 다르다", () => {
    expect(conversationKey("web-chatgpt", "x")).not.toBe(conversationKey("web-claude", "x"));
  });
});
