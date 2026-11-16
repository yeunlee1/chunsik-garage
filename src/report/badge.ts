// AQ 배지 그림(SVG). README나 깃허브 프로필에 붙이는 작은 그림으로, 점수와 등급만 넣고 바깥을 부르지 않는다(설계 「0.2.0에서 정한 것」)
import type { Grade } from "../core/score.ts";

/** 등급마다 오른쪽 바탕색. 흰 글자와의 대비가 4.5:1을 넘는 어두운 색이다 */
export const BADGE_COLORS: Readonly<Record<Grade, string>> = { S: "#1f883d", A: "#4d7c0f", B: "#8a6d00", C: "#c2410c", D: "#b91c1c" };
const LABEL_COLOR = "#555";
/** 글자 양옆의 여백 */
const PAD = 6;

/** 글자 폭의 어림값(Verdana 11px). 그림의 폭을 정할 때만 쓴다 */
const charWidth = (char: string): number => (/[0-9]/.test(char) ? 7 : /[A-Z]/.test(char) ? 8 : char === " " || char === "·" ? 4 : 7);
const textWidth = (text: string): number => [...text].reduce((sum, char) => sum + charWidth(char), 0);

/** 왼쪽에 AQ, 오른쪽에 「점수 · 등급」을 둔 배지. 같은 점수는 늘 같은 글자다 */
export function badgeSvg(score: { aq: number; grade: Grade }): string {
  const label = "AQ";
  const message = `${score.aq} · ${score.grade}`;
  const name = `${label} ${message}`;
  const left = textWidth(label) + PAD * 2;
  const right = textWidth(message) + PAD * 2;
  const width = left + right;
  const color = BADGE_COLORS[score.grade];
  return `${[
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20" viewBox="0 0 ${width} 20" role="img" aria-label="${name}">`,
    `<title>${name}</title>`,
    `<rect width="${width}" height="20" rx="3" fill="${LABEL_COLOR}"/>`,
    `<rect x="${left}" width="${right}" height="20" rx="3" fill="${color}"/>`,
    // 오른쪽 칸의 왼쪽 모서리는 각지게 덮는다
    `<rect x="${left}" width="4" height="20" fill="${color}"/>`,
    `<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">`,
    `<text x="${left / 2}" y="14">${label}</text>`,
    `<text x="${left + right / 2}" y="14">${message}</text>`,
    "</g>",
    "</svg>",
  ].join("")}\n`;
}
