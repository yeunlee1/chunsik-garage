// 정비 계획의 문장. 항목마다 제목, 바꾸는 것, 영향 범위, 되돌리는 법, 자동으로 고칠 수 없는 까닭과 실행 알림을 두 언어로 짓는다. 춘식이의 말투는 스킬 본문이 붙인다(「6단계 1부 계획 전 결정」 8번)
import { TOOL_NAMES } from "../core/copy/common.ts";
import { fill } from "../core/copy/format.ts";
import type { Lang, Texts } from "../core/copy/lang.ts";
import type { TuneBlock, TuneItem } from "./items.ts";
import type { TuneRunNotice } from "./plan.ts";

type Unit = TuneItem["unit"];

interface TuneCopy {
  title: Record<Unit, string>;
  change: Record<Unit, string>;
  current: { none: string; value: string; unexpected: string };
  impact: Record<Unit, string>;
  undo: string;
  blocked: Record<TuneBlock, string>;
  notices: { not_saved: string; plan_unsaved: string };
}

export const TUNE_COPY: Texts<TuneCopy> = {
  en: {
    title: { A1: "Turn off an unused skill: {name}", A2: "Turn off an unused plugin: {name}", A3: "Block an unused MCP server: {name}", A4: "Turn off an unused Codex MCP server: {name}" },
    change: {
      A1: 'In {file}, set "{name}" under skillOverrides to "off" ({current}).',
      A2: 'In {file}, set "{name}" under enabledPlugins to false ({current}).',
      A3: 'In {file}, add { "serverName": "{name}" } to the deniedMcpServers list.',
      A4: "In {file}, write enabled = false in the [mcp_servers.{name}] table ({current}).",
    },
    current: { none: "now not set", value: "now {value}", unexpected: "now an unexpected value" },
    impact: {
      A1: "This name also turns off {user} {user:skill|skills} in user folders, {project} in projects and {plugin} in plugins. It applies to every project on this PC.",
      A2: "The plugin contains only {skills} {skills:skill|skills}.",
      A3: "Servers with the same name are blocked too: {local} local, {project} project and {claudeAi} claude.ai. It applies to every server with this name on this PC.",
      A4: "It applies to all of Codex. {projects} trusted {projects:project|projects} that {projects:redefines|redefine} this server {projects:is|are} turned off too unless {projects:it sets|they set} enabled.",
    },
    undo: "After applying, you can undo this with aq tune undo.",
    blocked: {
      "unverified-version": "This {tool} version is outside the range this tool has verified, so it is not changed automatically. Change it yourself as described above.",
      "file-missing": "The settings file does not exist, so it is not changed automatically. Change it yourself as described above.",
      "file-unreadable": "The settings file could not be read, so it is not changed automatically. Change it yourself as described above.",
      "not-regular": "The settings file or its folder is a link, so it is not changed automatically. Change it yourself as described above.",
      "byte-order-mark": "The settings file starts with a byte order mark, so it is not changed automatically. Change it yourself as described above.",
      "not-json-object": "The settings file is not standard JSON (JSON with comments is not), so it is not changed automatically. Change it yourself as described above.",
      "parent-shape": "{parent} in the settings file is not in the expected shape, so it is not changed automatically. Change it yourself as described above.",
      "value-shape": "The current value is not in the expected shape, so it is not changed automatically. Change it yourself as described above.",
      "not-toml": "config.toml could not be parsed, so it is not changed automatically. Change it yourself as described above.",
      "table-shape": "The [mcp_servers.{name}] table is not written as one multi-line table (it uses an inline table or dotted keys), so it is not changed automatically. Change it yourself as described above.",
    },
    notices: {
      not_saved: "This plan was not saved, so it cannot be applied. To apply it, run aq tune plan again without --no-save.",
      plan_unsaved: "The plan could not be written to the state folder ({code}), so it cannot be applied.",
    },
  },
  ko: {
    title: { A1: "안 쓰는 스킬 끄기: {name}", A2: "안 쓰는 플러그인 끄기: {name}", A3: "안 쓰는 MCP 서버 막기: {name}", A4: "Codex의 안 쓰는 MCP 서버 끄기: {name}" },
    change: {
      A1: '{file}의 skillOverrides에서 이름 "{name}"의 값을 "off"로 바꿉니다({current}).',
      A2: '{file}의 enabledPlugins에서 설치 ID "{name}"의 값을 false로 바꿉니다({current}).',
      A3: '{file}의 deniedMcpServers 목록에 { "serverName": "{name}" } 항목을 더합니다.',
      A4: "{file}의 [mcp_servers.{name}] 표에 enabled = false를 적습니다({current}).",
    },
    current: { none: "지금은 정하지 않음", value: "지금은 {value}", unexpected: "지금은 예상하지 못한 값" },
    impact: {
      A1: "이 이름으로 사용자 폴더의 스킬 {user}개, 프로젝트의 스킬 {project}개, 플러그인의 스킬 {plugin}개가 함께 꺼집니다. 이 PC의 모든 프로젝트에 듣습니다.",
      A2: "이 플러그인에는 스킬 {skills}개만 들어 있습니다.",
      A3: "같은 이름의 로컬 범위 서버 {local}개, 프로젝트 범위 서버 {project}개, claude.ai 연결 {claudeAi}개도 함께 막힙니다. 이 PC에서 이 이름으로 정의된 서버 모두에 듣습니다.",
      A4: "Codex 전체에 듣습니다. 이 서버를 다시 적은 신뢰한 프로젝트 {projects}곳도 그 프로젝트가 enabled를 적지 않았으면 함께 꺼집니다.",
    },
    undo: "적용한 뒤 aq tune undo로 되돌릴 수 있습니다.",
    blocked: {
      "unverified-version": "{tool}의 버전이 이 도구가 확인한 범위 밖이라 자동으로 고치지 않습니다. 위에 적은 대로 직접 바꾸세요.",
      "file-missing": "설정 파일이 없어 자동으로 고치지 않습니다. 위에 적은 대로 직접 바꾸세요.",
      "file-unreadable": "설정 파일을 읽지 못해 자동으로 고치지 않습니다. 위에 적은 대로 직접 바꾸세요.",
      "not-regular": "설정 파일이나 그 폴더가 링크라 자동으로 고치지 않습니다. 위에 적은 대로 직접 바꾸세요.",
      "byte-order-mark": "설정 파일이 바이트 순서 표시로 시작해 자동으로 고치지 않습니다. 위에 적은 대로 직접 바꾸세요.",
      "not-json-object": "설정 파일이 표준 JSON이 아니어서(주석이 든 JSON도 그렇습니다) 자동으로 고치지 않습니다. 위에 적은 대로 직접 바꾸세요.",
      "parent-shape": "설정 파일의 {parent}가 예상한 꼴이 아니라 자동으로 고치지 않습니다. 위에 적은 대로 직접 바꾸세요.",
      "value-shape": "지금 값이 예상한 꼴이 아니라 자동으로 고치지 않습니다. 위에 적은 대로 직접 바꾸세요.",
      "not-toml": "config.toml을 풀지 못해 자동으로 고치지 않습니다. 위에 적은 대로 직접 바꾸세요.",
      "table-shape": "[mcp_servers.{name}] 표가 머리 하나로 여러 줄에 적혀 있지 않아(인라인 표나 점 열쇠로 적은 것) 자동으로 고치지 않습니다. 위에 적은 대로 직접 바꾸세요.",
    },
    notices: {
      not_saved: "저장하지 않은 계획이라 적용할 수 없습니다. 적용하려면 --no-save 없이 다시 계획하세요.",
      plan_unsaved: "상태 폴더에 계획을 쓰지 못해({code}) 적용할 수 없습니다.",
    },
  },
};

export interface TuneItemText {
  title: string;
  change: string;
  impact: string;
  /** 자동으로 고칠 수 없는 까닭. 고칠 수 있으면 null이다 */
  blocked: string | null;
  /** 되돌리는 법. 자동으로 고칠 수 없는 항목은 적용하지 않으므로 null이다 */
  undo: string | null;
}

function impactValues(item: TuneItem): Record<string, number> {
  const impact = item.impact;
  switch (impact.unit) {
    case "A1":
      return impact.skills;
    case "A2":
      return { skills: impact.skills };
    case "A3":
      return impact.sameName;
    case "A4":
      return { projects: impact.projects };
  }
}

export function tuneItemText(item: TuneItem, lang: Lang): TuneItemText {
  const copy = TUNE_COPY[lang];
  // 예상한 꼴이 아닌 지금 값은 적지 않는다(계획에도 없다)
  const current = item.blocked === "value-shape" ? copy.current.unexpected : "current" in item ? fill(copy.current.value, { value: JSON.stringify(item.current) }) : copy.current.none;
  const parent = item.key.kind === "toml-table-key" ? "mcp_servers" : item.key.parent;
  return {
    title: fill(copy.title[item.unit], { name: item.target }),
    change: fill(copy.change[item.unit], { file: item.file, name: item.target, current }),
    impact: fill(copy.impact[item.unit], impactValues(item)),
    blocked: item.blocked === null ? null : fill(copy.blocked[item.blocked], { tool: TOOL_NAMES[item.tool][lang], parent, name: item.target }),
    undo: item.blocked === null ? copy.undo : null,
  };
}

export function tuneNoticeText(notice: TuneRunNotice, lang: Lang): string {
  const lines = TUNE_COPY[lang].notices;
  return notice.kind === "not_saved" ? lines.not_saved : fill(lines.plan_unsaved, { code: notice.code });
}
