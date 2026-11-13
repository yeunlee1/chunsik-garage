// core가 순수한지 본다. 파일을 열지 않고, 시계와 난수를 읽지 않고, Node.js에만 있는 것을 쓰지 않는다. 글로 한 번 보고, 빈 실행 환경에서 실제로 돌려서 한 번 더 본다. 검사가 잡는지도 본다(설계 7.2)
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { createContext, runInContext, type Context } from "node:vm";
import { buildSync, transformSync } from "esbuild";
import { describe, expect, it } from "vitest";
import { evaluate } from "../../src/core/evaluate.ts";
import { PERSONAS, personaInput } from "../helpers/personas.ts";

const ROOT = resolve(import.meta.dirname, "..", "..");
const CORE = join(ROOT, "src", "core");

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? tsFiles(path) : name.endsWith(".ts") ? [path] : [];
  });
}

/** 묶을 것. 파일들이거나, core의 파일 하나인 것처럼 넣는 글이다(검사가 잡는지 볼 때 쓴다) */
type Entry = { files: string[] } | { source: string };
const entryOf = (entry: Entry) =>
  "files" in entry ? { entryPoints: entry.files } : { stdin: { contents: entry.source, resolveDir: CORE, sourcefile: join(CORE, "probe.ts"), loader: "ts" as const } };

interface Reach {
  /** 값으로 가져오는 모듈을 끝까지 따라가 닿는 파일(저장소 뿌리 기준 경로) */
  files: string[];
  /** 저장소 밖의 것(Node.js 모듈, 바깥 패키지)을 값으로 가져오는 자리. '<파일> ← <모듈>' */
  outside: string[];
}

/**
 * 진입점에서 값으로 가져오는 모듈을 끝까지 따라간다. 가져오기 문법은 묶는 도구(esbuild)가 읽는다.
 * 그래서 따옴표의 종류, 다시 내보내기, 동적 가져오기, require를 가리지 않는다. 타입만 가져오는 것은 실행할 때 지워지므로 따라가지 않는다.
 */
function follow(entry: Entry): Reach {
  const result = buildSync({
    ...entryOf(entry),
    absWorkingDir: ROOT,
    bundle: true,
    write: false,
    metafile: true,
    format: "esm",
    platform: "neutral",
    // 상대 경로가 아닌 것은 모두 저장소 밖의 것으로 남긴다
    packages: "external",
    outdir: "unused",
    logLevel: "silent",
  });
  const inputs = Object.entries(result.metafile.inputs);
  return {
    files: inputs.map(([path]) => path).sort(),
    outside: inputs.flatMap(([path, input]) => input.imports.filter((item) => item.external === true).map((item) => `${path} ← ${item.path}`)).sort(),
  };
}

/**
 * 이름이 나오기만 해도 걸리는 것. Node.js와 브라우저의 전역, 시계와 난수와 바깥에 닿는 것, 글을 실행하는 것(Function)과 값에서 만든 이를 꺼내는 길(constructor),
 * 오류의 스택(실행 환경의 파일 경로와 호출 계층이 든다)과 실행 파일의 위치다. 그래서 core에는 생성자 메서드가 있는 클래스와 stack이라는 이름을 쓰지 못한다
 */
const FORBIDDEN_NAMES = [
  ...["process", "performance", "globalThis", "require", "eval", "Function", "constructor", "crypto", "console", "navigator", "fetch"],
  ...["setTimeout", "setInterval", "setImmediate", "queueMicrotask", "Buffer", "Temporal", "ShadowRealm"],
  ...["stack", "captureStackTrace", "prepareStackTrace", "stackTraceLimit", "__dirname", "__filename"],
];

/** 날짜 글에 시간대가 적혀 있다. 날짜만 적은 글은 UTC로 풀리고, 끝에 Z나 +09:00 같은 것을 적은 글은 그 시간대로 풀린다. 그 밖의 글은 실행 환경의 시간대로 풀린다 */
const zonedText = (text: string): boolean => /^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(text) || /(?:Z|[+-]\d{2}:?\d{2})$/.test(text);

/** 여는 괄호로 시작하는 글에서, 그 괄호가 닫히기 전에 바로 안쪽의 쉼표가 있는지. 따옴표 안과 더 안쪽의 괄호는 건너뛴다 */
function hasSecondArgument(call: string): boolean {
  let depth = 0;
  let quote: string | null = null;
  for (let i = 0; i < call.length; i++) {
    const ch = call[i]!;
    if (quote !== null) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'" || ch === "`") quote = ch;
    else if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") {
      if (--depth === 0) return false;
    } else if (ch === "," && depth === 1) return true;
  }
  return false;
}

/** 여는 괄호로 시작하는 글의 첫 인자가 글자 그대로 적힌 날짜 글이면 그 글을, 아니면 null을 낸다 */
const firstTextArgument = (call: string): string | null => /^\s*\(\s*(["'`])([^"'`\\]*)\1/.exec(call)?.[2] ?? null;

/**
 * 글로 보는 검사. 주석과 타입을 지운 코드에서 시계와 실행 환경을 읽는 흔한 꼴을 찾는다.
 * 전역을 허용한 꼴로만 쓰게 해서, 별명을 붙이거나 구조 분해로 꺼내 돌려 쓰는 것도 걸리게 한다. 글자 안의 낱말도 걸린다. 엄한 쪽이다.
 * 글로는 모든 꼴을 막지 못한다. 실제로 읽는지는 아래의 sandboxed가 돌려서 본다.
 */
function leaksOf(source: string): string[] {
  const code = transformSync(source, { loader: "ts", legalComments: "none" }).code;
  const found = new Set<string>();
  for (const match of code.matchAll(/\bDate\b/g)) {
    const before = code.slice(0, match.index);
    const after = code.slice(match.index + "Date".length);
    // 받아 온 시각을 다루는 꼴만 허용한다. Date.UTC(...), Date.parse(...), 인자가 하나이고 눈에 보이는 new Date(...).
    // 펼친 인자는 비어 있을 수 있고, 인자가 둘 이상이면 로컬 시각으로 만든다. 글자 그대로 적은 날짜 글에는 시간대가 있어야 한다
    const parse = /^\.parse(\s*\(.*)$/s.exec(after);
    const made = /\bnew\s+$/.test(before) && /^\s*\(\s*[^)\s.]/.test(after) && !hasSecondArgument(after.trimStart());
    const text = parse !== null ? firstTextArgument(parse[1]!) : made ? firstTextArgument(after) : null;
    const allowed = (/^\.UTC\s*\(/.test(after) || parse !== null || made) && (text === null || zonedText(text));
    if (!allowed) found.add("Date");
  }
  // Math는 점으로 이어 부르는 꼴만 허용하고 난수는 허용하지 않는다
  if (/\bMath\b(?!\s*\.\s*(?!random\b)[A-Za-z])/.test(code)) found.add("Math");
  // 날짜 꼴에 날짜를 주지 않으면 지금 시각을 쓴다
  if (/\.format(?:ToParts)?\s*\(\s*\)/.test(code)) found.add("인자 없는 format");
  for (const name of FORBIDDEN_NAMES) if (new RegExp(`\\b${name}\\b`).test(code)) found.add(name);
  // 이름을 계산해서 가져오는 것은 따라갈 수 없으므로 동적 가져오기는 꼴 자체를 허용하지 않는다
  if (/\bimport\s*\(/.test(code)) found.add("import()");
  // 실행 파일의 위치(import.meta.url, import.meta.dirname)는 실행 환경마다 다르다
  if (/\bimport\s*\.\s*meta\b/.test(code)) found.add("import.meta");
  return [...found].sort();
}

/**
 * 빈 실행 환경을 꾸미는 글. 그 환경 안에서 돈다. 새 실행 환경에는 Node.js의 전역(process, require, crypto, performance, 타이머)이 처음부터 없다.
 * 언어에 든 것 가운데 시계, 난수, 실행 환경의 시간대와 로캘을 읽는 것은 부르면 던지게 바꾼다. 받아 온 시각을 다루는 것은 그대로 둔다.
 * 아는 것을 막아 둔 것이다. 언어의 기능을 다 훑은 것은 아니어서 막지 못한 것이 더 있을 수 있다.
 */
const GUARD = String.raw`(() => {
  const refuse = (what) => function () { throw new Error("순수하지 않다: " + what); };
  // 오류의 스택에는 실행 환경의 파일 경로와 호출 계층이 든다. 스택을 읽는 순간 던지게 한다. 오류를 만들고 던지고 메시지를 읽는 것은 그대로다
  Object.defineProperty(Error, "prepareStackTrace", { value: refuse("오류의 스택"), writable: false, configurable: false });
  const RealDate = Date;
  RealDate.now = refuse("Date.now");
  // 시간대를 적지 않은 날짜 글은 실행 환경의 시간대로 풀린다. 날짜만 적은 글(UTC로 푼다)과, 끝에 Z나 +09:00 같은 시간대를 적은 글만 받는다
  const zoned = (text) => /^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(text) || /(?:Z|[+-]\d{2}:?\d{2})$/.test(text);
  const unzoned = (value) => typeof value === "string" && !zoned(value);
  const realParse = RealDate.parse;
  RealDate.parse = function (text) {
    if (typeof text !== "string" || unzoned(text)) throw new Error("순수하지 않다: 시간대를 적지 않은 날짜 글");
    return realParse(text);
  };
  const LOCAL = ["getDate", "getDay", "getFullYear", "getHours", "getMilliseconds", "getMinutes", "getMonth", "getSeconds", "getTimezoneOffset", "getYear",
    "setDate", "setFullYear", "setHours", "setMilliseconds", "setMinutes", "setMonth", "setSeconds", "setYear",
    "toDateString", "toLocaleDateString", "toLocaleString", "toLocaleTimeString", "toString", "toTimeString"];
  for (const name of LOCAL) RealDate.prototype[name] = refuse("Date.prototype." + name);
  const GuardedDate = new Proxy(RealDate, {
    construct(target, args, newTarget) {
      if (args.length === 0) throw new Error("순수하지 않다: 인자 없는 new Date");
      if (args.length === 1 && unzoned(args[0])) throw new Error("순수하지 않다: 시간대를 적지 않은 날짜 글");
      // 연, 월, 일을 따로 주면 실행 환경의 시간대의 시각으로 만든다
      if (args.length > 1) throw new Error("순수하지 않다: 로컬 시각으로 만든 날짜");
      return Reflect.construct(target, args, newTarget === GuardedDate ? target : newTarget);
    },
    apply() { throw new Error("순수하지 않다: Date()"); },
  });
  RealDate.prototype.constructor = GuardedDate;
  globalThis.Date = GuardedDate;

  Math.random = refuse("Math.random");

  const RealFormat = Intl.DateTimeFormat;
  const realParts = RealFormat.prototype.formatToParts;
  RealFormat.prototype.formatToParts = function (date) {
    if (date === undefined) throw new Error("순수하지 않다: 날짜 없는 formatToParts");
    return realParts.call(this, date);
  };
  const realFormat = Object.getOwnPropertyDescriptor(RealFormat.prototype, "format").get;
  Object.defineProperty(RealFormat.prototype, "format", {
    get() {
      const format = realFormat.call(this);
      return (date) => {
        if (date === undefined) throw new Error("순수하지 않다: 날짜 없는 format");
        return format(date);
      };
    },
  });
  RealFormat.prototype.resolvedOptions = refuse("resolvedOptions");
  // 지원하는 로캘을 묻는 것은 막는다. 막는 글이 쓸 것은 그 전에 챙겨 둔다
  const realSupported = RealFormat.supportedLocalesOf;
  RealFormat.supportedLocalesOf = refuse("Intl.DateTimeFormat.supportedLocalesOf");
  const made = (args) => {
    const locales = args[0];
    const options = args[1];
    if (options === undefined || options === null || options.timeZone === undefined) throw new Error("순수하지 않다: 시간대를 주지 않은 Intl.DateTimeFormat");
    // 로캘을 주지 않았거나, 빈 목록으로 줬거나, 준 로캘 가운데 이 실행 환경이 아는 것이 하나도 없으면 실행 환경의 로캘로 돌아간다. 로캘을 적었다는 것만으로는 모자라다
    if (realSupported.call(RealFormat, locales, { localeMatcher: options.localeMatcher }).length === 0) throw new Error("순수하지 않다: 실행 환경의 로캘로 돌아가는 Intl.DateTimeFormat");
    return new RealFormat(...args);
  };
  const GuardedFormat = new Proxy(RealFormat, { construct: (_target, args) => made(args), apply: (_target, _self, args) => made(args) });
  RealFormat.prototype.constructor = GuardedFormat;
  for (const name of Object.getOwnPropertyNames(Intl)) if (typeof Intl[name] === "function") Intl[name] = refuse("Intl." + name);
  Intl.DateTimeFormat = GuardedFormat;

  for (const name of ["localeCompare", "toLocaleLowerCase", "toLocaleUpperCase"]) String.prototype[name] = refuse("String.prototype." + name);
  Number.prototype.toLocaleString = refuse("Number.prototype.toLocaleString");
  BigInt.prototype.toLocaleString = refuse("BigInt.prototype.toLocaleString");
  Array.prototype.toLocaleString = refuse("Array.prototype.toLocaleString");
  for (const name of ["console", "WebAssembly", "WeakRef", "FinalizationRegistry", "Atomics", "SharedArrayBuffer", "Temporal", "ShadowRealm"]) delete globalThis[name];
})();`;

/**
 * 돌려서 보는 검사. 진입점을 한 파일로 묶어 빈 실행 환경에서 돌리고, 내보낸 함수 하나를 JSON으로 준 인자로 부른 결과를 JSON 글로 돌려준다.
 * 가는 길에 막아 둔 것(시계, 난수, 실행 환경의 시간대와 로캘을 읽는 것)을 부르면 던진다. 글의 꼴과 상관없이 부르는 순간 걸린다.
 * 지나가지 않는 길과, 막아 두지 못한 것은 보지 못한다.
 *
 * 그 환경에는 바깥 실행 환경의 객체를 하나도 넣지 않는다. 바깥 객체가 하나라도 닿으면 그 생성자를 거슬러 올라가 바깥의 함수 생성자를 얻고,
 * 바깥에서 글을 실행해 막아 두지 않은 진짜 시계를 읽을 수 있다. 그래서 프로토타입이 없는 객체로 환경을 만들고, 인자는 글로 넣고 결과는 글로 받는다.
 * 그 환경 안에서 글을 실행하는 것(eval, 함수 생성자)도 막는다.
 */
/**
 * 빈 실행 환경에서 글을 돌린다. 그 안에서 던진 오류는 메시지만 옮겨 바깥의 오류로 바꿔 던진다.
 * 그 환경의 오류 객체가 그대로 밖으로 나오면, 시험 도구가 그 스택을 읽을 때 그 환경의 막는 글이 다시 던진다. 스택의 글이 시험 출력에 실리지도 않는다
 */
function inContext(code: string, context: Context): unknown {
  try {
    return runInContext(code, context);
  } catch (error) {
    throw new Error(String((error as { message?: unknown } | null)?.message ?? error));
  }
}

function sandboxed(entry: Entry, call: string, argJson = "null"): string {
  const bundle = buildSync({ ...entryOf(entry), absWorkingDir: ROOT, bundle: true, write: false, format: "iife", globalName: "probe", platform: "neutral", packages: "external", outdir: "unused", logLevel: "silent" });
  const context = createContext(Object.create(null), { codeGeneration: { strings: false, wasm: false } });
  inContext(GUARD, context);
  inContext(`var argJson = ${JSON.stringify(argJson)};`, context);
  inContext(bundle.outputFiles[0]!.text, context);
  return inContext(`JSON.stringify(probe.${call}(JSON.parse(argJson)))`, context) as string;
}

describe("core의 순수성", () => {
  const reach = follow({ files: tsFiles(CORE) });

  it("core의 파일을 찾았다", () => {
    expect(reach.files.filter((path) => path.startsWith("src/core/")).length).toBeGreaterThan(15);
  });
  it("core와 core가 값으로 가져오는 모듈은 Node.js 모듈이나 바깥 패키지를 값으로 가져오지 않는다", () => {
    expect(reach.outside).toEqual([]);
  });
  it("core 밖에서 값으로 가져오는 것은 날짜와 버전을 다루는 순수한 모듈 둘뿐이다", () => {
    expect(reach.files.filter((path) => !path.startsWith("src/core/"))).toEqual(["src/adapters/common/dates.ts", "src/adapters/common/version.ts"]);
  });
  it("시계를 직접 읽거나 실행 환경을 보는 글이 없다. 평가 시계는 입력으로 받는다", () => {
    const offending = reach.files.flatMap((path) => leaksOf(readFileSync(join(ROOT, path), "utf8")).map((name) => `${path}: ${name}`));
    expect(offending).toEqual([]);
  });
  it.each(["S", "A", "B", "C", "D"] as const)("시계도 난수도 Node.js의 전역도 없는 빈 실행 환경에서 평가가 끝까지 돌고 결과가 같다: 합성 사용자 %s", (grade) => {
    // 입력은 JSON으로 건넨다. 견주는 쪽도 같은 JSON에서 되살린 입력으로 평가한다
    const inputJson = JSON.stringify(personaInput(PERSONAS[grade]));
    expect(sandboxed({ files: [join(CORE, "evaluate.ts")] }, "evaluate", inputJson)).toBe(JSON.stringify(evaluate(JSON.parse(inputJson))));
  });
});

describe("순수성 검사가 실제로 잡는다", () => {
  it.each([
    ["큰따옴표로 가져온다", `import { join } from "node:path";\nexport const leak = () => join("a", "b");`],
    ["작은따옴표로 가져온다", `import { join } from 'node:path';\nexport const leak = () => join('a', 'b');`],
    ["가져와서 다시 내보낸다", `export { readFileSync as leak } from 'node:fs';`],
    ["동적으로 가져온다", `export const leak = () => import('node:fs');`],
    ["require로 가져온다", `export const leak = () => require('node:fs');`],
    ["node: 없이 가져온다", `import { readFileSync } from 'fs';\nexport const leak = readFileSync;`],
    ["바깥 패키지를 가져온다", `import { build } from 'esbuild';\nexport const leak = build;`],
    ["타입과 함께 값 자리를 남긴다", `import { type Stats } from 'node:fs';\nexport const size = (s: Stats) => s.size;`],
  ])("저장소 밖의 것을 값으로 가져오면 걸린다: %s", (_name, source) => {
    expect(follow({ source }).outside).toHaveLength(1);
  });
  it("타입만 가져오는 것과 저장소 안의 모듈은 걸리지 않는다. 안의 모듈은 끝까지 따라간다", () => {
    expect(follow({ source: `import type { Stats } from 'node:fs';\nexport const size = (s: Stats) => s.size;` })).toEqual({ files: ["src/core/probe.ts"], outside: [] });
    expect(follow({ source: `import { olderThan } from './installs/age.ts';\nexport const x = olderThan;` })).toEqual({
      files: ["src/adapters/common/dates.ts", "src/core/installs/age.ts", "src/core/probe.ts"],
      outside: [],
    });
  });
  it("안의 모듈을 거쳐 가져오는 것도 걸린다", () => {
    // 저장소의 다른 모듈(스캐너)은 Node.js 모듈을 값으로 가져온다. core가 그것을 값으로 가져오면 따라가서 잡는다
    const reach = follow({ source: `import { skillInstallKey } from '../scan/identity.ts';\nexport const x = skillInstallKey;` });
    expect(reach.files).toContain("src/scan/identity.ts");
    expect(reach.outside).not.toEqual([]);
  });

  /** [이름, 글, 글로 보는 검사가 내는 것]. 글로 보는 검사가 못 잡는 것은 빈 목록이다. 돌려서 보는 검사는 모두 잡아야 한다 */
  const LEAKS: [string, string, string[]][] = [
    ["Date.now", `export const run = () => Date.now();`, ["Date"]],
    ["인자 없는 new Date", `export const run = () => new Date().getTime();`, ["Date"]],
    ["빈 인자를 펼친 new Date", `export const run = () => new Date(...([] as [])).getTime();`, ["Date"]],
    ["시계에 별명을 붙인다", `const Clock = Date;\nexport const run = () => Clock.now();`, ["Date"]],
    ["시계를 구조 분해로 꺼낸다", `const { now } = Date;\nexport const run = () => now();`, ["Date"]],
    ["날짜에서 만든 이를 꺼내 지금 시각을 만든다", `export const run = (ms: number) => new (Object.getPrototypeOf(new Date(ms ?? 0)).constructor)().getTime();`, ["constructor"]],
    ["글을 실행해 지금 시각을 읽는다", `export const run = () => eval(["Da", "te.now()"].join(""));`, ["eval"]],
    ["함수 생성자로 글을 실행한다", `export const run = () => Function(["return Da", "te.now()"].join(""))();`, ["Function"]],
    ["전역의 생성자를 거슬러 올라가 바깥에서 글을 실행한다", `export const run = () => Function("return this")().constructor.constructor(["return ", "D", "ate.now()"].join(""))();`, ["Function", "constructor"]],
    ["전역에 물려 든 생성자를 거슬러 올라가 글을 실행한다", `export const run = () => (globalThis as unknown as { constructor: { constructor: (code: string) => () => number } }).constructor.constructor(["return Da", "te.now()"].join(""))();`, ["constructor", "globalThis"]],
    ["값의 생성자를 거슬러 올라가 글을 실행한다", `export const run = () => (0 as unknown as { constructor: { constructor: (code: string) => () => number } }).constructor.constructor(["return Da", "te.now()"].join(""))();`, ["constructor"]],
    ["날짜를 주지 않은 format", `export const run = () => new Intl.DateTimeFormat("en", { timeZone: "UTC", second: "2-digit", fractionalSecondDigits: 3 }).format();`, ["인자 없는 format"]],
    ["시간대를 주지 않은 날짜 꼴", `export const run = () => new Intl.DateTimeFormat("en-US", { year: "numeric" }).formatToParts(new Date(0)).length;`, []],
    ["실행 환경의 시간대를 묻는다", `export const run = () => new Intl.DateTimeFormat("en-US", { timeZone: "UTC" }).resolvedOptions().timeZone;`, []],
    ["로컬 시각을 읽는다", `export const run = () => new Date(0).getHours();`, []],
    ["시간대를 적지 않은 날짜 글을 푼다", `export const run = () => Date.parse("2026-11-13T00:00:00");`, ["Date"]],
    ["시간대를 적지 않은 날짜 글로 날짜를 만든다", `export const run = () => new Date("2026-11-13T00:00:00").getTime();`, ["Date"]],
    ["받아 온 글에 시간대가 없다", `export const run = (text: string) => Date.parse(text ?? "2026-11-13T00:00:00");`, []],
    ["연, 월, 일을 따로 주어 로컬 시각으로 날짜를 만든다", `export const run = () => new Date(2026, 10, 13).getTime();`, ["Date"]],
    ["오류의 스택을 읽는다", `export const run = () => new Error("synthetic").stack;`, ["stack"]],
    ["엔진이 던진 오류의 스택을 읽는다", `export const run = () => { try { return (null as unknown as { x: string }).x; } catch (error) { return (error as Error).stack; } };`, ["stack"]],
    ["이름을 계산해서 오류의 스택을 읽는다", `export const run = () => (new RangeError("x") as unknown as Record<string, unknown>)[["st", "ack"].join("")];`, []],
    ["값에 스택을 붙여 읽는다", `export const run = () => { const holder: { stack?: string } = {}; Error.captureStackTrace(holder); return holder.stack; };`, ["captureStackTrace", "stack"]],
    ["지원하는 로캘을 묻는다", `export const run = () => Intl.DateTimeFormat.supportedLocalesOf(["ko", "en"]).length;`, []],
    ["로캘을 빈 목록으로 준 날짜 꼴", `export const run = () => new Intl.DateTimeFormat([], { timeZone: "UTC", month: "long" }).formatToParts(new Date(0)).length;`, []],
    ["로캘을 주지 않은 날짜 꼴", `export const run = () => new Intl.DateTimeFormat(undefined, { timeZone: "UTC", month: "long" }).format(new Date(0));`, []],
    ["실행 환경이 지원하지 않는 로캘을 준 날짜 꼴", `export const run = () => new Intl.DateTimeFormat("zz-ZZ", { timeZone: "UTC", month: "long" }).format(new Date(0));`, []],
    ["지원하지 않는 로캘만 든 목록을 준 날짜 꼴", `export const run = () => new Intl.DateTimeFormat(["zz-ZZ", "qaa"], { localeMatcher: "lookup", timeZone: "UTC", month: "long" }).formatToParts(new Date(0)).length;`, []],
    ["Math.random", `export const run = () => Math.random();`, ["Math"]],
    ["Math에 별명을 붙인다", `const M = Math;\nexport const run = () => M.random();`, ["Math"]],
    ["crypto의 난수", `export const run = () => crypto.randomUUID();`, ["crypto"]],
    ["process", `export const run = () => process.env.HOME ?? null;`, ["process"]],
    ["process를 구조 분해로 꺼낸다", `const { env } = process;\nexport const run = () => Object.keys(env).length;`, ["process"]],
    ["performance.now", `export const run = () => performance.now();`, ["performance"]],
  ];
  it.each(LEAKS)("시계나 난수나 실행 환경을 읽는 글: %s", (_name, source, expected) => {
    expect(leaksOf(source)).toEqual(expected);
  });
  it.each(LEAKS)("빈 실행 환경에서 돌리면 던진다: %s", (_name, source) => {
    // 막아 둔 것을 불렀거나(순수하지 않다), 그 환경에 없는 전역을 찾았거나(is not defined), 글을 실행하려 했다(Code generation from strings disallowed)
    expect(() => sandboxed({ source }, "run")).toThrow(/순수하지 않다|is not defined|Code generation from strings disallowed/);
  });
  it("빈 실행 환경에서는 글을 실행하지 못한다. 시계를 읽지 않는 글이어도 같다", () => {
    expect(() => sandboxed({ source: `export const run = () => eval(["1", "+ 1"].join(" "));` }, "run")).toThrow(/Code generation from strings disallowed/);
    expect(() => sandboxed({ source: `export const run = () => Function(["return", "1"].join(" "))();` }, "run")).toThrow(/Code generation from strings disallowed/);
  });
  it("실행 파일의 위치를 읽는 것은 글로 걸린다. 빈 실행 환경에는 그 위치가 없어서 돌려서는 걸리지 않는다", () => {
    expect(leaksOf(`export const run = () => import.meta.url;`)).toEqual(["import.meta"]);
    expect(leaksOf(`export const run = () => import.meta.dirname;`)).toEqual(["import.meta"]);
    expect(leaksOf(`export const run = () => __dirname + __filename;`)).toEqual(["__dirname", "__filename"]);
    expect(sandboxed({ source: `export const run = () => typeof import.meta.url;` }, "run")).toBe(JSON.stringify("undefined"));
  });
  it("오류를 만들고 던지고 메시지를 읽는 것은 걸리지 않는다. 스택을 읽을 때만 걸린다", () => {
    const source = `export const run = (limit: number): string => { try { if (limit > 0) throw new RangeError("범위를 벗어났다"); return "지나감"; } catch (error) { return (error as Error).name + " " + (error as Error).message; } };`;
    expect(leaksOf(source)).toEqual([]);
    expect(sandboxed({ source }, "run", "1")).toBe(JSON.stringify("RangeError 범위를 벗어났다"));
  });
  it("빈 실행 환경에서 던진 오류는 메시지만 밖으로 나온다. 밖에서 그 스택을 읽어도 던지지 않고, 그 환경의 스택이 실리지 않는다", () => {
    let caught: unknown;
    try {
      sandboxed({ source: `export const run = () => { throw new TypeError("안에서 던졌다"); };` }, "run");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe("안에서 던졌다");
    expect(typeof (caught as Error).stack).toBe("string");
  });
  it("준 로캘 가운데 실행 환경이 지원하는 것이 하나라도 있으면 걸리지 않는다. 그 로캘로 꼴을 만든다", () => {
    // 지원하지 않는 로캘 뒤에 지원하는 로캘을 적으면 실행 환경의 로캘로 돌아가지 않는다. 지역을 모르는 로캘(en-ZZ)은 그 언어의 로캘로 푼다
    const source = `export const run = (ms: number) => [["zz-ZZ", "en-US"], ["en-US"], "en-US", "en-ZZ"].map((locales) => new Intl.DateTimeFormat(locales, { timeZone: "UTC", month: "long" }).format(new Date(ms)));`;
    expect(leaksOf(source)).toEqual([]);
    expect(sandboxed({ source }, "run", "0")).toBe(JSON.stringify(["January", "January", "January", "January"]));
  });
  it("이름을 계산해서 가져오는 것은 글로 걸린다. 따라갈 수 없으므로 꼴 자체를 허용하지 않는다", () => {
    expect(leaksOf(`export const run = (name: string) => import(name);`)).toEqual(["import()"]);
  });
  it("globalThis를 거쳐도 글로 걸린다", () => {
    expect(leaksOf(`export const run = () => globalThis.Date.now();`)).toEqual(["Date", "globalThis"]);
  });
  it("받아 온 시각을 다루는 꼴, 주석, 타입 자리는 걸리지 않고, 빈 실행 환경에서도 돈다", () => {
    const source = [
      "// Date.now()와 process.env는 쓰지 않는다",
      "/** new Date()도 Math.random()도 쓰지 않는다 */",
      "const partsOf = (when: Date, timeZone: string): number => new Intl.DateTimeFormat(\"en-US\", { timeZone, year: \"numeric\", month: \"2-digit\" }).formatToParts(when).length;",
      "export const run = (ms: number): string =>",
      "  new Date(Date.UTC(2026, 0, 1) + Date.parse(\"2026-01-01T00:00:00Z\") + Math.floor(ms) + Math.max(0, partsOf(new Date(ms), \"Asia/Seoul\"))).toISOString();",
    ].join("\n");
    expect(leaksOf(source)).toEqual([]);
    expect(sandboxed({ source }, "run", "1.5")).toBe(JSON.stringify(new Date(Date.UTC(2026, 0, 1) + Date.parse("2026-01-01T00:00:00Z") + 1 + 3).toISOString()));
  });
  it("시간대를 적은 날짜 글과 날짜만 적은 글은 빈 실행 환경에서도 풀린다", () => {
    const source = `export const run = () => [Date.parse("2026-11-13T00:00:00Z"), Date.parse("2026-11-13T09:00:00+09:00"), Date.parse("2026-11-13"), new Date("2026-11-13T00:00:00.000Z").getTime()];`;
    const utc = Date.UTC(2026, 10, 13);
    expect(sandboxed({ source }, "run")).toBe(JSON.stringify([utc, utc, utc, utc]));
  });
});
