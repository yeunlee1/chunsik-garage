// 규칙 문구 표를 본다. 기준마다 규칙이 빠짐없고, 두 언어가 같은 자리를 쓰고, 자리가 그 규칙의 근거 숫자이고, 제목과 문장의 끝이 정해진 꼴이다(설계 11.5, 12.2)
import { describe, expect, it } from "vitest";
import { slots } from "../../src/core/copy/format.ts";
import { LANGS, type Texts } from "../../src/core/copy/lang.ts";
import { SETUP_COPY } from "../../src/core/copy/rules-setup.ts";
import type { RuleCopy } from "../../src/core/copy/types.ts";
import { evaluate } from "../../src/core/evaluate.ts";
import { RULES, type Axis, type RuleId } from "../../src/core/rules.ts";
import { PERSONAS, personaInput } from "../helpers/personas.ts";

/** 규칙마다의 근거 숫자 이름. 아래 시험이 실제 평가와 맞춘다 */
const EVIDENCE_KEYS: Record<RuleId, string[]> = {
  S1: ["tools", "withInstructions"],
  S2: ["guarded", "tools"],
  S3: ["danglingLinks", "noFrontmatter", "problems", "unparsable"],
  S4: ["failures", "runs", "unclassifiedBlocks"],
  S5: ["enabledServers", "failedSessions", "mainSessions"],
  E1: ["cacheRead", "cacheWrite", "input"],
  E2: ["errors", "results"],
  E3: ["autoCompactions", "mainSessions"],
  E4: ["sampledSessions", "skippedSessions"],
  E5: ["enabled", "judgeable", "judged", "structural", "unused", "used"],
  E6: ["enabled", "judgeable", "judged", "structural", "unused", "used"],
  E7: ["denied", "humanRequests", "interruptedTurns", "lengthStops"],
  F1: ["highEffort", "knownEffort", "unknownEffort", "unknownLevel"],
  F2: ["compactedSessions", "delegatedSessions"],
  F3: ["targets", "withInstructions"],
  F4: ["comparedProjects", "globalLines", "overlappingLines"],
  F5: ["differingCopies", "identicalCopies", "skillKinds"],
  F6: ["conflicts", "projectsWithSettings"],
  I1: ["activeDays"],
  I2: ["activeDays", "humanRequests"],
  I3: ["humanRequests", "toolCalls"],
  I4: ["excludedFolders", "projects", "unlinkedSessions"],
};

/** 기준마다의 규칙 문구. 기준의 문구를 더할 때마다 여기에 더한다 */
const AXES: [Axis, Partial<Record<RuleId, Texts<RuleCopy>>>][] = [["setup", SETUP_COPY]];

const TITLES = ["name", "good", "fix"] as const;
const SENTENCES = ["why", "problem", "prescription", "method"] as const;
const FIELDS = [...TITLES, ...SENTENCES, "evidence", "unit"] as const;
/** 단위는 영어에서만 단수와 복수를 가른다({value:하나|여럿}). 잰 값의 숫자는 단위에 넣지 않는다 */
const unitOk = (unit: string): boolean => (slots(unit).length === 0 || (slots(unit).length === 1 && slots(unit)[0] === "value")) && !/{value}/.test(unit);
const endsAsSentence = (text: string): boolean => /[.!?]$/.test(text) && !/[:：]$/.test(text);
const endsAsTitle = (text: string): boolean => !/[.!?:：]$/.test(text);

describe("근거 숫자 이름의 표", () => {
  it("실제 평가가 내는 근거 숫자의 이름과 같다", () => {
    const seen = new Map<RuleId, Set<string>>();
    for (const persona of Object.values(PERSONAS)) {
      for (const finding of evaluate(personaInput(persona)).findings) {
        const keys = seen.get(finding.ruleId) ?? new Set<string>();
        for (const key of Object.keys(finding.evidence)) keys.add(key);
        for (const value of finding.tools) for (const key of Object.keys(value.evidence)) keys.add(key);
        seen.set(finding.ruleId, keys);
      }
    }
    expect(Object.fromEntries([...seen].map(([id, keys]) => [id, [...keys].sort()]))).toEqual(EVIDENCE_KEYS);
  });
});

describe.each(AXES)("%s 규칙 문구", (axis, copy) => {
  const ids = RULES.filter((spec) => spec.axis === axis).map((spec) => spec.id);

  it("그 기준의 규칙을 빠짐없이, 그 기준의 것만 담는다", () => {
    expect(Object.keys(copy)).toEqual(ids);
  });

  it.each(ids)("%s: 칸마다 두 언어가 있고 같은 자리를 쓴다", (id) => {
    const texts = copy[id]!;
    for (const field of FIELDS) {
      for (const lang of LANGS) expect(texts[lang][field].trim().length, `${id} ${lang} ${field}`).toBeGreaterThan(0);
      if (field !== "unit") expect(slots(texts.ko[field]).sort(), `${id} ${field}`).toEqual(slots(texts.en[field]).sort());
    }
    expect(Object.keys(texts.ko.reasons ?? {}), `${id} reasons`).toEqual(Object.keys(texts.en.reasons ?? {}));
    for (const reason of Object.keys(texts.en.reasons ?? {}) as (keyof NonNullable<RuleCopy["reasons"]>)[]) {
      expect(slots(texts.ko.reasons![reason]!.text).sort(), `${id} ${reason}`).toEqual(slots(texts.en.reasons![reason]!.text).sort());
      expect(texts.ko.reasons![reason]!.word === undefined, `${id} ${reason} word`).toBe(texts.en.reasons![reason]!.word === undefined);
    }
    expect(Object.keys(texts.ko.repairUnmeasured ?? {}), `${id} repairUnmeasured`).toEqual(Object.keys(texts.en.repairUnmeasured ?? {}));
    for (const reason of Object.keys(texts.en.repairUnmeasured ?? {}) as ("too_little" | "watching")[]) {
      expect(slots(texts.ko.repairUnmeasured![reason]!).sort(), `${id} ${reason}`).toEqual(slots(texts.en.repairUnmeasured![reason]!).sort());
    }
  });

  it.each(ids)("%s: 자리는 정해진 것만 쓰고 근거 숫자는 모두 보인다", (id) => {
    for (const lang of LANGS) {
      const text = copy[id]![lang];
      for (const field of [...TITLES, "why", "prescription", "method"] as const) expect(slots(text[field]), `${id} ${lang} ${field}`).toEqual([]);
      expect(unitOk(text.unit), `${id} ${lang} unit: ${text.unit}`).toBe(true);
      expect(slots(text.problem), `${id} ${lang} problem`).toEqual(["value"]);
      expect(slots(text.evidence).sort(), `${id} ${lang} evidence`).toEqual(EVIDENCE_KEYS[id]);
      for (const [reason, reasonCopy] of Object.entries(text.reasons ?? {})) {
        for (const slot of slots(reasonCopy!.text)) expect(EVIDENCE_KEYS[id], `${id} ${lang} ${reason}`).toContain(slot);
      }
      for (const [reason, sentence] of Object.entries(text.repairUnmeasured ?? {})) {
        for (const slot of slots(sentence!)) expect(["judgeable", "candidates"], `${id} ${lang} ${reason}`).toContain(slot);
      }
    }
  });

  it.each(ids)("%s: 제목은 마침표 없이, 설명은 문장으로 끝난다", (id) => {
    for (const lang of LANGS) {
      const text = copy[id]![lang];
      for (const field of [...TITLES, "evidence", "unit"] as const) expect(endsAsTitle(text[field]), `${id} ${lang} ${field}: ${text[field]}`).toBe(true);
      for (const field of SENTENCES) expect(endsAsSentence(text[field]), `${id} ${lang} ${field}: ${text[field]}`).toBe(true);
      for (const [reason, reasonCopy] of Object.entries(text.reasons ?? {})) {
        expect(endsAsSentence(reasonCopy!.text), `${id} ${lang} ${reason}`).toBe(true);
        if (reasonCopy!.word !== undefined) expect(endsAsTitle(reasonCopy!.word), `${id} ${lang} ${reason} word`).toBe(true);
      }
      for (const [reason, sentence] of Object.entries(text.repairUnmeasured ?? {})) expect(endsAsSentence(sentence!), `${id} ${lang} ${reason}`).toBe(true);
    }
  });
});
