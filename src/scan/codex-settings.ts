// Codex 설정 층에서 스캐너가 쓰는 값을 꺼낸다. 프로젝트의 신뢰, 승인과 샌드박스의 값, 플러그인 기능, 지침의 fallback 이름과 한도다. 값은 정해진 꼴로만 내고 원문은 내지 않는다(설계 「5단계 2부 계획 전 결정」 2·4·5·8번)
import { resolve } from "node:path";
import { isTable, mergeCodexLayers, type TomlTable } from "./codex-config.ts";

/** trusted는 신뢰한 프로젝트, untrusted는 신뢰하지 않는다고 적힌 프로젝트, null은 신뢰 기록이 없는 프로젝트다 */
export type CodexTrust = "trusted" | "untrusted" | null;

/** Windows에서 ASCII 글자만 소문자로 바꾼다. Codex는 신뢰 열쇠에서 ASCII 밖의 글자는 대소문자를 가린다(to_ascii_lowercase, eq_ignore_ascii_case) */
const asciiLower = (text: string, platform: NodeJS.Platform): string => (platform === "win32" ? text.replace(/[A-Z]/g, (letter) => letter.toLowerCase()) : text);

/** 신뢰 열쇠를 견주는 꼴. 절대 경로로 풀고 구분 기호를 /로 맞춘 뒤 ASCII 글자의 대소문자만 맞춘다(공통 경로 정규화와 달리 ASCII 밖의 글자는 그대로 둔다. 계획 리뷰 1차의 재확인) */
const trustKeyForm = (path: string, platform: NodeJS.Platform): string => asciiLower(resolve(path).replace(/\\/g, "/"), platform);

/**
 * 사용자 층의 projects에서 그 프로젝트의 뿌리와 같은 경로의 trust_level을 찾는다. trusted와 untrusted만 기록이다. Codex처럼 먼저 뿌리 경로를 Codex의 꼴
 * (Windows에서는 ASCII 글자를 소문자로)로 적은 것과 글자 그대로 같은 열쇠를 찾고, 없으면 구분 기호를 맞추고 Windows에서는 ASCII 글자의 대소문자를 가리지 않고 견준
 * 열쇠 가운데 원래 열쇠의 사전순으로 첫째인 것의 값이다(공개 소스 config/src/loader/mod.rs의 project_trust_for_lookup_key, 계획 리뷰 1차)
 */
export function trustOf(user: TomlTable, root: string, platform: NodeJS.Platform = process.platform): CodexTrust {
  const projects = isTable(user.projects) ? user.projects : {};
  const rootForm = trustKeyForm(root, platform);
  const exactKey = asciiLower(root, platform);
  const found: { key: string; trust: "trusted" | "untrusted" }[] = [];
  for (const [key, entry] of Object.entries(projects)) {
    if (!isTable(entry) || (entry.trust_level !== "trusted" && entry.trust_level !== "untrusted")) continue;
    if (key === exactKey) return entry.trust_level;
    if (trustKeyForm(key, platform) === rootForm) found.push({ key, trust: entry.trust_level });
  }
  found.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return found[0]?.trust ?? null;
}

export type ApprovalFact = "never" | "on-request" | "untrusted" | "granular" | "other" | null;
export type SandboxFact = "danger-full-access" | "workspace-write" | "read-only" | "other" | null;

/** 한 맥락(사용자 층 위에 얹은 층들)의 승인과 샌드박스. 적히지 않은 값은 null이다(Codex의 기본은 묻는 승인과 샌드박스다) */
export interface CodexSafetyFact {
  approval: ApprovalFact;
  sandbox: SandboxFact;
  /** default_permissions가 전면 접근(":danger-full-access")인지 */
  permissions: "danger-full-access" | "other" | null;
  /**
   * 이 맥락에서 쓰이는 샌드박스가 전면 해제다. Codex는 층을 아래에서 위로 보아 마지막으로 sandbox_mode나 default_permissions를 적은 층의 방식을 쓰고(같은 층에 둘 다
   * 있으면 default_permissions), 그 방식의 합친 값으로 샌드박스를 정한다(공개 소스 core/src/config/mod.rs의 resolve_permission_config_syntax, 계획 리뷰 1차)
   */
  fullAccess: boolean;
}

function approvalOf(value: unknown): ApprovalFact {
  if (value === undefined) return null;
  if (isTable(value)) return "granular";
  if (value === "never" || value === "untrusted") return value;
  // on-failure는 on-request의 옛 이름이다(공개 소스 protocol/src/protocol.rs의 AskForApproval)
  if (value === "on-request" || value === "on-failure") return "on-request";
  return "other";
}

function sandboxOf(value: unknown): SandboxFact {
  if (value === undefined) return null;
  return value === "danger-full-access" || value === "workspace-write" || value === "read-only" ? value : "other";
}

/** 층(아래에서 위의 차례)으로 그 맥락의 승인과 샌드박스를 낸다 */
export function safetyOf(layers: readonly TomlTable[]): CodexSafetyFact {
  const merged = mergeCodexLayers(layers);
  let syntax: "legacy" | "profiles" | null = null;
  for (const layer of layers) {
    if (layer.sandbox_mode !== undefined) syntax = "legacy";
    if (layer.default_permissions !== undefined) syntax = "profiles";
  }
  const permissions = merged.default_permissions;
  return {
    approval: approvalOf(merged.approval_policy),
    sandbox: sandboxOf(merged.sandbox_mode),
    permissions: permissions === undefined ? null : permissions === ":danger-full-access" ? "danger-full-access" : "other",
    fullAccess: syntax === "legacy" ? merged.sandbox_mode === "danger-full-access" : syntax === "profiles" ? permissions === ":danger-full-access" : false,
  };
}

/** [features]의 plugins가 거짓이면 플러그인을 하나도 쓰지 않는다(기본은 켜짐) */
export const pluginsFeatureOn = (merged: TomlTable): boolean => !(isTable(merged.features) && merged.features.plugins === false);

const DEFAULT_NAMES = ["AGENTS.override.md", "AGENTS.md"];

/**
 * 프로젝트 지침으로 더 찾는 파일 이름. 앞뒤 공백을 떼고 빈 것을 버린 뒤(core/src/config/mod.rs), 파일 이름이 아닌 것(".", "..", "/"나 NUL이 든 것,
 * Windows에서 "\"나 ":"가 든 것)과 이미 든 이름을 뺀다(core/src/agents_md.rs의 candidate_filenames)
 */
export function fallbackNames(merged: TomlTable, platform: NodeJS.Platform = process.platform): string[] {
  const listed = Array.isArray(merged.project_doc_fallback_filenames) ? merged.project_doc_fallback_filenames : [];
  const names: string[] = [];
  for (const raw of listed) {
    if (typeof raw !== "string") continue;
    const name = raw.trim();
    if (name === "" || name === "." || name === ".." || name.includes("/") || name.includes("\0")) continue;
    if (platform === "win32" && (name.includes("\\") || name.includes(":"))) continue;
    if (!DEFAULT_NAMES.includes(name) && !names.includes(name)) names.push(name);
  }
  return names;
}

/** project_doc_max_bytes가 0이면 Codex가 프로젝트 지침을 싣지 않는다 */
export const projectDocDisabled = (merged: TomlTable): boolean => merged.project_doc_max_bytes === 0 || merged.project_doc_max_bytes === 0n;
