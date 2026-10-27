# caveman-lean

The [Caveman](https://github.com/JuliusBrussee/caveman) plugin cuts output tokens, but it also loads about 2,000 tokens of skill and agent descriptions into every session, mostly for features that never run unless you call them.
This Claude Code plugin keeps only the part that saves tokens on its own: the hooks that put the main thread and every subagent in caveman mode, plus the skill text they inject.

## Install

```
/plugin marketplace add YuukiFST/caveman-lean
```
```
/plugin install caveman-lean@caveman-lean
```

Uninstall `caveman@caveman` first, or both inject the ruleset. Needs `node` on `PATH`.

## What it keeps

| Hook | Script | Effect |
|------|--------|--------|
| `SessionStart` | `caveman-activate.js` | Injects `skills/caveman/SKILL.md` into the main thread |
| `SubagentStart` | `caveman-activate.js --subagent` | Injects the same text into every subagent |
| `UserPromptSubmit` | `caveman-mode-tracker.js` | Adds a one-line reminder each turn; `stop caveman` or `normal mode` turns it off |

`caveman-config.js` and `caveman-parse.js` are their helpers.
The statusline scripts are there because `caveman-activate.js` copies them to the config dir when a `statusLine` uses them.

## What it drops

- Every other skill: `cavecrew`, `ultracave`, `megacave`, `caveman-commit`, `caveman-review`, `caveman-compress`, `caveman-stats`, `caveman-help`, `caveman-explore`, `caveman-init`, the Caveman Cloud skills (`caveman-setup`, `-manage`, `-optimize`, `-discover`, `-evidence-review`, `-learn`) and the workflow skills (`investigate-first`, `lean-build`, `migration`, `safe-refactor`, `surgical-patch`, `verify-and-stop`).
- The `cavecrew-builder`, `cavecrew-investigator` and `cavecrew-reviewer` agents, and `cavecrew-model-overrides.js`.
- The `SessionEnd` hook, which only records stats.

## Upstream

Every file under `src/hooks/` and `skills/` is copied unchanged from Caveman 4.0.1 at [`d262ab3`](https://github.com/JuliusBrussee/caveman/tree/d262ab3882952a59312ff3537cd86d894523c5ab).
To update, copy the same files from the new release, run the tests, and bump `version` in `.claude-plugin/plugin.json` so installed copies update.

Licensed under Apache-2.0, like Caveman; see `LICENSE` and `NOTICE`.

## Test

```
node --test
```
