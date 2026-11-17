# Chunsik's Garage

AQ checkup for Claude Code and Codex. A program on your own PC reads your local Claude Code and Codex records, scores how well you set up and use these AI coding tools, and writes a one-page report.

![AQ report page made from synthetic records](https://raw.githubusercontent.com/yeunlee1/chunsik-garage/develop/docs/images/report-en.png)

## Install

Node.js 22 or later is required. The `#main` and `@main` parts install the released version; without them you get the development branch.

| Tool | Install | Run |
|---|---|---|
| Claude Code | `claude plugin marketplace add yeunlee1/chunsik-garage#main`, then `claude plugin install chunsik-garage@chunsik-garage` | Say "Run an AQ checkup", or use `/chunsik-garage:aq` |
| Codex | `codex plugin marketplace add yeunlee1/chunsik-garage@main`, then `codex plugin add chunsik-garage@chunsik-garage` | Say "Run an AQ checkup", or pick the skill in `/skills` |

To update, run `claude plugin marketplace update chunsik-garage`, then `claude plugin update chunsik-garage@chunsik-garage` for Claude Code, and start a new session. For Codex, run `codex plugin marketplace upgrade chunsik-garage` and restart Codex.

## What it does

- **Checkup.** Scores four axes from your records and settings, opens the report page in your browser, and gives a short summary in the terminal. Every item shows how it was measured. The report shows how to reach the next grade step by step (what to change, the value now and the target) and explains how the score and the grades are worked out. It also points out API keys or tokens written as they are in your settings.
- **Tune-up.** Turns off skills, plugins, and MCP servers you have not used for a while. It changes only the items you approve, writes a record first, and can undo each change.
- **Deep checkup.** Reads the instruction files you pick and points out lines that overlap, conflict, or would be better moved. The score does not change.
- **Session start notices (Claude Code).** One line when a session starts, if 7 days have passed since the last checkup or something new is installed. Ask to turn them on.
- **Leaving an item as you chose.** If you keep a setting on purpose, such as a high reasoning effort, ask to leave that item as it is. It still counts in the score and leaves what to fix first and the next-grade steps.
- **AQ badge.** A small picture with your AQ and grade for your README or GitHub profile, made on your PC from your latest checkup. Ask for an AQ badge.

## Privacy

The program and the report page make no network requests. What the program prints goes to the AI in your current session. For a checkup, that is the scores, the counts, the paths of the report and result files, and the names of what to fix, such as MCP servers that failed to connect and where API keys are written. For a tune-up, it is also the names of what to tune up, the paths of the settings files, and the keys and values it proposes to change. The values of API keys, your conversations, and the text of your instructions are not sent. If you ask for a deep checkup, the AI reads only the instruction files you pick.

The checkup looks for API keys or tokens written as they are in your MCP settings and in the `env` of your Claude Code settings. It looks at a value only to tell its shape, and never shows or saves it. The report page and the AI receive where they are (the server, the field, and the key name) so you can move them, never the values.

The report file contains the names of your skills and project folders. Share the score card instead of the file.

What runs on your PC: the skill runs `skills/aq/scripts/aq.mjs` with Node.js, and Claude Code runs `hooks/session-start.mjs` when a session starts. The hook stays quiet unless you turned the notices on. Neither program makes network requests.

## Supported

- Node.js 22 or later. Tested on 22 and 24.
- Built and tested on Windows 11. macOS and Linux are covered only by tests with temporary home folders.
- Made for Claude Code and Codex on your own PC. The checkup reads the records these tools keep on your PC, so it is not made for claude.ai chat or Cowork.
- Claude Code record formats checked on 2.1.220 to 2.1.322, and the settings a tune-up changes on 2.1.220 to 2.1.325. Codex record formats checked on records of 0.166.0 (and the older format of 0.140 to 0.142), and up to 0.169.0 by comparing the public source of the record shapes the checkup reads.

## What it leaves and how to remove it

Everything lives in `~/.chunsik-garage/`: the cache, the reports, the score history, the state, the notice markers, the tune-up records, and the badge. Removing the plugin does not remove this folder.

The only exception is a checkup run without saving. Its report page and result file (`chunsik-garage-report-<time>.html`, `chunsik-garage-result-<time>.json`) go to your OS temp folder, and this tool does not delete them. The result file lists the names of your skills, MCP servers, and projects, so delete it yourself when you no longer need it.

- Ask "where does the AQ checkup keep its files" to see the folder and its size.
- Ask to clean up: the cache and older reports are removed, and the latest report stays.
- Ask to remove everything: the history, the state, and the tune-up records are removed too. After that, tune-ups can no longer be undone with this tool.
- Cleaning checks each path right before deleting it, but it cannot stop another program that swaps a folder inside `~/.chunsik-garage/` for a link at that very moment, which could delete files outside. Leave that folder alone while it is being cleaned.

## Using it in the Codex sandbox

In Codex's default sandbox (workspace-write with approval on request), writing to `~/.chunsik-garage/` needs your approval. To allow it for good, add the folder to `writable_roots` in `~/.codex/config.toml`:

```toml
[sandbox_workspace_write]
writable_roots = ["/absolute/path/to/your/home/.chunsik-garage"]
```

Without approval the checkup still runs without saving (no cache, no history). A tune-up always needs permission to write the settings file it changes.

## What a tune-up cannot prevent

- The lock works only among this tool's own runs. While a tune-up runs, do not install plugins or change settings in other Claude Code or Codex sessions. A change another program writes in the instant between the last check and the file replacement can be overwritten. The tune-up record still lets you undo what this tool changed.
- Open Claude Code sessions may not pick up a change. Check in a new session. Codex needs a restart.

## License

The code is MIT licensed (`LICENSE`). The character art in `skills/aq/assets/` is not covered by the MIT license; see `skills/aq/assets/ART-LICENSE.md`. You may share the art as it appears in the cards, result pages, and screenshots that this tool makes. You may not take the art out of them and use it elsewhere.

[한국어](README.ko.md)
