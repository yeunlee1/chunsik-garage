// Codex 세션 요약과 지문을 캐시에 넣고 꺼내는 것을 시험한다. 되살린 요약은 새로 해석한 요약과 JSON 글까지 같고, 요약은 뺄 지문(부모 세션의 기록과 같은 세션의 앞 기록) 가운데 자기 기록에도 있는 것의 지문(sharedDigest)이 같을 때만 다시 쓴다(설계 9.4, 12.2, 「5단계 계획 전 결정」 7번)
import { mkdtemp, readdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fromLists, sharedDigest, toLists, unionOf } from "../../../src/adapters/codex/fingerprints.ts";
import { CodexSessionParser, type CodexFingerprints } from "../../../src/adapters/codex/parser.ts";
import { reviveSummary } from "../../../src/adapters/types.ts";
import { cacheKeyFor, loadCached, storeCached, type CacheEntry } from "../../../src/state/cache.ts";
import { parseLines } from "../../helpers/claude-lines.ts";

const T = "2026-11-10T01:00:00Z";
const line = (type: string, payload: Record<string, unknown>) => JSON.stringify({ timestamp: T, type, payload });
const item = (it: Record<string, unknown>) => line("event_msg", { type: "item_completed", item: it });
const usage = (n: number) => ({ input_tokens: n, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 1, reasoning_output_tokens: 0, total_tokens: n + 1 });
const CHILD = [
  line("session_meta", { id: "child", cwd: "C:/w", cli_version: "0.166.0", thread_source: "subagent", parent_thread_id: "mom" }),
  line("turn_context", { model: "m", effort: "high" }),
  item({ type: "Zeta", id: "z1" }),
  item({ type: "Alpha", id: "a1" }),
  item({ type: "UserMessage", id: "u1" }),
  item({ type: "McpToolCall", id: "m1", server: "github", status: "completed" }),
  line("event_msg", { type: "token_count", info: { total_token_usage: usage(100) } }),
  line("token_usage_record", { response_id: "r1", usage: usage(5), thread_token_usage: usage(105) }),
  line("world_state", { state: { agents_md: { text: "ab가" } } }),
  '{"type":"event_msg","pay',
];
function parse(lines: string[], inherited: CodexFingerprints | null = null) {
  const parser = new CodexSessionParser({ recordId: "rec-1", timeZone: "Asia/Seoul", inherited });
  for (const text of lines) parser.line(text);
  const summary = parser.finish(null, false);
  return { summary, prints: parser.fingerprints() };
}
const momOf = (...ids: string[]) => parse([line("session_meta", { id: "mom", thread_source: "user" }), ...ids.map((id) => item({ type: "UserMessage", id }))]).prints;

describe("요약 되살리기", () => {
  it("Codex 요약은 JSON으로 저장했다가 되살려도 새로 해석한 것과 JSON 글까지 같다(정체 모를 종류의 열쇠 차례를 포함한다)", () => {
    const { summary } = parse(CHILD, momOf("u1"));
    const revived = reviveSummary(JSON.parse(JSON.stringify(summary)));
    expect(revived).toEqual(summary);
    expect(JSON.stringify(revived)).toBe(JSON.stringify(summary));
  });

  it("codex 칸이 없거나 모양이 다른 Codex 요약, codex 칸이 있는 Claude Code 요약, 모르는 도구의 요약은 되살리지 않는다", () => {
    const json = JSON.parse(JSON.stringify(parse(CHILD).summary)) as Record<string, unknown> & { codex: Record<string, unknown> };
    const { codex, ...withoutCodex } = json;
    expect(reviveSummary(withoutCodex)).toBeNull();
    for (const bad of [{ recordId: 1 }, { unknownThreadSource: 5 }, { idFallback: "bogus" }, { baselineMissing: "no" }, { unknownItemTypes: { X: "1" } }, { inheritedSkipped: { items: 0, totals: 0 } }, { unknownItemTypes: { X: -1 } }, { unknownItemTypes: { X: 0.5 } }, { unknownItemTypes: { X: Infinity } }, { unknownItemTypes: { X: 2 ** 53 } }, { inheritedSkipped: { items: -1, totals: 0, responses: 0 } }, { inheritedSkipped: { items: 0.5, totals: 0, responses: 0 } }]) {
      expect(reviveSummary({ ...json, codex: { ...codex, ...bad } }), JSON.stringify(bad)).toBeNull();
    }
    expect(reviveSummary({ ...JSON.parse(JSON.stringify(parseLines([]))), codex })).toBeNull();
    expect(reviveSummary({ ...json, tool: "cursor" })).toBeNull();
    // 모르는 종류의 개수 0은 정상 범위다
    expect(reviveSummary({ ...json, codex: { ...codex, unknownItemTypes: { X: 0 } } })).not.toBeNull();
  });
});

describe("지문 목록", () => {
  it("지문을 차례로 늘어놓은 목록으로 바꾸고 되돌린다. 열쇠가 모자라거나 목록이 아니거나 지문 꼴이 아닌 값이 있으면 되돌리지 않는다", () => {
    const { prints } = parse(CHILD);
    const lists = toLists(prints);
    for (const key of ["itemIds", "callIds", "totals", "responseIds"] as const) expect(lists[key]).toEqual([...prints[key]].sort());
    expect(fromLists(JSON.parse(JSON.stringify(lists)))).toEqual(prints);
    expect(fromLists({ ...lists, totals: ["xyz"] })).toBeNull();
    expect(fromLists({ ...lists, itemIds: "a" })).toBeNull();
    expect(fromLists({ itemIds: [], callIds: [], totals: [] })).toBeNull();
  });

  it("같은 세션의 기록 파일 여럿의 지문은 합친다", () => {
    const merged = unionOf([momOf("u1", "u2"), momOf("u2", "u3")]);
    expect(merged.itemIds).toEqual(momOf("u1", "u2", "u3").itemIds);
  });

  it("sharedDigest는 네 종류(항목, 호출, 누적값, 응답)마다 겹침을 따로 담는다. 어느 한 종류의 겹침만 달라도 다르다", () => {
    const none = () => new Set<string>();
    for (const kind of ["itemIds", "callIds", "totals", "responseIds"] as const) {
      const only = (prints: string[]): CodexFingerprints => ({ itemIds: none(), callIds: none(), totals: none(), responseIds: none(), [kind]: new Set(prints) });
      const own = only(["0000000000000001", "0000000000000002"]);
      expect(sharedDigest(own, only(["0000000000000001"])), kind).not.toBe(sharedDigest(own, only(["0000000000000002"])));
    }
  });

  it("sharedDigest는 뺄 지문 가운데 자기 지문에도 있는 것에만 기댄다. 뺄 지문에 관계없는 지문을 더해도 같고, 겹치는 지문이 바뀌면 다르며, 뺄 지문이 없으면 겹침이 없는 것과 같다", () => {
    const own = parse(CHILD).prints;
    const digest = sharedDigest(own, momOf("u1", "a1"));
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(sharedDigest(own, momOf("u1", "a1", "unrelated"))).toBe(digest);
    expect(sharedDigest(own, momOf("u1"))).not.toBe(digest);
    expect(sharedDigest(own, null)).toBe(sharedDigest(own, momOf("unrelated")));
    expect(sharedDigest(own, null)).not.toBe(digest);
  });
});

describe("캐시에 넣고 꺼내기", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "aq-codex-cache-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });
  async function entryFor(): Promise<CacheEntry> {
    const path = join(dir, "rollout-x.jsonl");
    const content = `${CHILD.join("\n")}\n`;
    await writeFile(path, content);
    const mtime = Date.parse(T);
    await utimes(path, mtime / 1000, mtime / 1000);
    const key = (await cacheKeyFor({ path, normPath: path.toLowerCase(), size: Buffer.byteLength(content), mtimeMs: mtime }, "codex@1", "Asia/Seoul"))!;
    const { summary, prints } = parse(CHILD);
    return { key, summary, bytesRead: Buffer.byteLength(content), codex: { fingerprints: toLists(prints), sharedDigest: sharedDigest(prints, null) } };
  }

  it("Codex 항목은 요약과 함께 자기 지문 목록과 sharedDigest를 넣고 같은 열쇠로 그대로 꺼낸다", async () => {
    const entry = await entryFor();
    await storeCached(join(dir, "cache"), entry);
    expect(await loadCached(join(dir, "cache"), entry.key)).toEqual(entry);
  });

  it("Codex 항목에 지문 칸이 없거나 모양이 다르면 꺼내지 않는다. Claude Code 항목에 지문 칸이 있어도 꺼내지 않는다", async () => {
    const entry = await entryFor();
    const cases: unknown[] = [
      { ...entry, codex: undefined },
      { ...entry, codex: { ...entry.codex, sharedDigest: 5 } },
      { ...entry, codex: { ...entry.codex, fingerprints: { ...entry.codex!.fingerprints, totals: [1] } } },
      { ...entry, summary: parseLines([]) },
    ];
    for (const bad of cases) {
      await rm(join(dir, "cache"), { recursive: true, force: true });
      await storeCached(join(dir, "cache"), bad as CacheEntry);
      expect(await readdir(join(dir, "cache"))).toHaveLength(1);
      expect(await loadCached(join(dir, "cache"), entry.key)).toBeNull();
    }
  });
});
