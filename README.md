# caveman-lean

The [Caveman](https://github.com/JuliusBrussee/caveman) plugin cuts output tokens, but it also loads about 2,000 tokens of skill and agent descriptions into every session, mostly for features that never run unless you call them.
This plugin, for Claude Code and OpenCode, keeps only the part that saves tokens on its own: the hooks that put the main thread and every subagent in caveman mode, plus the skill text they inject.

## Install

Claude Code:

```
/plugin marketplace add YuukiFST/caveman-lean
```
```
/plugin install caveman-lean@caveman-lean
```

Uninstall `caveman@caveman` first, or both inject the ruleset. Needs `node` on `PATH`.

OpenCode 2:

```
opencode plugin add github:YuukiFST/caveman-lean
```

Remove Caveman's own OpenCode plugin (`plugins/caveman` in the OpenCode config dir) first, for the same reason.

## What it keeps

| Hook | Script | Effect |
|------|--------|--------|
| `SessionStart` | `caveman-activate.js` | Injects `skills/caveman/SKILL.md` into the main thread |
| `SubagentStart` | `caveman-activate.js --subagent` | Injects the same text into every subagent |
| `UserPromptSubmit` | `caveman-mode-tracker.js` | Adds a one-line reminder each turn; `stop caveman` or `normal mode` turns it off |

`caveman-config.js` and `caveman-parse.js` are their helpers.
The statusline scripts are there because `caveman-activate.js` copies them to the config dir when a `statusLine` uses them.

In OpenCode, Caveman's own plugin in `src/plugins/opencode/` does the same job through OpenCode's session hooks: it adds the skill to the system prompt of every model call, main thread and subagents alike, and reads `stop caveman` or `normal mode` from the user's prompts only.
It keeps its mode in `.caveman-active` in the OpenCode config dir, so a switch applies to every OpenCode session on the machine.
[`opencode/server.mjs`](opencode/server.mjs) loads that plugin and registers its `/caveman` command:

| Command | Effect |
|---------|--------|
| `/caveman` | Turns caveman mode on |
| `/caveman off` | Turns it off |
| `/caveman status` | Reports the current mode without changing it |

## What it drops

- Every other skill: `cavecrew`, `ultracave`, `megacave`, `caveman-commit`, `caveman-review`, `caveman-compress`, `caveman-stats`, `caveman-help`, `caveman-explore`, `caveman-init`, the Caveman Cloud skills (`caveman-setup`, `-manage`, `-optimize`, `-discover`, `-evidence-review`, `-learn`) and the workflow skills (`investigate-first`, `lean-build`, `migration`, `safe-refactor`, `surgical-patch`, `verify-and-stop`).
- The `cavecrew-builder`, `cavecrew-investigator` and `cavecrew-reviewer` agents, and `cavecrew-model-overrides.js`.
- The `SessionEnd` hook, which only records stats.
- Every OpenCode command except `/caveman`, and the `AGENTS.md` block Caveman's installer writes.

## Upstream

Every file under `src/` and `skills/` is copied unchanged from Caveman at [`9b68f7e`](https://github.com/JuliusBrussee/caveman/tree/9b68f7ed12b05e7efaff18e65c5a3fc2849fd0a4).
To update, copy the same files from the new release, run the tests, and bump `version` in `.claude-plugin/plugin.json` and `package.json` so installed copies update.

Licensed under Apache-2.0, like Caveman; see `LICENSE` and `NOTICE`.

## Test

```
node --test
```
