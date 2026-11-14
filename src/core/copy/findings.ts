// 평가 결과의 규칙 하나에서 문장(제목, 설명, 처방, 어떻게 쟀나)을 만든다. 분류와 상태에 따라 문구 표에서 고르고 숫자를 끼운다. 이름과 경로는 넣지 않는다(순수 함수, 설계 11.5, 12.2, 13.1, 19.1)
import type { Evidence } from "../measure.ts";
import type { ToolSafeguard } from "../metrics/setup.ts";
import type { Reason } from "../reasons.ts";
import type { ResultFinding, ResultToolValue, UnjudgedServer } from "../result/assemble.ts";
import { ruleSpec, type RuleId, type ValueKind } from "../rules.ts";
import { OTHER_TOOL_COPY, REASON_COPY, SAFEGUARD_COPY, TOOL_LINE, TOOL_NAMES, UNJUDGED_COPY } from "./common.ts";
import { fill, formatValue, slots } from "./format.ts";
import type { Lang, Texts } from "./lang.ts";
import { EFFICIENCY_COPY } from "./rules-efficiency.ts";
import { FIT_COPY } from "./rules-fit.ts";
import { INTENSITY_COPY } from "./rules-intensity.ts";
import { SETUP_COPY } from "./rules-setup.ts";
import type { ReasonCopy, RuleCopy } from "./types.ts";

/** 규칙 스물둘의 문구(규칙 표의 차례) */
export const RULE_COPY: Record<RuleId, Texts<RuleCopy>> = { ...SETUP_COPY, ...EFFICIENCY_COPY, ...FIT_COPY, ...INTENSITY_COPY };

/** 규칙 하나의 문장(한 언어) */
export interface FindingText {
  /** 규칙 이름 */
  name: string;
  /** 분류에 맞는 제목. 잘하고 있는 것은 잘하는 것, 정비할 것은 할 일, 보통과 잴 수 없음은 규칙 이름이다 */
  title: string;
  /** 잰 값(숫자 부분). 못 쟀으면 null이다 */
  value: string | null;
  /** 잰 값의 단위. 못 쟀으면 null이다 */
  unit: string | null;
  /** 못 잰 이유의 낱말. 점수 자리에 "잴 수 없음"과 함께 보인다. 쟀으면 null이다 */
  reason: string | null;
  description: string;
  /** 처방. 보통과 정비할 것에만 있다 */
  prescription: string | null;
  /** 어떻게 쟀나. 계산식 한 줄과 근거 숫자의 줄(도구별 규칙은 도구마다 한 줄) */
  method: string[];
  /** 덧붙이는 정보. E6 항목의 판정에서 뺀 서버다 */
  notes: string[];
}

/** 문장을 붙이기 전의 규칙 하나 */
export type FindingInput = Omit<ResultFinding, "text">;

/** 규칙의 근거 가운데 문장에 쓰는 것 */
export interface FindingDetails {
  safeguards: readonly ToolSafeguard[];
  unjudgedServers: readonly UnjudgedServer[];
}

/** 잰 값에 단위를 붙인 글. %는 두 언어 모두 붙여 쓰고, 그 밖의 단위는 영어만 띄어 쓴다 */
export function joinValue(value: string, unit: string, lang: Lang): string {
  return unit === "%" || lang === "ko" ? `${value}${unit}` : `${value} ${unit}`;
}

/** 틀의 자리를 근거 숫자로 채운다. 근거 숫자에 없는 자리는 세지 못한 것으로 둔다 */
function fillEvidence(template: string, evidence: Evidence, extra: Readonly<Record<string, string | number>> = {}): string {
  return fill(template, { ...Object.fromEntries(slots(template).map((slot) => [slot, null])), ...evidence, ...extra });
}

function reasonOf(copy: RuleCopy, reason: Reason, lang: Lang): ReasonCopy {
  const own = copy.reasons?.[reason];
  const common = REASON_COPY[reason][lang];
  return { word: own?.word ?? common.word, text: own?.text ?? common.text };
}

/** 잰 값과 단위. 영어 단위의 단수와 복수는 보이는 수로 가른다 */
function measured(kind: ValueKind, value: number, copy: RuleCopy): { value: string; unit: string } {
  const shown = formatValue(kind, value);
  return { value: shown, unit: fill(copy.unit, { value: shown === "1" ? 1 : 0 }) };
}

function toolLine(kind: ValueKind, value: ResultToolValue, copy: RuleCopy, lang: Lang): string {
  const tool = TOOL_NAMES[value.tool][lang];
  const evidence = fillEvidence(copy.evidence, value.evidence);
  if (value.status === "scored") {
    const shown = measured(kind, value.value!, copy);
    return fill(TOOL_LINE[lang].measured, { tool, value: joinValue(shown.value, shown.unit, lang), evidence });
  }
  return fill(TOOL_LINE[lang].unmeasured, { tool, reason: reasonOf(copy, value.reason!, lang).word, evidence });
}

/** 못 잰 이유를 낸 근거 숫자. 도구별 규칙은 규칙의 이유와 같은 이유를 낸 첫 도구의 것이다 */
function reasonEvidence(finding: FindingInput): Evidence {
  if (finding.tools.length === 0) return finding.evidence;
  return finding.tools.find((value) => value.reason === finding.reason)?.evidence ?? {};
}

/** 비율은 못 쟀는데 정비 후보가 나온 도구(설계 11.5) */
const candidateSources = (finding: FindingInput): (ResultToolValue & { reason: "too_little" | "watching" })[] =>
  finding.tools.filter((value): value is ResultToolValue & { reason: "too_little" | "watching" } => value.status === "unmeasured" && value.candidates.length > 0 && (value.reason === "too_little" || value.reason === "watching"));

function description(finding: FindingInput, copy: RuleCopy, lang: Lang, shown: { value: string; unit: string } | null): string {
  if (finding.category === "strength" || finding.category === "average") return copy.why;
  if (finding.category === "unmeasured") return fillEvidence(reasonOf(copy, finding.reason!, lang).text, reasonEvidence(finding));
  const sources = candidateSources(finding);
  if (finding.status === "unmeasured") {
    const sentences = sources.map((value) => {
      const sentence = fillEvidence(copy.repairUnmeasured?.[value.reason] ?? reasonOf(copy, value.reason, lang).text, value.evidence, { candidates: value.candidates.length });
      return sources.length > 1 ? `${TOOL_NAMES[value.tool][lang]}: ${sentence}` : sentence;
    });
    return sentences.length > 0 ? sentences.join(" ") : fillEvidence(reasonOf(copy, finding.reason!, lang).text, reasonEvidence(finding));
  }
  const others = sources.map((value) => fillEvidence(OTHER_TOOL_COPY[value.reason][lang], value.evidence, { tool: TOOL_NAMES[value.tool][lang], candidates: value.candidates.length }));
  return [fill(copy.problem, { value: joinValue(shown!.value, shown!.unit, lang) }), ...others].join(" ");
}

function safeguardLine(safeguard: ToolSafeguard, lang: Lang): string {
  const copy = SAFEGUARD_COPY[lang];
  const { guardHook, permissionChecks } = safeguard;
  const condition = guardHook === null || permissionChecks === null ? copy.unknown : guardHook && permissionChecks ? copy.both : guardHook ? copy.hook : permissionChecks ? copy.permissions : copy.none;
  return fill(copy.line, { tool: TOOL_NAMES[safeguard.tool][lang], condition });
}

const WHY_ORDER: readonly UnjudgedServer["why"][] = ["no_definition", "plugin_unread", "not_established", "observation_incomplete"];

/** E6 항목의 정보. 도구마다 까닭마다 수를 적고, claude.ai에 연결한 서버가 있으면 직접 막는 방법을 적는다 */
function unjudgedNotes(servers: readonly UnjudgedServer[], lang: Lang): string[] {
  if (servers.length === 0) return [];
  const copy = UNJUDGED_COPY[lang];
  const lines = [copy.intro];
  for (const tool of [...new Set(servers.map((server) => server.tool))].sort()) {
    for (const why of WHY_ORDER) {
      const count = servers.filter((server) => server.tool === tool && server.why === why).length;
      if (count > 0) lines.push(fill(copy.line, { tool: TOOL_NAMES[tool][lang], why: copy.why[why], count }));
    }
  }
  if (servers.some((server) => server.scope === "claude-ai")) lines.push(copy.deny);
  return lines;
}

export function findingText(finding: FindingInput, details: FindingDetails, lang: Lang): FindingText {
  const copy = RULE_COPY[finding.ruleId][lang];
  const shown = finding.status === "scored" ? measured(finding.kind, finding.value!, copy) : null;
  const method = [copy.method];
  if (ruleSpec(finding.ruleId).unit === "merged") method.push(fillEvidence(copy.evidence, finding.evidence));
  for (const value of finding.tools) method.push(toolLine(finding.kind, value, copy, lang));
  if (finding.ruleId === "S2") for (const safeguard of details.safeguards) method.push(safeguardLine(safeguard, lang));
  return {
    name: copy.name,
    title: finding.category === "strength" ? copy.good : finding.category === "repair" ? copy.fix : copy.name,
    value: shown?.value ?? null,
    unit: shown?.unit ?? null,
    reason: finding.status === "unmeasured" ? reasonOf(copy, finding.reason!, lang).word : null,
    description: description(finding, copy, lang, shown),
    prescription: finding.category === "average" || finding.category === "repair" ? copy.prescription : null,
    method,
    notes: finding.ruleId === "E6" ? unjudgedNotes(details.unjudgedServers, lang) : [],
  };
}
