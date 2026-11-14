// E6(안 쓰는 MCP 서버)을 도구 하나에서 잰다. 서버 하나가 설치 하나이고, 설정 층을 합쳐 켜져 있는 서버만 센다(순수 함수, 설계 11.3 E6)
import type { LocalDate } from "../../adapters/common/dates.ts";
import type { McpFact } from "../../scan/types.ts";
import { blank, unmeasured, type Measurement } from "../measure.ts";
import type { ToolSetup } from "../metrics/setup.ts";
import { byContent } from "../order.ts";
import { enablementUnread, unread } from "../readability.ts";
import { BLANK_INSTALL_EVIDENCE, measureInstalls, type Counted } from "./gate.ts";
import { sameInstall } from "./same.ts";
import { serverJudgeableFrom, serverVerdict, type Verdict, type VerdictContext } from "./verdict.ts";

/** E6의 분모(판정된 서버)와 판정할 수 있는 대상의 최소 개수 */
export const MIN_JUDGED_SERVERS = 2;

export interface JudgedServer {
  server: McpFact;
  verdict: Verdict;
  /**
   * 구조상 판정할 수 없어 판정할 수 있는 대상에서 뺀 까닭. no_definition은 정의를 읽지 못해 같은 설치인지 견줄 수 없는 서버이고(claude.ai에 연결한 서버가 든다),
   * plugin_unread는 MCP 정의를 읽지 못했거나 구성을 모르는 플러그인이 넣은 서버다(읽힌 것도 세지 않는다). 판정할 수 있으면 null이다
   */
  excluded: "no_definition" | "plugin_unread" | null;
  /** 판정을 시작할 수 있는 날(serverJudgeableFrom). 쓰는지 모름이고 구조상 빼지 않은 서버만 날을 셈하고, 그 밖은 null이다(설계 12.1, 13.1) */
  judgeFrom: LocalDate | null;
}

export interface ServerJudgement {
  measurement: Measurement;
  /** 판정한 서버 모두(꺼 둔 것도 든다). 읽지 못했거나 MCP 호출을 기록하지 않는 형식에서는 판정하지 않아 비어 있다 */
  servers: JudgedServer[];
}

const SCOPE_ORDER = { user: 0, local: 1, project: 2, plugin: 3, "claude-ai": 4 } as const;
const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const byServer = (a: McpFact, b: McpFact): number =>
  byText(a.name, b.name) ||
  SCOPE_ORDER[a.scope] - SCOPE_ORDER[b.scope] ||
  byText(a.projectRoot ?? "", b.projectRoot ?? "") ||
  byText(a.pluginId ?? "", b.pluginId ?? "") ||
  byText(a.definitionHash ?? "", b.definitionHash ?? "") ||
  // 같은 플러그인을 두 길로 찾으면 켜짐만 다른 서버 사실 둘이 온다. 내용까지 견줘 차례를 끝까지 정한다
  byContent(a, b);

/**
 * 서버를 찾는 곳이나 설정 파일 가운데 읽지 못한 것이 있다. ~/.claude.json은 없으면 그 파일의 서버가 없는 것이라 읽지 못한 것이 아니다.
 * 사용자와 프로젝트의 스킬 폴더는 그 폴더에 둔 플러그인이 넣은 서버를 모르게 한다(설계 11.3 「설치를 찾는 곳을 읽지 못했을 때」).
 */
function serversUnread(tool: ToolSetup): boolean {
  const { setup } = tool;
  const places = setup.unreadableSkillPlaces;
  return unread(setup.claudeJson) || places.user || places.projects.length > 0 || setup.projects.some((project) => unread(project.mcpJsonStatus)) || unread(setup.pluginsFile) || enablementUnread(setup);
}

export function judgeServers(tool: ToolSetup, context: VerdictContext): ServerJudgement {
  const { setup } = tool;
  if (tool.coverage.mcpCalls === "unsupported") return { measurement: unmeasured("unsupported", blank(BLANK_INSTALL_EVIDENCE)), servers: [] };
  if (serversUnread(tool)) return { measurement: unmeasured("unreadable", blank(BLANK_INSTALL_EVIDENCE)), servers: [] };

  // 같은 이름의 서버는 나중에 선언된 것이 통째로 대신하므로, 읽지 못한 선언이 읽힌 서버를 덮었을 수 있다
  const unreadPlugins = new Set(setup.plugins.filter((plugin) => !plugin.compositionKnown || plugin.mcpUnreadable).map((plugin) => plugin.id));
  const servers = [...setup.mcpServers].sort(byServer).map((server): JudgedServer => {
    if (server.installKey === null) return { server, verdict: "unknown", excluded: "no_definition", judgeFrom: null };
    if (server.pluginId !== null && unreadPlugins.has(server.pluginId)) return { server, verdict: "unknown", excluded: "plugin_unread", judgeFrom: null };
    const verdict = serverVerdict(server, context);
    return { server, verdict, excluded: null, judgeFrom: verdict === "unknown" ? serverJudgeableFrom(server, context) : null };
  });
  // 정체가 같은 사실은 설치 하나다. 켜져 있는 사실만 모아 설치마다 한 번 센다. 하나라도 켜져 있으면 켜진 설치다.
  // 스캐너가 같은 플러그인을 두 길로 찾으면 그 서버의 사실이 둘 오는데, 사실마다 세면 서버 하나가 최소 개수 둘을 채운다
  const installs = sameInstall(servers.filter((judged) => judged.server.enabled), (judged) => judged.server.installKey);
  const counted = installs.map((facts): Counted => ({
    verdict: facts.some((judged) => judged.verdict === "used") ? "used" : facts.every((judged) => judged.verdict === "unused") ? "unused" : "unknown",
    structural: facts.some((judged) => judged.excluded !== null),
  }));
  return { measurement: measureInstalls(counted, context.complete, MIN_JUDGED_SERVERS), servers };
}
