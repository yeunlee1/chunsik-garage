// 버전이 쓰이는 곳이 모두 같은지 본다. npm run check가 마지막에 돌린다(설계 7.1)
import { readVersions, versionProblems } from "./version-scan.mjs";

const problems = versionProblems(readVersions(process.cwd()));
for (const problem of problems) console.error(problem);
if (problems.length > 0) process.exit(1);
console.log("버전 검사 통과");
