---
name: aq
description: Run an AQ checkup with Chunsik's Garage. A program on this PC reads the local Claude Code and Codex records, scores how well the user sets up and uses these AI coding tools, writes a one-page report and opens it in the browser, and returns a short summary to relay in the terminal. Use when the user asks for an AQ checkup, their AQ score, or how well they use their AI coding tools. Korean requests such as "AQ 점검해 줘", "AQ 지수", or "춘식이 정비소" mean the same.
allowed-tools: Bash(node "${CLAUDE_SKILL_DIR}/scripts/aq.mjs" *)
---

# AQ checkup

A program on this PC computes the AQ score. Run it and relay its summary. The program does all the reading and scoring. Never compute, guess, round, or change a number, and never add an expected gain the summary does not give.

## 1. Run the checkup

1. Pick the language you are using with the user: `ko` for Korean, `en` for English. For any other language pass its two-letter code. The program then falls back to the OS language or English.
2. Write the start line from section 3 before you run the program: the Korean line if you pass `--lang ko`, otherwise the English line.
3. Run this one command, keeping the double quotes around the path:

   ```bash
   node "${CLAUDE_SKILL_DIR}/scripts/aq.mjs" checkup --lang <lang>
   ```

   - Add `--no-save` only if the user asked not to save anything. Add `--no-open` only if the user asked not to open the browser. Add `--rescan` only if the user asked to read every record again.
   - If `${CLAUDE_SKILL_DIR}` was not replaced with a real path, use the absolute path of `scripts/aq.mjs` in the folder that holds this SKILL.md, still in double quotes.
   - Do not run any other command for the checkup. Do not open, list, move, or delete the report or result files yourself.
4. The program prints one JSON object, `{"summary": {...}, "run": {...}}`. Use only the fields named below.

## 2. When the program fails

- The shell cannot find `node`, or the program stops with exit code 2 and says Node.js 22 or later is required: tell the user the checkup needs Node.js 22 or later, then stop.
- The program stops with exit code 1 and prints `{"error": {"code": ..., "message": ...}}`: tell the user the checkup stopped with an error and give `error.code`. Do not retry with other options unless the user asks.
- After the program fails, your whole reply is one line as Chunsik with the error face `(;_;)`. Do not guess the cause, and do not add anything the program did not print, such as the options you passed, files, or what to do next.

## 3. What to tell the user

Write the result in the language of `summary.lang`, as plain lines, not inside a code block. Use at most six lines. The report page has the details.

Speakers: 📋 Chunsam (춘삼이) checks and reports. 🔧 Chunsik (춘식이) talks about fixing. Put the face right after the name.

| Situation | Speaker | Face |
|---|---|---|
| Starting the checkup | Chunsam | `(o_o)` |
| Result with `summary.tier` 3 to 5 | Chunsam | `(^o^)` |
| Result with `summary.tier` 1 or 2 | Chunsam | `(O_O)!` |
| Result without an AQ (`summary.aq` is null) | Chunsam | `(o_o)` |
| Nothing to fix (`summary.text.noFixFirst`) | Chunsam | `(^_^)b` |
| Fix first | Chunsik | `(-_-)9` |
| Error | Chunsik | `(;_;)` |

Lines, in this order. Copy every value you take from the summary and the run record exactly. Indent a line that continues the same speaker.

1. Start, before running: `📋 춘삼이 (o_o)  기록을 읽고 있습니다. 많으면 1~2분 걸립니다.` or `📋 Chunsam (o_o)  Reading your records. This can take a minute or two.`
2. Result.
   - With an AQ: `📋 춘삼이 <face>  점검 끝! AQ <summary.aq> · <summary.grade>등급 「<summary.text.grade>」` or `📋 Chunsam <face>  Checkup done! AQ <summary.aq> · Grade <summary.grade> "<summary.text.grade>"`.
   - Without an AQ: `📋 춘삼이 (o_o)  점검 끝! <the summary.text.notices sentence whose summary.notices kind is score_withheld>` or the same with `Chunsam` and `Checkup done!`. Then, indented, `summary.text.diagnosis`.
3. Best, indented: `가장 잘하는 것  <summary.text.best.title> (<summary.text.best.detail>)` or `Best at  <summary.text.best.title> (<summary.text.best.detail>)`. If `summary.text.best` is null, write `summary.text.noBest` instead, or nothing if that is null too.
4. Fix first: only the first item of `summary.text.fixFirst`, as `🔧 춘식이 (-_-)9 먼저 고칠 것  <summary.text.fixFirst[0].title> (<summary.text.fixFirst[0].detail>)` or `🔧 Chunsik (-_-)9 Fix first  <summary.text.fixFirst[0].title> (<summary.text.fixFirst[0].detail>)`. If `summary.text.fixFirst` is empty and `summary.text.noFixFirst` is not null, write `📋 춘삼이 (^_^)b <summary.text.noFixFirst>` or `📋 Chunsam (^_^)b <summary.text.noFixFirst>`. If both are empty, skip this line.
5. Report line, indented, from section 4.
6. Notice line, indented, from section 4. At most one.

## 4. The report page and notices

`summary.reportPath` is the report page. `run.notices[].kind` names each thing that happened while saving and opening it, and `run.text.notices` has the sentence for each notice in the same order. "The sentence of a kind" below means the `run.text.notices` sentence at the position of that kind.

Report line. Use the first row that applies.

| When | Write |
|---|---|
| `summary.reportPath` is null | the sentence of `report_unwritten`. There is no report page this time |
| `report_unopened` is in the notices | the sentence of `report_unopened`, then `summary.reportPath` |
| You ran with `--no-open` | `결과 화면: <summary.reportPath>` or `Report page: <summary.reportPath>` |
| Otherwise | `결과 화면을 열었습니다.` or `Opened the report page.` |

Notice line. Find the first kind in this table that is in the notices and do what its row says. Write no other notice.

| Kind | Notice line |
|---|---|
| `report_failed` | the sentence of `report_failed` |
| `save_failed` | the sentence of `save_failed` |
| `result_unwritten` | the sentence of `result_unwritten` |
| `not_saved` | the sentence of `not_saved`, unless the user asked not to save |
| `report_unwritten` | none (the report line already says it) |
| `report_unopened` | none (the report line already says it) |
| `prune_failed` | none |
| `prune_skipped` | none |
