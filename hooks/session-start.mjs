// 춘식이 정비소 세션 시작 알림. src/hook을 묶은 빌드 결과라 직접 고치지 않는다.

// src/hook/session-start.ts
import { homedir } from "node:os";

// src/hook/notify.ts
import { mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// src/core/copy/format.ts
var UNCOUNTED = "\u2014";
function groupDigits(value) {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
var SLOT = /\{([A-Za-z]+)(?::([^|{}]*)\|([^|{}]*))?\}/g;
function fill(template, values) {
  return template.replace(SLOT, (_match, name, one, other) => {
    if (!(name in values)) throw new Error(`no value for {${name}} in "${template}"`);
    const value = values[name];
    if (one !== void 0 && other !== void 0) return value === 1 ? one : other;
    if (value === null) return UNCOUNTED;
    return typeof value === "number" ? groupDigits(value) : value;
  });
}

// src/hook/notify.ts
var isMissing = (error) => {
  const code = error?.code;
  return code === "ENOENT" || code === "ENOTDIR";
};
function readObject(path) {
  try {
    const value = JSON.parse(readFileSync(path, "utf8").replace(/^﻿/, ""));
    return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
  } catch (error) {
    return isMissing(error) ? null : void 0;
  }
}
var keysOf = (value) => typeof value === "object" && value !== null && !Array.isArray(value) ? Object.keys(value) : [];
function notifyNames(env, homedir2) {
  const configDir = env.CLAUDE_CONFIG_DIR || join(homedir2, ".claude");
  const names = /* @__PURE__ */ new Set();
  let complete = true;
  try {
    for (const entry of readdirSync(join(configDir, "skills"), { withFileTypes: true })) if (entry.isDirectory() || entry.isSymbolicLink()) names.add(`skill:${entry.name}`);
  } catch (error) {
    if (!isMissing(error)) complete = false;
  }
  const settings = readObject(join(configDir, "settings.json"));
  if (settings === void 0) complete = false;
  for (const id of keysOf(settings?.enabledPlugins)) names.add(`plugin:${id}`);
  const global = readObject(env.CLAUDE_CONFIG_DIR ? join(env.CLAUDE_CONFIG_DIR, ".claude.json") : join(homedir2, ".claude.json"));
  if (global === void 0) complete = false;
  for (const name of keysOf(global?.mcpServers)) names.add(`mcp:${name}`);
  return { names: [...names].sort(), complete };
}
var HOOK_COPY = {
  en: { prefix: "\u{1F527} Chunsik: ", days: "It has been {days} days since the last checkup. Ask for an AQ checkup.", never: "There is no saved checkup yet. Ask for an AQ checkup.", fresh: "There are newly installed skills, plugins, or MCP servers. Ask for an AQ checkup." },
  ko: { prefix: "\u{1F527} \uCD98\uC2DD\uC774: ", days: "\uB9C8\uC9C0\uB9C9 \uC810\uAC80 \uB4A4 {days}\uC77C \uC9C0\uB0AC\uC2B5\uB2C8\uB2E4. AQ \uC810\uAC80\uD574 \uB2EC\uB77C\uACE0 \uB9D0\uD574 \uBCF4\uC138\uC694.", never: "\uC544\uC9C1 \uC800\uC7A5\uD55C \uC810\uAC80\uC774 \uC5C6\uC2B5\uB2C8\uB2E4. AQ \uC810\uAC80\uD574 \uB2EC\uB77C\uACE0 \uB9D0\uD574 \uBCF4\uC138\uC694.", fresh: "\uC0C8\uB85C \uAE50 \uC2A4\uD0AC\uC774\uB098 \uD50C\uB7EC\uADF8\uC778, MCP \uC11C\uBC84\uAC00 \uC788\uC2B5\uB2C8\uB2E4. AQ \uC810\uAC80\uD574 \uB2EC\uB77C\uACE0 \uB9D0\uD574 \uBCF4\uC138\uC694." }
};
var DAY = 864e5;
var KEEP_MARKERS_DAYS = 7;
function hookMessage(state, current, nowMs) {
  const notify = state.notify;
  if (notify === null || !notify.on) return null;
  const copy = HOOK_COPY[notify.lang];
  if (state.lastCheckupAt === null) return copy.prefix + copy.never;
  const days = Math.floor((nowMs - Date.parse(state.lastCheckupAt)) / DAY);
  if (days >= 7) return copy.prefix + fill(copy.days, { days });
  if (notify.names === null) return null;
  const known = new Set(notify.names);
  return current().names.some((name) => !known.has(name)) ? copy.prefix + copy.fresh : null;
}
var localDate = (nowMs) => {
  const date = new Date(nowMs);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
function sessionStart(env, homedir2, nowMs) {
  try {
    const stateDir = join(homedir2, ".chunsik-garage");
    const state = JSON.parse(readFileSync(join(stateDir, "state.json"), "utf8"));
    const message = hookMessage({ lastCheckupAt: state.lastCheckupAt ?? null, notify: state.notify ?? null }, () => notifyNames(env, homedir2), nowMs);
    if (message === null) return null;
    const dir = join(stateDir, "notified");
    mkdirSync(dir, { recursive: true });
    const today = localDate(nowMs);
    try {
      writeFileSync(join(dir, today), "", { flag: "wx" });
    } catch {
      return null;
    }
    const oldest = localDate(nowMs - KEEP_MARKERS_DAYS * DAY);
    for (const name of readdirSync(dir)) if (/^\d{4}-\d{2}-\d{2}$/.test(name) && name < oldest) unlinkSync(join(dir, name));
    return JSON.stringify({ systemMessage: message });
  } catch {
    return null;
  }
}

// src/hook/session-start.ts
var line = sessionStart(process.env, homedir(), Date.now());
if (line !== null) process.stdout.write(`${line}
`);
