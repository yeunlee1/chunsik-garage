// 결과 화면에 넣을 그림을 시험한다. 그림 폴더의 파일, 장면 고르기, 그림 폴더 찾기, data URI로 읽기와 읽지 못할 때(설계 13.3, 「3단계 계획 전 결정」의 12번)
import { readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ART_FILES, assetsDirOf, loadArt, sceneFor, stickerFor } from "../../src/report/assets.ts";
import { makeTemp, put, removeTemp } from "../helpers/temp-fs.ts";

const ROOT = resolve(import.meta.dirname, "..", "..");
const ASSETS = join(ROOT, "skills", "aq", "assets");
/** WebP 파일의 머리(RIFF ... WEBP)와 그림 크기(VP8 손실 압축의 가로·세로) */
const webpSize = (path: string): { width: number; height: number } => {
  const bytes = readFileSync(path);
  expect(bytes.subarray(0, 4).toString("latin1")).toBe("RIFF");
  expect(bytes.subarray(8, 12).toString("latin1")).toBe("WEBP");
  expect(bytes.subarray(12, 16).toString("latin1")).toBe("VP8 ");
  return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
};

describe("그림 폴더", () => {
  it("장면 일곱 장은 512px, 얼굴과 스티커 넉 장은 128px의 WebP다", () => {
    expect(Object.keys(ART_FILES).sort()).toEqual(["face", "scene-1", "scene-2", "scene-3", "scene-4", "scene-5", "scene-few-records", "scene-unreadable", "sticker-done", "sticker-fix", "sticker-good"]);
    for (const [name, file] of Object.entries(ART_FILES)) {
      const size = name.startsWith("scene") ? 512 : 128;
      expect(webpSize(join(ASSETS, file)), name).toEqual({ width: size, height: size });
    }
  });
  it("한 화면에 넣는 그림(장면 하나, 얼굴, 스티커 둘)의 WebP는 가장 큰 조합도 50,000바이트를 넘지 않는다", () => {
    const sizeOf = (name: keyof typeof ART_FILES): number => statSync(join(ASSETS, ART_FILES[name])).size;
    const scenes = (Object.keys(ART_FILES) as (keyof typeof ART_FILES)[]).filter((name) => name.startsWith("scene"));
    const largest = Math.max(...scenes.map(sizeOf)) + sizeOf("face") + sizeOf("sticker-good") + Math.max(sizeOf("sticker-fix"), sizeOf("sticker-done"));
    expect(largest).toBeLessThanOrEqual(50_000);
  });
  it("그림 이용 조건 파일에 설계의 문장이 그대로 있다(설계 7.1)", () => {
    const terms = readFileSync(join(ASSETS, "ART-LICENSE.md"), "utf8");
    expect(terms).toContain("이 도구가 만든 카드, 결과 화면, 소개 캡처에 든 그림은 그대로 공유해도 된다. 그림만 떼어 다른 데 쓰는 것은 허락하지 않는다.");
    for (const file of Object.values(ART_FILES)) expect(terms).toContain(file.replace(/-\d\.webp$/, ""));
  });
});

describe("장면과 스티커 고르기", () => {
  it("AQ를 냈으면 등급 단계의 장면이다", () => {
    for (const tier of [1, 2, 3, 4, 5]) expect(sceneFor(tier, false)).toBe(`scene-${tier}`);
    expect(sceneFor(4, true)).toBe("scene-4");
  });
  it("AQ를 내지 않았으면 기록을 읽지 못했다는 알림이 있을 때 읽지 못함, 없으면 모자람이다", () => {
    expect(sceneFor(null, true)).toBe("scene-unreadable");
    expect(sceneFor(null, false)).toBe("scene-few-records");
  });
  it("정비할 것이 있으면 고칠 것 스티커, 없으면 다 고침 스티커다", () => {
    expect(stickerFor(1)).toBe("sticker-fix");
    expect(stickerFor(0)).toBe("sticker-done");
  });
});

describe("그림 폴더 찾기와 읽기", () => {
  let root: string;
  beforeEach(async () => {
    root = await makeTemp();
  });
  afterEach(async () => removeTemp(root));

  it("묶은 실행 파일(<스킬 폴더>/scripts/aq.mjs)이면 그 스킬 폴더의 assets다. 원본으로 돌리면 없다", () => {
    expect(assetsDirOf(join(root, "aq", "scripts", "aq.mjs"))).toBe(join(root, "aq", "assets"));
    expect(assetsDirOf(join(root, "src", "entry.ts"))).toBeNull();
    expect(assetsDirOf("")).toBeNull();
  });
  it("고른 그림만 data URI로 읽는다", async () => {
    await put(join(root, "scene-4.webp"), "S4");
    await put(join(root, "face.webp"), "F");
    await put(join(root, "sticker-good.webp"), "G");
    await put(join(root, "sticker-done.webp"), "D");
    await put(join(root, "scene-1.webp"), "S1");
    const art = await loadArt(root, { tier: 4, unreadable: false, repairs: 0 });
    expect(art).toEqual({
      scene: `data:image/webp;base64,${Buffer.from("S4").toString("base64")}`,
      face: `data:image/webp;base64,${Buffer.from("F").toString("base64")}`,
      good: `data:image/webp;base64,${Buffer.from("G").toString("base64")}`,
      fix: `data:image/webp;base64,${Buffer.from("D").toString("base64")}`,
    });
  });
  it("그림 폴더가 없거나 파일을 읽지 못하면 그 그림만 null이다. 점검은 멈추지 않는다", async () => {
    await put(join(root, "face.webp"), "F");
    expect(await loadArt(root, { tier: null, unreadable: true, repairs: 2 })).toEqual({ scene: null, face: `data:image/webp;base64,${Buffer.from("F").toString("base64")}`, good: null, fix: null });
    expect(await loadArt(null, { tier: 3, unreadable: false, repairs: 0 })).toEqual({ scene: null, face: null, good: null, fix: null });
  });
});
