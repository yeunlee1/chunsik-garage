// 평가 결과의 규칙 하나에서 문장을 만드는 것을 본다. 분류와 상태에 따라 제목·설명·처방을 고르고, 잰 값과 단위, 못 잰 이유, 어떻게 쟀나, E6의 정보를 만든다(설계 11.5, 12.2, 13.1)
import { describe, expect, it } from "vitest";
import { findingText, joinValue, RULE_COPY, type FindingInput } from "../../src/core/copy/findings.ts";
import type { ResultToolValue, UnjudgedServer } from "../../src/core/result/assemble.ts";
import { RULES } from "../../src/core/rules.ts";

const toolValue = (input: Partial<ResultToolValue>): ResultToolValue => ({ tool: "claude-code", status: "scored", reason: null, value: 0.5, score: 0.5, evidence: {}, candidates: [], observed: "measured", ...input });
const finding = (ruleId: FindingInput["ruleId"], input: Partial<FindingInput>): FindingInput => ({ ruleId, axis: "efficiency", kind: "share", weight: 2, status: "scored", reason: null, value: 0.5, score: 0.5, category: "average", severity: null, gain: null, evidence: {}, tools: [], candidates: [], ...input });
const NONE = { safeguards: [], unjudgedServers: [] };
const E5_EVIDENCE = { enabled: 6, judgeable: 3, judged: 1, structural: 3, unused: 1, used: 0 };

describe("규칙 문구 표", () => {
  it("규칙 스물둘을 규칙 표의 차례로 담는다", () => {
    expect(Object.keys(RULE_COPY)).toEqual(RULES.map((spec) => spec.id));
  });
});

describe("잰 값과 단위", () => {
  it("%는 붙여 쓰고 그 밖의 단위는 영어만 띄어 쓴다", () => {
    expect(joinValue("96", "%", "en")).toBe("96%");
    expect(joinValue("0.4", "per session", "en")).toBe("0.4 per session");
    expect(joinValue("0.4", "회/세션", "ko")).toBe("0.4회/세션");
  });

  it("영어 단위는 보이는 수가 1이면 단수다", () => {
    const one = finding("S3", { axis: "setup", kind: "count", value: 1, category: "repair", evidence: { danglingLinks: 1, noFrontmatter: 0, problems: 1, unparsable: 0 } });
    expect(findingText(one, NONE, "en")).toMatchObject({ value: "1", unit: "problem" });
    expect(findingText({ ...one, value: 2 }, NONE, "en")).toMatchObject({ value: "2", unit: "problems" });
    expect(findingText(one, NONE, "ko")).toMatchObject({ value: "1", unit: "개" });
  });

  it("횟수의 영어 단위도 보이는 수로 가른다. 반올림해서 1로 보이면 단수다", () => {
    const i3 = (value: number) => findingText(finding("I3", { axis: "intensity", kind: "rate", value, category: "average", evidence: { humanRequests: 100, toolCalls: 100 } }), NONE, "en");
    expect(i3(1)).toMatchObject({ value: "1", unit: "call per request" });
    expect(i3(0.96)).toMatchObject({ value: "1", unit: "call per request" });
    expect(i3(1.1)).toMatchObject({ value: "1.1", unit: "calls per request" });
    expect(i3(0.94)).toMatchObject({ value: "0.9", unit: "calls per request" });
  });
});

describe("분류마다의 문장", () => {
  const cache = toolValue({ value: 0.96, score: 1, evidence: { cacheRead: 1200, cacheWrite: 20, input: 30 } });

  it("잘하고 있는 것은 잘하는 것을 제목으로, 왜 좋은지를 설명으로 하고 처방이 없다", () => {
    const text = findingText(finding("E1", { value: 0.96, score: 1, category: "strength", tools: [cache] }), NONE, "ko");
    expect(text).toEqual({
      name: "캐시 적중",
      title: "같은 내용을 다시 계산시키지 않음",
      value: "96",
      unit: "%",
      reason: null,
      description: RULE_COPY.E1.ko.why,
      prescription: null,
      method: [RULE_COPY.E1.ko.method, "Claude Code: 96% · 캐시 읽기 1,200 · 입력 30 · 캐시 쓰기 20 (토큰)"],
      notes: [],
    });
  });

  it("보통은 규칙 이름을 제목으로 하고 처방을 붙인다", () => {
    const text = findingText(finding("E1", { value: 0.75, category: "average", tools: [cache] }), NONE, "en");
    expect(text).toMatchObject({ title: "Cache hits", description: RULE_COPY.E1.en.why, prescription: RULE_COPY.E1.en.prescription });
  });

  it("정비할 것은 할 일을 제목으로, 잰 값을 끼운 문제를 설명으로 한다", () => {
    const text = findingText(finding("E1", { value: 0.4, score: 0, category: "repair", severity: "critical", gain: 9, tools: [toolValue({ value: 0.4, score: 0, evidence: { cacheRead: 40, cacheWrite: 10, input: 50 } })] }), NONE, "ko");
    expect(text).toMatchObject({ title: "세션의 앞부분을 자주 바꾸지 않기", value: "40", unit: "%", description: "입력 가운데 캐시에서 읽은 몫이 40%입니다.", prescription: RULE_COPY.E1.ko.prescription });
  });

  it("잴 수 없음은 이유의 낱말과 설명을 내고 값과 처방이 없다. 규칙이 따로 쓴 설명이 있으면 그것이다", () => {
    const tooLittle = findingText(finding("E2", { status: "unmeasured", reason: "too_little", value: null, score: null, category: "unmeasured", tools: [toolValue({ status: "unmeasured", reason: "too_little", value: null, score: null, evidence: { errors: 1, results: 12 } })] }), NONE, "ko");
    expect(tooLittle).toMatchObject({ title: "도구 오류", value: null, unit: null, reason: "기록이 적음", description: "도구 결과가 50개에 못 미쳐 재지 않았습니다.", prescription: null });
    expect(tooLittle.method).toEqual([RULE_COPY.E2.ko.method, "Claude Code: 잴 수 없음(기록이 적음) · 오류 1 · 도구 결과 12"]);
    const unsupported = findingText(finding("E1", { status: "unmeasured", reason: "unsupported", value: null, score: null, category: "unmeasured", tools: [toolValue({ status: "unmeasured", reason: "unsupported", value: null, score: null, evidence: { cacheRead: null, cacheWrite: null, input: null } })] }), NONE, "en");
    expect(unsupported).toMatchObject({ reason: "Not recorded", description: "This tool or record format does not record what this rule needs." });
    expect(unsupported.method[1]).toBe("Claude Code: not measured (Not recorded) · Cache reads — · input — · cache writes — (tokens)");
  });

  it("E4의 기록 없음은 지침이 없다고 하지 않는다", () => {
    const text = findingText(finding("E4", { kind: "amount", status: "unmeasured", reason: "no_data", value: null, score: null, category: "unmeasured", tools: [toolValue({ status: "unmeasured", reason: "no_data", value: null, score: null, evidence: { sampledSessions: 0, skippedSessions: 4 } })] }), NONE, "ko");
    expect(text.reason).toBe("크기가 기록되지 않음");
    expect(text.description).toBe("기록에서 지침 크기를 찾지 못했습니다. 세션을 시작할 때의 입력 정보(지침 포함)를 기록에 남기지 않는 실행 방식이 있습니다.");
    expect(text.method[1]).toBe("Claude Code: 잴 수 없음(크기가 기록되지 않음) · 표본에 넣은 세션 0 · 지침 크기가 기록에 남지 않은 세션 4");
  });

  it("합침 규칙은 근거 숫자를 한 줄로 내고, 도구별 값이 없는 도구별 규칙은 계산식만 낸다", () => {
    const s1 = findingText(finding("S1", { axis: "setup", value: 1, score: 1, category: "strength", evidence: { tools: 1, withInstructions: 1 } }), NONE, "ko");
    expect(s1.method).toEqual([RULE_COPY.S1.ko.method, "전역 지침이 있는 도구 1 · 쓰는 도구 1"]);
    const noTool = findingText(finding("E1", { status: "unmeasured", reason: "no_data", value: null, score: null, category: "unmeasured" }), NONE, "ko");
    expect(noTool).toMatchObject({ reason: "기록 없음", description: "점수 구간에 입력 토큰이 기록되지 않았습니다." });
    expect(noTool.method).toEqual([RULE_COPY.E1.ko.method]);
  });
});

describe("못 잰 도구의 정비 후보(설계 11.5)", () => {
  it("규칙을 못 쟀는데 후보가 있으면 비율을 못 낸 까닭과 정리할 수 있는 수를 함께 말한다", () => {
    const value = toolValue({ status: "unmeasured", reason: "too_little", value: null, score: null, evidence: E5_EVIDENCE, candidates: ["c1", "c2"] });
    const e5 = finding("E5", { status: "unmeasured", reason: "too_little", value: null, score: null, category: "repair", severity: "info", tools: [value], candidates: ["c1", "c2"] });
    expect(findingText(e5, NONE, "ko")).toMatchObject({
      title: "안 쓰는 스킬 끄기",
      value: null,
      reason: "가릴 수 있는 것이 적음",
      description: "쓰는지 가릴 수 있는 스킬이 3개뿐이어서 안 쓰는 비율은 내지 않았습니다. 정리할 수 있는 것은 2개 찾았습니다.",
      prescription: RULE_COPY.E5.ko.prescription,
    });
    const e6 = { ...e5, ruleId: "E6" as const, tools: [{ ...value, evidence: { ...E5_EVIDENCE, judgeable: 1 } }] };
    expect(findingText(e6, NONE, "ko").description).toBe("쓰는지 가릴 수 있는 MCP 서버가 1개뿐이어서 안 쓰는 비율은 내지 않았습니다. 정리할 수 있는 것은 2개 찾았습니다.");
    const watching = { ...e5, reason: "watching" as const, tools: [{ ...value, reason: "watching" as const }] };
    expect(findingText(watching, NONE, "ko")).toMatchObject({
      reason: "지켜보는 중",
      description: "아직 지켜보는 중인 것이 있어 안 쓰는 비율은 내지 않았습니다. 안 쓰는 것으로 확인된 것 가운데 2개는 지금 정리할 수 있습니다.",
    });
    expect(findingText(e5, NONE, "en").description).toBe("Only 3 skills are eligible for use assessment, so the unused share was not calculated. Found 2 that can be cleaned up.");
  });

  it("규칙은 다른 도구로 쟀으면 평소 설명 뒤에 후보가 나온 도구의 몫을 붙인다", () => {
    const measured = toolValue({ value: 0.1, score: 1, evidence: { ...E5_EVIDENCE, judgeable: 10, judged: 10, unused: 1, used: 9 } });
    const other = toolValue({ status: "unmeasured", reason: "too_little", value: null, score: null, evidence: E5_EVIDENCE, candidates: ["c1", "c2"] });
    const e5 = finding("E5", { value: 0.1, score: 1, category: "repair", severity: "info", tools: [measured, other], candidates: ["c1", "c2"] });
    expect(findingText(e5, NONE, "ko").description).toBe("쓰는지 판정된 스킬 가운데 10%는 쓰지 않은 것으로 확인됐습니다. Claude Code는 쓰는지 가릴 수 있는 것이 3개뿐이어서 비율을 내지 않았지만 정리할 수 있는 것이 2개 있습니다.");
    const watching = { ...e5, tools: [measured, { ...other, reason: "watching" as const }] };
    expect(findingText(watching, NONE, "ko").description).toBe("쓰는지 판정된 스킬 가운데 10%는 쓰지 않은 것으로 확인됐습니다. Claude Code는 아직 지켜보는 중인 것이 있어 비율을 내지 않았지만 안 쓰는 것으로 확인된 것 가운데 2개는 지금 정리할 수 있습니다.");
  });
});

describe("규칙마다 덧붙는 것", () => {
  it("안전장치(S2)의 어떻게 쟀나에 도구마다 인정된 조건을 적는다", () => {
    const s2 = finding("S2", { axis: "setup", value: 1, score: 1, category: "strength", evidence: { guarded: 1, tools: 1 } });
    const line = (guardHook: boolean | null, permissionChecks: boolean | null) => findingText(s2, { safeguards: [{ tool: "claude-code", guardHook, permissionChecks }], unjudgedServers: [] }, "ko").method[2];
    expect(line(true, false)).toBe("Claude Code: 셸 명령을 덮는 도구 실행 전 확인 훅이 있음");
    expect(line(false, true)).toBe("Claude Code: 기본 모드가 권한 우회가 아님");
    expect(line(true, true)).toBe("Claude Code: 기본 모드가 권한 우회가 아니고 셸 명령을 덮는 확인 훅도 있음");
    expect(line(false, false)).toBe("Claude Code: 안전장치 없음(권한 우회 모드이고 셸 명령을 덮는 확인 훅이 없음)");
    expect(line(null, true)).toBe("Claude Code: 설정 파일을 읽지 못해 가리지 못함");
  });

  it("E6에는 판정에서 뺀 서버를 까닭마다 세어 적고, claude.ai에 연결한 서버가 있으면 직접 막는 방법을 적는다. 이름은 넣지 않는다", () => {
    const server = (name: string, why: UnjudgedServer["why"], scope: UnjudgedServer["scope"] = "user"): UnjudgedServer => ({ tool: "claude-code", name, scope, projectRoot: null, projectName: null, pluginId: null, why, judgeFrom: null });
    const unjudgedServers = [server("secret-a", "not_established"), server("secret-b", "not_established"), server("claude.ai secret", "no_definition", "claude-ai")];
    const e6 = finding("E6", { status: "unmeasured", reason: "watching", value: null, score: null, category: "unmeasured", tools: [toolValue({ status: "unmeasured", reason: "watching", value: null, score: null, evidence: E5_EVIDENCE })] });
    const notes = findingText(e6, { safeguards: [], unjudgedServers }, "ko").notes;
    expect(notes).toEqual([
      "판정에서 뺀 서버 가운데 부른 기록이 없는 것입니다. 끄자고 하지 않습니다.",
      "Claude Code: 정의가 이 PC에 없거나 다 읽히지 않음 1개",
      "Claude Code: 아직 지켜보는 중 2개",
      "Claude Code가 직접 가져오는 claude.ai 연결을 막으려면 사용자 설정(~/.claude/settings.json)의 deniedMcpServers 목록에 { \"serverName\": \"<이름>\" }을 더하세요. 데스크톱 앱이 직접 넘기는 연결은 이렇게 막히지 않습니다. 그런 연결은 claude.ai/customize/connectors에서 끊으세요.",
    ]);
    expect(JSON.stringify(findingText(e6, { safeguards: [], unjudgedServers }, "en"))).not.toMatch(/secret/);
    expect(findingText(e6, NONE, "ko").notes).toEqual([]);
    expect(findingText(finding("E5", {}), { safeguards: [], unjudgedServers }, "ko").notes).toEqual([]);
  });
});
