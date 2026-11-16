// aq 명령의 입구. Node.js 버전을 확인하고 하위 명령으로 나눠 보낸다. 예상하지 못한 오류는 이유를 담은 JSON과 종료 코드 1로 낸다(설계 20.1)
import { homedir, tmpdir } from "node:os";
import type { EvalClock } from "./collect/claude.ts";
import { runBadge } from "./commands/badge.ts";
import { runCheckup } from "./commands/checkup.ts";
import { runDeepHints } from "./commands/deep-hints.ts";
import { runNotify } from "./commands/notify.ts";
import { runTunePlan } from "./commands/tune-plan.ts";
import { runTuneApply, runTuneUndo, runTuneVerify, type TuneRunOptions } from "./commands/tune-run.ts";
import { openInBrowser } from "./commands/open.ts";
import { pickLang } from "./core/copy/lang.ts";
import { clean } from "./commands/clean.ts";
import { doctor } from "./commands/doctor.ts";
import { where } from "./commands/where.ts";
import { stateDir } from "./state/folder.ts";
import { ID_PATTERN } from "./tune/work.ts";
import { PROGRAM_VERSION } from "./version.ts";

export function nodeMajorOk(version: string): boolean {
  const major = Number(version.replace(/^v/, "").split(".")[0]);
  return Number.isInteger(major) && major >= 22;
}

export interface CliContext {
  env: Record<string, string | undefined>;
  homedir: string;
  /** 아래는 주지 않으면 실제 값이다. 시험이 고정한다 */
  tmpdir?: string;
  platform?: NodeJS.Platform;
  /** 평가 시계. 주지 않으면 지금 시각과 이 PC의 시간대다 */
  clock?: EvalClock;
  /** 실행한 파일. 주지 않으면 process.argv[1]이다 */
  entryFile?: string;
  managedDir?: string;
  /** OS의 언어. 주지 않으면 실행 환경의 로캘이다. 시험이 고정한다 */
  locale?: string;
  /** 결과 화면을 여는 것. 주지 않으면 기본 브라우저로 연다. 시험이 바꾼다 */
  open?: (path: string) => Promise<boolean>;
}

/** aq checkup이 받는 옵션. --no-open은 결과 화면을 열지 않는다. --lang은 값을 하나 받는다 */
const CHECKUP_FLAGS: ReadonlySet<string> = new Set(["--no-open", "--no-save", "--rescan"]);
/** aq tune plan이 받는 옵션. 결과 화면이 없어 --no-open은 받지 않는다(「6단계 1부 계획 전 결정」 6번) */
const TUNE_PLAN_FLAGS: ReadonlySet<string> = new Set(["--no-save", "--rescan"]);

/** aq checkup과 aq tune plan의 옵션을 읽는다. 받는 옵션은 allowed다. 모르는 옵션이 있거나 --lang 뒤에 값이 없으면(값 자리에 -로 시작하는 것이 와도) null이다. --lang이 여럿이면 마지막 것이다 */
export function checkupArgs(rest: readonly string[], allowed: ReadonlySet<string> = CHECKUP_FLAGS): { flags: Set<string>; lang: string | null } | null {
  const flags = new Set<string>();
  let lang: string | null = null;
  for (let index = 0; index < rest.length; index++) {
    const arg = rest[index]!;
    if (arg === "--lang") {
      const value = rest[index + 1];
      if (value === undefined || value.startsWith("-")) return null;
      lang = value;
      index++;
    } else if (allowed.has(arg)) {
      flags.add(arg);
    } else {
      return null;
    }
  }
  return { flags, lang };
}

const printJson = (value: unknown): void => {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
};

/**
 * aq tune apply·undo·verify의 인자. --lang <언어>와 --rescan 말고는 위치 인자다. 첫 위치 인자는 계획이나 작업 ID의 꼴이어야 하고, 항목 ID는 겹치지 않아야 한다.
 * apply는 항목이 하나 이상, verify는 항목이 없어야 한다. 아니면 null이다(「6단계 2부 계획 전 결정」 10번).
 * undo만 위치 인자를 다 빼도 되고, 그때 id는 null이다(작업 번호를 모르는 새 세션의 되돌리기, 0.1.1)
 */
export function tuneRunArgs(command: "apply" | "undo" | "verify", rest: readonly string[]): { lang: string | null; rescan: boolean; id: string | null; items: string[] } | null {
  let lang: string | null = null;
  let rescan = false;
  const positional: string[] = [];
  for (let index = 0; index < rest.length; index++) {
    const arg = rest[index]!;
    if (arg === "--lang") {
      const value = rest[index + 1];
      if (value === undefined || value.startsWith("-")) return null;
      lang = value;
      index++;
    } else if (arg === "--rescan") rescan = true;
    else if (arg.startsWith("-")) return null;
    else positional.push(arg);
  }
  const [id, ...items] = positional;
  if (id === undefined) return command === "undo" ? { lang, rescan, id: null, items: [] } : null;
  if (!ID_PATTERN.test(id) || new Set(items).size !== items.length) return null;
  if ((command === "apply" && items.length === 0) || (command === "verify" && items.length > 0)) return null;
  return { lang, rescan, id, items };
}

/** 하위 명령을 돌린다. 모르는 명령이면 null이다. */
async function run(command: string | undefined, rest: string[], context: CliContext): Promise<number | null> {
  if (command === "doctor") {
    printJson(
      await doctor({
        env: context.env,
        homedir: context.homedir,
        nodeVersion: process.version,
        nodeOk: nodeMajorOk(process.version),
        stateDir: stateDir(context.homedir),
      }),
    );
    return 0;
  }
  if (command === "where" && rest.length === 0) {
    printJson(await where(stateDir(context.homedir)));
    return 0;
  }
  if (command === "clean" && (rest.length === 0 || (rest.length === 1 && rest[0] === "--all"))) {
    printJson(await clean(stateDir(context.homedir), rest[0] === "--all" ? "all" : "clean"));
    return 0;
  }
  if (command === "badge") {
    // --lang만 받는다. 이력의 AQ로 배지 그림을 상태 폴더에 만든다(0.2.0)
    const args = checkupArgs(rest, new Set());
    if (args === null) return null;
    printJson(
      await runBadge({
        stateDir: stateDir(context.homedir),
        lang: pickLang(args.lang, context.locale ?? Intl.DateTimeFormat().resolvedOptions().locale),
        timeZone: context.clock?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    );
    return 0;
  }
  if (command === "notify" && (rest[0] === "on" || rest[0] === "off" || rest[0] === "status")) {
    const args = checkupArgs(rest.slice(1), new Set());
    if (args === null) return null;
    printJson(await runNotify(rest[0], { env: context.env, homedir: context.homedir, stateDir: stateDir(context.homedir), lang: pickLang(args.lang, context.locale ?? Intl.DateTimeFormat().resolvedOptions().locale) }));
    return 0;
  }
  if (command === "deep-hints") {
    const args = checkupArgs(rest, TUNE_PLAN_FLAGS);
    if (args === null) return null;
    // 단서와 읽을 수 있는 지침 파일 목록만 낸다. 파일의 글은 스킬이 사용자가 고른 것만 읽는다(설계 17)
    printJson(
      await runDeepHints({
        env: context.env,
        homedir: context.homedir,
        tmpdir: context.tmpdir ?? tmpdir(),
        platform: context.platform ?? process.platform,
        clock: context.clock ?? { nowMs: Date.now(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
        lang: pickLang(args.lang, context.locale ?? Intl.DateTimeFormat().resolvedOptions().locale),
        stateDir: stateDir(context.homedir),
        save: !args.flags.has("--no-save"),
        rescan: args.flags.has("--rescan"),
        entryFile: context.entryFile ?? process.argv[1] ?? "",
        ...(context.managedDir === undefined ? {} : { managedDir: context.managedDir }),
      }),
    );
    return 0;
  }
  if (command === "tune" && rest[0] === "plan") {
    const args = checkupArgs(rest.slice(1), TUNE_PLAN_FLAGS);
    if (args === null) return null;
    // 계획 전체(경로, 열쇠, 전후 값, 영향 범위)를 낸다. 설정 파일의 다른 내용은 계획에 없다(설계 16.5의 2번)
    printJson(
      await runTunePlan({
        env: context.env,
        homedir: context.homedir,
        tmpdir: context.tmpdir ?? tmpdir(),
        platform: context.platform ?? process.platform,
        clock: context.clock ?? { nowMs: Date.now(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
        lang: pickLang(args.lang, context.locale ?? Intl.DateTimeFormat().resolvedOptions().locale),
        stateDir: stateDir(context.homedir),
        save: !args.flags.has("--no-save"),
        rescan: args.flags.has("--rescan"),
        entryFile: context.entryFile ?? process.argv[1] ?? "",
        ...(context.managedDir === undefined ? {} : { managedDir: context.managedDir }),
      }),
    );
    return 0;
  }
  if (command === "tune" && (rest[0] === "apply" || rest[0] === "undo" || rest[0] === "verify")) {
    const which = rest[0];
    const args = tuneRunArgs(which, rest.slice(1));
    if (args === null) return null;
    const options: TuneRunOptions = {
      env: context.env,
      homedir: context.homedir,
      tmpdir: context.tmpdir ?? tmpdir(),
      platform: context.platform ?? process.platform,
      clock: context.clock ?? { nowMs: Date.now(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
      lang: pickLang(args.lang, context.locale ?? Intl.DateTimeFormat().resolvedOptions().locale),
      stateDir: stateDir(context.homedir),
      rescan: args.rescan,
      entryFile: context.entryFile ?? process.argv[1] ?? "",
      ...(context.managedDir === undefined ? {} : { managedDir: context.managedDir }),
    };
    if (which === "undo") printJson(await runTuneUndo({ ...options, workId: args.id, itemIds: args.items }));
    // apply와 verify는 tuneRunArgs가 ID 없이는 null을 돌려주므로 여기서 id는 늘 있다
    else if (args.id === null) return null;
    else if (which === "apply") printJson(await runTuneApply({ ...options, planId: args.id, itemIds: args.items }));
    else printJson(await runTuneVerify({ ...options, workId: args.id }));
    return 0;
  }
  const args = command === "checkup" ? checkupArgs(rest) : null;
  if (args !== null) {
    const platform = context.platform ?? process.platform;
    const open = context.open ?? ((path: string) => openInBrowser(path, platform));
    const outcome = await runCheckup({
      env: context.env,
      homedir: context.homedir,
      tmpdir: context.tmpdir ?? tmpdir(),
      platform,
      clock: context.clock ?? { nowMs: Date.now(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
      lang: pickLang(args.lang, context.locale ?? Intl.DateTimeFormat().resolvedOptions().locale),
      stateDir: stateDir(context.homedir),
      save: !args.flags.has("--no-save"),
      rescan: args.flags.has("--rescan"),
      entryFile: context.entryFile ?? process.argv[1] ?? "",
      ...(context.managedDir === undefined ? {} : { managedDir: context.managedDir }),
      ...(args.flags.has("--no-open") ? {} : { open }),
    });
    // 평가 결과 전체(이름 목록이 든 것)는 파일로만 두고 표준 출력에는 요약과 실행 기록만 낸다(설계 12.3, 19.1)
    printJson({ summary: outcome.summary, run: outcome.run });
    return 0;
  }
  return null;
}

export async function main(argv: string[], context: CliContext = { env: process.env, homedir: homedir() }): Promise<number> {
  if (!nodeMajorOk(process.version)) {
    process.stderr.write(`Node.js 22 or later is required (found ${process.version}).\n`);
    return 2;
  }
  const [command, ...rest] = argv;
  if (command === "--version" || command === "version") {
    process.stdout.write(`${PROGRAM_VERSION}\n`);
    return 0;
  }
  let code: number | null;
  try {
    code = await run(command, rest, context);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    printJson({ error: { code: err.code ?? "unexpected", message: err instanceof Error ? err.message : String(error) } });
    return 1;
  }
  if (code !== null) return code;
  process.stderr.write(`Unknown command: ${[command ?? "(none)", ...rest].join(" ")}\n`);
  return 64;
}
