// 세션 시작 훅의 입구. hooks/session-start.mjs로 묶인다. 알릴 것이 있을 때만 한 줄의 JSON을 내고, 어떤 경우에도 0으로 끝난다(설계 18.2)
import { homedir } from "node:os";
import { sessionStart } from "./notify.ts";

const line = sessionStart(process.env, homedir(), Date.now());
if (line !== null) process.stdout.write(`${line}\n`);
