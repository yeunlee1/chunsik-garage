// aq ignore add|remove|list. 사용자가 일부러 그렇게 둔 규칙을 고칠 목록과 다음 등급 차례에서 빼고 다시 넣는다. 점수에는 그대로 든다(설계 「0.3.0에서 정한 것」, 다른 PC 피드백 5번)
import { RULE_COPY } from "../core/copy/findings.ts";
import type { Lang } from "../core/copy/lang.ts";
import { RULES, type RuleId } from "../core/rules.ts";
import { openState } from "../state/next-state.ts";
import { reviveIgnoredRules, saveState } from "../state/state.ts";

export interface IgnoreOptions {
  stateDir: string;
  lang: Lang;
}

export interface IgnoreOutcome {
  /** 지금 그대로 두기로 한 규칙(규칙 차례) */
  ignored: RuleId[];
  run: { text: string };
}

const COPY = {
  en: {
    added: '"{name}" is now kept as you chose. It is left out of what to fix first and the next-grade steps, and it still counts in the score.',
    removed: '"{name}" is back on the list of what to fix.',
    list: "Kept as you chose: {names}.",
    none: "Nothing is kept as you chose.",
    quote: (name: string): string => `"${name}"`,
  },
  ko: {
    added: "「{name}」 항목은 정한 대로 두고, 고칠 목록과 다음 등급 차례에서 뺐습니다. 점수에는 그대로 들어갑니다.",
    removed: "「{name}」 항목을 다시 고칠 목록에 넣었습니다.",
    list: "그대로 두기로 한 항목은 {names}입니다.",
    none: "그대로 두기로 한 항목이 없습니다.",
    quote: (name: string): string => `「${name}」`,
  },
} as const;

const failure = (code: string, message: string): Error => Object.assign(new Error(message), { code });

/** 대소문자를 가리지 않고 규칙 ID를 찾는다. 모르는 것이면 null이다 */
function ruleIdOf(text: string | null): RuleId | null {
  if (text === null) return null;
  return RULES.find((spec) => spec.id === text.trim().toUpperCase())?.id ?? null;
}

export async function runIgnore(action: "add" | "remove" | "list", rule: string | null, options: IgnoreOptions): Promise<IgnoreOutcome> {
  const copy = COPY[options.lang];
  const nameOf = (id: RuleId): string => RULE_COPY[id][options.lang].name;
  const opened = await openState(options.stateDir);
  if (action === "list") {
    const ignored = opened.broken ? [] : reviveIgnoredRules(opened.state.ignoredRules);
    return { ignored, run: { text: ignored.length === 0 ? copy.none : copy.list.replace("{names}", ignored.map((id) => copy.quote(nameOf(id))).join(", ")) } };
  }
  const id = ruleIdOf(rule);
  if (id === null) throw failure("unknown-rule", `not a rule id: ${rule ?? "(none)"}`);
  // 깨진 상태 파일을 새 상태로 덮으면 관측 기록이 사라진다. 점검이 맞춘 뒤에 다시 하게 한다
  if (opened.broken) throw failure("state-broken", "the state file could not be read; run a checkup first");
  const { state } = opened;
  const current = reviveIgnoredRules(state.ignoredRules);
  const next = reviveIgnoredRules(action === "add" ? [...current, id] : current.filter((value) => value !== id));
  if (next.join(",") !== current.join(",") || opened.fresh) {
    if (next.length > 0) state.ignoredRules = next;
    else delete state.ignoredRules;
    if (next.length > 0 || !opened.fresh) await saveState(options.stateDir, state);
  }
  return { ignored: next, run: { text: (action === "add" ? copy.added : copy.removed).replace("{name}", nameOf(id)) } };
}
