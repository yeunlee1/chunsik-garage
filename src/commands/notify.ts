// aq notify on|off|status. 세션 시작 알림을 켜고 끄고 지금 상태를 알린다. 켤 때 알림용 이름 목록을 지어 둔다(설계 7.4, 18.1, 18.2)
import type { Lang } from "../core/copy/lang.ts";
import { nextNames, notifyNames } from "../hook/notify.ts";
import { openState } from "../state/next-state.ts";
import { saveState } from "../state/state.ts";

export interface NotifyOptions {
  env: Record<string, string | undefined>;
  homedir: string;
  stateDir: string;
  lang: Lang;
}

export interface NotifyOutcome {
  notify: { on: boolean; lang: Lang };
  lastCheckupAt: string | null;
  run: { text: string };
}

const COPY = {
  en: {
    on: "Session start notices are on. When 7 days pass after the last checkup or something new is installed, a Claude Code session shows one line when it starts. Codex has no notices.",
    off: "Session start notices are off.",
    statusOn: "Session start notices are on.",
    statusOff: "Session start notices are off.",
  },
  ko: {
    on: "세션 시작 알림을 켰습니다. 마지막 점검 뒤 7일이 지나거나 새로 깐 것이 있으면 Claude Code 세션을 시작할 때 한 줄로 알립니다. Codex에는 알림이 없습니다.",
    off: "세션 시작 알림을 껐습니다.",
    statusOn: "세션 시작 알림이 켜져 있습니다.",
    statusOff: "세션 시작 알림이 꺼져 있습니다.",
  },
} as const;

const failure = (code: string, message: string): Error => Object.assign(new Error(message), { code });

export async function runNotify(action: "on" | "off" | "status", options: NotifyOptions): Promise<NotifyOutcome> {
  const opened = await openState(options.stateDir);
  // 깨진 상태 파일을 새 상태로 덮으면 관측 기록이 사라진다. 점검이 맞춘 뒤에 다시 하게 한다
  if (opened.broken && action !== "status") throw failure("state-broken", "the state file could not be read; run a checkup first");
  const { state } = opened;
  if (action === "on") {
    state.notify = { on: true, lang: options.lang, names: nextNames(state.notify?.names ?? null, notifyNames(options.env, options.homedir)) };
    await saveState(options.stateDir, state);
  } else if (action === "off" && state.notify !== null && !opened.fresh) {
    state.notify = { ...state.notify, on: false };
    await saveState(options.stateDir, state);
  }
  const on = state.notify?.on === true;
  const text = action === "on" ? COPY[options.lang].on : action === "off" ? COPY[options.lang].off : on ? COPY[options.lang].statusOn : COPY[options.lang].statusOff;
  return { notify: { on, lang: state.notify?.lang ?? options.lang }, lastCheckupAt: state.lastCheckupAt, run: { text } };
}
