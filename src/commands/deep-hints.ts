// aq deep-hints. 점검과 같은 입력으로 정밀 점검 단서와 읽을 수 있는 지침 파일 목록을 낸다. 점수와 결과 화면에 넣지 않고, 설정과 상태는 읽기만 한다(설계 7.4, 17)
import { join } from "node:path";
import type { EvalClock } from "../collect/claude.ts";
import { deepHintText } from "../core/copy/deep-hints.ts";
import type { Lang } from "../core/copy/lang.ts";
import { deepFiles, deepHints, type DeepFile, type DeepHint } from "../core/result/hints.ts";
import { openState } from "../state/next-state.ts";
import { gatherCheckupInput } from "./checkup-input.ts";
import { selfIdentity } from "./self.ts";

export interface DeepHintsOptions {
  env: Record<string, string | undefined>;
  homedir: string;
  tmpdir: string;
  platform: NodeJS.Platform;
  clock: EvalClock;
  lang: Lang;
  stateDir: string;
  /** 캐시를 쓴다. 거짓이면 상태 폴더에 아무것도 쓰지 않는다 */
  save: boolean;
  rescan: boolean;
  entryFile: string;
  managedDir?: string;
  now?: () => number;
}

export interface DeepHintsOutcome {
  hints: DeepHint[];
  files: DeepFile[];
  run: { durationMs: number; text: { hints: string[] } };
}

export async function runDeepHints(options: DeepHintsOptions): Promise<DeepHintsOutcome> {
  const now = options.now ?? Date.now;
  const started = now();
  const opened = await openState(options.stateDir);
  const gathered = await gatherCheckupInput({
    env: options.env,
    homedir: options.homedir,
    tmpdir: options.tmpdir,
    platform: options.platform,
    clock: options.clock,
    cacheDir: options.save ? join(options.stateDir, "cache") : null,
    rescan: options.rescan,
    state: opened.state,
    self: await selfIdentity(options.entryFile),
    ...(options.managedDir === undefined ? {} : { managedDir: options.managedDir }),
  });
  const hints = deepHints(gathered.input);
  return { hints, files: deepFiles(gathered.input), run: { durationMs: now() - started, text: { hints: hints.map((hint) => deepHintText(hint, options.lang)) } } };
}
