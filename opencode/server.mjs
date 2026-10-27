// OpenCode 2 entry: Caveman's own plugin plus its /caveman command. Caveman's installer
// writes the command file into the OpenCode config dir; a package plugin registers it instead.

import fs from 'node:fs';

import caveman from '../src/plugins/opencode/server.js';

const commandFile = fs.readFileSync(new URL('../src/plugins/opencode/commands/caveman.md', import.meta.url), 'utf8');
const [, frontmatter, template] = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(commandFile);
const description = /^description:\s*(.*)$/m.exec(frontmatter)[1].trim();

// server.js's prompt hook reads the mode from the first line of this expansion,
// "Activate caveman mode: <argument>", as it does for the command file Caveman installs.
function expandCavemanCommand(argument) {
  return template.replaceAll('$ARGUMENTS', String(argument ?? '').trim());
}

const withoutMentions = (items) => items?.map(({ mention, ...item }) => item);

export default {
  id: caveman.id,
  async setup(ctx) {
    // server.js adds the ruleset on `context` only; its handler also takes `compaction`,
    // whose event has the same shape, so the summary call gets caveman mode too.
    const session = Object.create(ctx.session, {
      hook: {
        value: async (name, handler) => {
          await ctx.session.hook(name, handler);
          if (name === 'context') await ctx.session.hook('compaction', handler);
        },
      },
    });
    const dispose = await caveman.setup(Object.create(ctx, { session: { value: session } }));
    await ctx.command.transform((editor) => {
      editor.add({
        name: 'caveman',
        description,
        execute: async ({ sessionID, prompt, delivery }) => {
          await ctx.session.prompt({
            ...prompt,
            sessionID,
            text: expandCavemanCommand(prompt.text),
            files: withoutMentions(prompt.files),
            agents: withoutMentions(prompt.agents),
            skills: withoutMentions(prompt.skills),
            delivery,
          });
        },
      });
    });
    return dispose;
  },
};
