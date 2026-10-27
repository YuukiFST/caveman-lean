import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// plugin.js resolves its flag file from XDG_CONFIG_HOME when the module loads.
const configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'caveman-lean-opencode-'));
process.env.XDG_CONFIG_HOME = configHome;
delete process.env.CAVEMAN_DEFAULT_MODE;
test.after(() => fs.rmSync(configHome, { recursive: true, force: true }));

const manifest = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const { default: plugin } = await import(new URL(manifest.exports['.'], new URL('../', import.meta.url)));
const skillBody = fs.readFileSync(new URL('../skills/caveman/SKILL.md', import.meta.url), 'utf8')
  .replace(/^---[\s\S]*?---\s*/, '').trimEnd();

// Loads the package the way OpenCode 2 does: one setup per location, session events on a
// subscription, session hooks, and commands whose session.prompt runs the prompt hook.
async function setupAsOpenCode(sessionEvents) {
  const hooks = {};
  const commands = {};
  const sent = [];
  const ctx = {
    location: { directory: fs.mkdtempSync(path.join(configHome, 'project-')) },
    event: {
      async *subscribe() {
        for (const event of sessionEvents) yield event;
      },
    },
    session: {
      hook: async (name, fn) => { hooks[name] = fn; },
      prompt: async (input) => {
        const event = { sessionID: input.sessionID, prompt: { ...input } };
        await hooks.prompt(event);
        sent.push(event.prompt.text);
      },
    },
    command: {
      transform: async (fn) => fn({ add: (command) => { commands[command.name] = command; } }),
    },
  };
  const dispose = await plugin.setup(ctx);
  await new Promise((resolve) => setImmediate(resolve));
  return { hooks, commands, sent, dispose };
}

async function systemFor(hooks, sessionID, agent, hookName = 'context') {
  const event = { sessionID, agent, system: [], messages: [], tools: {}, options: {} };
  await hooks[hookName](event);
  return event.system.map((part) => part.text).join('\n');
}

async function prompt(hooks, sessionID, text) {
  await hooks.prompt({ sessionID, prompt: { text, files: [], agents: [], skills: [] } });
}

async function runCommand(commands, sessionID, argument) {
  await commands.caveman.execute({ sessionID, prompt: { text: argument, files: [], agents: [], skills: [] }, delivery: 'steer' });
}

test('the main thread and every subagent get the full caveman skill until the user says stop caveman', async () => {
  const { hooks, dispose } = await setupAsOpenCode([
    { type: 'session.created', data: { sessionID: 'ses_child', parentID: 'ses_main' } },
  ]);
  try {
    for (const [sessionID, agent] of [['ses_main', 'build'], ['ses_child', 'general'], ['ses_child', 'explore']]) {
      const system = await systemFor(hooks, sessionID, agent);
      assert.match(system, /^CAVEMAN MODE ACTIVE \(caveman\)/, `${agent} lost the banner`);
      assert.ok(system.includes(skillBody), `${agent} fell back to the short ruleset`);
    }

    // A subagent's prompt is written by the model, so it must not switch the user's mode.
    await prompt(hooks, 'ses_child', 'stop caveman');
    assert.ok((await systemFor(hooks, 'ses_main', 'build')).includes(skillBody));

    await prompt(hooks, 'ses_main', 'stop caveman');
    assert.strictEqual(await systemFor(hooks, 'ses_main', 'build'), '');
    assert.strictEqual(await systemFor(hooks, 'ses_child', 'general'), '');
  } finally {
    dispose();
  }
});

test('compaction summaries are written in caveman mode while it is on', async () => {
  const { hooks, commands, dispose } = await setupAsOpenCode([]);
  try {
    await runCommand(commands, 'ses_main', '');
    const system = await systemFor(hooks, 'ses_main', 'build', 'compaction');
    assert.match(system, /^CAVEMAN MODE ACTIVE \(caveman\)/);
    assert.ok(system.includes(skillBody));

    await runCommand(commands, 'ses_main', 'off');
    assert.strictEqual(await systemFor(hooks, 'ses_main', 'build', 'compaction'), '');
  } finally {
    dispose();
  }
});

test('/caveman off, /caveman status and /caveman switch the mode in OpenCode', async () => {
  const { hooks, commands, sent, dispose } = await setupAsOpenCode([]);
  try {
    assert.strictEqual(commands.caveman.description, 'Activate caveman mode (off | status)');

    await runCommand(commands, 'ses_main', 'off');
    assert.strictEqual(await systemFor(hooks, 'ses_main', 'build'), '');

    await runCommand(commands, 'ses_main', 'status');
    assert.strictEqual(sent.at(-1), 'Report this status verbatim without changing mode: Caveman mode: off');
    assert.strictEqual(await systemFor(hooks, 'ses_main', 'build'), '');

    await runCommand(commands, 'ses_main', '');
    assert.ok((await systemFor(hooks, 'ses_main', 'build')).includes(skillBody));

    await runCommand(commands, 'ses_main', 'status');
    assert.strictEqual(sent.at(-1), 'Report this status verbatim without changing mode: Caveman mode: caveman');
  } finally {
    dispose();
  }
});
