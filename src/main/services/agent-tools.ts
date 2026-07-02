import { spawn } from 'node:child_process';
import type Anthropic from '@anthropic-ai/sdk';
import { betaTool } from '@anthropic-ai/sdk/helpers/beta/json-schema';
import type { ChatStreamEvent } from '@shared/types';
import * as fsService from './fs-service';
import { uploadFileBlock } from './file-attachments';
import { waitForApproval } from './command-approvals';
import { SkillsStore } from './skills';

type Emit = (e: ChatStreamEvent) => void;

const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

// Single string-path argument shared by every tool.
const pathSchema = {
  type: 'object',
  properties: { path: { type: 'string', description: 'Absolute Windows path.' } },
  required: ['path'],
  additionalProperties: false
} as const;

const TEXT_READ_LIMIT = 200 * 1024;
const NULL = String.fromCharCode(0);

const runCommandSchema = {
  type: 'object',
  properties: {
    command: { type: 'string', description: 'The shell command to run.' },
    cwd: {
      type: 'string',
      description:
        "Folder to run in. Defaults to the user's selected folder (or the folder " +
        'containing the selected file) — NOT the skill folder.'
    }
  },
  required: ['command'],
  additionalProperties: false
} as const;

const COMMAND_TIMEOUT_MS = 60_000;
const OUTPUT_LIMIT = 20 * 1024;

// Single-argument schema for activate_skill: the exact skill name to load.
const skillNameSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'The exact name of the skill to activate.' }
  },
  required: ['name'],
  additionalProperties: false
} as const;

/** Runs a shell command and resolves with its exit code plus combined output. */
function runCommand(command: string, cwd: string): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      timeout: COMMAND_TIMEOUT_MS,
      // Force Python (and friends) to emit UTF-8 so Hebrew/Unicode output
      // isn't mangled by the default Windows code page.
      env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' }
    });

    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));

    child.on('error', (err) => resolve(`Failed to run command: ${err.message}`));
    child.on('close', (code) => {
      const text = output.slice(0, OUTPUT_LIMIT) || '(no output)';
      resolve(`Exit code: ${code}\n\n${text}`);
    });
  });
}

/**
 * The agent's local tool set. The first three are cheap (metadata / text only);
 * `load_file` is the expensive "send me the actual file" escape hatch — it
 * returns the file as native content blocks (PDF/image/text) in the tool result.
 */
export function makeTools(emit: Emit, client: Anthropic, workDir: string) {
  let seq = 0;
  const start = (name: string, input: unknown): string => {
    const id = `t${Date.now()}_${seq++}`;
    emit({ type: 'tool_start', id, name, input });
    return id;
  };
  const ok = (id: string, preview: string): void => emit({ type: 'tool_result', id, ok: true, preview });
  const fail = (id: string, preview: string): void => emit({ type: 'tool_result', id, ok: false, preview });

  return [
    betaTool({
      name: 'activate_skill',
      // The catalog is baked into the description so the model can see, up front,
      // which skills exist and when each applies. This is the whole "magic":
      // discovery is just a catalog handed to a Tool-Calling model.
      description:
        'Agent Skills provide specialized, expert instructions for specific kinds of ' +
        'tasks. When the user\'s request matches a skill below, call activate_skill with ' +
        "that skill's exact name to load its full instructions, then follow them.\n\n" +
        '== Available Agent Skills ==\n' +
        SkillsStore.getCatalog(),
      inputSchema: skillNameSchema,
      run: async ({ name }) => {
        const id = start('activate_skill', { name });

        const skill = SkillsStore.getByName(name);
        if (!skill) {
          fail(id, `no skill named "${name}"`);
          const available = SkillsStore.getCatalog();
          return (
            `No skill named "${name}". Available skills:\n${available}\n` +
            'Call activate_skill again with one of these exact names.'
          );
        }

        ok(id, `${name} activated`);

        return [
          `Activated skill: ${name}`,
          `Skill folder (read-only — reference its scripts by absolute path): ${skill.location}`,
          `Commands run in: ${workDir} (write output files here, not in the skill folder).`,
          '',
          'Follow these instructions for the rest of this task:',
          '',
          skill.body
        ].join('\n');
      }
    }),

    betaTool({
      name: 'run_command',
      description:
        "Run a shell command on the user's computer — for example, a script listed in an " +
        'activated skill. The user must approve every command before it runs. ' +
        "Commands run from the user's selected folder (the folder containing the " +
        'selected file) unless you pass a different cwd — NOT the skill folder. ' +
        'If a script lives in the skill folder, reference it by its absolute path.',
      inputSchema: runCommandSchema,
      run: async ({ command, cwd }) => {
        const id = start('run_command', { command, cwd });
        // Default to the user's working folder — never the skill folder.
        const dir = cwd || workDir || process.cwd();

        // Ask the user to approve, then pause until they click a button.
        emit({
          type: 'command_approval_required',
          id,
          command,
          cwd: dir,
          explanation: 'The agent wants to run this command.'
        });
        const approved = await waitForApproval(id);

        if (!approved) {
          fail(id, 'denied');
          return 'The user denied this command, so it was not run.';
        }

        const output = await runCommand(command, dir);
        ok(id, 'done');
        return output;
      }
    }),

    betaTool({
      name: 'get_file_info',
      description:
        'Get metadata (kind, size in bytes, modified time) for a file or folder. ' +
        'Cheap — prefer this over loading file content.',
      inputSchema: pathSchema,
      run: async ({ path }) => {
        const id = start('get_file_info', { path });
        try {
          const st = await fsService.stat(path);
          ok(id, st.kind);
          return JSON.stringify(st);
        } catch (e) {
          fail(id, msg(e));
          return `Error: ${msg(e)}`;
        }
      }
    }),

    betaTool({
      name: 'list_dir',
      description: 'List the files and sub-folders of a directory.',
      inputSchema: pathSchema,
      run: async ({ path }) => {
        const id = start('list_dir', { path });
        try {
          const listing = await fsService.listDir(path);
          ok(id, `${listing.entries.length} items`);
          return JSON.stringify(
            listing.entries.map((e) => ({ name: e.name, kind: e.kind, sizeBytes: e.sizeBytes }))
          );
        } catch (e) {
          fail(id, msg(e));
          return `Error: ${msg(e)}`;
        }
      }
    }),

    betaTool({
      name: 'read_text_file',
      description:
        'Read the UTF-8 text of a text file (code, .txt, .md, .json, etc.). ' +
        'Returns an error for binary files like PDF or images — use load_file for those.',
      inputSchema: pathSchema,
      run: async ({ path }) => {
        const id = start('read_text_file', { path });
        try {
          const { text, truncated } = await fsService.readFile(path, TEXT_READ_LIMIT);
          if (text.includes(NULL)) {
            ok(id, 'binary');
            return 'This file is binary and cannot be read as text. Use load_file instead.';
          }
          ok(id, `${text.length} chars`);
          return truncated ? `${text}\n…[truncated]` : text || '(empty file)';
        } catch (e) {
          fail(id, msg(e));
          return `Error: ${msg(e)}`;
        }
      }
    }),

    betaTool({
      name: 'load_file',
      description:
        "Load a file's full content into the conversation so you can read it directly — " +
        'PDFs and images are loaded natively (you can see them). ' +
        'Use ONLY when metadata and the cheaper tools cannot answer the question; ' +
        'this is token-expensive, especially for large or scanned documents.',
      inputSchema: pathSchema,
      run: async ({ path }) => {
        const id = start('load_file', { path });
        try {
          const blocks = await uploadFileBlock(client, path);
          ok(id, 'uploaded');
          return blocks;
        } catch (e) {
          fail(id, msg(e));
          return `Error: ${msg(e)}`;
        }
      }
    })
  ];
}
