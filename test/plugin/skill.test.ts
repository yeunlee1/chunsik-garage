// 스킬 본문(skills/aq/SKILL.md)이 프로그램과 약속대로 맞물리는지 본다. 머리말, 실행 명령과 허락 규칙, 옵션, 본문이 읽으라는 요약과 실행 기록의 칸, 그 절 안에서 글자 그대로 견주는 옵션 줄·실패할 때·틀·표, 틀의 칸 짝, 알림 표, 말하는 쪽과 얼굴, 실패할 때다(설계 7.1, 7.4, 12.3, 15, 「4단계 계획에서 보완」)
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { checkupArgs, main, tuneRunArgs, type CliContext } from "../../src/cli.ts";
import { RUN_NOTICE_KINDS } from "../../src/commands/run-notices.ts";
import { SELF_SKILL_NAMES } from "../../src/commands/self.ts";
import { findingText, type FindingInput } from "../../src/core/copy/findings.ts";
import { evaluate } from "../../src/core/evaluate.ts";
import { checkupResult, type ResultFinding } from "../../src/core/result/assemble.ts";
import { NOTICE_KINDS } from "../../src/core/result/notices.ts";
import { checkupSummary } from "../../src/core/result/summary.ts";
import type { CollectedTool } from "../../src/core/result/tools.ts";
import { claudeTool, evaluationInput } from "../helpers/evaluation.ts";
import { makeTemp, put, removeTemp } from "../helpers/temp-fs.ts";

const source = readFileSync("skills/aq/SKILL.md", "utf8").replace(/\r\n/g, "\n");
const parts = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(source);
if (parts === null) throw new Error("SKILL.md의 머리말을 찾지 못했다");
const head: Record<string, string> = Object.fromEntries(
  parts[1]!.split("\n").map((line) => {
    const at = line.indexOf(": ");
    return [line.slice(0, at), line.slice(at + 2)];
  }),
);
const body = parts[2]!;
/** 실행 파일을 부르는 꼴. 허락 규칙과 본문의 명령이 같은 꼴로 시작해야 묻지 않고 돈다 */
const COMMAND = 'node "${CLAUDE_SKILL_DIR}/scripts/aq.mjs"';
/** 본문의 한 절(제목부터 다음 같은 단계의 제목 앞까지) */
const section = (title: string): string => {
  const start = body.indexOf(title);
  if (start < 0) throw new Error(`절이 없다: ${title}`);
  const next = body.indexOf("\n## ", start + title.length);
  return body.slice(start, next < 0 ? body.length : next);
};
/** 마크다운 표의 몸 줄을 칸으로 나눈다. 머리 줄과 구분 줄은 뺀다 */
const tableRows = (text: string, header: string): string[][] => {
  const lines = text.split("\n");
  const at = lines.indexOf(header);
  if (at < 0) throw new Error(`표가 없다: ${header}`);
  const rows: string[][] = [];
  for (const line of lines.slice(at + 2)) {
    if (!line.startsWith("|")) break;
    rows.push(line.slice(1, -1).split(" | ").map((cell) => cell.trim()));
  }
  return rows;
};

describe("머리말", () => {
  it("이름, 설명, 허락 규칙 셋만 두고, 이름은 이 도구가 스스로를 알아보는 스킬 이름이다", () => {
    expect(Object.keys(head)).toEqual(["name", "description", "allowed-tools"]);
    expect(head.name).toBe(SELF_SKILL_NAMES[0]);
  });

  it("설명은 목록에 다 실리는 1,536자 안이고 꺾쇠가 없으며, 영어와 한국어로 부르는 말을 담는다", () => {
    expect(head.description!.length).toBeLessThanOrEqual(1536);
    expect(head.description).not.toMatch(/[<>]/);
    expect(head.description).toContain("AQ checkup");
    expect(head.description).toContain("AQ 점검해 줘");
  });

  it("허락 규칙은 실행 파일 명령 하나만 묻지 않고 돌게 한다", () => {
    expect(head["allowed-tools"]).toBe(`Bash(${COMMAND} *)`);
  });
});

describe("실행 명령", () => {
  it("본문의 명령은 모두 허락 규칙과 같은 꼴로 시작하고, checkup 뒤의 인자를 프로그램이 받으며 넘긴 언어가 그대로 읽힌다", () => {
    const commands = [...body.matchAll(/^\s*(node .*)$/gm)].map((match) => match[1]!.trim());
    expect(commands.filter((command) => command.startsWith(`${COMMAND} checkup `)).length).toBeGreaterThan(0);
    for (const command of commands) {
      expect(command.startsWith(`${COMMAND} `)).toBe(true);
      // 정비 명령의 자리 표시는 받는 꼴의 값으로 바꿔 본다(6단계 정비 흐름)
      const [sub, ...args] = command
        .slice(`${COMMAND} `.length)
        .replace("<lang>", "ko")
        .replace(/<(?:plan|work) ID>/, "2026-11-12T03-00-00-000Z-abc123")
        .replace("<item ID…>", "A1:claude-code:idle")
        .split(" ");
      if (sub === "checkup") expect(checkupArgs(args)).toEqual({ flags: new Set(), lang: "ko" });
      else if (sub === "deep-hints") expect(checkupArgs(args, new Set(["--no-save", "--rescan"]))).toEqual({ flags: new Set(), lang: "ko" });
      else if (sub === "where") expect(args).toEqual([]);
      else if (sub === "clean") expect([[], ["--all"]]).toContainEqual(args);
      else if (sub === "notify") {
        expect(["on", "off", "status"]).toContain(args[0]);
        expect(checkupArgs(args.slice(1), new Set())).toEqual({ flags: new Set(), lang: "ko" });
      }
      else if (sub === "tune" && args[0] === "plan") expect(checkupArgs(args.slice(1), new Set(["--no-save", "--rescan"]))).toEqual({ flags: new Set(), lang: "ko" });
      else {
        expect([sub, ["apply", "undo", "verify"].includes(args[0]!)]).toEqual(["tune", true]);
        expect(tuneRunArgs(args[0] as "apply" | "undo" | "verify", args.slice(1))?.lang).toBe("ko");
      }
    }
  });

  it("본문이 붙이라고 하는 옵션은 checkup이 받는 셋이다", () => {
    const options = [...new Set([...body.matchAll(/`(--[a-z-]+)`/g)].map((match) => match[1]!))].sort();
    expect(options).toEqual(["--no-open", "--no-save", "--rescan"]);
    for (const option of options) expect(checkupArgs(["--lang", "ko", option])).not.toBeNull();
  });
});

const collected: CollectedTool = {
  tool: "claude-code",
  detected: true,
  visibleFrom: "2026-10-01",
  overlappingSessions: 0,
  read: { files: 3, listedBytes: 300, bytes: 300, inProgress: 0, olderThanWindow: 0, unreadableFiles: [], unreadableFileBytes: 0, unknownSizeFiles: 0, unreadableDirs: [] },
  observation: { skills: { complete: true, reasons: [] }, mcp: { complete: true, reasons: [] } },
};
const finding = (ruleId: ResultFinding["ruleId"], input: Partial<FindingInput>): ResultFinding => {
  const base: FindingInput = { ruleId, axis: "efficiency", kind: "share", weight: 2, status: "scored", reason: null, value: 0.5, score: 0.5, category: "average", severity: null, gain: null, evidence: {}, tools: [], candidates: [], ...input };
  const details = { safeguards: [], unjudgedServers: [] };
  return { ...base, text: { en: findingText(base, details, "en"), ko: findingText(base, details, "ko") } };
};
/** AQ와 가장 잘하는 것과 먼저 고칠 것이 있는 요약 */
function scoredSummary(): unknown {
  const sessions = Array.from({ length: 3 }, (_, index) => ({ days: { [`2026-11-1${index}`]: { responses: 3, humanRequests: 10 } } }));
  const input = evaluationInput([claudeTool({ sessions })]);
  const result = checkupResult({ input, evaluation: evaluate(input), collected: [collected], appVersion: "0.1.0", lang: "ko", run: { stateBroken: false } });
  return checkupSummary({ ...result, findings: [finding("E1", { category: "strength", value: 0.95, score: 1 }), finding("E3", { category: "repair", gain: 6, severity: "critical" })] }, "C:/report.html");
}

/** 칸의 경로 하나. 처음 이름(summary, run) 뒤에 칸 이름(.이름)이나 배열 자리([숫자] 또는 모든 원소 [])가 이어지고 끝까지 그 꼴이어야 한다 */
const PATH = /^(summary|run)((?:\.[A-Za-z][A-Za-z0-9_]*|\[\d*\])+)$/;
/** 경로를 조각으로 나눈다. 끝까지 바른 꼴이 아니면 null이다 */
function pathSteps(path: string): string[] | null {
  const match = PATH.exec(path);
  return match === null ? null : [match[1]!, ...match[2]!.match(/\.[A-Za-z][A-Za-z0-9_]*|\[\d*\]/g)!];
}
/**
 * 글에서 칸의 경로 후보를 모두 뽑는다. 처음 이름(summary, run) 바로 뒤가 점이나 대괄호인 것만 후보다(running 같은 낱말은 아니다). 두 갈래를 합친다.
 * - 백틱 안이나 꺾쇠 안의 글 전체가 그렇게 시작하면 그 글 전체가 후보다. 안에 빈칸, 쉼표, 소괄호, 끝의 점이 끼어도 자르지 않는다.
 * - 글 어디서나, 구분자(빈칸, 백틱, 꺾쇠, 따옴표, 쉼표) 앞까지를 통째로 잡는다. 대괄호나 소괄호가 깨졌거나 칸 이름 끝에 글자가 붙어도 앞부분만 잘라 내지 않는다.
 *   이 갈래는 문장 끝의 마침표만 떼고, 떼고 나서 처음 이름만 남은 것(문장 끝의 낱말 summary.)은 경로가 아니라 뺀다.
 *   세미콜론이나 콜론은 구분자가 아니다. 본문에서 경로 바로 뒤에 붙이면 시험이 실패하므로, 경로는 백틱으로 감싸 쓴다
 */
function extractPaths(text: string): string[] {
  const inside = [...text.matchAll(/`([^`\n]+)`/g), ...text.matchAll(/<([^<>\n]+)>/g)].map((match) => match[1]!).filter((inner) => /^(?:summary|run)[.[\]]/.test(inner));
  const loose = [...text.matchAll(/(?<![\w.])((?:summary|run)(?=[.[\]])[^\s`<>"',]*)/g)].map((match) => match[1]!.replace(/\.+$/, "")).filter((path) => path !== "summary" && path !== "run");
  return [...new Set([...inside, ...loose])];
}
/** 경로를 따라가 끝까지 닿는 값이 하나라도 있는지 본다. 값이 null이어도 칸이 있으면 닿은 것이다. 바른 꼴이 아니면 닿지 않는다 */
function reaches(output: Record<string, unknown>, path: string): boolean {
  const steps = pathSteps(path);
  if (steps === null) return false;
  const [first, ...rest] = steps;
  let values: unknown[] = first! in output ? [output[first!]] : [];
  for (const step of rest) {
    if (step.startsWith(".")) {
      const key = step.slice(1);
      values = values.filter((value) => value !== null && typeof value === "object" && key in value).map((value) => (value as Record<string, unknown>)[key]);
    } else if (step === "[]") values = values.flatMap((value) => (Array.isArray(value) ? value : []));
    else values = values.flatMap((value) => (Array.isArray(value) && Number(step.slice(1, -1)) < value.length ? [value[Number(step.slice(1, -1))]] : []));
  }
  return values.length > 0;
}

describe("본문이 읽으라는 칸", () => {
  let root: string;
  let unscored: Record<string, unknown>;
  beforeAll(async () => {
    root = await makeTemp();
    await put(join(root, "tmp", ".keep"), "");
    const context: CliContext = { env: {}, homedir: join(root, "home"), tmpdir: join(root, "tmp"), platform: process.platform, clock: { nowMs: Date.parse("2026-11-12T03:00:00Z"), timeZone: "Asia/Seoul" }, entryFile: join(root, "src", "entry.ts"), managedDir: join(root, "managed"), locale: "en-US", open: async () => true };
    let printed = "";
    const write = vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
      printed += String(chunk);
      return true;
    });
    await main(["checkup", "--no-save", "--lang", "ko"], context);
    write.mockRestore();
    unscored = JSON.parse(printed) as Record<string, unknown>;
  });
  afterAll(async () => removeTemp(root));

  it("본문에 적힌 summary와 run의 칸은 모두 끝까지 바른 꼴이고, 프로그램이 내는 칸이다(AQ가 없는 빈 홈의 출력이나, AQ와 먼저 고칠 것이 있는 요약 가운데 하나에 있다)", () => {
    const paths = extractPaths(body);
    expect(paths.length).toBeGreaterThan(10);
    const scored = { summary: scoredSummary(), run: unscored.run };
    for (const path of paths) expect([path, pathSteps(path) !== null && (reaches(unscored, path) || reaches(scored, path))]).toEqual([path, true]);
  });

  it("경로를 따라가는 확인은 없는 칸, 끝에 글자가 붙은 칸, 잘못된 배열 자리를 받지 않는다", () => {
    const scored = { summary: scoredSummary(), run: unscored.run };
    expect(reaches(scored, "summary.text.best.detail")).toBe(true);
    expect(reaches(scored, "summary.text.fixFirst[0].title")).toBe(true);
    expect(reaches(unscored, "run.notices[].kind")).toBe(true);
    expect(reaches(scored, "summary.text.best.detail2")).toBe(false);
    expect(reaches(scored, "summary.text.fixFirst[0x].title")).toBe(false);
    expect(reaches(scored, "summary.text.fixFirst[5].title")).toBe(false);
    expect(pathSteps("summary.text..best")).toBeNull();
  });

  it("본문의 경로를 깨뜨리면(대괄호가 빠짐, 배열 자리를 소괄호로, 칸 사이에 빈칸이나 쉼표, 끝에 점이나 글자) 뽑은 후보가 깨진 꼴 그대로라 바른 꼴로 받지 않는다", () => {
    const table = "Report line. Use the first row that applies.";
    const broken = [
      ["`run.notices[].kind`", "`run.notices[0.kind`", "run.notices[0.kind"],
      ["`run.notices[].kind`", "`run.notices]0].kind`", "run.notices]0].kind"],
      ["`summary.text.noBest` instead", "`summary.text.noBest[0x` instead", "summary.text.noBest[0x"],
      ["(<summary.text.best.detail>)` or `Best at", "(<summary.text.best.detail2>)` or `Best at", "summary.text.best.detail2"],
      [table, `For the first notice, read \`run.notices(0).kind\`.\n\n${table}`, "run.notices(0).kind"],
      [table, `For the first notice sentence, read \`run.text.notices(0)\`.\n\n${table}`, "run.text.notices(0)"],
      [table, `For the first notice, read run.notices(0).kind.\n\n${table}`, "run.notices(0).kind"],
      ["`run.text.notices` has the sentence", "`run.text. notices` has the sentence", "run.text. notices"],
      ["the `run.text.notices` sentence at the position", "the `run.text,notices` sentence at the position", "run.text,notices"],
      ["`summary.text.diagnosis`", "`summary.text.diagnosis.`", "summary.text.diagnosis."],
    ] as const;
    for (const [find, replace, path] of broken) {
      expect([find, body.split(find).length - 1]).toEqual([find, 1]);
      const paths = extractPaths(body.replace(find, replace));
      expect([path, paths.includes(path)]).toEqual([path, true]);
      expect([path, pathSteps(path) !== null && reaches({ summary: scoredSummary(), run: unscored.run }, path)]).toEqual([path, false]);
    }
  });
});

describe("틀 그대로", () => {
  // 사용자의 요청에서 옵션을 고르는 줄(1절), 실패할 때의 지시(2절), 터미널에 쓰는 틀(3절의 줄 목록), 결과 화면 줄·알림 줄의 표(4절)는 스킬과 프로그램이 맞춘 약속이라 그 절 안에서 글자 그대로 견준다. 바꾸려면 이 시험도 함께 고친다
  const OPTIONS = "   - Add `--no-save` only if the user asked not to save anything. Add `--no-open` only if the user asked not to open the browser. Add `--rescan` only if the user asked to read every record again.";
  const FAILING = [
    "- The shell cannot find `node`, or the program stops with exit code 2 and says Node.js 22 or later is required: tell the user the checkup needs Node.js 22 or later, then stop.",
    '- The program stops with exit code 1 and prints `{"error": {"code": ..., "message": ...}}`: tell the user the checkup stopped with an error and give `error.code`. Do not retry with other options unless the user asks.',
    "- After the program fails, your whole reply is one line as Chunsik with the error face `(;_;)`. Do not guess the cause, and do not add anything the program did not print, such as the options you passed, files, or what to do next.",
  ].join("\n");
  const LINES = [
    "1. Start, before running: `📋 춘삼이 (o_o)  기록을 읽고 있습니다. 많으면 1~2분 걸립니다.` or `📋 Chunsam (o_o)  Reading your records. This can take a minute or two.`",
    "2. Result.",
    '   - With an AQ: `📋 춘삼이 <face>  점검 끝! AQ <summary.aq> · <summary.grade>등급 「<summary.text.grade>」` or `📋 Chunsam <face>  Checkup done! AQ <summary.aq> · Grade <summary.grade> "<summary.text.grade>"`.',
    "   - Without an AQ: `📋 춘삼이 (o_o)  점검 끝! <the summary.text.notices sentence whose summary.notices kind is score_withheld>` or the same with `Chunsam` and `Checkup done!`. Then, indented, `summary.text.diagnosis`.",
    "3. Best, indented: `가장 잘하는 것  <summary.text.best.title> (<summary.text.best.detail>)` or `Best at  <summary.text.best.title> (<summary.text.best.detail>)`. If `summary.text.best` is null, write `summary.text.noBest` instead, or nothing if that is null too.",
    "4. Fix first: only the first item of `summary.text.fixFirst`, as `🔧 춘식이 (-_-)9 먼저 고칠 것  <summary.text.fixFirst[0].title> (<summary.text.fixFirst[0].detail>)` or `🔧 Chunsik (-_-)9 Fix first  <summary.text.fixFirst[0].title> (<summary.text.fixFirst[0].detail>)`. If `summary.text.fixFirst` is empty and `summary.text.noFixFirst` is not null, write `📋 춘삼이 (^_^)b <summary.text.noFixFirst>` or `📋 Chunsam (^_^)b <summary.text.noFixFirst>`. If both are empty, skip this line.",
    "5. Report line, indented, from section 4.",
    "6. Notice line, indented, from section 4. At most one.",
  ].join("\n");
  const TABLES = [
    "Report line. Use the first row that applies.",
    "",
    "| When | Write |",
    "|---|---|",
    "| `summary.reportPath` is null | the sentence of `report_unwritten`. There is no report page this time |",
    "| `report_unopened` is in the notices | the sentence of `report_unopened`, then `summary.reportPath` |",
    "| You ran with `--no-open` | `결과 화면: <summary.reportPath>` or `Report page: <summary.reportPath>` |",
    "| Otherwise | `결과 화면을 열었습니다.` or `Opened the report page.` |",
    "",
    "Notice line. Find the first kind in this table that is in the notices and do what its row says. Write no other notice.",
    "",
    "| Kind | Notice line |",
    "|---|---|",
    "| `report_failed` | the sentence of `report_failed` |",
    "| `save_failed` | the sentence of `save_failed` |",
    "| `result_unwritten` | the sentence of `result_unwritten` |",
    "| `not_saved` | the sentence of `not_saved`, unless the user asked not to save |",
    "| `report_unwritten` | none (the report line already says it) |",
    "| `report_unopened` | none (the report line already says it) |",
    "| `prune_failed` | none |",
    "| `prune_skipped` | none |",
  ].join("\n");

  /** 그 절 안에 블록이 몇 번 있는지 센다. 다른 절에 같은 글을 남겨도 세지 않는다 */
  const countIn = (title: string, block: string): number => section(title).split(block).length - 1;

  it("본문에 HTML 주석이 없다(주석 안에 남긴 옛 문구가 글자 비교를 속이지 않게)", () => {
    expect(body).not.toContain("<!--");
  });

  it("1절의 옵션을 고르는 줄이 1절 안에 한 번, 글자 그대로 있다", () => {
    expect(countIn("## 1. Run the checkup", `\n${OPTIONS}\n`)).toBe(1);
  });

  it("2절의 실패할 때의 지시가 2절 안에 한 번, 글자 그대로 있다", () => {
    expect(countIn("## 2. When the program fails", `\n${FAILING}\n`)).toBe(1);
  });

  it("3절의 줄 목록이 3절 안에 한 번, 글자 그대로 있다", () => {
    expect(countIn("## 3. What to tell the user", LINES)).toBe(1);
  });

  it("4절의 두 표가 4절 안에 한 번, 글자 그대로 있다", () => {
    expect(countIn("## 4. The report page and notices", TABLES)).toBe(1);
  });
});

describe("틀의 칸 짝", () => {
  const count = (fragment: string): number => body.split(fragment).length - 1;

  it("두 언어의 틀마다 결과 줄은 AQ와 등급과 별명의 자리를, 가장 잘하는 것과 먼저 고칠 것은 제목과 덧붙이는 말의 자리를 바르게 짝짓는다", () => {
    expect(count("AQ <summary.aq> · <summary.grade>등급 「<summary.text.grade>」")).toBe(1);
    expect(count('AQ <summary.aq> · Grade <summary.grade> "<summary.text.grade>"')).toBe(1);
    expect(count("<summary.text.best.title> (<summary.text.best.detail>)")).toBe(2);
    expect(count("<summary.text.fixFirst[0].title> (<summary.text.fixFirst[0].detail>)")).toBe(2);
    expect(count("(^_^)b <summary.text.noFixFirst>")).toBe(2);
  });
});

describe("알림 표", () => {
  /** 알림 종류는 두 글자 넘는 소문자 마디를 밑줄로 이은 낱말이다(얼굴 (o_o)의 o_o 같은 한 글자 마디는 아니다) */
  const kindsIn = (text: string): string[] => [...new Set([...text.matchAll(/\b([a-z]{2,}(?:_[a-z]{2,})+)\b/g)].map((match) => match[1]!))];
  const notices = section("## 4. The report page and notices");

  it("본문이 말하는 알림 종류는 프로그램이 내는 종류다", () => {
    const known = new Set<string>([...RUN_NOTICE_KINDS, ...NOTICE_KINDS]);
    for (const kind of kindsIn(body)) expect([kind, known.has(kind)]).toEqual([kind, true]);
    expect(kindsIn(section("## 3. What to tell the user"))).toEqual(["score_withheld"]);
  });

  it("결과 화면 줄의 표는 맞는 첫 행을 쓰고, 알림 종류가 조건인 행은 그 종류의 문장을 쓴다", () => {
    const rows = tableRows(notices, "| When | Write |");
    expect(rows.map((row) => row[0])).toEqual(["`summary.reportPath` is null", "`report_unopened` is in the notices", "You ran with `--no-open`", "Otherwise"]);
    expect(rows[0]![1]).toMatch(/^the sentence of `report_unwritten`\./);
    expect(rows[1]![1]).toBe("the sentence of `report_unopened`, then `summary.reportPath`");
    for (const [when, write] of rows) {
      const conditions = kindsIn(when!);
      if (conditions.length > 0) expect([when, kindsIn(write!)]).toEqual([when, conditions]);
    }
  });

  it("알림 줄의 표는 실행 알림 여덟을 한 번씩 우선순위대로 두고, 행마다 그 종류의 문장을 쓰거나 아무것도 쓰지 않는다", () => {
    const rows = tableRows(notices, "| Kind | Notice line |");
    expect(RUN_NOTICE_KINDS).toHaveLength(8);
    expect(rows.map((row) => row[0])).toEqual(["`report_failed`", "`save_failed`", "`result_unwritten`", "`not_saved`", "`report_unwritten`", "`report_unopened`", "`prune_failed`", "`prune_skipped`"]);
    expect(new Set(rows.map((row) => row[0]!.slice(1, -1)))).toEqual(new Set(RUN_NOTICE_KINDS));
    for (const [kindCell, line] of rows) {
      const kind = kindCell!.slice(1, -1);
      const writes = ["report_failed", "save_failed", "result_unwritten", "not_saved"].includes(kind);
      expect([kind, writes ? line!.startsWith(`the sentence of \`${kind}\``) : line!.startsWith("none")]).toEqual([kind, true]);
      expect([kind, kindsIn(line!)]).toEqual([kind, writes ? [kind] : []]);
    }
  });
});

describe("말하는 쪽과 얼굴", () => {
  const CHUNSAM_FACES = ["(o_o)", "(^o^)", "(^_^)b", "(O_O)!"];
  const CHUNSIK_FACES = ["(-_-)9", "(>_<)", "(^_^)v", "(;_;)"];

  it("상황 표는 설계 15와 「4단계 계획에서 보완」 3번의 화자와 얼굴 그대로다", () => {
    expect(tableRows(body, "| Situation | Speaker | Face |")).toEqual([
      ["Starting the checkup", "Chunsam", "`(o_o)`"],
      ["Result with `summary.tier` 3 to 5", "Chunsam", "`(^o^)`"],
      ["Result with `summary.tier` 1 or 2", "Chunsam", "`(O_O)!`"],
      ["Result without an AQ (`summary.aq` is null)", "Chunsam", "`(o_o)`"],
      ["Nothing to fix (`summary.text.noFixFirst`)", "Chunsam", "`(^_^)b`"],
      ["Fix first", "Chunsik", "`(-_-)9`"],
      ["Error", "Chunsik", "`(;_;)`"],
    ]);
  });

  it("틀의 줄마다 춘삼이(📋)는 점검 쪽 얼굴, 춘식이(🔧)는 정비 쪽 얼굴만 쓰고, 시작·칭찬·먼저 고칠 것의 줄은 그 상황의 얼굴이다(결과 줄의 얼굴을 고르는 자리는 <face>다)", () => {
    // 틀은 백틱 안의 글이다. 백틱 밖의 소개 문장(📋 Chunsam (춘삼이) …)은 틀이 아니다
    const frames = [...body.matchAll(/`([^`\n]+)`/g)].map((match) => match[1]!).filter((frame) => /(📋|🔧) (춘삼이|Chunsam|춘식이|Chunsik) /.test(frame));
    expect(frames.length).toBeGreaterThan(5);
    for (const frame of frames) {
      const [, icon, name, face] = /(📋|🔧) (춘삼이|Chunsam|춘식이|Chunsik) (\S+)/.exec(frame)!;
      const chunsam = name === "춘삼이" || name === "Chunsam";
      expect([frame, icon]).toEqual([frame, chunsam ? "📋" : "🔧"]);
      expect([frame, (chunsam ? [...CHUNSAM_FACES, "<face>"] : CHUNSIK_FACES).includes(face!)]).toEqual([frame, true]);
      const expected = /기록을 읽고|Reading your records/.test(frame) ? "(o_o)" : frame.includes("summary.text.noFixFirst") ? "(^_^)b" : frame.includes("summary.text.fixFirst[0]") ? "(-_-)9" : null;
      if (expected !== null) expect([frame, face]).toEqual([frame, expected]);
    }
  });
});

describe("실패할 때", () => {
  it("node가 없거나 Node.js 22 미만(종료 코드 2)이면 22 이상이 필요하다고 알리고, 오류로 멈추면(종료 코드 1) error.code를 알린다", () => {
    // 실패의 절 안에서, 조건(종료 코드)과 같은 줄의 "tell the user" 뒤에 알릴 말이 와야 한다. 조건을 설명하는 앞부분의 같은 낱말로는 통과하지 않는다
    const failing = section("## 2. When the program fails");
    expect(failing).toMatch(/exit code 2[^\n]*tell the user[^\n]*Node\.js 22 or later/);
    expect(failing).toMatch(/exit code 1[^\n]*tell the user[^\n]*`error\.code`/);
  });
});
