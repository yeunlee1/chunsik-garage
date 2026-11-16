// 작업 하나를 파일마다 적용한다. 바꾸기 전 검사(16.3), 파일마다의 차례(16.5의 3.3~3.10), 되돌리기의 지금 값 확인(16.6)이고, 적용과 되돌리기가 같이 쓴다(「6단계 2부 계획 전 결정」 5·8번)
import { stat } from "node:fs/promises";
import { normalizePath } from "../adapters/claude/locate.ts";
import { blockOf, fingerprintOf, sameSlot, slotOf, type TargetRead } from "./items.ts";
import { editJson, jsonMeaningOk, type JsonOp } from "./json-edit.ts";
import { editToml, tomlMeaningOk, type TomlOp } from "./toml-edit.ts";
import { writeDurable, type TuneWork, type WorkItem } from "./work.ts";

export interface EngineIo {
  read(path: string): Promise<TargetRead>;
  /** 후보를 임시 파일에 쓰고 이름을 바꿔 원본을 갈아 끼운다 */
  replace(path: string, data: string): Promise<void>;
  /** 작업 기록을 쓴다. 상태가 바뀔 때마다 부른다 */
  save(work: TuneWork): Promise<void>;
  /** 바꾸기 바로 앞에서 지문을 다시 보기 전이다. 시험이 다른 프로그램의 끼어듦을 흉내 낸다 */
  beforeRecheck?(path: string): Promise<void>;
  /** 갈아 끼운 뒤 다시 읽기 전이다 */
  afterReplace?(path: string): Promise<void>;
}

/** 원본의 권한 비트를 지켜 갈아 끼운다(POSIX). 없던 파일은 기본 권한이다 */
export async function replaceSetting(path: string, data: string): Promise<void> {
  const mode = await stat(path).then(
    (info) => info.mode & 0o7777,
    () => undefined,
  );
  await writeDurable(path, data, mode);
}

/** 갈아 끼운 뒤 다시 읽으니 후보와 다른 파일. 누군가 갈아 끼운 뒤에 다시 쓴 것이다(16.5의 3.9) */
export type EngineNotice = { kind: "overwritten"; path: string };

const fingerprintRead = (read: TargetRead): string | null | undefined => (read.status === "ok" ? fingerprintOf(read.bytes) : read.status === "missing" ? null : undefined);

function jsonOpOf(item: WorkItem): JsonOp {
  const { key, after } = item;
  if (key.kind === "json-list-add") return { op: after.present ? "append" : "remove", parent: key.parent, entry: key.entry };
  if (key.kind === "json-entry") return after.present ? { op: "set", parent: key.parent, name: key.name, value: after.value as string | boolean } : { op: "delete", parent: key.parent, name: key.name };
  throw new Error("JSON 자리가 아니다");
}

function tomlOpOf(item: WorkItem): TomlOp {
  if (item.key.kind !== "toml-table-key") throw new Error("TOML 자리가 아니다");
  return item.after.present ? { op: "set", table: item.key.table, value: item.after.value as boolean } : { op: "delete", table: item.key.table };
}

/** 그 파일의 항목을 모두 담은 후보 글(16.3의 「파일 하나는 한 번만 바꾼다」). 짓지 못하거나 뜻이 승인받은 변경과 다르면 null이다 */
function candidateOf(original: string | null, items: readonly WorkItem[]): string | null {
  if (items[0]!.key.kind === "toml-table-key") {
    if (original === null) return null;
    const ops = items.map(tomlOpOf);
    const text = editToml(original, ops);
    return text !== null && tomlMeaningOk(original, text, ops) ? text : null;
  }
  const ops = items.map(jsonOpOf);
  const text = editJson(original, ops);
  return text !== null && jsonMeaningOk(original, text, ops) ? text : null;
}

/**
 * 작업의 예정 항목을 파일마다 적용한다. 파일은 정규화한 경로의 차례이고, 한 파일에서 걸려도 다른 파일은 계속한다.
 * planned를 주면(적용) 파일의 지문이 계획 때와 같아야 하고, 바꾸기 전 값을 그 바이트로 적는다. null이면(되돌리기) 항목마다 지금 값이 before(그 적용이 쓴 값)와 같아야 한다
 */
export async function runFiles(work: TuneWork, io: EngineIo, planned: ReadonlyMap<string, string | null> | null): Promise<EngineNotice[]> {
  const notices: EngineNotice[] = [];
  const files = [...work.files].sort((a, b) => (normalizePath(a.path) < normalizePath(b.path) ? -1 : 1));
  for (const file of files) {
    const items = work.items.filter((item) => item.file === file.path && item.state === "planned");
    if (items.length === 0) continue;
    const mark = async (list: readonly WorkItem[], state: WorkItem["state"], reason: string | null): Promise<void> => {
      for (const item of list) {
        item.state = state;
        item.reason = reason;
      }
      await io.save(work);
    };
    const read = await io.read(file.path);
    const fingerprint = fingerprintRead(read);
    if (fingerprint === undefined) {
      await mark(items, "rejected", "file-unreadable");
      continue;
    }
    file.before = fingerprint;
    if (planned !== null && planned.get(file.path) !== fingerprint) {
      await mark(items, "not_applied", "changed-since-plan");
      continue;
    }
    // 고칠 수 있는 모양과 보통 파일인지는 그 순간의 바이트로 다시 본다(16.3의 앞 두 줄). 걸린 항목만 빼고 같은 파일의 다른 항목은 계속한다
    const ready: WorkItem[] = [];
    for (const item of items) {
      const block = blockOf(read, item.key);
      const slot = slotOf(read, item.key);
      if (block !== null || slot === null) {
        item.state = "rejected";
        item.reason = block ?? "parent-shape";
      } else if (sameSlot(slot, item.after)) {
        // 이미 바꿀 값이면 쓰지 않는다. 되돌리기에서는 사용자가 직접 원래 값으로 돌려놓은 경우다(0.1.1)
        item.state = "not_applied";
        item.reason = "already-set";
      } else if (planned === null && !sameSlot(slot, item.before)) {
        // 되돌리기: 적용한 뒤 그 값이 바뀌었으면 덮어쓰지 않는다(16.6)
        item.state = "not_applied";
        item.reason = "changed-since-apply";
      } else {
        if (planned !== null) item.before = slot;
        ready.push(item);
      }
    }
    if (ready.length === 0) {
      await io.save(work);
      continue;
    }
    const candidate = candidateOf(read.status === "ok" ? read.bytes.toString("utf8") : null, ready);
    if (candidate === null) {
      await mark(ready, "rejected", "check-failed");
      continue;
    }
    file.candidate = fingerprintOf(Buffer.from(candidate, "utf8"));
    await mark(ready, "writing", null);
    // 바꾸기 바로 앞에서 원본의 지문을 한 번 더 본다(16.5의 3.7)
    await io.beforeRecheck?.(file.path);
    if (fingerprintRead(await io.read(file.path)) !== fingerprint) {
      await mark(ready, "not_applied", "changed-before-write");
      continue;
    }
    try {
      await io.replace(file.path, candidate);
    } catch (error) {
      await mark(ready, "not_applied", (error as NodeJS.ErrnoException).code ?? "write-failed");
      continue;
    }
    await mark(ready, "written", null);
    await io.afterReplace?.(file.path);
    if (fingerprintRead(await io.read(file.path)) !== file.candidate) notices.push({ kind: "overwritten", path: file.path });
  }
  return notices;
}
