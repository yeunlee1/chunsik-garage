// 춘식이 정비소 AQ 점검 실행 파일. src/를 묶은 빌드 결과라 직접 고치지 않는다.

// src/version.ts
var PROGRAM_VERSION = "0.1.0";

// src/cli.ts
function nodeMajorOk(version) {
  const major = Number(version.replace(/^v/, "").split(".")[0]);
  return Number.isInteger(major) && major >= 22;
}
async function main(argv) {
  if (!nodeMajorOk(process.version)) {
    process.stderr.write(`Node.js 22 or later is required (found ${process.version}).
`);
    return 2;
  }
  const [command] = argv;
  if (command === "--version" || command === "version") {
    process.stdout.write(`${PROGRAM_VERSION}
`);
    return 0;
  }
  process.stderr.write(`Unknown command: ${command ?? "(none)"}
`);
  return 64;
}

// src/entry.ts
process.exitCode = await main(process.argv.slice(2));
