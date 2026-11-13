// 평가 결과의 읽은 양을 만든다. 읽은 파일과 바이트, 빠진 것의 수, 읽지 못한 비율과 아래 경계, "일부만 읽었다" 띠, 지표마다 관측이 빠짐없는지다(순수 함수, 설계 9.8, 12.2, 20.1)
import type { Observation } from "../../adapters/claude/observation.ts";
import type { ToolId } from "../../adapters/types.ts";
import type { EvaluationInput } from "../evaluate.ts";
import type { CollectedTool } from "./tools.ts";

/** 읽지 못한 비율이 이것을 넘으면 "일부만 읽었다" 띠를 띄운다(설계 20.1). 정확히 이 값은 넘지 않은 것이다 */
export const PARTIAL_READ_SHARE = 0.2;

export interface ResultCoverage {
  tool: ToolId;
  /** 목록에 있는 세션 파일의 수(크기를 보지 못한 파일 포함), 크기를 아는 파일의 바이트, 읽은 바이트 */
  files: number;
  listedBytes: number;
  readBytes: number;
  /** 수정 시각이 수집 구간보다 앞서 열지 않은 파일 */
  olderThanWindow: number;
  /** 쓰는 중이라 열 때의 크기까지만 읽은 파일 */
  inProgress: number;
  unreadableFiles: number;
  unreadableDirs: number;
  unknownSizeFiles: number;
  /** 일부만 읽은 파일(끊긴 압축)과 건너뛴 압축 파일. Claude Code의 기록에는 없다 */
  partialFiles: number;
  skippedFiles: number;
  brokenLines: number;
  tooLongLines: number;
  tailFragments: number;
  /** 읽지 못한 비율. 파일 수 기준과 바이트 기준 가운데 큰 쪽이고, 분모가 둘 다 0이면 null이다 */
  unreadableShare: number | null;
  /** 비율이 "적어도 이만큼"이다. 읽지 못한 폴더나 크기를 모르는 파일이 있다 */
  lowerBound: boolean;
  /** "일부만 읽었다" 띠를 띄운다. 비율이 20%를 넘거나 아래 경계다 */
  partial: boolean;
  observation: { skills: Observation; mcp: Observation };
}

export function resultCoverage(input: EvaluationInput, collected: readonly CollectedTool[]): ResultCoverage[] {
  const tools = [...input.tools].sort((a, b) => (a.tool < b.tool ? -1 : a.tool > b.tool ? 1 : 0));
  return tools.map((tool): ResultCoverage => {
    // 입력 묶음의 도구는 모두 수집 결과가 있다. 없으면 관측이 빠짐없다고 지어내지 않고 멈춘다
    const found = collected.find((item) => item.tool === tool.tool);
    if (found === undefined) throw new Error(`no collected result for ${tool.tool}`);
    const { read } = found;
    const sum = (pick: (missing: (typeof tool.summaries)[number]["missing"]) => number): number => tool.summaries.reduce((total, summary) => total + pick(summary.missing), 0);
    const shares = [read.files > 0 ? read.unreadableFiles.length / read.files : null, read.listedBytes > 0 ? read.unreadableFileBytes / read.listedBytes : null].filter((share): share is number => share !== null);
    const unreadableShare = shares.length === 0 ? null : Math.max(...shares);
    const lowerBound = read.unreadableDirs.length > 0 || read.unknownSizeFiles > 0;
    return {
      tool: tool.tool,
      files: read.files,
      listedBytes: read.listedBytes,
      readBytes: read.bytes,
      olderThanWindow: read.olderThanWindow,
      inProgress: read.inProgress,
      unreadableFiles: read.unreadableFiles.length,
      unreadableDirs: read.unreadableDirs.length,
      unknownSizeFiles: read.unknownSizeFiles,
      partialFiles: 0,
      skippedFiles: 0,
      brokenLines: sum((missing) => missing.brokenLines),
      tooLongLines: sum((missing) => missing.tooLongLines),
      tailFragments: sum((missing) => missing.tailFragments),
      unreadableShare,
      lowerBound,
      partial: lowerBound || (unreadableShare !== null && unreadableShare > PARTIAL_READ_SHARE),
      observation: found.observation,
    };
  });
}
