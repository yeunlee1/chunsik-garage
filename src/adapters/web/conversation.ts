// 웹 채팅 대화 하나를 도구와 상관없는 꼴(사람 요청과 응답의 시각, 응답의 모델)로 받아 날짜별 세션 요약을 만든다. 대화 글과 제목은 받지 않는다(순수 함수, 설계 9.3, 「0.5.0에서 정한 것」)
import { nameRecord } from "../common/canonical.ts";
import { localDateOf, type LocalDate } from "../common/dates.ts";
import { fnv1a64 } from "../common/hash.ts";
import { canonicalDay, emptyDay, type DayCell, type SessionSummary } from "../types.ts";

export type WebToolId = "web-chatgpt" | "web-claude";

/** 대화 안의 사건 하나. 사람 요청이거나 응답 하나다. 시각을 모르면 atMs가 null이다 */
export interface WebEvent {
  kind: "request" | "response";
  atMs: number | null;
  /** 응답을 낸 모델. 모르면 null이다 */
  model: string | null;
}

export interface WebConversation {
  /** 내보내기 파일의 대화 ID. 요약에는 지문만 남긴다 */
  id: string;
  events: WebEvent[];
  /** 알아보지 못한 메시지 꼴과 그 수(형식이 바뀌었는지 알리는 데 쓴다) */
  unknownKinds: Record<string, number>;
}

/** 대화 ID의 지문. 같은 대화면 늘 같고 ID는 되살릴 수 없다 */
export const conversationKey = (tool: WebToolId, id: string): string => `${tool}:${fnv1a64(id)}`;

/**
 * 대화 하나의 세션 요약. keepFrom보다 이른 날의 칸은 버린다(수집 구간은 앞으로만 움직이므로 다시 쓰이지 않는다). 첫 날짜는 버린 날까지 따진다.
 * 모든 대화는 주 세션이고 작업 폴더와 버전이 없다
 */
export function webSummary(tool: WebToolId, conversation: WebConversation, timeZone: string, keepFrom: LocalDate | null): SessionSummary {
  const days: Record<LocalDate, DayCell> = {};
  let firstDate: LocalDate | null = null;
  let undated = 0;
  for (const event of conversation.events) {
    if (event.atMs === null) {
      undated++;
      continue;
    }
    const date = localDateOf(event.atMs, timeZone);
    if (firstDate === null || date < firstDate) firstDate = date;
    if (keepFrom !== null && date < keepFrom) continue;
    const day = (days[date] ??= emptyDay());
    if (event.kind === "request") day.humanRequests++;
    else {
      day.responses++;
      if (event.model !== null) day.models[event.model] = (Object.hasOwn(day.models, event.model) ? day.models[event.model]! : 0) + 1;
    }
  }
  const sorted: Record<LocalDate, DayCell> = {};
  for (const date of Object.keys(days).sort()) sorted[date] = canonicalDay(days[date]!);
  const unconfirmedTypes = nameRecord<number>();
  for (const kind of Object.keys(conversation.unknownKinds).sort()) unconfirmedTypes[kind] = conversation.unknownKinds[kind]!;
  return {
    tool,
    sessionId: conversationKey(tool, conversation.id),
    kind: "main",
    parentSessionId: null,
    cwd: null,
    version: null,
    firstDate,
    days: sorted,
    instructionChars: null,
    initialSkills: null,
    initialMcpServers: null,
    missing: { lines: conversation.events.length, brokenLines: 0, tailFragments: 0, tooLongLines: 0, unconfirmedTypes },
    firstResponseIdHashes: [],
    notes: { syntheticResponses: 0, responsesWithoutId: 0, undatedLines: undated, unknownHookKinds: nameRecord<number>() },
  };
}
