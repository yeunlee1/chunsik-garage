// 규칙 문장에 함께 쓰는 문구. 도구 이름, 못 잰 이유의 낱말과 설명, 도구별 값의 줄, 다른 도구로 쟀을 때의 덧붙임, 안전장치의 조건, E6 항목의 정보다(설계 11.4, 11.5, 12.2, 13.1)
import type { ToolId } from "../../adapters/types.ts";
import type { Reason } from "../reasons.ts";
import type { UnjudgedServer } from "../result/assemble.ts";
import type { Texts } from "./lang.ts";
import type { ReasonCopy } from "./types.ts";

export const TOOL_NAMES: Record<ToolId, Texts<string>> = {
  "claude-code": { en: "Claude Code", ko: "Claude Code" },
};

/** 못 잰 이유의 낱말과 설명. 규칙이 따로 쓴 것이 없을 때 쓴다(설계 11.4) */
export const REASON_COPY: Record<Reason, Texts<ReasonCopy>> = {
  unsupported: {
    en: { word: "Not recorded", text: "This tool or record format does not record what this rule needs." },
    ko: { word: "기록되지 않음", text: "이 도구나 기록 형식은 이 규칙이 보는 것을 남기지 않습니다." },
  },
  unreadable: {
    en: { word: "Could not read", text: "A file this rule needs could not be read. See the notices as well." },
    ko: { word: "읽지 못함", text: "이 규칙에 필요한 파일을 읽지 못했습니다. 알림도 함께 보세요." },
  },
  not_applicable: {
    en: { word: "Not applicable", text: "There is nothing for this rule to look at." },
    ko: { word: "해당 없음", text: "이 규칙이 볼 것이 없습니다." },
  },
  incomplete: {
    en: { word: "Incomplete records", text: "The records could not all be read, so this was not measured." },
    ko: { word: "기록이 빠짐", text: "기록을 빠짐없이 읽지 못해 재지 않았습니다." },
  },
  no_data: {
    en: { word: "No records", text: "There is nothing in the records to measure yet." },
    ko: { word: "기록 없음", text: "잴 기록이 아직 없습니다." },
  },
  too_little: {
    en: { word: "Too few records", text: "Not enough records have built up to measure this." },
    ko: { word: "기록이 적음", text: "잴 만큼 기록이 쌓이지 않았습니다." },
  },
  watching: {
    en: { word: "Still watching", text: "Still watching before judging." },
    ko: { word: "지켜보는 중", text: "아직 지켜보는 중입니다." },
  },
};

/** 도구별 값의 줄. {value}는 단위를 붙인 잰 값, {reason}은 못 잰 이유의 낱말, {evidence}는 그 도구의 근거 숫자 줄이다 */
export const TOOL_LINE: Texts<{ measured: string; unmeasured: string }> = {
  en: { measured: "{tool}: {value} · {evidence}", unmeasured: "{tool}: not measured ({reason}) · {evidence}" },
  ko: { measured: "{tool}: {value} · {evidence}", unmeasured: "{tool}: 잴 수 없음({reason}) · {evidence}" },
};

/** 규칙은 다른 도구로 쟀는데 정비 후보가 나온 도구는 비율을 못 쟀을 때, 규칙의 평소 설명 뒤에 붙인다(설계 11.5의 표) */
export const OTHER_TOOL_COPY: Record<"too_little" | "watching", Texts<string>> = {
  too_little: {
    en: "Only {judgeable} {judgeable:installation|installations} in {tool} can be assessed for use, so its share was not calculated, but {candidates} can be cleaned up.",
    ko: "{tool}는 쓰는지 가릴 수 있는 것이 {judgeable}개뿐이어서 비율을 내지 않았지만 정리할 수 있는 것이 {candidates}개 있습니다.",
  },
  watching: {
    en: "Some installations in {tool} are still being observed, so its share was not calculated, but {candidates} of those confirmed unused can be cleaned up now.",
    ko: "{tool}는 아직 지켜보는 중인 것이 있어 비율을 내지 않았지만 안 쓰는 것으로 확인된 것 가운데 {candidates}개는 지금 정리할 수 있습니다.",
  },
};

/** 안전장치(S2)가 도구마다 어느 조건으로 인정됐는지(설계 11.3 S2의 근거와 처방). 훅의 명령은 싣지 않는다 */
export const SAFEGUARD_COPY: Texts<{ line: string; hook: string; permissions: string; both: string; none: string; unknown: string }> = {
  en: {
    line: "{tool}: {condition}",
    hook: "a PreToolUse hook that can block covers shell commands",
    permissions: "the default mode does not bypass permissions",
    both: "the default mode does not bypass permissions, and a confirming hook covers shell commands too",
    none: "no safeguard (permissions are bypassed and no confirming hook covers shell commands)",
    unknown: "could not tell, because a settings file could not be read",
  },
  ko: {
    line: "{tool}: {condition}",
    hook: "셸 명령을 덮는 도구 실행 전 확인 훅이 있음",
    permissions: "기본 모드가 권한 우회가 아님",
    both: "기본 모드가 권한 우회가 아니고 셸 명령을 덮는 확인 훅도 있음",
    none: "안전장치 없음(권한 우회 모드이고 셸 명령을 덮는 확인 훅이 없음)",
    unknown: "설정 파일을 읽지 못해 가리지 못함",
  },
};

/** E6 항목의 정보. 판정에서 뺀 켜진 서버 가운데 부른 기록이 없는 것을 까닭마다 센다. 이름은 결과 화면이 따로 그린다(설계 13.1, 16.1) */
export const UNJUDGED_COPY: Texts<{ intro: string; line: string; why: Record<UnjudgedServer["why"], string>; deny: string }> = {
  en: {
    intro: "Servers left out of the judgment that have no record of being called. They are not suggested for turning off.",
    line: "{tool}: {why} ({count})",
    why: {
      no_definition: "definition not on this PC or not fully read",
      plugin_unread: "plugin configuration or MCP definitions could not be read",
      not_established: "still being watched",
      observation_incomplete: "records could not all be read",
    },
    deny: "To block a claude.ai connector that Claude Code loads itself, add { \"serverName\": \"<name>\" } to the deniedMcpServers list in your user settings (~/.claude/settings.json). Connectors that the desktop app passes in directly are not blocked this way. Disconnect those at claude.ai/customize/connectors.",
  },
  ko: {
    intro: "판정에서 뺀 서버 가운데 부른 기록이 없는 것입니다. 끄자고 하지 않습니다.",
    line: "{tool}: {why} {count}개",
    why: {
      no_definition: "정의가 이 PC에 없거나 다 읽히지 않음",
      plugin_unread: "플러그인 구성이나 MCP 정의를 읽지 못함",
      not_established: "아직 지켜보는 중",
      observation_incomplete: "기록을 빠짐없이 읽지 못함",
    },
    deny: "Claude Code가 직접 가져오는 claude.ai 연결을 막으려면 사용자 설정(~/.claude/settings.json)의 deniedMcpServers 목록에 { \"serverName\": \"<이름>\" }을 더하세요. 데스크톱 앱이 직접 넘기는 연결은 이렇게 막히지 않습니다. 그런 연결은 claude.ai/customize/connectors에서 끊으세요.",
  },
};
