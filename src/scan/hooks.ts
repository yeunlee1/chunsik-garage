// 훅 설정에서 도구 실행 전 확인 훅의 겉모양(셸 명령 도구에 걸리는지, 실행을 막을 수 있는지)만 본다. 명령과 권한 규칙의 글은 메모리에서만 쓰고 싣지 않는다(설계 11.3 S2, E5 ⑤)
export const SHELL_TOOLS = ["Bash", "PowerShell"] as const;

/** ㉠의 훅을 찾는 네 출처(설계 11.3). 프로젝트 설정·로컬 설정·스킬과 에이전트의 머리말에 적은 훅은 넣지 않는다 */
export type HookSource = "managed" | "managed-plugin" | "user" | "user-plugin";

export interface ShellGuard {
  source: HookSource;
  /** 플러그인의 훅이면 '<이름>@<마켓>' */
  pluginId: string | null;
  /** 매처와 if를 함께 통과하는 셸 명령 도구가 있다 */
  coversShell: boolean;
  /** 기다렸다가 받는 방식이다(async와 asyncRewake를 둘 다 켜지 않았다) */
  canBlock: boolean;
}

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => v !== null && typeof v === "object" && !Array.isArray(v);

/** 공식 문서의 매처 규약. 없거나 빈 문자열이나 *이면 모두에 맞고, 이름 글자만 있으면 |나 ,로 나눈 이름과 글자 그대로 견주며, 그 밖은 정규식이다. 풀리지 않는 정규식은 맞지 않는다. */
export function matcherMatches(matcher: unknown, tool: string): boolean {
  if (matcher === undefined || matcher === null || matcher === "" || matcher === "*") return true;
  if (typeof matcher !== "string") return false;
  if (/^[A-Za-z0-9_\- ,|]+$/.test(matcher)) {
    return matcher
      .split(/[|,]/)
      .map((name) => name.trim())
      .includes(tool);
  }
  try {
    return new RegExp(matcher).test(tool);
  } catch {
    return false;
  }
}

/** 처리기의 if(권한 규칙 하나)가 가리키는 도구. if가 없으면 null, 권한 규칙으로 읽지 못하면 "unreadable"이다. 인자 부분은 보지 않는다. */
export function ifTool(rule: unknown): string | null | "unreadable" {
  if (rule === undefined) return null;
  if (typeof rule !== "string") return "unreadable";
  const match = /^\s*([A-Za-z0-9_]+)\s*(?:\(.*\))?\s*$/s.exec(rule);
  return match === null ? "unreadable" : match[1]!;
}

export function coversShell(matcher: unknown, rule: unknown): boolean {
  const tool = ifTool(rule);
  if (tool === "unreadable") return false;
  return SHELL_TOOLS.some((shell) => matcherMatches(matcher, shell) && (tool === null || tool === shell));
}

/** 공식 문서의 처리기 종류와 종류마다 꼭 있어야 하는 값(hooks 문서의 처리기 필드). type이 없거나 이 밖이면 처리기가 아니다 */
const REQUIRED_FIELDS = new Map<string, readonly string[]>([
  ["command", ["command"]],
  ["http", ["url"]],
  ["mcp_tool", ["server", "tool"]],
  ["prompt", ["prompt"]],
  ["agent", ["prompt"]],
]);

/** 처리기로 읽히는가. type이 다섯 종류 가운데 하나이고 그 종류의 필수 값이 모두 빈 글자가 아닌 글자다 */
export function isHandler(handler: unknown): handler is Json {
  if (!isObject(handler) || typeof handler.type !== "string") return false;
  const required = REQUIRED_FIELDS.get(handler.type);
  return required !== undefined && required.every((field) => typeof handler[field] === "string" && handler[field] !== "");
}

/** 사건 묶음이 훅 형식의 뼈대를 갖췄는가. 사건마다 매처 묶음의 목록이고, 묶음마다 hooks 목록이 있고, 처리기가 모두 처리기로 읽힌다. 형식 검사의 전부는 아니다(그 밖의 값의 종류나 사건 이름은 보지 않는다) */
export function hookMapValid(events: unknown): events is Json {
  if (!isObject(events)) return false;
  for (const groups of Object.values(events)) {
    if (!Array.isArray(groups)) return false;
    for (const group of groups) if (!isObject(group) || !Array.isArray(group.hooks) || !group.hooks.every(isHandler)) return false;
  }
  return true;
}

/** 플러그인 훅 파일의 사건 묶음. 맨 위 hooks 감싸개가 없거나 뼈대가 형식에 맞지 않으면 도구가 파일째 싣지 않으므로 null이다(공식 문서 plugins-reference 「hooks」, plugins troubleshooting 「Hooks fail to load」) */
export function hookFileEvents(file: unknown): Json | null {
  return isObject(file) && hookMapValid(file.hooks) ? file.hooks : null;
}

/** 매니페스트나 마켓 항목에 인라인으로 적은 훅. 감싸개 없이 사건 묶음 그대로이고, 뼈대가 형식에 맞지 않으면 null이다(공식 문서 plugins-reference 「hooks」) */
export function inlineHookEvents(inline: unknown): Json | null {
  return hookMapValid(inline) ? inline : null;
}

/** 사건 묶음({ 사건: [ { matcher, hooks: [처리기] } ] })에서 PreToolUse 처리기마다 겉모양을 낸다. 처리기로 읽히지 않는 것은 확인 훅으로 세지 않는다 */
export function preToolUseGuards(events: unknown, source: HookSource, pluginId: string | null): ShellGuard[] {
  if (!isObject(events) || !Array.isArray(events.PreToolUse)) return [];
  const out: ShellGuard[] = [];
  for (const group of events.PreToolUse) {
    if (!isObject(group) || !Array.isArray(group.hooks)) continue;
    for (const handler of group.hooks) {
      if (!isHandler(handler)) continue;
      out.push({ source, pluginId, coversShell: coversShell(group.matcher, handler.if), canBlock: handler.async !== true && handler.asyncRewake !== true });
    }
  }
  return out;
}

/** 사건 묶음의 모든 처리기가 실행하는 명령의 글(command와 args). 스킬 경로가 나오는지 보는 데에만 쓰고 버린다. */
export function hookCommandTexts(events: unknown): string[] {
  if (!isObject(events)) return [];
  const out: string[] = [];
  for (const groups of Object.values(events)) {
    if (!Array.isArray(groups)) continue;
    for (const group of groups) {
      if (!isObject(group) || !Array.isArray(group.hooks)) continue;
      for (const handler of group.hooks) {
        if (!isObject(handler)) continue;
        const parts: string[] = [];
        if (typeof handler.command === "string") parts.push(handler.command);
        if (Array.isArray(handler.args)) for (const arg of handler.args) if (typeof arg === "string") parts.push(arg);
        if (parts.length > 0) out.push(parts.join(" "));
      }
    }
  }
  return out;
}
