// 평가 결과의 읽은 양(읽은 파일과 바이트, 빠진 것의 수, 읽지 못한 비율과 아래 경계, "일부만 읽었다" 띠, 지표마다의 관측)을 시험한다(설계 9.8, 12.2, 20.1)
import { describe, expect, it } from "vitest";
import { resultCoverage } from "../../src/core/result/coverage.ts";
import type { CollectedTool } from "../../src/core/result/tools.ts";
import { claudeTool, evaluationInput } from "../helpers/evaluation.ts";
import type { SummaryInput } from "../helpers/summaries.ts";

const read = (input: Partial<CollectedTool["read"]> = {}): CollectedTool["read"] => ({ files: 10, listedBytes: 1000, bytes: 1000, inProgress: 0, olderThanWindow: 0, unreadableFiles: [], unreadableFileBytes: 0, unknownSizeFiles: 0, unreadableDirs: [], ...input });
const collected = (input: Partial<CollectedTool> = {}): CollectedTool => ({
  tool: "claude-code",
  detected: true,
  visibleFrom: "2026-09-01",
  overlappingSessions: 0,
  read: read(),
  observation: { skills: { complete: true, reasons: [] }, mcp: { complete: true, reasons: [] } },
  ...input,
});
const missing = (brokenLines: number, tooLongLines: number, tailFragments: number) => ({ missing: { lines: 100, brokenLines, tailFragments, tooLongLines, unconfirmedTypes: {} } });
const coverageOf = (tool: CollectedTool, sessions: SummaryInput[] = []) => resultCoverage(evaluationInput([claudeTool({ sessions })]), [tool])[0]!;

describe("읽은 양", () => {
  it("읽은 양을 싣고, 깨진 줄·너무 긴 줄·덜 쓴 끝 조각은 세션 요약마다의 수를 더한다", () => {
    const coverage = coverageOf(
      collected({
        read: read({ files: 12, listedBytes: 4000, bytes: 3900, inProgress: 1, olderThanWindow: 30, unreadableFiles: ["/x/a.jsonl"], unreadableFileBytes: 100 }),
        observation: { skills: { complete: false, reasons: ["unreadable-files"] }, mcp: { complete: false, reasons: ["unreadable-files", "too-long-lines"] } },
      }),
      [{ ...missing(2, 1, 0), days: { "2026-11-10": { responses: 1 } } }, { ...missing(3, 0, 1), days: { "2026-10-11": { responses: 1 } } }],
    );
    expect(coverage).toEqual({
      tool: "claude-code",
      files: 12,
      listedBytes: 4000,
      readBytes: 3900,
      olderThanWindow: 30,
      inProgress: 1,
      unreadableFiles: 1,
      unreadableDirs: 0,
      unknownSizeFiles: 0,
      partialFiles: 0,
      skippedFiles: 0,
      brokenLines: 5,
      tooLongLines: 1,
      tailFragments: 1,
      unreadableShare: 1 / 12,
      lowerBound: false,
      partial: false,
      observation: { skills: { complete: false, reasons: ["unreadable-files"] }, mcp: { complete: false, reasons: ["unreadable-files", "too-long-lines"] } },
    });
  });

  it("읽지 못한 비율은 파일 수 기준과 바이트 기준 가운데 큰 쪽이다", () => {
    const byBytes = coverageOf(collected({ read: read({ files: 10, listedBytes: 1000, unreadableFiles: ["/x/big.jsonl"], unreadableFileBytes: 300 }) }));
    expect(byBytes.unreadableShare).toBe(0.3);
    expect(byBytes.partial).toBe(true);
    const byFiles = coverageOf(collected({ read: read({ files: 4, listedBytes: 1000, unreadableFiles: ["/x/a.jsonl"], unreadableFileBytes: 10 }) }));
    expect(byFiles.unreadableShare).toBe(0.25);
  });

  it("정확히 20%는 넘지 않은 것이라 띠를 띄우지 않는다", () => {
    const edge = coverageOf(collected({ read: read({ files: 10, listedBytes: 1000, unreadableFiles: ["/x/a.jsonl", "/x/b.jsonl"], unreadableFileBytes: 200 }) }));
    expect(edge).toMatchObject({ unreadableShare: 0.2, lowerBound: false, partial: false });
  });

  it("읽지 못한 폴더나 크기를 모르는 파일이 있으면 비율은 아래 경계이고 비율이 작아도 띠를 띄운다", () => {
    const dirs = coverageOf(collected({ read: read({ unreadableDirs: ["/x/locked"] }) }));
    expect(dirs).toMatchObject({ unreadableDirs: 1, unreadableShare: 0, lowerBound: true, partial: true });
    const unknown = coverageOf(collected({ read: read({ files: 10, unreadableFiles: ["/x/q.jsonl"], unknownSizeFiles: 1 }) }));
    expect(unknown).toMatchObject({ unknownSizeFiles: 1, unreadableShare: 0.1, lowerBound: true, partial: true });
  });

  it("목록에 파일이 없으면 비율을 내지 않는다. 그래도 읽지 못한 폴더가 있으면 숫자 없이 띠를 띄운다", () => {
    expect(coverageOf(collected({ read: read({ files: 0, listedBytes: 0, bytes: 0 }) }))).toMatchObject({ unreadableShare: null, lowerBound: false, partial: false });
    expect(coverageOf(collected({ read: read({ files: 0, listedBytes: 0, bytes: 0, unreadableDirs: ["/x"] }) }))).toMatchObject({ unreadableShare: null, lowerBound: true, partial: true });
  });

  it("수집 결과가 없는 도구가 있으면 관측이 빠짐없다고 지어내지 않고 멈춘다", () => {
    expect(() => resultCoverage(evaluationInput([claudeTool()]), [])).toThrow(/no collected result for claude-code/);
  });

  it("크기를 아는 파일이 없으면 바이트 기준은 빼고 파일 수 기준만 쓴다", () => {
    expect(coverageOf(collected({ read: read({ files: 2, listedBytes: 0, bytes: 0, unreadableFiles: ["/x/a.jsonl", "/x/b.jsonl"], unknownSizeFiles: 2 }) })).unreadableShare).toBe(1);
  });
});
