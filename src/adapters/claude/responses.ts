// 응답 ID마다 남길 상태(첫 줄의 날짜, 처음 모델과 강도, 마지막 사용량·끊긴 까닭·귀속)를 숫자 배열 셋에 담는다. 응답이 100만 개여도 메모리를 묶으려는 것이다(설계 9.5, 22)
import type { LocalDate } from "../common/dates.ts";

const DATE = 0;
const MODEL = 1;
const EFFORT = 2;
const SKILL = 3;
const SERVER = 4;
const NAME_WIDTH = 5;
const USAGE_WIDTH = 5; // 입력, 캐시 읽기, 캐시 쓰기, 출력, 생각
const NONE = -1;
const SYNTHETIC = 1;
const HAS_USAGE = 2;
const LENGTH_STOP = 4;
const FIRST_CAPACITY = 1024;

export interface ResponseUsage {
  input: number;
  cacheRead: number;
  cacheWrite: number;
  output: number;
  thinking: number;
}

export interface FoldedResponse {
  date: LocalDate | null;
  synthetic: boolean;
  model: string | null;
  effort: string | null;
  lengthStop: boolean;
  usage: ResponseUsage | null;
  skill: string | null;
  mcpServer: string | null;
}

export class ResponseTable {
  private readonly rows = new Map<string, number>();
  private readonly names: string[] = [];
  private readonly nameIds = new Map<string, number>();
  private capacity = FIRST_CAPACITY;
  private nameCells = new Int32Array(NAME_WIDTH * FIRST_CAPACITY);
  private flagCells = new Uint8Array(FIRST_CAPACITY);
  private usageCells = new Float64Array(USAGE_WIDTH * FIRST_CAPACITY);

  get size(): number {
    return this.rows.size;
  }

  /** 응답 ID의 줄 번호. 처음 보는 ID면 줄을 더하고 isNew를 참으로 돌려준다. */
  row(id: string, date: LocalDate | null, synthetic: boolean): { row: number; isNew: boolean } {
    const known = this.rows.get(id);
    if (known !== undefined) return { row: known, isNew: false };
    const row = this.rows.size;
    if (row === this.capacity) this.grow();
    const base = row * NAME_WIDTH;
    this.nameCells[base + DATE] = this.nameId(date);
    this.nameCells.fill(NONE, base + MODEL, base + NAME_WIDTH);
    this.flagCells[row] = synthetic ? SYNTHETIC : 0;
    this.usageCells.fill(0, row * USAGE_WIDTH, (row + 1) * USAGE_WIDTH);
    this.rows.set(id, row);
    return { row, isNew: true };
  }

  private grow(): void {
    const capacity = Math.ceil(this.capacity * 1.5);
    const names = new Int32Array(NAME_WIDTH * capacity);
    names.set(this.nameCells);
    this.nameCells = names;
    const flags = new Uint8Array(capacity);
    flags.set(this.flagCells);
    this.flagCells = flags;
    const usage = new Float64Array(USAGE_WIDTH * capacity);
    usage.set(this.usageCells);
    this.usageCells = usage;
    this.capacity = capacity;
  }

  isSynthetic(row: number): boolean {
    return (this.flagCells[row]! & SYNTHETIC) !== 0;
  }

  /** 아직 값이 없을 때만 채운다(모델·강도는 처음 값을 쓴다). */
  fillFirst(row: number, column: "model" | "effort", value: string | null): void {
    const at = row * NAME_WIDTH + (column === "model" ? MODEL : EFFORT);
    if (value !== null && this.nameCells[at] === NONE) this.nameCells[at] = this.nameId(value);
  }

  /** 마지막 값으로 바꾼다(귀속). */
  setLast(row: number, column: "skill" | "mcpServer", value: string | null): void {
    if (value !== null) this.nameCells[row * NAME_WIDTH + (column === "skill" ? SKILL : SERVER)] = this.nameId(value);
  }

  setUsage(row: number, usage: ResponseUsage): void {
    const base = row * USAGE_WIDTH;
    this.usageCells[base] = usage.input;
    this.usageCells[base + 1] = usage.cacheRead;
    this.usageCells[base + 2] = usage.cacheWrite;
    this.usageCells[base + 3] = usage.output;
    this.usageCells[base + 4] = usage.thinking;
    this.flagCells[row] = this.flagCells[row]! | HAS_USAGE;
  }

  /** 마지막으로 적힌 끊긴 까닭이 길이 제한인지 적는다. */
  setStop(row: number, stop: string): void {
    const flags = this.flagCells[row]!;
    this.flagCells[row] = stop === "max_tokens" ? flags | LENGTH_STOP : flags & ~LENGTH_STOP;
  }

  /** 들어온 차례로 응답을 하나씩 돌려준다. */
  *fold(): Generator<FoldedResponse> {
    for (let row = 0; row < this.rows.size; row++) {
      const names = row * NAME_WIDTH;
      const usage = row * USAGE_WIDTH;
      const flags = this.flagCells[row]!;
      yield {
        date: this.name(this.nameCells[names + DATE]!),
        synthetic: (flags & SYNTHETIC) !== 0,
        model: this.name(this.nameCells[names + MODEL]!),
        effort: this.name(this.nameCells[names + EFFORT]!),
        lengthStop: (flags & LENGTH_STOP) !== 0,
        usage:
          (flags & HAS_USAGE) === 0
            ? null
            : {
                input: this.usageCells[usage]!,
                cacheRead: this.usageCells[usage + 1]!,
                cacheWrite: this.usageCells[usage + 2]!,
                output: this.usageCells[usage + 3]!,
                thinking: this.usageCells[usage + 4]!,
              },
        skill: this.name(this.nameCells[names + SKILL]!),
        mcpServer: this.name(this.nameCells[names + SERVER]!),
      };
    }
  }

  private nameId(value: string | null): number {
    if (value === null) return NONE;
    let id = this.nameIds.get(value);
    if (id === undefined) {
      id = this.names.length;
      this.names.push(value);
      this.nameIds.set(value, id);
    }
    return id;
  }

  private name(id: number): string | null {
    return id === NONE ? null : this.names[id]!;
  }
}
