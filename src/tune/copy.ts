// 정비 계획의 문장. 항목마다 제목, 바꾸는 것, 영향 범위, 되돌리는 법, 자동으로 고칠 수 없는 까닭과 실행 알림을 두 언어로 짓는다. 춘식이의 말투는 스킬 본문이 붙인다(「6단계 1부 계획 전 결정」 8번)
import { TOOL_NAMES } from "../core/copy/common.ts";
import { fill } from "../core/copy/format.ts";
import type { Lang, Texts } from "../core/copy/lang.ts";
import type { TuneBlock, TuneItem, TuneKey } from "./items.ts";
import type { TuneRunNotice } from "./plan.ts";
import type { TuneWork, WorkItem } from "./work.ts";

type Unit = TuneItem["unit"];

interface TuneCopy {
  title: Record<Unit, string>;
  change: Record<Unit, string>;
  current: { none: string; value: string; unexpected: string };
  impact: Record<Unit, string>;
  undo: string;
  blocked: Record<TuneBlock, string>;
  notices: { not_saved: string; plan_unsaved: string; unfinished_work: string };
}

export const TUNE_COPY: Texts<TuneCopy> = {
  en: {
    title: { A1: "Turn off an unused skill: {name}", A2: "Turn off an unused plugin: {name}", A3: "Block an unused MCP server: {name}", A4: "Turn off an unused Codex MCP server: {name}" },
    change: {
      A1: 'In {file}, set {key} under skillOverrides to "off" ({current}).',
      A2: 'In {file}, set {key} under enabledPlugins to false ({current}).',
      A3: 'In {file}, add { "serverName": {key} } to the deniedMcpServers list.',
      A4: "In {file}, write enabled = false in the [mcp_servers.{key}] table ({current}).",
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
      "table-shape": "The [mcp_servers.{key}] table is not written as one multi-line table (it uses an inline table or dotted keys), so it is not changed automatically. Change it yourself as described above.",
    },
    notices: {
      not_saved: "This plan was not saved, so it cannot be applied. To apply it, run aq tune plan again without --no-save.",
      plan_unsaved: "The plan could not be written to the state folder ({code}), so it cannot be applied.",
      unfinished_work: "There {count:is|are} {count} unfinished tune {count:run|runs}. The next apply reconciles {count:it|them} with the files first.",
    },
  },
  ko: {
    title: { A1: "안 쓰는 스킬 끄기: {name}", A2: "안 쓰는 플러그인 끄기: {name}", A3: "안 쓰는 MCP 서버 막기: {name}", A4: "Codex의 안 쓰는 MCP 서버 끄기: {name}" },
    change: {
      A1: '{file}의 skillOverrides에서 이름 {key}의 값을 "off"로 바꿉니다({current}).',
      A2: '{file}의 enabledPlugins에서 설치 ID {key}의 값을 false로 바꿉니다({current}).',
      A3: '{file}의 deniedMcpServers 목록에 { "serverName": {key} } 항목을 더합니다.',
      A4: "{file}의 [mcp_servers.{key}] 표에 enabled = false를 적습니다({current}).",
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
      "table-shape": "[mcp_servers.{key}] 표가 머리 하나로 여러 줄에 적혀 있지 않아(인라인 표나 점 열쇠로 적은 것) 자동으로 고치지 않습니다. 위에 적은 대로 직접 바꾸세요.",
    },
    notices: {
      not_saved: "저장하지 않은 계획이라 적용할 수 없습니다. 적용하려면 --no-save 없이 다시 계획하세요.",
      plan_unsaved: "상태 폴더에 계획을 쓰지 못해({code}) 적용할 수 없습니다.",
      unfinished_work: "끝나지 않은 정비 작업이 {count}개 있습니다. 다음 적용 때 먼저 실제 파일로 맞춥니다.",
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

/** TOML 기본 문자열. 역슬래시, 큰따옴표와 제어 문자를 이스케이프한다 */
function tomlString(text: string): string {
  const short: Record<string, string> = { "\\": "\\\\", '"': '\\"', "\b": "\\b", "\t": "\\t", "\n": "\\n", "\f": "\\f", "\r": "\\r" };
  return `"${text.replace(/[\\"\u0000-\u001f\u007f]/g, (char) => short[char] ?? `\\u${char.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")}`)}"`;
}

/**
 * 설정 글에 넣는 자리의 이름. JSON은 JSON 문자열 꼴로 적고, TOML 표 이름은 맨 열쇠로 쓸 수 있는 글자(영문자, 숫자, -, _)만이면 그대로, 아니면 큰따옴표로 싸서 적는다.
 * 이름을 그대로 넣으면 점이 든 이름이 다른 열쇠를 가리켰다(6단계 1부 구현 검증)
 */
function keyText(key: TuneKey): string {
  switch (key.kind) {
    case "json-entry":
      return JSON.stringify(key.name);
    case "json-list-add":
      return JSON.stringify(key.entry.serverName);
    case "toml-table-key":
      return /^[A-Za-z0-9_-]+$/.test(key.table) ? key.table : tomlString(key.table);
  }
}

/** 자동으로 고칠 수 없는 까닭의 문장. 계획 항목과 작업 기록의 거절된 항목이 같이 쓴다 */
function blockedText(block: TuneBlock, key: TuneKey, tool: TuneItem["tool"], lang: Lang): string {
  const parent = key.kind === "toml-table-key" ? "mcp_servers" : key.parent;
  return fill(TUNE_COPY[lang].blocked[block], { tool: TOOL_NAMES[tool][lang], parent, key: keyText(key) });
}

export function tuneItemText(item: TuneItem, lang: Lang): TuneItemText {
  const copy = TUNE_COPY[lang];
  // 예상한 꼴이 아닌 지금 값은 적지 않는다(계획에도 없다)
  const current = item.blocked === "value-shape" ? copy.current.unexpected : "current" in item ? fill(copy.current.value, { value: JSON.stringify(item.current) }) : copy.current.none;
  const key = keyText(item.key);
  return {
    title: fill(copy.title[item.unit], { name: item.target }),
    change: fill(copy.change[item.unit], { file: item.file, key, current }),
    impact: fill(copy.impact[item.unit], impactValues(item)),
    blocked: item.blocked === null ? null : blockedText(item.blocked, item.key, item.tool, lang),
    undo: item.blocked === null ? copy.undo : null,
  };
}

export function tuneNoticeText(notice: TuneRunNotice, lang: Lang): string {
  const lines = TUNE_COPY[lang].notices;
  switch (notice.kind) {
    case "not_saved":
      return lines.not_saved;
    case "plan_unsaved":
      return fill(lines.plan_unsaved, { code: notice.code });
    case "unfinished_work":
      return fill(lines.unfinished_work, { count: notice.count });
  }
}

/** 적용·되돌리기·확인의 알림(16.5의 3.9, 16.7의 「적용되는 때」, 「6단계 2부 계획 전 결정」 9·10번) */
export type WorkNotice = { kind: "reconciled"; count: number } | { kind: "overwritten"; path: string } | { kind: "replan" } | { kind: "new-session" } | { kind: "restart-codex" };

/** 적용 안 됨의 까닭 가운데 문장이 따로 있는 것. 그 밖의 까닭은 쓰기의 오류 코드다 */
type NotAppliedReason = "no-longer-candidate" | "plan-differs" | "changed-since-plan" | "changed-before-write" | "already-set" | "changed-since-apply" | "not-written" | "interrupted";

interface WorkCopy {
  written: { apply: string; undo: string };
  verified: string;
  undone: string;
  writtenOnResume: string;
  unknown: string;
  checkFailed: string;
  notApplied: Record<NotAppliedReason, string>;
  writeFailed: string;
  notices: Record<WorkNotice["kind"], string>;
  verify: { ok: string; changed: string; still: string };
}

export const WORK_COPY: Texts<WorkCopy> = {
  en: {
    written: { apply: "Changed.", undo: "Undone." },
    verified: "Verified. The value is still in place and the item is off when judged again.",
    undone: "Undone later.",
    writtenOnResume: "The run was interrupted, but the file shows the change was written.",
    unknown: "The run was interrupted and the result is unknown. Check the file yourself.",
    checkFailed: "Not written because the check before the change failed. This may be a fault in this tool.",
    notApplied: {
      "no-longer-candidate": "Not changed because it is no longer a candidate when judged again. Plan again.",
      "plan-differs": "Not changed because the place or value differs from the plan now. Plan again.",
      "changed-since-plan": "Not changed because the file changed after the plan. Plan again.",
      "changed-before-write": "Not changed because the file changed just before the write. Plan again.",
      "already-set": "Not changed because it already has that value.",
      "changed-since-apply": "Not overwritten because the value changed after the apply. Look at the current value and decide yourself.",
      "not-written": "Nothing to undo because this item was not applied.",
      "interrupted": "The run was interrupted before the change, so it is recorded as not applied.",
    },
    writeFailed: "The file could not be replaced ({code}).",
    notices: {
      reconciled: "Reconciled {count} unfinished tune {count:run|runs} with the files.",
      overwritten: "Another program wrote {path} again after the change. Check it with aq tune verify.",
      replan: "Some items were not changed. Plan again with aq tune plan.",
      "new-session": "Claude Code sessions that are already open may not pick this up. Check in a new session.",
      "restart-codex": "Codex needs a restart to apply this.",
    },
    verify: {
      ok: "Still off.",
      changed: "The value changed after the apply. Check the current settings.",
      still: "The file still has the value, but it is a candidate again when judged. Another settings layer may turn it back on.",
    },
  },
  ko: {
    written: { apply: "바꿨습니다.", undo: "되돌렸습니다." },
    verified: "확인했습니다. 값이 그대로이고 다시 판정해도 꺼져 있습니다.",
    undone: "그 뒤에 되돌렸습니다.",
    writtenOnResume: "끊긴 작업이지만 파일에 쓴 것을 확인했습니다.",
    unknown: "끊긴 작업이라 결과를 모릅니다. 파일을 직접 확인하세요.",
    checkFailed: "바꾸기 전 검사에서 걸려 쓰지 않았습니다. 이 도구의 잘못일 수 있습니다.",
    notApplied: {
      "no-longer-candidate": "다시 판정하니 더는 후보가 아니어서 바꾸지 않았습니다. 다시 계획하세요.",
      "plan-differs": "계획한 뒤 바꿀 자리나 값이 달라져 바꾸지 않았습니다. 다시 계획하세요.",
      "changed-since-plan": "계획한 뒤 파일이 바뀌어 바꾸지 않았습니다. 다시 계획하세요.",
      "changed-before-write": "바꾸기 바로 앞에서 파일이 바뀌어 바꾸지 않았습니다. 다시 계획하세요.",
      "already-set": "이미 그 값이라 바꾸지 않았습니다.",
      "changed-since-apply": "적용한 뒤 그 값이 바뀌어 덮어쓰지 않았습니다. 지금 값을 보고 직접 정하세요.",
      "not-written": "적용되지 않은 항목이라 되돌릴 것이 없습니다.",
      "interrupted": "바꾸기 전에 끊긴 작업이라 적용 안 됨으로 맞췄습니다.",
    },
    writeFailed: "파일을 갈아 끼우지 못했습니다({code}).",
    notices: {
      reconciled: "끝나지 않은 정비 작업 {count}개를 실제 파일로 맞췄습니다.",
      overwritten: "{path}를 바꾼 뒤 다른 프로그램이 다시 썼습니다. aq tune verify로 확인하세요.",
      replan: "바꾸지 않은 항목이 있습니다. aq tune plan으로 다시 계획하세요.",
      "new-session": "Claude Code는 지금 떠 있는 세션에는 바로 적용되지 않을 수 있습니다. 새 세션에서 확인하세요.",
      "restart-codex": "Codex는 다시 시작해야 적용됩니다.",
    },
    verify: {
      ok: "그대로 꺼져 있습니다.",
      changed: "바꾼 값이 그 뒤에 달라졌습니다. 지금 설정을 확인하세요.",
      still: "파일에는 그대로지만 다시 판정해도 후보로 나옵니다. 다른 설정 층이 다시 켜고 있을 수 있습니다.",
    },
  },
};

const isNotAppliedReason = (reason: string | null): reason is NotAppliedReason => reason !== null && Object.hasOwn(WORK_COPY.en.notApplied, reason);
const isBlock = (reason: string | null): reason is TuneBlock => reason !== null && Object.hasOwn(TUNE_COPY.en.blocked, reason);

/** 작업 기록의 항목 하나가 어떻게 됐는지 */
export function workItemText(item: WorkItem, kind: TuneWork["kind"], lang: Lang): string {
  const copy = WORK_COPY[lang];
  switch (item.state) {
    case "written":
      return item.reason === "interrupted" ? copy.writtenOnResume : copy.written[kind];
    case "verified":
      return copy.verified;
    case "undone":
      return copy.undone;
    case "unknown":
      return copy.unknown;
    case "rejected":
      return isBlock(item.reason) ? blockedText(item.reason, item.key, item.tool, lang) : copy.checkFailed;
    case "not_applied":
      return isNotAppliedReason(item.reason) ? copy.notApplied[item.reason] : fill(copy.writeFailed, { code: item.reason ?? "unknown" });
    case "planned":
    case "writing":
      return copy.unknown;
  }
}

export function workNoticeText(notice: WorkNotice, lang: Lang): string {
  const lines = WORK_COPY[lang].notices;
  if (notice.kind === "reconciled") return fill(lines.reconciled, { count: notice.count });
  if (notice.kind === "overwritten") return fill(lines.overwritten, { path: notice.path });
  return lines[notice.kind];
}

/** 확인의 결과 하나. 값이 그대로이고 다시 판정해도 후보가 아니면 꺼진 것이다 */
export function verifyText(result: { kept: boolean; stillCandidate: boolean }, lang: Lang): string {
  const copy = WORK_COPY[lang].verify;
  if (!result.kept) return copy.changed;
  return result.stillCandidate ? copy.still : copy.ok;
}
