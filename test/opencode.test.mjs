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

const { default: plugin } = await import('../src/plugins/opencode/server.js');
const manifest = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const skillBody = fs.readFileSync(new URL('../skills/caveman/SKILL.md', import.meta.url), 'utf8')
  .replace(/^---[\s\S]*?---\s*/, '').trimEnd();

// Loads the plugin the way OpenCode 2 does: one setup per location, session events
// on a subscription, and the prompt and context hooks on the session domain.
async function setupAsOpenCode(sessionEvents) {
  const hooks = {};
  const ctx = {
    location: { directory: fs.mkdtempSync(path.join(configHome, 'project-')) },
    event: {
      async *subscribe() {
        for (const event of sessionEvents) yield event;
      },
    },
    session: { hook: async (name, fn) => { hooks[name] = fn; } },
  };
  const dispose = await plugin.setup(ctx);
  await new Promise((resolve) => setImmediate(resolve));
  return { hooks, dispose };
}

async function systemFor(hooks, sessionID, agent) {
  const event = { sessionID, agent, system: [], messages: [], tools: {}, options: {} };
  await hooks.context(event);
  return event.system.map((part) => part.text).join('\n');
}

async function prompt(hooks, sessionID, text) {
  await hooks.prompt({ sessionID, prompt: { text, files: [], agents: [], skills: [] } });
}

test('the package entry is the OpenCode 2 plugin', () => {
  assert.strictEqual(manifest.exports['.'], './src/plugins/opencode/server.js');
  assert.strictEqual(plugin.id, 'caveman');
});

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
