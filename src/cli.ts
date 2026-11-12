// aq 명령의 입구. Node.js 버전을 확인하고 하위 명령으로 나눠 보낸다
import { homedir } from "node:os";
import { defaultStateDir, doctor } from "./commands/doctor.ts";
import { PROGRAM_VERSION } from "./version.ts";

export function nodeMajorOk(version: string): boolean {
  const major = Number(version.replace(/^v/, "").split(".")[0]);
  return Number.isInteger(major) && major >= 22;
}

export interface CliContext {
  env: Record<string, string | undefined>;
  homedir: string;
}

export async function main(argv: string[], context: CliContext = { env: process.env, homedir: homedir() }): Promise<number> {
  if (!nodeMajorOk(process.version)) {
    process.stderr.write(`Node.js 22 or later is required (found ${process.version}).\n`);
    return 2;
  }
  const [command] = argv;
  if (command === "--version" || command === "version") {
    process.stdout.write(`${PROGRAM_VERSION}\n`);
    return 0;
  }
  if (command === "doctor") {
    const report = await doctor({
      env: context.env,
      homedir: context.homedir,
      nodeVersion: process.version,
      nodeOk: nodeMajorOk(process.version),
      stateDir: defaultStateDir(context.homedir),
    });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return 0;
  }
  process.stderr.write(`Unknown command: ${command ?? "(none)"}\n`);
  return 64;
}
