const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const pluginRoot = path.join(__dirname, '..');
const manifest = require('../.claude-plugin/plugin.json');
const skillBody = fs.readFileSync(path.join(pluginRoot, 'skills', 'caveman', 'SKILL.md'), 'utf8')
  .replace(/^---[\s\S]*?---\s*/, '').trimEnd();

// Runs the event's hook the way Claude Code does: exec form, plugin root substituted.
function runHookAsClaudeCode(event, payload, claudeConfigDir) {
  const [hookCommand] = manifest.hooks[event][0].hooks;
  const args = hookCommand.args.map((arg) => arg.replace('${CLAUDE_PLUGIN_ROOT}', pluginRoot));
  return execFileSync(hookCommand.command, args, {
    input: JSON.stringify({ hook_event_name: event, session_id: 'test-session', cwd: claudeConfigDir, ...payload }),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: pluginRoot, CLAUDE_CONFIG_DIR: claudeConfigDir },
  });
}

function withClaudeConfigDir(body) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'caveman-lean-'));
  try {
    body(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('ships only the hooks and skill that compress output on their own', () => {
  assert.deepStrictEqual(Object.keys(manifest.hooks).sort(), ['SessionStart', 'SubagentStart', 'UserPromptSubmit']);
  assert.deepStrictEqual(fs.readdirSync(path.join(pluginRoot, 'skills')), ['caveman']);
  assert.ok(!fs.existsSync(path.join(pluginRoot, 'agents')), 'agents/ would add subagent descriptions to every session');
  assert.ok(!fs.existsSync(path.join(pluginRoot, 'commands')), 'commands/ would add command descriptions to every session');
});

test('session start hands the main thread the full caveman skill', () => {
  withClaudeConfigDir((dir) => {
    const context = runHookAsClaudeCode('SessionStart', { source: 'startup' }, dir);

    assert.ok(context.startsWith('CAVEMAN MODE ACTIVE — mode: caveman'), context.slice(0, 80));
    assert.ok(context.includes(skillBody), 'SKILL.md body missing; hooks fell back to the short ruleset');
  });
});

test('subagent start hands every subagent the full caveman skill', () => {
  withClaudeConfigDir((dir) => {
    runHookAsClaudeCode('SessionStart', { source: 'startup' }, dir);
    const output = JSON.parse(runHookAsClaudeCode('SubagentStart', { agent_type: 'general-purpose' }, dir));

    assert.strictEqual(output.hookSpecificOutput.hookEventName, 'SubagentStart');
    assert.ok(output.hookSpecificOutput.additionalContext.includes(skillBody));
  });
});

test('each prompt gets the reminder until the user says stop caveman', () => {
  withClaudeConfigDir((dir) => {
    runHookAsClaudeCode('SessionStart', { source: 'startup' }, dir);

    const reminder = JSON.parse(runHookAsClaudeCode('UserPromptSubmit', { prompt: 'fix the bug' }, dir));
    assert.match(reminder.hookSpecificOutput.additionalContext, /^CAVEMAN MODE ACTIVE \(caveman\)/);

    runHookAsClaudeCode('UserPromptSubmit', { prompt: 'stop caveman' }, dir);
    assert.strictEqual(runHookAsClaudeCode('UserPromptSubmit', { prompt: 'fix the bug' }, dir), '');
  });
});
