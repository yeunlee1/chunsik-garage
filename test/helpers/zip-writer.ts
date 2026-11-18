// 시험용 zip 파일을 만든다. 항목마다 저장만(0)이나 deflate(8)를 고르고, ZIP64 끝 기록과 덧붙임 칸, 끝 주석을 넣을 수 있다
import { crc32, deflateRawSync } from "node:zlib";

export interface ZipItem {
  name: string;
  data: Buffer | string;
  method?: 0 | 8;
  /** 암호를 건 항목의 표시만 켠다(내용은 그대로) */
  encrypted?: boolean;
}

export interface ZipOptions {
  /** 중앙 목록의 크기·자리를 ZIP64 덧붙임 칸과 ZIP64 끝 기록으로 적는다 */
  zip64?: boolean;
  comment?: string;
}

const u16 = (value: number): Buffer => {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value);
  return buffer;
};
const u32 = (value: number): Buffer => {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value >>> 0);
  return buffer;
};
const u64 = (value: number): Buffer => {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(BigInt(value));
  return buffer;
};

export function makeZip(items: readonly ZipItem[], options: ZipOptions = {}): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const item of items) {
    const raw = Buffer.isBuffer(item.data) ? item.data : Buffer.from(item.data, "utf8");
    const method = item.method ?? 8;
    const body = method === 8 ? deflateRawSync(raw) : raw;
    const name = Buffer.from(item.name, "utf8");
    const flags = 0x0800 | (item.encrypted ? 0x0001 : 0);
    const crc = crc32(raw);
    const local = Buffer.concat([u32(0x04034b50), u16(20), u16(flags), u16(method), u16(0), u16(0), u32(crc), u32(body.length), u32(raw.length), u16(name.length), u16(0), name]);
    locals.push(local, body);
    const extra = options.zip64 ? Buffer.concat([u16(0x0001), u16(24), u64(raw.length), u64(body.length), u64(offset)]) : Buffer.alloc(0);
    const sizeField = options.zip64 ? 0xffffffff : body.length;
    const rawField = options.zip64 ? 0xffffffff : raw.length;
    const offsetField = options.zip64 ? 0xffffffff : offset;
    centrals.push(
      Buffer.concat([u32(0x02014b50), u16(45), u16(45), u16(flags), u16(method), u16(0), u16(0), u32(crc), u32(sizeField), u32(rawField), u16(name.length), u16(extra.length), u16(0), u16(0), u16(0), u32(0), u32(offsetField), name, extra]),
    );
    offset += local.length + body.length;
  }
  const central = Buffer.concat(centrals);
  const comment = Buffer.from(options.comment ?? "", "utf8");
  const parts: Buffer[] = [...locals, central];
  if (options.zip64) {
    const zip64At = offset + central.length;
    parts.push(Buffer.concat([u32(0x06064b50), u64(44), u16(45), u16(45), u32(0), u32(0), u64(items.length), u64(items.length), u64(central.length), u64(offset)]));
    parts.push(Buffer.concat([u32(0x07064b50), u32(0), u64(zip64At), u32(1)]));
    parts.push(Buffer.concat([u32(0x06054b50), u16(0), u16(0), u16(0xffff), u16(0xffff), u32(0xffffffff), u32(0xffffffff), u16(comment.length), comment]));
  } else {
    parts.push(Buffer.concat([u32(0x06054b50), u16(0), u16(0), u16(items.length), u16(items.length), u32(central.length), u32(offset), u16(comment.length), comment]));
  }
  return Buffer.concat(parts);
}
