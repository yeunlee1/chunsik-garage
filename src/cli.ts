// aq 명령의 입구. Node.js 버전을 확인하고 하위 명령으로 나눠 보낸다. 예상하지 못한 오류는 이유를 담은 JSON과 종료 코드 1로 낸다(설계 20.1)
import { homedir } from "node:os";
import { clean } from "./commands/clean.ts";
import { doctor } from "./commands/doctor.ts";
import { where } from "./commands/where.ts";
import { stateDir } from "./state/folder.ts";
import { PROGRAM_VERSION } from "./version.ts";

export function nodeMajorOk(version: string): boolean {
  const major = Number(version.replace(/^v/, "").split(".")[0]);
  return Number.isInteger(major) && major >= 22;
}

export interface CliContext {
  env: Record<string, string | undefined>;
  homedir: string;
}

const printJson = (value: unknown): void => {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
};

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
