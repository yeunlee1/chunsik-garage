// 결과 화면의 고정 글(단의 제목, 단추, 화면 낱말, 꼬리, 공유 카드)의 두 언어. 3단계 시안에서 짝이 칸마다 판정한 표를 출발점으로 하고, 시안에만 있던 글은 뺐다(설계 13.1, 13.2, 14, 19.1, 「3단계 계획 전 결정」의 11번)
import type { Lang, Texts } from "../core/copy/lang.ts";

/** 화면의 고정 글. {이름}은 숫자나 글을 끼우는 자리이고 {이름:하나|여럿}은 값이 1이면 앞의 것이다 */
export const REPORT_COPY = {
  brand: { en: "Chunsik's Garage", ko: "춘식이 정비소" },
  title: { en: "AQ Inspection Sheet", ko: "AQ 점검 명세서" },
  pageTitle: { en: "AQ Inspection Sheet · {date}", ko: "AQ 점검 명세서 · {date}" },
  langGroup: { en: "Language", ko: "화면 언어" },
  date: { en: "Date", ko: "점검일" },
  tools: { en: "Tools", ko: "대상" },
  period: { en: "Score window", ko: "점수 구간" },
  round: { en: "Check-up", ko: "회차" },
  roundValue: { en: "#{n}", ko: "{n}회" },
  notSaved: { en: "Not saved", ko: "저장 안 함" },
  noTools: { en: "None found", ko: "찾지 못함" },
  scoreAria: { en: "Overall score", ko: "종합 점수" },
  aqLabel: { en: "AQ SCORE", ko: "AQ 지수" },
  grade: { en: "GRADE", ko: "등급" },
  gradeAria: { en: "Grade {g}", ko: "등급 {g}" },
  noScore: { en: "No score", ko: "점수 없음" },
  axisCounts: { en: "Good {g} · Fix {f}", ko: "잘함 {g} · 정비 {f}" },
  axisAria: { en: "{axis} {v} out of 100", ko: "{axis} {v}점, 100점 만점" },
  axisNone: { en: "{axis} not measured", ko: "{axis} 잴 수 없음" },
  axesTable: { en: "Scores on the four axes", ko: "네 기준의 점수" },
  thAxis: { en: "Axis", ko: "기준" },
  thScore: { en: "Score", ko: "점수" },
  thGood: { en: "Good", ko: "잘함" },
  thFix: { en: "Fix", ko: "정비" },
  unmeasured: { en: "Not measured", ko: "잴 수 없음" },
  verdict: { en: "Verdict", ko: "진단" },
  best: { en: "Best at", ko: "가장 잘하는 것" },
  fixFirst: { en: "Fix first", ko: "먼저 고칠 것" },
  colGood: { en: "What you do well", ko: "잘하고 있는 것" },
  colFix: { en: "What to tune up", ko: "정비할 것" },
  how: { en: "How it was measured", ko: "어떻게 쟀나" },
  clean: { en: "Clean up", ko: "정리하기" },
  copied: { en: "Copied. Paste it into Claude Code or Codex.", ko: "복사했습니다. Claude Code나 Codex에 붙여 넣으세요." },
  copyFail: { en: "Copying was blocked. Copy the text below and paste it into Claude Code or Codex.", ko: "복사가 막혔습니다. 아래 글을 직접 복사해 Claude Code나 Codex에 붙여 넣으세요." },
  copyLabel: { en: "Text to paste", ko: "붙여 넣을 말" },
  phrase: { en: "Chunsik's Garage tune-up: {name}", ko: "춘식이 정비소 정비: {name}" },
  targets: { en: "To clean up", ko: "정리할 것" },
  places: { en: "Where", ko: "고칠 곳" },
  missingProjects: { en: "Projects without instructions", ko: "지침이 없는 프로젝트" },
  overlapProject: { en: "Project with the most overlap", ko: "가장 많이 겹치는 프로젝트" },
  serversOut: { en: "{n} {n:server|servers} left out of the judgment", ko: "판정에서 뺀 서버 {n}개" },
  judgeFrom: { en: "If nothing else changes, it can be judged from the check-up {n} {n:day|days} from now.", ko: "다른 조건이 같으면 {n}일 뒤의 점검부터 판정할 수 있습니다." },
  judgeUnknown: { en: "The day judging can start could not be worked out.", ko: "판정을 시작할 날을 정하지 못했습니다." },
  judgeChange: { en: "The day moves if the server is called or its definition changes in the meantime.", ko: "그 사이에 부르거나 정의가 바뀌면 날이 달라집니다." },
  judgeNotSaved: { en: "This check-up was not saved, so for servers seen for the first time the day may move later.", ko: "이번 점검은 저장하지 않아, 이번에 처음 본 서버는 날이 뒤로 밀릴 수 있습니다." },
  blockWith: { en: "Setting to block it", ko: "막을 때 쓸 설정" },
  blockNote: { en: "This is the display name set by claude.ai. It can change, and a name that clashes gets \" (N)\" added.", ko: "이 이름은 claude.ai가 정하는 표시 이름이라 바뀔 수 있고, 이름이 겹치면 뒤에 \" (N)\"이 붙습니다." },
  avgList: { en: "Doing okay", ko: "보통" },
  unmList: { en: "Not measured", ko: "잴 수 없음" },
  none: { en: "None", ko: "없음" },
  use: { en: "Mileage", ko: "사용 기록" },
  kMain: { en: "Main sessions", ko: "주 세션" },
  kDays: { en: "Active days", ko: "사용한 날" },
  kOut: { en: "Output tokens", ko: "출력 토큰" },
  kCache: { en: "Cache hits", ko: "캐시 적중" },
  cal: { en: "Replies per day", ko: "날짜별 응답 수" },
  calAria: { en: "Replies per day from {from} to {to}. {u} {u:day|days} used, {n} not used, {x} with no records kept. Busiest day: {max} {max:reply|replies}.", ko: "{from}부터 {to}까지 날짜별 응답 수. 쓴 날 {u}일, 안 쓴 날 {n}일, 기록이 남아 있지 않은 날 {x}일, 가장 많은 날 {max}개" },
  toolsTable: { en: "Main sessions and output tokens by tool", ko: "도구별 주 세션과 출력 토큰" },
  thTool: { en: "Tool", ko: "도구" },
  less: { en: "Less", ko: "적음" },
  more: { en: "More", ko: "많음" },
  lgUnused: { en: "Not used", ko: "안 쓴 날" },
  lgUnseen: { en: "No records kept", ko: "기록이 남아 있지 않은 날" },
  asTable: { en: "Show tables", ko: "표로 보기" },
  asChart: { en: "Show charts", ko: "그림으로 보기" },
  thDate: { en: "Date", ko: "날짜" },
  thReplies: { en: "Replies", ko: "응답 수" },
  thState: { en: "State", ko: "상태" },
  stUsed: { en: "Used", ko: "쓴 날" },
  byTool: { en: "By tool", ko: "도구별" },
  shell: { en: "Shell commands that ended with a non-zero code: {v} · not scored", ko: "셸 명령이 0이 아닌 값으로 끝난 몫 {v} · 점수에 넣지 않음" },
  notices: { en: "Notices", ko: "알림" },
  partialRead: { en: "Only part of the {tool} records could be read. {share} of them could not be read.", ko: "{tool} 기록을 일부만 읽었습니다. 읽지 못한 비율은 {share}입니다." },
  partialReadAtLeast: { en: "Only part of the {tool} records could be read. At least {share} of them could not be read.", ko: "{tool} 기록을 일부만 읽었습니다. 읽지 못한 비율은 적어도 {share}입니다." },
  partialReadUnknown: { en: "Only part of the {tool} records could be read. How much could not be read is unknown.", ko: "{tool} 기록을 일부만 읽었습니다. 얼마나 읽지 못했는지는 알 수 없습니다." },
  footCalc: { en: "Computed on this PC.", ko: "이 PC에서 계산했습니다." },
  footPromise: {
    en: "The program and this page send nothing anywhere. The AI receives your scores, totals and the names of things to tune up. Your conversations and the text of your instructions are not sent. If you ask for a deep check, the AI reads the instruction files you pick.",
    ko: "프로그램과 결과 화면은 바깥으로 아무것도 보내지 않습니다. AI에게는 점수와 집계, 정비할 것의 이름이 전해집니다. 대화 내용과 지침의 글은 전해지지 않습니다. 정밀 점검을 시키면 고른 지침 파일을 AI가 읽습니다.",
  },
  footNames: { en: "This file contains the names of your skills and project folders. Anyone you send the file to can see them. To share your result, use the card.", ko: "이 파일에는 스킬과 프로젝트 폴더의 이름이 들어 있습니다. 파일째 보내면 그 이름도 보입니다. 결과를 나눌 때는 카드를 쓰세요." },
  cardBtn: { en: "Save as card", ko: "카드로 저장" },
  cardTitle: { en: "Share card", ko: "공유 카드" },
  download: { en: "Download", ko: "내려받기" },
  close: { en: "Close", ko: "닫기" },
  cardNote: { en: "If the download is blocked, right-click the image, or press and hold it on a phone, to save it.", ko: "내려받기가 막히면 그림을 오른쪽 단추로 누르거나, 휴대폰에서는 길게 눌러 저장하세요." },
  cardFail: { en: "The card could not be drawn in this browser.", ko: "이 브라우저에서 카드를 그리지 못했습니다." },
  cardAlt: { en: "Share card: AQ {aq}, grade {grade}, {name}, with the four axis scores", ko: "공유 카드. AQ {aq}, {grade}등급 {name}, 네 기준 점수" },
  cardRepo: { en: "github.com/yeunlee1/chunsik-garage", ko: "github.com/yeunlee1/chunsik-garage" },
} as const satisfies Record<string, Texts<string>>;

export type CopyKey = keyof typeof REPORT_COPY;

/** 요일 머리(월요일부터) */
export const WEEKDAYS: Texts<readonly string[]> = { en: ["M", "T", "W", "T", "F", "S", "S"], ko: ["월", "화", "수", "목", "금", "토", "일"] };

/** 상태 표시의 낱말. 색과 아이콘과 함께 보인다(설계 13.4) */
export const STATUS_COPY = {
  critical: { en: "Serious", ko: "심각" },
  caution: { en: "Caution", ko: "주의" },
  info: { en: "Note", ko: "참고" },
  good: { en: "Good", ko: "양호" },
  average: { en: "Okay", ko: "보통" },
  unmeasured: { en: "Not measured", ko: "잴 수 없음" },
} as const satisfies Record<string, Texts<string>>;

/** 설정 문제의 종류(S3의 근거 숫자와 같은 낱말) */
export const PROBLEM_KIND_COPY = {
  unparsable: { en: "unparsable settings file", ko: "풀리지 않는 설정 파일" },
  noFrontmatter: { en: "skill without a header", ko: "머리말이 없는 스킬" },
  danglingLink: { en: "link that points nowhere", ko: "가리키는 곳이 없는 링크" },
} as const satisfies Record<string, Texts<string>>;

/** 장면 그림의 대체 글. 그림이 무엇을 하는지만 적는다(설계 13.3, 「3단계 계획 전 결정」의 12번) */
export const SCENE_ALT = {
  "scene-1": { en: "An angry Chunsik slashes a messy sheet with a pipe wrench like lightning while Chunsam looks on, startled", ko: "화난 춘식이가 파이프렌치로 엉망인 명세서를 번개처럼 베고, 춘삼이가 뒤에서 놀라는 그림" },
  "scene-2": { en: "Chunsik glares at a crumpled sheet while Chunsam waits with a toolbox", ko: "춘식이가 구겨진 명세서를 노려보고, 춘삼이가 공구함을 들고 기다리는 그림" },
  "scene-3": { en: "Chunsik fixes a car while Chunsam hands over a screwdriver", ko: "춘식이가 손님 차를 고치고, 춘삼이가 드라이버를 건네는 그림" },
  "scene-4": { en: "Chunsik stamps a clean sheet while Chunsam gives a thumbs-up", ko: "춘식이가 깨끗한 명세서에 합격 도장을 찍고, 춘삼이가 엄지를 든 그림" },
  "scene-5": { en: "Chunsik and Chunsam jump and toss sheets into the air", ko: "춘식이와 춘삼이가 뛰어오르며 명세서를 하늘로 던지는 그림" },
  "scene-few-records": { en: "Chunsam holds a checklist with only a couple of lines while Chunsik sits on a toolbox watching an hourglass", ko: "춘삼이가 줄이 두어 개뿐인 점검표를 들고, 춘식이가 공구함에 앉아 모래시계를 보는 그림" },
  "scene-unreadable": { en: "Chunsik cannot open a folder with a lock on it while Chunsam peers at it through a magnifying glass", ko: "춘식이가 자물쇠가 그려진 서류철을 열지 못해 머쓱하고, 춘삼이가 돋보기로 들여다보는 그림" },
} as const satisfies Record<string, Texts<string>>;

/** 고정 글 하나를 고른다 */
export function copyOf(key: CopyKey, lang: Lang): string {
  return REPORT_COPY[key][lang];
}
